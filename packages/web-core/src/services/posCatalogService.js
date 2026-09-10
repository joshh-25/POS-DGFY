import api from './api.js';

export const POS_READINESS_INCOMPLETE = 'POS_READINESS_INCOMPLETE';

const normalizePosCatalogOverrideError = (error) => {
  const details = error?.response?.data?.errors;
  const reasonCode = details?.reason_code;
  if (reasonCode !== POS_READINESS_INCOMPLETE) {
    return error;
  }

  const normalized = new Error(
    error?.response?.data?.message || 'Cannot enable POS visibility until readiness requirements are completed.'
  );
  normalized.reason_code = reasonCode;
  normalized.missing_requirements = Array.isArray(details?.missing_requirements)
    ? details.missing_requirements
    : [];
  normalized.readiness_snapshot = details?.readiness_snapshot || null;
  normalized.is_pos_readiness_blocked = true;
  normalized.original = error;
  return normalized;
};

export const getPosCatalogOverrides = async (params = {}) => {
  const response = await api.get('/pos/catalog-overrides', { params });
  return response.data.data || [];
};

export const updatePosCatalogOverride = async (itemId, payload) => {
  try {
    const response = await api.patch(`/pos/catalog-overrides/${itemId}`, payload);
    return response.data.data;
  } catch (error) {
    throw normalizePosCatalogOverrideError(error);
  }
};

export const updateBulkPosCatalogOverrides = async ({ itemIds, posVisible }) => {
  const response = await api.patch('/pos/catalog-overrides/bulk', {
    item_ids: itemIds,
    pos_visible: posVisible
  });
  return response.data.data;
};

export const uploadPosCatalogImage = async (itemId, file) => {
  const formData = new FormData();

  // Client-side encode is gated by rolloutFlag.js's server-authoritative `image_client_conversion`
  // flag (epic #265, Phase 298), scoped to 'pos_catalog_single'. Single-variant only:
  // `image_medium`/`image_thumbnail`/`client_image_manifest` multipart fields are a follow-up
  // job (#298d bulk excluded), not this phase's.
  const { isImageClientConversionEnabledForScope } = await import('../utils/imageEncoding/rolloutFlag.js');
  if (isImageClientConversionEnabledForScope('pos_catalog_single')) {
    const { prepareImageVariants } = await import('../utils/imageEncoding/index.js');
    const { reportImageClientConversionDegradation } = await import('../utils/imageEncoding/reportDegradation.js');
    const { variants, manifest, degraded } = await prepareImageVariants(file);
    reportImageClientConversionDegradation({ scope: 'pos_catalog_single', degraded, manifest });
    formData.append('image', variants.large || file);
  } else {
    formData.append('image', file);
  }

  const response = await api.post(`/pos/catalog-overrides/${itemId}/image`, formData);
  return response.data.data;
};

export const uploadBulkPosCatalogImages = async (files = []) => {
  // Client-side encode is gated by rolloutFlag.js's server-authoritative `image_client_conversion`
  // flag (#1643, epic #265's 298d), scoped to 'pos_catalog_bulk'. Shared orchestration (batch
  // packing, sequential conversion, multi-request send/merge) lives in bulkCatalogUpload.js -- see
  // its own doc comment for why this deviates from the single-image pattern's per-service-file
  // duplication.
  const { uploadBulkCatalogImagesWithClientConversion } = await import('../utils/imageEncoding/bulkCatalogUpload.js');
  return uploadBulkCatalogImagesWithClientConversion({
    files,
    scope: 'pos_catalog_bulk',
    postBatch: (batchFiles) => {
      const formData = new FormData();
      batchFiles.forEach((file) => formData.append('images', file));
      return api.post('/pos/catalog-overrides/images/bulk', formData);
    },
  });
};

export const POS_BULK_IMAGE_CHUNK_BYTES = 6 * 1024 * 1024;
const POS_BULK_TERMINAL_STATUSES = new Set(['completed', 'completed_with_errors', 'failed', 'rejected']);

const sha256Hex = async (blob) => {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
};

const buildPackageIdempotencyKey = async ({ zipFile, manifestCsv }) => {
  // Deliberately hash only bounded metadata and the <=1 MiB manifest. Reading
  // the ZIP itself here would duplicate as much as 512 MiB in POS/APK memory.
  const fingerprint = new Blob([
    'pos-image-package-v1\n',
    String(zipFile.name || ''), '\n',
    String(zipFile.size || 0), '\n',
    String(zipFile.lastModified || 0), '\n',
    manifestCsv
  ]);
  return `pos-bulk-${await sha256Hex(fingerprint)}`;
};

export const getPosCatalogImageImport = async (jobId, params = {}) => {
  const response = await api.get(`/pos/catalog-image-imports/${jobId}`, { params });
  return response.data.data;
};

export const getAllPosCatalogImageImportResults = async (jobId) => {
  const first = await getPosCatalogImageImport(jobId, { page: 1, page_size: 100 });
  const pages = Number(first?.pagination?.pages || 1);
  if (pages <= 1) return first;
  const remaining = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => (
    getPosCatalogImageImport(jobId, { page: index + 2, page_size: 100 })
  )));
  return { ...first, files: [first.files || [], ...remaining.map((page) => page.files || [])].flat() };
};

export const retryFailedPosCatalogImageImport = async (jobId) => {
  const response = await api.post(`/pos/catalog-image-imports/${jobId}/retry-failed`);
  return response.data.data;
};

export const waitForPosCatalogImageImport = async (jobId, {
  onStatus,
  pollMs = 1000,
  signal
} = {}) => {
  while (!signal?.aborted) {
    const status = await getPosCatalogImageImport(jobId, { page: 1, page_size: 100 });
    onStatus?.(status);
    if (POS_BULK_TERMINAL_STATUSES.has(status?.status)) return getAllPosCatalogImageImportResults(jobId);
    await new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, pollMs);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
  throw new DOMException('Aborted', 'AbortError');
};

export const uploadPosCatalogImagePackage = async ({ zipFile, csvFile }, {
  onProgress,
  onStatus,
  signal
} = {}) => {
  if (!zipFile || !csvFile) throw new Error('Choose one ZIP package and one CSV manifest.');
  const chunkCount = Math.ceil(zipFile.size / POS_BULK_IMAGE_CHUNK_BYTES);
  const manifestCsv = await csvFile.text();
  const idempotencyKey = await buildPackageIdempotencyKey({ zipFile, manifestCsv });
  const created = await api.post('/pos/catalog-image-imports', {
    manifest_csv: manifestCsv,
    archive_size: zipFile.size,
    chunk_count: chunkCount
  }, { headers: { 'Idempotency-Key': idempotencyKey }, signal });
  const job = created.data.data;
  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = zipFile.slice(index * POS_BULK_IMAGE_CHUNK_BYTES, Math.min(zipFile.size, (index + 1) * POS_BULK_IMAGE_CHUNK_BYTES));
    await api.put(`/pos/catalog-image-imports/${job.job_id}/chunks/${index}`, chunk, {
      headers: { 'Content-Type': 'application/octet-stream', 'X-Chunk-SHA256': await sha256Hex(chunk) },
      signal
    });
    onProgress?.({ stage: 'uploading', processed: index + 1, total: chunkCount });
  }
  const accepted = await api.post(`/pos/catalog-image-imports/${job.job_id}/complete`, null, { signal });
  onStatus?.(accepted.data.data);
  return waitForPosCatalogImageImport(job.job_id, { onStatus, signal });
};

export const deletePosCatalogImage = async (itemId) => {
  const response = await api.delete(`/pos/catalog-overrides/${itemId}/image`);
  return response.data.data;
};

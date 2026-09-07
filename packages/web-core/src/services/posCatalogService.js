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

export const deletePosCatalogImage = async (itemId) => {
  const response = await api.delete(`/pos/catalog-overrides/${itemId}/image`);
  return response.data.data;
};

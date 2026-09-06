import api from './api.js';

export const getStorefrontCatalogOverrides = async (params = {}) => {
  const response = await api.get('/items/storefront-overrides', { params });
  return response.data.data || [];
};

export const updateStorefrontCatalogOverride = async (itemId, payload) => {
  const response = await api.patch(`/items/${itemId}/storefront-override`, payload);
  return response.data.data;
};

export const updateBulkStorefrontCatalogOverrides = async ({ itemIds, storefrontVisible }) => {
  const response = await api.patch('/items/storefront-overrides/bulk', {
    item_ids: itemIds,
    storefront_visible: storefrontVisible
  });
  return response.data.data;
};

export const uploadStorefrontCatalogImage = async (itemId, file) => {
  const formData = new FormData();

  // Mirrors posCatalogService.js's uploadPosCatalogImage wiring exactly (epic #265, Phase 298),
  // scoped to 'storefront_catalog_single'. Single-variant only -- image_medium/image_thumbnail/
  // client_image_manifest are a separate, already-shipped phase's job, not this one's.
  const { isImageClientConversionEnabledForScope } = await import('../utils/imageEncoding/rolloutFlag.js');
  if (isImageClientConversionEnabledForScope('storefront_catalog_single')) {
    const { prepareImageVariants } = await import('../utils/imageEncoding/index.js');
    const { reportImageClientConversionDegradation } = await import('../utils/imageEncoding/reportDegradation.js');
    const { variants, manifest, degraded } = await prepareImageVariants(file);
    reportImageClientConversionDegradation({ scope: 'storefront_catalog_single', degraded, manifest });
    formData.append('image', variants.large || file);
  } else {
    formData.append('image', file);
  }

  const response = await api.post(`/items/${itemId}/storefront-image`, formData);
  return response.data.data;
};

export const importExternalStorefrontCatalogImage = async (itemId, code) => {
  const response = await api.post(`/items/${itemId}/storefront-image/external`, { code });
  return response.data.data;
};

export const uploadStorefrontCatalogImages = async (itemId, files = []) => {
  const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const formData = new FormData();
  normalizedFiles.forEach((file) => formData.append('images', file));
  const response = await api.post(`/items/${itemId}/storefront-images`, formData);
  return response.data.data;
};

export const queueStorefrontCatalogImage = async (itemId, file) => {
  const formData = new FormData();
  formData.append('image', file);
  const response = await api.post(`/items/${itemId}/storefront-image/async`, formData);
  return response.data.data;
};

export const queueStorefrontCatalogImages = async (itemId, files = []) => {
  const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const formData = new FormData();
  normalizedFiles.forEach((file) => formData.append('images', file));
  const response = await api.post(`/items/${itemId}/storefront-images/async`, formData);
  return response.data.data;
};

export const getStorefrontCatalogImageUploadStatus = async (itemId) => {
  const response = await api.get(`/items/${itemId}/storefront-image/async-status`);
  return response.data.data;
};

export const updateStorefrontCatalogGallery = async (itemId, gallery = []) => {
  const response = await api.patch(`/items/${itemId}/storefront-images/gallery`, { gallery });
  return response.data.data;
};

export const deleteStorefrontCatalogGalleryImage = async (itemId, imageIndex) => {
  const response = await api.delete(`/items/${itemId}/storefront-images/${imageIndex}`);
  return response.data.data;
};

export const uploadBulkStorefrontCatalogImages = async (files = []) => {
  // Client-side encode is gated by rolloutFlag.js's server-authoritative `image_client_conversion`
  // flag (#1643, epic #265's 298d), scoped to 'storefront_catalog_bulk'. Shared orchestration
  // (batch packing, sequential conversion, multi-request send/merge) lives in
  // bulkCatalogUpload.js -- see its own doc comment for why this deviates from the single-image
  // pattern's per-service-file duplication. Do not confuse this with
  // `uploadStorefrontCatalogImages` above (the per-item gallery endpoint) -- that function is
  // out of scope for this phase; see ADR 0017's #1643 amendment.
  const { uploadBulkCatalogImagesWithClientConversion } = await import('../utils/imageEncoding/bulkCatalogUpload.js');
  return uploadBulkCatalogImagesWithClientConversion({
    files,
    scope: 'storefront_catalog_bulk',
    postBatch: (batchFiles) => {
      const formData = new FormData();
      batchFiles.forEach((file) => formData.append('images', file));
      return api.post('/items/storefront-images/bulk', formData);
    },
  });
};

export const deleteStorefrontCatalogImage = async (itemId) => {
  const response = await api.delete(`/items/${itemId}/storefront-image`);
  return response.data.data;
};

// AI image generation (#197) — reuses the shared generation service built
// for menu-import (#176). Both calls are fire-and-forget from the client's
// perspective: the response only confirms the item was queued, not that a
// photo exists yet.
export const generateStorefrontCatalogImage = async (itemId) => {
  const response = await api.post(`/items/${itemId}/storefront-image/generate`);
  return response.data.data;
};

export const bulkGenerateStorefrontCatalogImages = async ({ itemIds, overwriteExisting = false } = {}) => {
  const response = await api.post('/items/storefront-images/generate/bulk', {
    item_ids: itemIds,
    overwrite_existing: overwriteExisting
  });
  return response.data.data;
};

// The completion/failure signal generateStorefrontCatalogImage's own comment
// above says doesn't exist yet — it does now. Returns
// {status: 'queued'|'processing'|'completed'|'failed'|'unknown', error_code,
// error_message, updated_at}; 'unknown' means nothing was ever queued for
// this item, or the status record's TTL expired.
export const getStorefrontImageGenerationStatus = async (itemId) => {
  const response = await api.get(`/items/${itemId}/storefront-image/generation-status`);
  return response.data.data;
};

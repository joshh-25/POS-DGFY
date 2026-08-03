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
  formData.append('image', file);
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

export const updateStorefrontCatalogGallery = async (itemId, gallery = []) => {
  const response = await api.patch(`/items/${itemId}/storefront-images/gallery`, { gallery });
  return response.data.data;
};

export const deleteStorefrontCatalogGalleryImage = async (itemId, imageIndex) => {
  const response = await api.delete(`/items/${itemId}/storefront-images/${imageIndex}`);
  return response.data.data;
};

export const uploadBulkStorefrontCatalogImages = async (files = []) => {
  const formData = new FormData();
  files.forEach((file) => formData.append('images', file));
  const response = await api.post('/items/storefront-images/bulk', formData);
  return response.data.data;
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

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

export const uploadStorefrontCatalogImages = async (itemId, files = []) => {
  const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  if (normalizedFiles.length === 1) {
    return uploadStorefrontCatalogImage(itemId, normalizedFiles[0]);
  }
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

import api from './api.js';

export const getStorefrontCatalogOverrides = async (params = {}) => {
  const response = await api.get('/items/storefront-overrides', { params });
  return response.data.data || [];
};

export const updateStorefrontCatalogOverride = async (itemId, payload) => {
  const response = await api.patch(`/items/${itemId}/storefront-override`, payload);
  return response.data.data;
};

export const uploadStorefrontCatalogImage = async (itemId, file) => {
  const formData = new FormData();
  formData.append('image', file);
  const response = await api.post(`/items/${itemId}/storefront-image`, formData);
  return response.data.data;
};

export const deleteStorefrontCatalogImage = async (itemId) => {
  const response = await api.delete(`/items/${itemId}/storefront-image`);
  return response.data.data;
};

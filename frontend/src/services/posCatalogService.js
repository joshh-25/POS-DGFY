import api from './api.js';

export const getPosCatalogOverrides = async (params = {}) => {
  const response = await api.get('/pos/catalog-overrides', { params });
  return response.data.data || [];
};

export const updatePosCatalogOverride = async (itemId, payload) => {
  const response = await api.patch(`/pos/catalog-overrides/${itemId}`, payload);
  return response.data.data;
};

export const uploadPosCatalogImage = async (itemId, file) => {
  const formData = new FormData();
  formData.append('image', file);
  const response = await api.post(`/pos/catalog-overrides/${itemId}/image`, formData);
  return response.data.data;
};

export const deletePosCatalogImage = async (itemId) => {
  const response = await api.delete(`/pos/catalog-overrides/${itemId}/image`);
  return response.data.data;
};


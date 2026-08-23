import api from './api.js';

// Pricelist admin API client (#696/#698). Mirrors `voucherService.js`'s shape exactly: thin named
// exports over the shared `api.js` axios instance, unwrapping `response.data?.data`. Same
// optimistic-lock contract as vouchers -- always include the last-known `version` on every
// `updatePricelist`/`replacePricelistItems` call (the latter only when editing a row that already
// has one; a brand-new draft's first item write has none yet).

export const listPricelists = async (params = {}) => {
  const response = await api.get('/pricelists', { params });
  return response.data?.data || { pricelists: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } };
};

export const getPricelist = async (pricelistId) => {
  const response = await api.get(`/pricelists/${pricelistId}`);
  return response.data?.data;
};

export const createPricelist = async (payload = {}) => {
  const response = await api.post('/pricelists', payload);
  return response.data?.data;
};

export const updatePricelist = async (pricelistId, payload = {}) => {
  const response = await api.put(`/pricelists/${pricelistId}`, payload);
  return response.data?.data;
};

export const replacePricelistItems = async (pricelistId, payload = {}) => {
  const response = await api.put(`/pricelists/${pricelistId}/items`, payload);
  return response.data?.data;
};

export const publishPricelist = async (pricelistId) => {
  const response = await api.post(`/pricelists/${pricelistId}/publish`);
  return response.data?.data;
};

export const archivePricelist = async (pricelistId) => {
  const response = await api.post(`/pricelists/${pricelistId}/archive`);
  return response.data?.data;
};

export default {
  listPricelists,
  getPricelist,
  createPricelist,
  updatePricelist,
  replacePricelistItems,
  publishPricelist,
  archivePricelist
};

import api from './api.js';

// Voucher admin API client (#614). Mirrors `tenantLocationService.js`'s shape: thin named exports
// over the shared `api.js` axios instance, unwrapping `response.data?.data`. No TTL cache or
// in-flight dedup layer here on purpose -- that's `settingsService.js`'s pattern, specific to the
// single generic-settings blob resource, not applicable to a paginated CRUD list like this one.
//
// Callers are responsible for never resending `redeemed_count` / `redeemed_value_centavos` /
// `redeemed_quantity` (server-owned, `Joi.any().forbidden()` on both create and update -- see
// `apps/dgfy-api/src/validators/voucherValidator.js`) and for always including the last-known
// `version` on every `updateVoucher` call (optimistic lock, 409 `VOUCHER_VERSION_CONFLICT` on a
// stale value).

export const listVouchers = async (params = {}) => {
  const response = await api.get('/vouchers', { params });
  return response.data?.data || { vouchers: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } };
};

export const getVoucher = async (voucherId) => {
  const response = await api.get(`/vouchers/${voucherId}`);
  return response.data?.data;
};

export const createVoucher = async (payload = {}) => {
  const response = await api.post('/vouchers', payload);
  return response.data?.data;
};

export const updateVoucher = async (voucherId, payload = {}) => {
  const response = await api.put(`/vouchers/${voucherId}`, payload);
  return response.data?.data;
};

export const activateVoucher = async (voucherId) => {
  const response = await api.post(`/vouchers/${voucherId}/activate`);
  return response.data?.data;
};

export const pauseVoucher = async (voucherId) => {
  const response = await api.post(`/vouchers/${voucherId}/pause`);
  return response.data?.data;
};

export const archiveVoucher = async (voucherId) => {
  const response = await api.post(`/vouchers/${voucherId}/archive`);
  return response.data?.data;
};

export default {
  listVouchers,
  getVoucher,
  createVoucher,
  updateVoucher,
  activateVoucher,
  pauseVoucher,
  archiveVoucher
};

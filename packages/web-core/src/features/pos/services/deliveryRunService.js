import api from '@/services/api';

// Phase 226 (#1273). Mirrors deliveryPersonnelService.js's shape exactly -- one thin wrapper per
// route, unwrap response.data?.data. None of Phase 225's 7 routes carry requirePairedTerminal or
// requireActiveOperatorForMutation, so no terminal headers are sent here either.

export const fetchDeliveryRuns = async (params = {}) => {
  const response = await api.get('/pos/delivery-runs', { params });
  return response.data?.data || { items: [], pagination: { total: 0, page: 1, limit: 20 } };
};

export const fetchDeliveryRun = async (deliveryRunId) => {
  const response = await api.get(`/pos/delivery-runs/${deliveryRunId}`);
  return response.data?.data || null;
};

export const createDeliveryRun = async (payload) => {
  const response = await api.post('/pos/delivery-runs', payload);
  return response.data?.data || null;
};

export const updateDeliveryRun = async (deliveryRunId, payload) => {
  const response = await api.patch(`/pos/delivery-runs/${deliveryRunId}`, payload);
  return response.data?.data || null;
};

export const setDeliveryRunPersonnel = async (deliveryRunId, payload) => {
  const response = await api.put(`/pos/delivery-runs/${deliveryRunId}/personnel`, payload);
  return response.data?.data || null;
};

export const addDeliveryRunMembers = async (deliveryRunId, payload) => {
  const response = await api.post(`/pos/delivery-runs/${deliveryRunId}/members`, payload);
  return response.data?.data || null;
};

export const removeDeliveryRunMember = async (deliveryRunId, posTransactionId) => {
  const response = await api.delete(`/pos/delivery-runs/${deliveryRunId}/members/${posTransactionId}`);
  return response.data?.data || null;
};

// Phase 228 (#1273). Best-effort dispatch of every eligible member -- three-bucket result
// (dispatched/skipped/failed), not the two-bucket {added,skipped} shape addDeliveryRunMembers uses.
export const dispatchDeliveryRun = async (deliveryRunId, payload) => {
  const response = await api.post(`/pos/delivery-runs/${deliveryRunId}/dispatch`, payload);
  return response.data?.data || null;
};

import api from './api.js';

export const getPurchaseOrders = async (params = {}) => {
  const response = await api.get('/purchase-orders', { params });
  return response.data.data;
};

export const getPurchaseOrderById = async (poId, params = {}) => {
  const response = await api.get(`/purchase-orders/${poId}`, { params });
  return response.data.data;
};

export const createPurchaseOrder = async (poData) => {
  const response = await api.post('/purchase-orders', poData);
  return response.data.data;
};

export const createPurchaseOrderDraft = async (poData) => {
  const response = await api.post('/purchase-orders?save_as_draft=true', { ...poData, status: 'draft' });
  return response.data.data;
};

export const finalizePurchaseOrder = async (poId) => {
  const response = await api.patch(`/purchase-orders/${poId}/finalize`);
  return response.data.data;
};

export const receivePurchaseOrder = async (poId, receiptData) => {
  const response = await api.post(`/purchase-orders/${poId}/receive`, receiptData);
  return response.data.data;
};

export const archivePurchaseOrder = async (poId) => {
  const response = await api.post(`/purchase-orders/${poId}/archive`);
  return response.data;
};

export const restorePurchaseOrder = async (poId) => {
  const response = await api.post(`/purchase-orders/${poId}/restore`);
  return response.data;
};

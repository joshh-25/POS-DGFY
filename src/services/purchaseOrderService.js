import api from './api.js';

export const getPurchaseOrders = async (params = {}) => {
  const response = await api.get('/purchase-orders', { params });
  return response.data.data;
};

export const getPurchaseOrderById = async (poId) => {
  const response = await api.get(`/purchase-orders/${poId}`);
  return response.data.data;
};

export const createPurchaseOrder = async (poData) => {
  const response = await api.post('/purchase-orders', poData);
  return response.data.data;
};

export const receivePurchaseOrder = async (poId, receiptData) => {
  const response = await api.post(`/purchase-orders/${poId}/receive`, receiptData);
  return response.data.data;
};


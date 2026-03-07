import api from './api.js';

export const getDispatchOrders = async (params = {}) => {
  const response = await api.get('/dispatch-orders', { params });
  return response.data.data;
};

export const getDispatchOrderById = async (id) => {
  const response = await api.get(`/dispatch-orders/${id}`);
  return response.data.data;
};

export const getDispatchStats = async (params = {}) => {
  const response = await api.get('/dispatch-orders/stats', { params });
  return response.data.data;
};

export const createDispatchOrder = async (data) => {
  const response = await api.post('/dispatch-orders', data);
  return response.data;
};

export const updateDispatchOrder = async (id, data) => {
  const response = await api.put(`/dispatch-orders/${id}`, data);
  return response.data;
};

export const confirmDispatchOrder = async (id) => {
  const response = await api.post(`/dispatch-orders/${id}/confirm`);
  return response.data;
};

export const dispatchLines = async (id, lines) => {
  const response = await api.post(`/dispatch-orders/${id}/dispatch`, { lines });
  return response.data;
};

export const cancelDispatchOrder = async (id, reason = '') => {
  const response = await api.post(`/dispatch-orders/${id}/cancel`, { reason });
  return response.data;
};

export const archiveDispatchOrder = async (id) => {
  const response = await api.post(`/dispatch-orders/${id}/archive`);
  return response.data;
};

export const exportDispatchOrders = async (params = {}) => {
  const response = await api.get('/dispatch-orders/export', { params });
  return response.data.data;
};

export const exportDispatchOrdersCSV = async (params = {}) => {
  const response = await api.get('/dispatch-orders/export', {
    params: { ...params, format: 'csv' },
    responseType: 'blob'
  });
  return response.data;
};

export const getEarningsReport = async (params = {}) => {
  const response = await api.get('/dispatch-orders/earnings', { params });
  return response.data.data;
};

export const updateLineSalePrice = async (doId, lineId, salePrice) => {
  const response = await api.patch(`/dispatch-orders/${doId}/lines/${lineId}/sale-price`, { sale_price_per_unit: salePrice });
  return response.data.data;
};

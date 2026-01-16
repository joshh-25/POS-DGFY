import api from './api.js';

export const getStockMovements = async (params = {}) => {
  const response = await api.get('/stock-movements', { params });
  return response.data.data;
};

export const getMovementById = async (id) => {
  const response = await api.get(`/stock-movements/${id}`);
  return response.data.data;
};

export const getMovementStats = async (params = {}) => {
  const response = await api.get('/stock-movements/stats', { params });
  return response.data.data;
};

export const createStockMovement = async (movementData) => {
  const response = await api.post('/stock-movements', movementData);
  return response.data.data;
};

export const createBulkMovements = async (movements) => {
  const response = await api.post('/stock-movements/bulk', { movements });
  return response.data.data;
};

export const voidMovement = async (id, reason) => {
  const response = await api.post(`/stock-movements/${id}/void`, { reason });
  return response.data.data;
};

export const getExportUrl = (params = {}) => {
  const query = new URLSearchParams({ ...params, format: 'csv' }).toString();
  return `${api.defaults.baseURL}/stock-movements/export?${query}`;
};

export const getLocations = async () => {
  // Mock API call - in future replace with real endpoint
  return new Promise(resolve => {
    setTimeout(() => resolve([
      'Main Warehouse',
      'Production Floor',
      'Shipping Area',
      'Quality Control',
      'Cold Storage',
      'Returns Processing'
    ]), 300);
  });
};

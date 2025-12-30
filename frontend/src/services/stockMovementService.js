import api from './api.js';

export const getStockMovements = async (params = {}) => {
  const response = await api.get('/stock-movements', { params });
  return response.data.data;
};

export const createStockMovement = async (movementData) => {
  const response = await api.post('/stock-movements', movementData);
  return response.data.data;
};


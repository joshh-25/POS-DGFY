import api from './api.js';

export const getDashboardStats = async () => {
  const response = await api.get('/dashboard/stats');
  return response.data.data;
};

export const getLowStockItems = async () => {
  const response = await api.get('/dashboard/low-stock');
  return response.data.data.items;
};

export const getRecentMovements = async (limit = 10) => {
  const response = await api.get('/dashboard/recent-movements', { params: { limit } });
  return response.data.data.movements;
};


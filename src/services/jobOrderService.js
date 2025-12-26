import api from './api.js';

export const getJobOrders = async (params = {}) => {
  const response = await api.get('/job-orders', { params });
  return response.data.data;
};

export const getJobOrderById = async (joId) => {
  const response = await api.get(`/job-orders/${joId}`);
  return response.data.data;
};

export const createJobOrder = async (joData) => {
  const response = await api.post('/job-orders', joData);
  return response.data.data;
};

export const completeJobOrder = async (joId) => {
  const response = await api.post(`/job-orders/${joId}/complete`);
  return response.data.data;
};


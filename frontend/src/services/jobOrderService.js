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

export const createJobOrderDraft = async (joData) => {
  const response = await api.post('/job-orders?save_as_draft=true', { ...joData, status: 'draft' });
  return response.data.data;
};

export const finalizeJobOrder = async (joId) => {
  const response = await api.patch(`/job-orders/${joId}/finalize`);
  return response.data.data;
};

export const completeJobOrder = async (joId) => {
  const response = await api.post(`/job-orders/${joId}/complete`);
  return response.data.data;
};

export const archiveJobOrder = async (joId) => {
  const response = await api.post(`/job-orders/${joId}/archive`);
  return response.data;
};

export const restoreJobOrder = async (joId) => {
  const response = await api.post(`/job-orders/${joId}/restore`);
  return response.data;
};

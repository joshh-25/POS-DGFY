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

export const completeJobOrder = async (joId, completionPayload = {}) => {
  const payload = {
    expiry_date: completionPayload.expiry_date ?? null,
    notes: completionPayload.notes ?? null,
    quantity_produced: completionPayload.quantity_produced ?? null,
    quality_check: completionPayload.quality_check ?? null,
    source_location_id: completionPayload.source_location_id ?? null,
    destination_location_id: completionPayload.destination_location_id ?? null
  };
  const response = await api.post(`/job-orders/${joId}/complete`, payload);
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

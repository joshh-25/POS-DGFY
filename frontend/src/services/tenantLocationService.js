import api from './api.js';

export const listTenantLocations = async (params = {}) => {
  const response = await api.get('/tenant-locations', { params });
  return response.data?.data || [];
};

export const createTenantLocation = async (payload) => {
  const response = await api.post('/tenant-locations', payload);
  return response.data?.data || null;
};

export const updateTenantLocation = async (locationId, payload) => {
  const response = await api.put(`/tenant-locations/${locationId}`, payload);
  return response.data?.data || null;
};

export const deactivateTenantLocation = async (locationId) => {
  const response = await api.delete(`/tenant-locations/${locationId}`);
  return response.data?.data || null;
};


import api from './api.js';

export const listTenantLocations = async (params = {}, requestConfig = {}) => {
  const response = await api.get('/tenant-locations', { params, ...requestConfig });
  return response.data?.data || [];
};

export const listTenantLocationsWithMeta = async (params = {}, requestConfig = {}) => {
  const response = await api.get('/tenant-locations', { params, ...requestConfig });
  return {
    rows: response.data?.data || [],
    meta: response.data?.meta || {}
  };
};

export const createTenantLocation = async (payload = {}) => {
  const response = await api.post('/tenant-locations', payload);
  return response.data?.data;
};

export const updateTenantLocation = async (locationId, payload = {}) => {
  const response = await api.put(`/tenant-locations/${locationId}`, payload);
  return response.data?.data;
};

export const deactivateTenantLocation = async (locationId) => {
  const response = await api.delete(`/tenant-locations/${locationId}`);
  return response.data?.data;
};

export const deleteTenantLocation = async (locationId) => {
  const response = await api.delete(`/tenant-locations/${locationId}/permanent`);
  return response.data?.data;
};

export const reactivateTenantLocation = async (locationId) => {
  const response = await api.put(`/tenant-locations/${locationId}`, {
    is_active: true
  });
  return response.data?.data;
};

export default {
  listTenantLocations,
  listTenantLocationsWithMeta,
  createTenantLocation,
  updateTenantLocation,
  deactivateTenantLocation,
  deleteTenantLocation,
  reactivateTenantLocation
};

import api from './api.js';

export const getSuppliers = async (params = {}) => {
  const response = await api.get('/suppliers', { params });
  return response.data.data;
};

export const getSupplierById = async (supplierId) => {
  const response = await api.get(`/suppliers/${supplierId}`);
  return response.data.data;
};

export const createSupplier = async (supplierData) => {
  const response = await api.post('/suppliers', supplierData);
  return response.data.data;
};

export const updateSupplier = async (supplierId, supplierData) => {
  const response = await api.put(`/suppliers/${supplierId}`, supplierData);
  return response.data.data;
};

export const addSupplierItem = async (supplierId, itemData) => {
  const response = await api.post(`/suppliers/${supplierId}/items`, itemData);
  return response.data.data;
};


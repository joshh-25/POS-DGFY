import api from './api.js';

export const getItems = async (params = {}) => {
  const response = await api.get('/items', { params });
  return response.data.data;
};

export const getItemById = async (itemId) => {
  const response = await api.get(`/items/${itemId}`);
  return response.data.data;
};

export const createItem = async (itemData) => {
  const response = await api.post('/items', itemData);
  return response.data.data;
};

export const updateItem = async (itemId, itemData) => {
  const response = await api.put(`/items/${itemId}`, itemData);
  return response.data.data;
};

export const deleteItem = async (itemId) => {
  const response = await api.delete(`/items/${itemId}`);
  return response.data;
};

export const getItemBatches = async (itemId) => {
  const response = await api.get(`/items/${itemId}/batches`);
  return response.data.data.batches;
};

export const getItemMovements = async (itemId) => {
  const response = await api.get(`/items/${itemId}/movements`);
  return response.data.data.movements;
};

export const getItemStockHistory = async (itemId, params = {}) => {
  const response = await api.get(`/items/${itemId}/stock-history`, { params });
  return response.data.data.movements;
};


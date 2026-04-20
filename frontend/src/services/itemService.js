import api from './api.js';

// Transform items to ensure both 'id' and 'item_id' fields exist (defensive)
const transformItem = (item) => ({
  ...item,
  id: item.id || item.item_id, // Support both field names
  item_id: item.item_id || item.id
});

export const getItems = async (params = {}) => {
  const response = await api.get('/items', { params });
  const data = response.data.data;

  // Transform items defensively to ensure compatibility
  if (data.items && Array.isArray(data.items)) {
    return {
      ...data,
      items: data.items.map(transformItem)
    };
  }

  return data;
};

export const getItemById = async (itemId, params = {}) => {
  const response = await api.get(`/items/${itemId}`, { params });
  const item = response.data.data;

  // Transform to ensure both id fields exist
  return transformItem(item);
};

export const createItem = async (itemData) => {
  const response = await api.post('/items', itemData);
  return response.data.data;
};

export const createItemDraft = async (itemData) => {
  const response = await api.post('/items?save_as_draft=true', { ...itemData, status: 'draft' });
  return response.data.data;
};

export const finalizeItem = async (itemId, itemData = {}) => {
  const response = await api.patch(`/items/${itemId}/finalize`, itemData);
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

export const getItemBatches = async (itemId, params = {}) => {
  const response = await api.get(`/items/${itemId}/batches`, { params });
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

/**
 * Get item supplier coverage statistics
 * Returns items grouped by whether they have suppliers assigned
 * @returns {Promise<object>} Object with items_with_supplier and items_without_supplier arrays
 */
export const getItemSupplierCoverage = async () => {
  const response = await api.get('/items/supplier-coverage');
  return response.data.data;
};

export const replaceItemSuppliers = async (itemId, suppliers = []) => {
  const response = await api.put(`/items/${itemId}/suppliers`, { suppliers });
  return response.data.data;
};

export const getFolders = async () => {
  const response = await api.get('/items/folders');
  return response.data.data;
};

export const createFolder = async (folderData) => {
  const response = await api.post('/items/folders', folderData);
  return response.data.data;
};

export const updateFolder = async (folderId, payload) => {
  const response = await api.patch(`/items/folders/${folderId}`, payload);
  return response.data.data;
};

export const deleteFolder = async (folderId) => {
  const response = await api.delete(`/items/folders/${folderId}`);
  return response.data;
};

import { deleteFolder, getItemById, updateFolder } from '../../../services/itemService.js';

export const getInventoryItemById = (itemId, params = {}) => getItemById(itemId, params);
export const deleteInventoryFolder = (folderId) => deleteFolder(folderId);
export const updateInventoryFolder = (folderId, payload) => updateFolder(folderId, payload);

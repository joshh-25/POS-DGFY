import { deleteFolder, getItemById, updateFolder } from '../../../services/itemService.js';

export const getInventoryItemById = (itemId) => getItemById(itemId);
export const deleteInventoryFolder = (folderId) => deleteFolder(folderId);
export const updateInventoryFolder = (folderId, payload) => updateFolder(folderId, payload);

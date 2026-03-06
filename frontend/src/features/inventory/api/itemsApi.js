import { deleteFolder, getItemById } from '../../../services/itemService.js';

export const getInventoryItemById = (itemId) => getItemById(itemId);
export const deleteInventoryFolder = (folderId) => deleteFolder(folderId);


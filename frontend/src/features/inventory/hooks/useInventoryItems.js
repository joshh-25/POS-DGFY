import {
  useItems,
  useCreateItem,
  useUpdateItem,
  useDeleteItem,
  useCreateItemDraft,
  useFinalizeItem,
  useFolders
} from '../../../hooks/useItems.js';

export const useInventoryItems = (params = {}) => useItems(params);
export const useInventoryCreateItem = () => useCreateItem();
export const useInventoryUpdateItem = () => useUpdateItem();
export const useInventoryDeleteItem = () => useDeleteItem();
export const useInventoryCreateItemDraft = () => useCreateItemDraft();
export const useInventoryFinalizeItem = () => useFinalizeItem();
export const useInventoryFolders = () => useFolders();

export default useInventoryItems;

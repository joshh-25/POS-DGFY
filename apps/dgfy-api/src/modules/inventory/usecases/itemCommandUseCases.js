import {
  createItemUseCase,
  updateItemUseCase,
  finalizeItemUseCase,
  deleteItemUseCase,
  reactivateItemUseCase,
  replaceItemSuppliersUseCase
} from '../index.js';

export const itemCommandUseCases = {
  createItem: async (itemData, userId = null) => createItemUseCase({ itemData, userId }),
  updateItem: async (itemId, itemData, userId = null) => updateItemUseCase({ itemId, itemData, userId }),
  finalizeItem: async (itemId, itemData = {}, userId = null) => finalizeItemUseCase({ itemId, itemData, userId }),
  deleteItem: async (itemId, userId) => deleteItemUseCase({ itemId, userId }),
  reactivateItem: async (itemId, userId) => reactivateItemUseCase({ itemId, userId }),
  replaceItemSuppliers: async (itemId, suppliers = []) => replaceItemSuppliersUseCase({ itemId, suppliers })
};

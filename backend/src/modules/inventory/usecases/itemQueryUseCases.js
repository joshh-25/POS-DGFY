import {
  getItemsUseCase,
  getItemByIdUseCase,
  getItemStockHistoryUseCase,
  getItemBatchesUseCase,
  getItemMovementsUseCase,
  getItemSupplierCoverageUseCase
} from '../index.js';

export const itemQueryUseCases = {
  getItems: async (queryParams = {}) => getItemsUseCase({ query: queryParams }),
  getItemById: async (itemId) => getItemByIdUseCase({ itemId }),
  getItemStockHistory: async (itemId, queryParams = {}) => getItemStockHistoryUseCase({ itemId, query: queryParams }),
  getItemBatches: async (itemId) => getItemBatchesUseCase({ itemId }),
  getItemMovements: async (itemId) => getItemMovementsUseCase({ itemId }),
  getItemSupplierCoverage: async () => getItemSupplierCoverageUseCase()
};

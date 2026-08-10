import { purchaseOrderRepository } from './repositories/purchaseOrderRepository.js';
import { buildGetPurchaseOrdersUseCase } from './usecases/getPurchaseOrdersUseCase.js';
import { buildGetPurchaseOrderByIdUseCase } from './usecases/getPurchaseOrderByIdUseCase.js';
import { buildCreatePurchaseOrderUseCase } from './usecases/createPurchaseOrderUseCase.js';
import { buildFinalizePurchaseOrderUseCase } from './usecases/finalizePurchaseOrderUseCase.js';
import { buildReceivePurchaseOrderUseCase } from './usecases/receivePurchaseOrderUseCase.js';
import { buildArchivePurchaseOrderUseCase } from './usecases/archivePurchaseOrderUseCase.js';
import { buildRestorePurchaseOrderUseCase } from './usecases/restorePurchaseOrderUseCase.js';
import { inventoryStockCommandService } from '../inventory/index.js';

export const getPurchaseOrdersUseCase = buildGetPurchaseOrdersUseCase({ purchaseOrderRepository });
export const getPurchaseOrderByIdUseCase = buildGetPurchaseOrderByIdUseCase({ purchaseOrderRepository });
export const createPurchaseOrderUseCase = buildCreatePurchaseOrderUseCase({ purchaseOrderRepository });
export const finalizePurchaseOrderUseCase = buildFinalizePurchaseOrderUseCase({ purchaseOrderRepository });
export const receivePurchaseOrderUseCase = buildReceivePurchaseOrderUseCase({
  purchaseOrderRepository,
  inventoryCommandService: inventoryStockCommandService
});
export const archivePurchaseOrderUseCase = buildArchivePurchaseOrderUseCase({ purchaseOrderRepository });
export const restorePurchaseOrderUseCase = buildRestorePurchaseOrderUseCase({ purchaseOrderRepository });

export * from './contracts/purchaseOrderRepository.contract.js';
export * from './repositories/purchaseOrderRepository.js';

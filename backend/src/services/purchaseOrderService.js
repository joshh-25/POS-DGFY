import {
  getPurchaseOrdersUseCase,
  getPurchaseOrderByIdUseCase,
  createPurchaseOrderUseCase,
  finalizePurchaseOrderUseCase,
  receivePurchaseOrderUseCase,
  archivePurchaseOrderUseCase,
  restorePurchaseOrderUseCase
} from '../modules/purchaseOrders/index.js';
import { unwrapApplicationResultOrThrow } from '../modules/shared/contracts/applicationResultHelpers.js';

/**
 * Purchase Order Service (Compatibility Facade)
 *
 * Existing callers keep importing this service while behavior is sourced from
 * modular purchase-order use-cases.
 */

export const getPurchaseOrders = async (queryParams) => {
  const result = await getPurchaseOrdersUseCase({ queryParams });
  return unwrapApplicationResultOrThrow(result, 'Failed to retrieve purchase orders');
};

export const getPurchaseOrderById = async (poId) => {
  const result = await getPurchaseOrderByIdUseCase({ poId });
  return unwrapApplicationResultOrThrow(result, 'Failed to retrieve purchase order');
};

export const createPurchaseOrder = async (poData, userId) => {
  const result = await createPurchaseOrderUseCase({ poData, userId });
  return unwrapApplicationResultOrThrow(result, 'Failed to create purchase order');
};

export const finalizePurchaseOrder = async (poId, userId) => {
  const result = await finalizePurchaseOrderUseCase({ poId, userId });
  return unwrapApplicationResultOrThrow(result, 'Failed to finalize purchase order');
};

export const receivePurchaseOrder = async (poId, receiptData, userId) => {
  const result = await receivePurchaseOrderUseCase({ poId, receiptData, userId });
  return unwrapApplicationResultOrThrow(result, 'Failed to receive purchase order');
};

export const archivePurchaseOrder = async (poId, userId) => {
  const result = await archivePurchaseOrderUseCase({ poId, userId });
  return unwrapApplicationResultOrThrow(result, 'Failed to archive purchase order');
};

export const restorePurchaseOrder = async (poId) => {
  const result = await restorePurchaseOrderUseCase({ poId });
  return unwrapApplicationResultOrThrow(result, 'Failed to restore purchase order');
};

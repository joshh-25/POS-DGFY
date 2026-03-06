/**
 * Purchase order repository contract.
 *
 * Legacy service/controllers are migrated behind this boundary so transport
 * and orchestration layers can depend on stable abstractions.
 */
export const PurchaseOrderRepositoryContract = Object.freeze([
  'getPurchaseOrders',
  'getPurchaseOrderById',
  'createPurchaseOrder',
  'finalizePurchaseOrder',
  'receivePurchaseOrder',
  'archivePurchaseOrder',
  'restorePurchaseOrder'
]);

export const assertPurchaseOrderRepositoryContract = (repository) => {
  PurchaseOrderRepositoryContract.forEach((method) => {
    if (typeof repository?.[method] !== 'function') {
      throw new Error(`PurchaseOrderRepository missing required method: ${method}`);
    }
  });
};

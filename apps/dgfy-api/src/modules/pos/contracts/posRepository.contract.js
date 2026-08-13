const REQUIRED_METHODS = [
    'findTransactionByIdempotencyKey',
    'findSellableItemsByIds',
    'nextInvoiceNumber',
    'incrementPersistentCounter',
    'getPersistentCounterValue',
    'createTransactionWithLines',
    'getTransactionById',
    'getReportsOverview',
    'listTransactions',
    'getZReadingSummary',
    'createZReadingSnapshot',
    'getLatestZReadingSnapshotByBusinessDate',
    'findActiveDayCloseOperatorById',
    'getTerminalIdentityPolicySettings',
    'getShiftLocationBindingReadinessSummary',
    'listCatalog',
    'resolveCatalogScan',
    'listCatalogOverrides',
    'findCatalogOverrideByItemId',
    'upsertCatalogOverride',
    'updateCatalogImage',
    'clearCatalogImage',
    'findOperationReplayByKey',
    'createOperationReplay',
    'findParkedSaleByIdempotencyKey',
    'createParkedSale',
    'listParkedSales',
    'getParkedSaleById',
    'updateParkedSale',
    'countActiveParkedSalesForShift',
    'findPosPaymentSessionByIdempotencyKey',
    'findActivePosPaymentSessionForScope',
    'listUnresolvedFundedPaymentSessionsForShift',
    'createPosPaymentSession',
    'getPosPaymentSessionById',
    'updatePosPaymentSession',
    'listPosPaymentAllocationsForSession',
    'findPosPaymentAllocationByIdempotencyKey',
    'createPosPaymentAllocation',
    'getPosPaymentAllocationById',
    'findPosPaymentAllocationByProviderEventId',
    'findPosPaymentAllocationByProviderRefundEventId',
    'updatePosPaymentAllocation',
    'findOpenTerminalShift',
    'listOpenTerminalShiftsForLocation',
    'createTerminalShift',
    'createShiftLocationTransition',
    'getTerminalShiftById',
    'createCashDrawerEvent',
    'createAuditLog',
    'listCashDrawerEventsByShiftId',
    'getShiftCashSalesTotal',
    'getMerchantTenderExpectedByShift',
    'findMerchantTenderReconciliationByIdempotencyKey',
    'getLatestMerchantTenderReconciliation',
    'createMerchantTenderReconciliation',
    'closeTerminalShift',
    'listIncomingOnlineOrders',
    'listOnlineOrderHistory',
    'getOrderByIdForLifecycle',
    'updateOrderById',
    'updateDeliveryJobByOrderId',
    'listActiveDeliveryPersonnel',
    'findActiveDeliveryPersonnelById',
    'assignDeliveryPersonnelToJob'
];

export const assertPosRepositoryContract = (repository) => {
    if (!repository || typeof repository !== 'object') {
        throw new Error('posRepository must be an object');
    }

    for (const methodName of REQUIRED_METHODS) {
        if (typeof repository[methodName] !== 'function') {
            throw new Error(`posRepository is missing required method: ${methodName}`);
        }
    }
};

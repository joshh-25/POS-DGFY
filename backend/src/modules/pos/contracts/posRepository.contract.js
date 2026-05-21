const REQUIRED_METHODS = [
    'findTransactionByIdempotencyKey',
    'findSellableItemsByIds',
    'nextInvoiceNumber',
    'incrementPersistentCounter',
    'getPersistentCounterValue',
    'createTransactionWithLines',
    'getTransactionById',
    'listTransactions',
    'getZReadingSummary',
    'createZReadingSnapshot',
    'getLatestZReadingSnapshotByBusinessDate',
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
    'findOpenTerminalShift',
    'createTerminalShift',
    'createShiftLocationTransition',
    'getTerminalShiftById',
    'createCashDrawerEvent',
    'listCashDrawerEventsByShiftId',
    'getShiftCashSalesTotal',
    'closeTerminalShift',
    'listIncomingOnlineOrders',
    'getOrderByIdForLifecycle',
    'updateOrderById'
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

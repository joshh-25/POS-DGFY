const REQUIRED_METHODS = [
    'findTransactionByIdempotencyKey',
    'findSellableItemsByIds',
    'nextInvoiceNumber',
    'createTransactionWithLines',
    'getTransactionById',
    'listTransactions',
    'getZReadingSummary',
    'listCatalog',
    'listCatalogOverrides',
    'findCatalogOverrideByItemId',
    'upsertCatalogOverride',
    'updateCatalogImage',
    'clearCatalogImage',
    'findOpenTerminalShift',
    'createTerminalShift',
    'getTerminalShiftById',
    'createCashDrawerEvent',
    'listCashDrawerEventsByShiftId',
    'getShiftCashSalesTotal',
    'closeTerminalShift'
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

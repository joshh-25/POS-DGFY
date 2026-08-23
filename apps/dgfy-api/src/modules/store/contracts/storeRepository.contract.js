const REQUIRED_METHODS = Object.freeze([
    'beginTransaction',
    'findCustomerByEmail',
    'findCustomerById',
    'createCustomer',
    'updateCustomerById',
    'listCustomerAddresses',
    'findAddressById',
    'createAddress',
    'updateAddressById',
    'clearDefaultAddress',
    'deleteAddressById',
    'findSellableItemsByIds',
    'getLocationStocksByItemIds',
    'listStoreCatalog',
    'resolvePublicBarcode',
    'resolvePublicServiceBookingReference',
    'listActiveLocations',
    'findLocationById',
    'getSettingsByKeys',
    'findTransactionByIdempotencyKey',
    'isTrackingPinTaken',
    'nextInvoiceNumber',
    'createOnlineTransactionWithLines',
    // Phase 141 (#822): ledger row 1 (kind: 'downpayment') for a webhook-finalized downpayment order.
    'createOrderPaymentEntry',
    'getOrderByTrackingPin',
    'updateOrderByTrackingPin',
    'listOrdersByCustomer',
    'getOrderById',
    'updateOrderById',
    'findStorefrontFollow',
    'upsertStorefrontFollow',
    'deleteStorefrontFollow',
    'countStorefrontFollowsBySlug'
]);

export const assertStoreRepositoryContract = (repository) => {
    if (!repository || typeof repository !== 'object') {
        throw new Error('storeRepository must be an object');
    }

    const missingMethods = REQUIRED_METHODS.filter((methodName) => typeof repository[methodName] !== 'function');
    if (missingMethods.length > 0) {
        throw new Error(`storeRepository missing required methods: ${missingMethods.join(', ')}`);
    }
};

export const STORE_REPOSITORY_METHODS = REQUIRED_METHODS;

/**
 * Single source of truth for the order-method vocabulary.
 *
 * ALL_ORDER_METHODS must stay identical to the `pos_transactions.order_method`
 * DB ENUM (last widened by backend/migrations/20260807000001-add-walk-in-pos-order-method.cjs,
 * which also aligned `service_fee_method_snapshot`). Widening the vocabulary is a
 * DB migration plus an edit here in the same PR; the cross-layer contract test
 * (backend/tests/orderMethods.crossLayer.contract.test.js) fails on any drift.
 *
 * `online` is legacy/reserved: no current write path sets it (storefront orders
 * persist the customer-chosen method with order_source `online_store`), but
 * historical rows carry it, so read-side filters must keep accepting it.
 */
export const ALL_ORDER_METHODS = Object.freeze([
    'dine_in',
    'takeout',
    'pickup',
    'delivery',
    'online',
    'appointment',
    'walk_in'
]);

// In-store POS checkout can write every method except the reserved `online`.
export const POS_ORDER_METHODS = Object.freeze(
    ALL_ORDER_METHODS.filter((method) => method !== 'online')
);

// Public storefront product checkout. `appointment`/`walk_in` are not choosable
// here because service availments go through the dedicated /store/services
// booking routes, not product checkout.
export const STOREFRONT_ORDER_METHODS = Object.freeze([
    'dine_in',
    'takeout',
    'pickup',
    'delivery'
]);

// Methods a tenant may configure a per-method service fee for
// (`order_method_fees` setting). Matches the `service_fee_method_snapshot`
// column, which mirrors the order_method ENUM.
export const ORDER_METHOD_FEE_METHODS = ALL_ORDER_METHODS;

// The ecommerce fulfillment axis: what a public storefront checkout can offer as a
// delivery/pickup choice. dine_in/takeout are in-venue concerns and never appear in
// storefront checkout -- a store that takes no online orders at all expresses that via
// customer_access_mode 'catalog' (Catalog Only), not by disabling both of these. See
// docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md.
export const STOREFRONT_FULFILLMENT_ORDER_METHODS = Object.freeze(['delivery', 'pickup']);

// order_method -> the tenant_locations column that gates whether a location accepts it.
// Single source of truth for this mapping; storeUseCases.js's checkout enforcement and the
// storefront's own availability resolver both import this rather than each keeping their
// own copy.
export const ORDER_METHOD_LOCATION_SUPPORT_KEYS = Object.freeze({
    delivery: 'supports_delivery',
    pickup: 'supports_pickup',
    takeout: 'supports_pickup',
    dine_in: 'supports_dine_in'
});

export const isOrderMethod = (value) => ALL_ORDER_METHODS.includes(value);

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

export const isOrderMethod = (value) => ALL_ORDER_METHODS.includes(value);

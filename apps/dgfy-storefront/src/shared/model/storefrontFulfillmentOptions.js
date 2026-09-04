import { ORDER_METHOD_OPTIONS } from './storefrontConstants.js';
import { buildStorefrontOrderMethodOptions } from './storefrontOrderMethodOptions.js';

const PRODUCT_FULFILLMENT_METHODS = new Set(['delivery', 'pickup']);

// The ecommerce fulfillment axis: the only two methods a product storefront checkout offers.
// dine_in/takeout live in ORDER_METHOD_OPTIONS for dine-in-capable surfaces and never apply here.
export const PRODUCT_FULFILLMENT_CANDIDATE_OPTIONS = ORDER_METHOD_OPTIONS.filter(
  (option) => PRODUCT_FULFILLMENT_METHODS.has(option.value)
);

// #1217, "consolidate or defer" decision: CONSOLIDATED. This resolver and
// storefrontOrderMethodOptions.js's buildStorefrontOrderMethodOptions previously encoded the
// same fail-open availability rule (`!== false`) twice, independently. It now delegates, so
// the rule -- and the order_method -> tenant_locations column mapping it depends on
// (ORDER_METHOD_LOCATION_SUPPORT_KEYS) -- lives in exactly one place. Behaviour is unchanged:
// for delivery/pickup the support keys are supports_delivery/supports_pickup, which is what
// this function read directly before.
export function resolveStorefrontFulfillmentOptions(location = null) {
  return buildStorefrontOrderMethodOptions(PRODUCT_FULFILLMENT_CANDIDATE_OPTIONS, location);
}

export function getUnavailableFulfillmentMessage(option) {
  return `This store does not support ${option?.label || 'this fulfillment method'}.`;
}

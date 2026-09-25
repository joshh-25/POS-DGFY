import { ORDER_METHOD_OPTIONS } from './storefrontConstants.js';
import { buildStorefrontOrderMethodOptions } from './storefrontOrderMethodOptions.js';

const PRODUCT_FULFILLMENT_METHODS = new Set(['delivery', 'pickup']);
const FNB_FULFILLMENT_METHODS = new Set(['delivery', 'pickup', 'dine_in']);

// The ecommerce fulfillment axis: the only two methods a product storefront checkout offers.
// dine_in/takeout live in ORDER_METHOD_OPTIONS for dine-in-capable surfaces and never apply here.
export const PRODUCT_FULFILLMENT_CANDIDATE_OPTIONS = ORDER_METHOD_OPTIONS.filter(
  (option) => PRODUCT_FULFILLMENT_METHODS.has(option.value)
);

// F&B has one additional customer-facing fulfillment path. Dine-in is intentionally
// mode-scoped here rather than being added to the shared ecommerce candidate set used by
// Retail/Simple checkout.
export const FNB_FULFILLMENT_CANDIDATE_OPTIONS = ORDER_METHOD_OPTIONS.filter(
  (option) => FNB_FULFILLMENT_METHODS.has(option.value)
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

export function resolveStorefrontFnbFulfillmentOptions(location = null) {
  const options = buildStorefrontOrderMethodOptions(FNB_FULFILLMENT_CANDIDATE_OPTIONS, location);
  return options.map((option) => option.value === 'dine_in' && location?.scheduling_enabled === false
    ? {
        ...option,
        available: false,
        unavailableReason: 'Dine-in requires a scheduled date and time, but this location has scheduling disabled.'
      }
    : option);
}

export function getUnavailableFulfillmentMessage(option) {
  return option?.unavailableReason || `This store does not support ${option?.label || 'this fulfillment method'}.`;
}

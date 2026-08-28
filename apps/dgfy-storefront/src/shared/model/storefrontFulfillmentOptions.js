import { ORDER_METHOD_OPTIONS } from './storefrontConstants.js';

const PRODUCT_FULFILLMENT_METHODS = new Set(['delivery', 'pickup']);

// Location snapshots can be cached or originate from tenants created before
// fulfillment flags existed. Missing flags deliberately remain available.
export function resolveStorefrontFulfillmentOptions(location = null) {
  return ORDER_METHOD_OPTIONS
    .filter((option) => PRODUCT_FULFILLMENT_METHODS.has(option.value))
    .map((option) => ({
      ...option,
      available: location?.[`supports_${option.value}`] !== false
    }));
}

export function getUnavailableFulfillmentMessage(option) {
  return `This store does not support ${option?.label || 'this fulfillment method'}.`;
}

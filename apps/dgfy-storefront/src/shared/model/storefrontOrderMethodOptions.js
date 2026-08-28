import { ORDER_METHOD_LOCATION_SUPPORT_KEYS } from '@sieitzz/shared-constants/orderMethods';

// #1093: the storefront's own mirror of the server's checkout-time enforcement
// (assertCheckoutLocationOperationalReadiness, apps/dgfy-api's storeUseCases.js) --
// so the customer never sees a fulfillment method the server is about to reject with
// a 409. Fail-open (`!== false`) on purpose, matching the polarity already used for
// these columns everywhere else they're read (storefrontDiscoveryRepository.js's
// `supports_delivery: plain.supports_delivery !== false`, tenantLocationUseCases.js's
// normalizer): an absent field (an older cached payload, a partially loaded store)
// must not silently strip every fulfillment option.
export const isEnabledStorefrontOrderMethod = (method, locationSupport = null) => {
  const supportKey = ORDER_METHOD_LOCATION_SUPPORT_KEYS[method] || null;
  if (!supportKey) return false;
  return locationSupport?.[supportKey] !== false;
};

// Mirrors the server's own location resolution for checkout
// (storeUseCases.js: `const location = requestedLocation || fallbackLocation`):
// prefer the location the customer actually has selected, fall back to the
// storefront's primary/active location list, and finally fall back to the
// discovery profile's own primary-location snapshot (`selectedStore.supports_*`)
// for a store that hasn't loaded `storeLocations` yet.
export const resolveLocationFulfillmentSupport = ({
  selectedStore = null,
  storeLocations = [],
  selectedLocationId = null
} = {}) => {
  const locations = Array.isArray(storeLocations) ? storeLocations : [];

  if (selectedLocationId != null) {
    const selected = locations.find((location) => String(location?.location_id) === String(selectedLocationId));
    if (selected) return selected;
  }

  const fallback = locations.find((location) => location?.is_primary_storefront === true)
    || locations.find((location) => location?.is_active !== false)
    || locations[0]
    || null;
  if (fallback) return fallback;

  return selectedStore || null;
};

// Annotates a mode's candidate order-method options (e.g. RETAIL_ORDER_METHOD_OPTIONS,
// already scoped to the ecommerce fulfillment axis) with the resolved location's
// availability. Candidates stay visible so a customer can understand why a method
// cannot be selected; this never adds a method a mode does not offer.
export const buildStorefrontOrderMethodOptions = (candidateOptions = [], locationSupport = null) => (
  (Array.isArray(candidateOptions) ? candidateOptions : [])
    .map((option) => ({
      ...option,
      available: isEnabledStorefrontOrderMethod(option?.value, locationSupport)
    }))
);

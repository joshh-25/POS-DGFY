import { getStorefrontAccessModeMessage } from '../../../../../packages/web-core/src/utils/tenantCapabilityMessages.js';

const DEFAULT_CAPABILITIES = Object.freeze({
  profile: true,
  contact: true,
  catalog: true,
  inventory: true,
  inquiry: false,
  cart: true,
  quote: true,
  checkout: true,
  booking: true,
  payment: true
});

export const getAccessCapabilities = (store = null) => ({
  ...DEFAULT_CAPABILITIES,
  ...(store?.access_capabilities && typeof store.access_capabilities === 'object'
    ? store.access_capabilities
    : {})
});

export const canUseProductCart = (store = null) => getAccessCapabilities(store).cart === true;
export const canUseCheckout = (store = null) => getAccessCapabilities(store).checkout === true;
export const canUseBooking = (store = null) => getAccessCapabilities(store).booking === true;
export const canViewCatalog = (store = null) => getAccessCapabilities(store).catalog === true;

export const buildAccessPolicyStorePatch = (accessPolicy = null) => {
  if (!accessPolicy || typeof accessPolicy !== 'object') return null;
  return {
    customer_access_mode: accessPolicy.customer_access_mode,
    effective_customer_access_mode: accessPolicy.effective_customer_access_mode,
    max_customer_access_mode: accessPolicy.max_customer_access_mode,
    inventory_display_mode: accessPolicy.inventory_display_mode,
    inventory_low_stock_display_threshold: accessPolicy.inventory_low_stock_display_threshold,
    access_capabilities: accessPolicy.access_capabilities,
    access_limitation_reason: accessPolicy.limitation_reason || accessPolicy.access_limitation_reason || null,
    customer_access_modes_enabled: accessPolicy.customer_access_modes_enabled,
    guest_checkout_enabled: accessPolicy.guest_checkout_enabled
  };
};

// #622: fail OPEN on the client -- a missing/undefined value (an older cached SPA build served
// against a newer or older API) must never trap a customer in an un-completable guest flow. The
// server (assertGuestCheckoutAllowed, apps/dgfy-api) is the authority and fails closed; this is
// only a UI convenience to hide the guest path when the merchant has explicitly disabled it.
export const isGuestCheckoutAllowed = (store = null) => store?.guest_checkout_enabled !== false;

export const shouldClearStorefrontCart = ({
  cart = [],
  productCartPermitted = false,
  checkoutPermitted = false,
  bookingPermitted = false
} = {}) => {
  const lines = Array.isArray(cart) ? cart : [];
  const hasServiceLines = lines.some((line) => line?.category === 'service');
  const hasProductLines = lines.some((line) => line?.category !== 'service');

  return (hasProductLines && (!productCartPermitted || !checkoutPermitted))
    || (hasServiceLines && !bookingPermitted);
};

export const getInventoryDisplayLabel = (item = {}) => {
  const label = item?.inventory_display?.label;
  return typeof label === 'string' && label.trim() ? label.trim() : null;
};

export const getStorefrontAccessBlockMessage = (store = null) => {
  const requestedMode = String(
    store?.requested_customer_access_mode
      || store?.customer_access_mode
      || ''
  ).trim().toLowerCase();
  const effectiveMode = String(
    store?.effective_customer_access_mode
      || requestedMode
      || ''
  ).trim().toLowerCase();
  if (requestedMode === 'transaction' && effectiveMode && effectiveMode !== 'transaction') {
    return 'Online ordering is requested, but checkout is capped by registration readiness.';
  }
  const mode = effectiveMode || requestedMode;
  const modeMessage = getStorefrontAccessModeMessage(mode);
  if (modeMessage) {
    return modeMessage;
  }
  const capabilities = getAccessCapabilities(store);
  if (capabilities.checkout !== true || capabilities.booking !== true || capabilities.cart !== true) {
    return 'This Storefront action is not available right now.';
  }
  return null;
};

import { getStorefrontAccessModeMessage } from '../../../src/utils/tenantCapabilityMessages.js';

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

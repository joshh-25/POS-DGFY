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

export const getInventoryDisplayLabel = (item = {}) => {
  const label = item?.inventory_display?.label;
  return typeof label === 'string' && label.trim() ? label.trim() : null;
};

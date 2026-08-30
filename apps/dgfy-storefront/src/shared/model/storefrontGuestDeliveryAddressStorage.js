const STOREFRONT_GUEST_DELIVERY_ADDRESS_STORAGE_KEY = 'dgfy_store_guest_delivery_address_v1';

/**
 * #1219: the single remembered delivery address for a not-signed-in visitor.
 * Modelled byte-for-byte on `storefrontCustomerStorage.js`'s
 * normalize/read/write/clear shape (`normalizeSavedCustomerDetails` et al.) --
 * one remembered address, not a device-local address book (that's a separate
 * feature, tracked as a follow-up rather than built here).
 */
export const normalizeGuestDeliveryAddress = (value) => {
  if (!value || typeof value !== 'object') return null;
  const addressLine = String(value.addressLine || '').trim();
  if (!addressLine) return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  const hasFiniteCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  return {
    version: 1,
    addressLine,
    latitude: hasFiniteCoordinates ? latitude : null,
    longitude: hasFiniteCoordinates ? longitude : null,
    savedAt: Number(value.savedAt) || Date.now()
  };
};

export const readGuestDeliveryAddress = () => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STOREFRONT_GUEST_DELIVERY_ADDRESS_STORAGE_KEY) || 'null');
    return normalizeGuestDeliveryAddress(parsed);
  } catch {
    return null;
  }
};

export const writeGuestDeliveryAddress = (value) => {
  if (typeof window === 'undefined') return null;
  const normalized = normalizeGuestDeliveryAddress(value);
  if (!normalized) return null;
  window.localStorage.setItem(STOREFRONT_GUEST_DELIVERY_ADDRESS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
};

export const clearGuestDeliveryAddress = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STOREFRONT_GUEST_DELIVERY_ADDRESS_STORAGE_KEY);
};

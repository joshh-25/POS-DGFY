export const STOREFRONT_GUEST_CHECKOUT_DRAFT_KEY = 'dgfy_store_guest_checkout_draft_v1';

// grab_pay/shopeepay were missing here even though the storefront's own online-payment rail
// list has included them for a while (storefrontCheckoutPaymentOptions.js) -- a restored guest
// draft that had one of those two selected would silently coerce to 'cash' below (#613), which
// for a downpayment-required store re-surfaces a payment type the storefront is about to hide.
export const VALID_STORE_PAYMENT_TYPES = new Set(['cash', 'gcash', 'maya', 'card', 'bank_transfer', 'qrph', 'grab_pay', 'shopeepay']);

const normalizeSlug = (value = '') => String(value || '').trim().toLowerCase();

const normalizeCartLines = (value = []) => (
  Array.isArray(value)
    ? value.filter((line) => Number(line?.item_id) > 0 && Number(line?.quantity) > 0)
    : []
);

const normalizeStep = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

export const isValidStorePaymentType = (value) => (
  VALID_STORE_PAYMENT_TYPES.has(String(value || '').trim())
);

export const normalizeGuestCheckoutDraft = (value = {}) => {
  if (!value || typeof value !== 'object') return null;
  const routeSlug = normalizeSlug(value.routeSlug || value.storeSlug || '');
  const cart = normalizeCartLines(value.cart);
  if (!routeSlug || cart.length === 0) return null;

  const rawPaymentType = String(value.paymentType || '').trim();
  const paymentType = isValidStorePaymentType(rawPaymentType) ? rawPaymentType : 'cash';

  const customerPin = value.customerPin
    && Number.isFinite(Number(value.customerPin.latitude))
    && Number.isFinite(Number(value.customerPin.longitude))
    ? {
        latitude: Number(value.customerPin.latitude),
        longitude: Number(value.customerPin.longitude)
      }
    : null;

  return {
    version: 1,
    routeSlug,
    checkoutTab: String(value.checkoutTab || 'checkout').trim() || 'checkout',
    cart,
    selectedLocationId: Number.isFinite(Number(value.selectedLocationId)) ? Number(value.selectedLocationId) : null,
    orderMethod: String(value.orderMethod || 'delivery').trim() || 'delivery',
    simpleOrderStep: normalizeStep(value.simpleOrderStep, 1),
    fnbOrderStep: normalizeStep(value.fnbOrderStep, 3),
    customerFirstName: String(value.customerFirstName || '').trim(),
    customerLastName: String(value.customerLastName || '').trim(),
    customerName: String(value.customerName || '').trim(),
    customerPhone: String(value.customerPhone || '').trim(),
    customerEmail: String(value.customerEmail || '').trim(),
    customerAddress: String(value.customerAddress || '').trim(),
    resolvedDeliveryAddress: String(value.resolvedDeliveryAddress || '').trim(),
    deliveryLocationAction: String(value.deliveryLocationAction || '').trim(),
    customerPin,
    selectedSavedLocationId: String(value.selectedSavedLocationId || '').trim(),
    fnbScheduleMode: String(value.fnbScheduleMode || 'asap').trim() || 'asap',
    fnbScheduledFor: String(value.fnbScheduledFor || '').trim(),
    fnbSpecialInstructions: String(value.fnbSpecialInstructions || '').trim(),
    paymentType,
    savedAt: Number(value.savedAt) || Date.now()
  };
};

export const readGuestCheckoutDraft = (routeSlug = '') => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STOREFRONT_GUEST_CHECKOUT_DRAFT_KEY) || 'null');
    const normalized = normalizeGuestCheckoutDraft(parsed);
    if (!normalized) {
      window.sessionStorage.removeItem(STOREFRONT_GUEST_CHECKOUT_DRAFT_KEY);
      return null;
    }
    const expectedSlug = normalizeSlug(routeSlug);
    if (expectedSlug && normalized.routeSlug !== expectedSlug) return null;
    return normalized;
  } catch {
    window.sessionStorage.removeItem(STOREFRONT_GUEST_CHECKOUT_DRAFT_KEY);
    return null;
  }
};

export const writeGuestCheckoutDraft = (value) => {
  if (typeof window === 'undefined') return null;
  const normalized = normalizeGuestCheckoutDraft(value);
  if (!normalized) return null;
  window.sessionStorage.setItem(STOREFRONT_GUEST_CHECKOUT_DRAFT_KEY, JSON.stringify(normalized));
  return normalized;
};

export const clearGuestCheckoutDraft = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STOREFRONT_GUEST_CHECKOUT_DRAFT_KEY);
};

const toSlug = (value) => String(value || '').trim().toLowerCase();

const STOREFRONT_RECENT_STORES_STORAGE_KEY = 'dgfy_store_recent_stores';
const STOREFRONT_LAST_STORE_STORAGE_KEY = 'dgfy_store_last_store_slug';
const STOREFRONT_SAVED_DETAILS_STORAGE_KEY = 'dgfy_store_saved_customer_details_v1';
const STOREFRONT_CHECKOUT_AUTH_RESUME_KEY = 'dgfy_store_checkout_auth_resume_v1';
const STOREFRONT_VISITOR_ID_STORAGE_KEY = 'dgfy_storefront_visitor_id';
const STOREFRONT_VISITOR_ID_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export const getOrCreateStorefrontVisitorId = () => {
  if (typeof window === 'undefined') return '';
  const existing = String(window.localStorage.getItem(STOREFRONT_VISITOR_ID_STORAGE_KEY) || '').trim();
  if (STOREFRONT_VISITOR_ID_PATTERN.test(existing)) return existing;
  const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}${Math.random().toString(36).slice(2, 18)}`;
  window.localStorage.setItem(STOREFRONT_VISITOR_ID_STORAGE_KEY, generated);
  return generated;
};

export const normalizeSavedCustomerDetails = (value) => {
  if (!value || typeof value !== 'object') return null;
  const rawName = String(value.name || '').trim();
  const rawFirstName = String(value.firstName || '').trim();
  const rawLastName = String(value.lastName || '').trim();
  const derivedNameParts = rawName
    ? (() => {
        const segments = rawName.split(/\s+/).filter(Boolean);
        if (segments.length <= 1) return { firstName: rawName, lastName: '' };
        return {
          firstName: segments.slice(0, -1).join(' '),
          lastName: segments.slice(-1).join(' ')
        };
      })()
    : { firstName: '', lastName: '' };
  const firstName = rawFirstName || derivedNameParts.firstName;
  const lastName = rawLastName || derivedNameParts.lastName;
  const name = [firstName, lastName].filter(Boolean).join(' ').trim() || rawName;
  const phone = String(value.phone || '').trim();
  const email = String(value.email || '').trim();
  if (!name && !phone && !email) return null;
  return {
    firstName,
    lastName,
    name,
    phone,
    email,
    updatedAt: Number(value.updatedAt) || Date.now(),
    source: String(value.source || 'guest').trim() || 'guest'
  };
};

export const readSavedCustomerDetails = () => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STOREFRONT_SAVED_DETAILS_STORAGE_KEY) || 'null');
    return normalizeSavedCustomerDetails(parsed);
  } catch {
    return null;
  }
};

export const writeSavedCustomerDetails = (value) => {
  if (typeof window === 'undefined') return null;
  const normalized = normalizeSavedCustomerDetails(value);
  if (!normalized) return null;
  window.localStorage.setItem(STOREFRONT_SAVED_DETAILS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
};

export const clearSavedCustomerDetails = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STOREFRONT_SAVED_DETAILS_STORAGE_KEY);
};

export const normalizeCheckoutAuthResumeDraft = (value) => {
  if (!value || typeof value !== 'object') return null;
  const routeSlug = toSlug(value.routeSlug || value.storeSlug || '');
  const checkoutTab = String(value.checkoutTab || '').trim();
  const cart = Array.isArray(value.cart) ? value.cart : [];
  if (!routeSlug || !checkoutTab || cart.length === 0) return null;
  return {
    version: 1,
    routeSlug,
    returnTo: String(value.returnTo || '').trim(),
    checkoutTab,
    fnbOrderStep: Number(value.fnbOrderStep || 0) || null,
    simpleOrderStep: Number(value.simpleOrderStep || 0) || null,
    serviceBookingStep: Number(value.serviceBookingStep || 0) || null,
    selectedLocationId: Number.isFinite(Number(value.selectedLocationId)) ? Number(value.selectedLocationId) : null,
    selectedSavedLocationId: String(value.selectedSavedLocationId || '').trim(),
    orderMethod: String(value.orderMethod || '').trim(),
    fnbScheduledFor: String(value.fnbScheduledFor || '').trim(),
    fnbScheduleMode: String(value.fnbScheduleMode || '').trim(),
    fnbSpecialInstructions: String(value.fnbSpecialInstructions || '').trim(),
    serviceAppointmentAt: String(value.serviceAppointmentAt || '').trim(),
    servicePaymentTiming: String(value.servicePaymentTiming || '').trim(),
    customerAddress: String(value.customerAddress || '').trim(),
    serviceLocationLandmarkNote: String(value.serviceLocationLandmarkNote || '').trim(),
    resolvedDeliveryAddress: String(value.resolvedDeliveryAddress || '').trim(),
    deliveryLocationAction: String(value.deliveryLocationAction || '').trim(),
    customerPin: value.customerPin && Number.isFinite(Number(value.customerPin.latitude)) && Number.isFinite(Number(value.customerPin.longitude))
      ? {
        latitude: Number(value.customerPin.latitude),
        longitude: Number(value.customerPin.longitude)
      }
      : null,
    serviceIntakeResponses: value.serviceIntakeResponses && typeof value.serviceIntakeResponses === 'object'
      ? value.serviceIntakeResponses
      : {},
    cart,
    selectedServiceItemId: Number.isFinite(Number(value.selectedServiceItemId)) ? Number(value.selectedServiceItemId) : null,
    savedAt: Number(value.savedAt) || Date.now()
  };
};

export const readCheckoutAuthResumeDraft = () => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STOREFRONT_CHECKOUT_AUTH_RESUME_KEY) || 'null');
    return normalizeCheckoutAuthResumeDraft(parsed);
  } catch {
    return null;
  }
};

export const writeCheckoutAuthResumeDraft = (value) => {
  if (typeof window === 'undefined') return null;
  const normalized = normalizeCheckoutAuthResumeDraft(value);
  if (!normalized) return null;
  window.sessionStorage.setItem(STOREFRONT_CHECKOUT_AUTH_RESUME_KEY, JSON.stringify(normalized));
  return normalized;
};

export const clearCheckoutAuthResumeDraft = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STOREFRONT_CHECKOUT_AUTH_RESUME_KEY);
};

export const maskValue = (value = '', keepPrefix = 2, keepSuffix = 1) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length <= keepPrefix + keepSuffix) return '*'.repeat(Math.max(2, raw.length));
  return `${raw.slice(0, keepPrefix)}${'*'.repeat(Math.max(2, raw.length - keepPrefix - keepSuffix))}${raw.slice(-keepSuffix)}`;
};

export const buildMaskedSavedCustomerPreview = (savedCustomerDetails) => {
  if (!savedCustomerDetails) return '';
  const previewParts = [];
  if (savedCustomerDetails.name) previewParts.push(savedCustomerDetails.name);
  if (savedCustomerDetails.phone) previewParts.push(maskValue(savedCustomerDetails.phone, 3, 2));
  if (savedCustomerDetails.email) previewParts.push(maskValue(savedCustomerDetails.email, 2, 8));
  return previewParts.join(' | ');
};

export const splitCustomerName = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: trimmed, lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.slice(-1).join(' ')
  };
};

export const buildCustomerFullName = (firstName = '', lastName = '') => (
  [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ').trim()
);

const normalizeRecentStoreEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const slug = toSlug(entry.slug);
  if (!slug) return null;
  return {
    slug,
    tenant_name: String(entry.tenant_name || entry.name || slug).trim() || slug,
    address_line: String(entry.address_line || '').trim(),
    business_mode: String(entry.business_mode || entry.workflow_mode || '').trim().toLowerCase(),
    storefront_open: entry.storefront_open !== false
  };
};

export const readRecentStores = () => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STOREFRONT_RECENT_STORES_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRecentStoreEntry).filter(Boolean).slice(0, 8);
  } catch {
    return [];
  }
};

export const readLastStoreSlug = () => {
  if (typeof window === 'undefined') return '';
  return toSlug(window.localStorage.getItem(STOREFRONT_LAST_STORE_STORAGE_KEY) || '');
};

export const persistRecentStore = (entry) => {
  const normalizedEntry = normalizeRecentStoreEntry(entry);
  if (typeof window === 'undefined' || !normalizedEntry) return readRecentStores();
  const next = [
    normalizedEntry,
    ...readRecentStores().filter((store) => toSlug(store.slug) !== normalizedEntry.slug)
  ].slice(0, 8);
  window.localStorage.setItem(STOREFRONT_RECENT_STORES_STORAGE_KEY, JSON.stringify(next));
  window.localStorage.setItem(STOREFRONT_LAST_STORE_STORAGE_KEY, normalizedEntry.slug);
  return next;
};

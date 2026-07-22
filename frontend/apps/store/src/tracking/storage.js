const STOREFRONT_LAST_TRACKING_PIN_KEY_PREFIX = 'dgfy_store_last_tracking_pin_v1';
const STOREFRONT_TRACKED_ORDERS_KEY_PREFIX = 'dgfy_store_tracked_orders_v1';

const normalizeTrackingStoreSlug = (value = '') => String(value || '').trim().toLowerCase();

export const TERMINAL_TRACKING_STATUSES = new Set(['completed', 'delivered', 'picked_up', 'cancelled', 'rejected']);

const getLastTrackingPinStorageKey = (slug = '') => `${STOREFRONT_LAST_TRACKING_PIN_KEY_PREFIX}:${normalizeTrackingStoreSlug(slug)}`;

export const readLastTrackingPinForStore = (slug = '') => {
  if (typeof window === 'undefined') return '';
  const normalizedSlug = normalizeTrackingStoreSlug(slug);
  if (!normalizedSlug) return '';
  return String(window.localStorage.getItem(getLastTrackingPinStorageKey(normalizedSlug)) || '').trim().toUpperCase();
};

export const writeLastTrackingPinForStore = (slug = '', pin = '') => {
  if (typeof window === 'undefined') return;
  const normalizedSlug = normalizeTrackingStoreSlug(slug);
  const normalizedPin = String(pin || '').trim().toUpperCase();
  if (!normalizedSlug || !normalizedPin) return;
  window.localStorage.setItem(getLastTrackingPinStorageKey(normalizedSlug), normalizedPin);
};

const getTrackedOrdersStorageKey = (slug = '') => `${STOREFRONT_TRACKED_ORDERS_KEY_PREFIX}:${normalizeTrackingStoreSlug(slug)}`;

const compareTrackedOrderEntries = (left = {}, right = {}) => {
  const leftTime = Date.parse(left.updated_at || left.created_at || 0) || 0;
  const rightTime = Date.parse(right.updated_at || right.created_at || 0) || 0;
  return rightTime - leftTime;
};

export const normalizeTrackedOrderEntry = (entry, fallback = {}) => {
  if (!entry || typeof entry !== 'object') return null;
  const trackingPin = String(entry.tracking_pin || entry.trackingPin || '').trim().toUpperCase();
  const status = String(entry.status || '').trim().toLowerCase();
  if (!trackingPin) return null;
  const items = Array.isArray(entry.items)
    ? entry.items
      .map((item, index) => {
        const name = String(item?.name || item?.item_name || item?.label || '').trim();
        if (!name) return null;
        const quantity = Number(item?.qty ?? item?.quantity ?? 1);
        const amountValue = item?.amount ?? item?.line_subtotal ?? item?.sale_price ?? item?.price ?? null;
        return {
          id: item?.id ?? item?.line_id ?? item?.item_id ?? `tracked-item-${index}`,
          item_id: Number.isFinite(Number(item?.item_id)) ? Number(item.item_id) : null,
          name,
          qty: Number.isFinite(quantity) ? quantity : 1,
          amount: Number.isFinite(Number(amountValue)) ? Number(amountValue) : null,
          image_url: String(item?.image_url || item?.thumbnail || '').trim(),
          unit_of_measure: String(item?.unit_of_measure || '').trim()
        };
      })
      .filter(Boolean)
    : [];
  return {
    tracking_pin: trackingPin,
    status,
    status_label: String(entry.status_label || entry.statusLabel || '').trim(),
    order_method: String(entry.order_method || entry.orderMethod || 'delivery').trim().toLowerCase(),
    updated_at: String(entry.updated_at || entry.updatedAt || '').trim(),
    created_at: String(entry.created_at || entry.createdAt || '').trim(),
    item_name: String(entry.item_name || entry.itemName || '').trim(),
    store_slug: normalizeTrackingStoreSlug(entry.store_slug || entry.storeSlug || fallback.storeSlug || ''),
    store_name: String(entry.store_name || entry.storeName || fallback.storeName || '').trim(),
    store_logo: String(entry.store_logo || entry.storeLogo || fallback.storeLogo || '').trim(),
    branch_name: String(entry.branch_name || entry.branchName || fallback.branchName || '').trim(),
    item_count: Number.isFinite(Number(entry.item_count ?? entry.itemCount))
      ? Number(entry.item_count ?? entry.itemCount)
      : null,
    eta_minutes: Number.isFinite(Number(entry.eta_minutes ?? entry.etaMinutes))
      ? Number(entry.eta_minutes ?? entry.etaMinutes)
      : null,
    subtotal: Number.isFinite(Number(entry.subtotal ?? entry.subtotal_amount ?? entry.subtotalAmount))
      ? Number(entry.subtotal ?? entry.subtotal_amount ?? entry.subtotalAmount)
      : null,
    discount_amount: Number.isFinite(Number(entry.discount_amount ?? entry.discountAmount))
      ? Number(entry.discount_amount ?? entry.discountAmount)
      : null,
    discount_label: String(entry.discount_label || entry.discountLabel || entry.promo_label || entry.promoLabel || '').trim(),
    delivery_fee: Number.isFinite(Number(entry.delivery_fee ?? entry.deliveryFee))
      ? Number(entry.delivery_fee ?? entry.deliveryFee)
      : null,
    service_fee: Number.isFinite(Number(entry.service_fee ?? entry.serviceFee ?? entry.service_fee_amount ?? entry.serviceFeeAmount))
      ? Number(entry.service_fee ?? entry.serviceFee ?? entry.service_fee_amount ?? entry.serviceFeeAmount)
      : null,
    total_amount: Number.isFinite(Number(entry.total_amount ?? entry.totalAmount))
      ? Number(entry.total_amount ?? entry.totalAmount)
      : null,
    delivery_address: String(entry.delivery_address || entry.deliveryAddress || '').trim(),
    branch_address: String(entry.branch_address || entry.branchAddress || '').trim(),
    items
  };
};

export const mergeTrackedOrderEntries = (entries = []) => {
  const deduped = new globalThis.Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const normalized = normalizeTrackedOrderEntry(entry);
    if (!normalized?.tracking_pin) return;
    const existing = deduped.get(normalized.tracking_pin);
    if (!existing || compareTrackedOrderEntries(normalized, existing) < 0) {
      deduped.set(normalized.tracking_pin, normalized);
    }
  });
  return Array.from(deduped.values()).sort(compareTrackedOrderEntries).slice(0, 20);
};

export const readTrackedOrdersForStore = (slug = '') => {
  if (typeof window === 'undefined') return [];
  const normalizedSlug = normalizeTrackingStoreSlug(slug);
  if (!normalizedSlug) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(getTrackedOrdersStorageKey(normalizedSlug)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return mergeTrackedOrderEntries(parsed.map((entry) => normalizeTrackedOrderEntry(entry, { storeSlug: normalizedSlug })));
  } catch {
    return [];
  }
};

export const writeTrackedOrdersForStore = (slug = '', entries = []) => {
  if (typeof window === 'undefined') return [];
  const normalizedSlug = normalizeTrackingStoreSlug(slug);
  if (!normalizedSlug) return [];
  const next = mergeTrackedOrderEntries(
    (Array.isArray(entries) ? entries : []).map((entry) => normalizeTrackedOrderEntry(entry, { storeSlug: normalizedSlug }))
  );
  window.localStorage.setItem(getTrackedOrdersStorageKey(normalizedSlug), JSON.stringify(next));
  return next;
};

export const upsertTrackedOrderForStore = (slug = '', entry = null) => {
  const normalized = normalizeTrackedOrderEntry(entry);
  if (!normalized) return readTrackedOrdersForStore(slug);
  const current = readTrackedOrdersForStore(slug).filter((item) => item.tracking_pin !== normalized.tracking_pin);
  if (TERMINAL_TRACKING_STATUSES.has(normalized.status)) {
    return writeTrackedOrdersForStore(slug, current);
  }
  return writeTrackedOrdersForStore(slug, [normalized, ...current]);
};

export const readTrackedOrdersAcrossStores = () => {
  if (typeof window === 'undefined') return [];
  const prefix = `${STOREFRONT_TRACKED_ORDERS_KEY_PREFIX}:`;
  try {
    const entries = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      const slug = normalizeTrackingStoreSlug(key.slice(prefix.length));
      if (!slug) continue;
      entries.push(...readTrackedOrdersForStore(slug));
    }
    return mergeTrackedOrderEntries(entries);
  } catch {
    return [];
  }
};

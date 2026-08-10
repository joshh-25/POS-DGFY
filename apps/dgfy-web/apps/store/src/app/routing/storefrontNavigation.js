import {
  STORE_BOOKING_SUBPAGE,
  STORE_ITEM_SUBPAGE,
  STORE_ORDER_SUBPAGE,
  STORE_SERVICE_SUBPAGE,
  STORE_TRACK_SUBPAGE,
  storePath
} from './storefrontRouting.js';

const normalizeNavigationSlug = (value) => String(value || '').trim().toLowerCase();

export const buildStorefrontHistoryState = ({
  storeSlug = '',
  storeSubpage = null,
  serviceItemId = '',
  itemId = '',
  reviewToken = ''
} = {}) => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  const normalizedSubpage = storeSubpage ? String(storeSubpage).trim().toLowerCase() : null;
  const state = {
    storeSlug: normalizedSlug,
    storeSubpage: normalizedSubpage
  };
  const normalizedServiceItemId = String(serviceItemId || '').trim();
  const normalizedItemId = String(itemId || '').trim();
  const normalizedReviewToken = String(reviewToken || '').trim();
  if (normalizedServiceItemId) state.serviceItemId = normalizedServiceItemId;
  if (normalizedItemId) state.itemId = normalizedItemId;
  if (normalizedReviewToken) state.reviewToken = normalizedReviewToken;
  return state;
};

export const buildServiceDetailTarget = (storeSlug, serviceItemId) => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  const normalizedServiceItemId = String(serviceItemId || '').trim();
  if (!normalizedSlug || !normalizedServiceItemId) return '';
  return storePath(normalizedSlug, STORE_SERVICE_SUBPAGE, `?service=${encodeURIComponent(normalizedServiceItemId)}`);
};

export const buildItemDetailTarget = (storeSlug, itemId, { reviewToken = '' } = {}) => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  const normalizedItemId = String(itemId || '').trim();
  if (!normalizedSlug || !normalizedItemId) return '';
  const params = new URLSearchParams();
  params.set('item', normalizedItemId);
  const normalizedReviewToken = String(reviewToken || '').trim();
  if (normalizedReviewToken) {
    params.set('review_token', normalizedReviewToken);
    params.set('review', '1');
  }
  return storePath(normalizedSlug, STORE_ITEM_SUBPAGE, `?${params.toString()}`);
};

export const buildCatalogTarget = (storeSlug) => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  return normalizedSlug ? storePath(normalizedSlug) : '';
};

export const buildOrderTarget = (storeSlug) => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  return normalizedSlug ? storePath(normalizedSlug, STORE_ORDER_SUBPAGE) : '';
};

export const buildBookingTarget = (storeSlug) => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  return normalizedSlug ? storePath(normalizedSlug, STORE_BOOKING_SUBPAGE) : '';
};

export const buildTrackTarget = (storeSlug, pin = '') => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  if (!normalizedSlug) return '';
  const normalizedPin = String(pin || '').trim().toUpperCase();
  return normalizedPin
    ? `${storePath(normalizedSlug, STORE_TRACK_SUBPAGE)}?pin=${encodeURIComponent(normalizedPin)}`
    : storePath(normalizedSlug, STORE_TRACK_SUBPAGE);
};

export const buildCanonicalStorefrontTarget = ({
  storeSlug = '',
  routeSubpage = null,
  routeServiceItemId = '',
  routeItemId = ''
} = {}) => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  if (!normalizedSlug) return '';
  if (routeSubpage === STORE_BOOKING_SUBPAGE) return storePath(normalizedSlug, STORE_BOOKING_SUBPAGE);
  if (routeSubpage === STORE_TRACK_SUBPAGE) return storePath(normalizedSlug, STORE_TRACK_SUBPAGE);
  if (routeSubpage === STORE_ORDER_SUBPAGE) return storePath(normalizedSlug, STORE_ORDER_SUBPAGE);
  if (routeSubpage === STORE_SERVICE_SUBPAGE && String(routeServiceItemId || '').trim()) {
    return buildServiceDetailTarget(normalizedSlug, routeServiceItemId);
  }
  if (routeSubpage === STORE_ITEM_SUBPAGE && String(routeItemId || '').trim()) {
    return buildItemDetailTarget(normalizedSlug, routeItemId);
  }
  return storePath(normalizedSlug);
};

export const isCurrentStorefrontTarget = (target) => {
  if (!target || typeof window === 'undefined') return false;
  return `${window.location.pathname}${window.location.search}` === target;
};

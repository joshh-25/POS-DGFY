import {
  STORE_BOOKING_SUBPAGE,
  STORE_ITEM_SUBPAGE,
  STORE_ORDER_SUBPAGE,
  STORE_SERVICE_SUBPAGE,
  STORE_TRACK_SUBPAGE,
  storePath
} from './storefrontRouting.js';

const normalizeNavigationSlug = (value) => String(value || '').trim().toLowerCase();

const normalizeLocationId = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const buildQueryString = (params) => {
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const buildStorefrontHistoryState = ({
  storeSlug = '',
  storeSubpage = null,
  serviceItemId = '',
  itemId = '',
  reviewToken = '',
  locationId = null
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
  const normalizedLocationId = normalizeLocationId(locationId);
  if (normalizedLocationId != null) state.locationId = normalizedLocationId;
  return state;
};

export const buildServiceDetailTarget = (storeSlug, serviceItemId, { locationId = null } = {}) => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  const normalizedServiceItemId = String(serviceItemId || '').trim();
  if (!normalizedSlug || !normalizedServiceItemId) return '';
  const params = new URLSearchParams({ service: normalizedServiceItemId });
  const normalizedLocationId = normalizeLocationId(locationId);
  if (normalizedLocationId != null) params.set('location_id', String(normalizedLocationId));
  return storePath(normalizedSlug, STORE_SERVICE_SUBPAGE, buildQueryString(params));
};

export const buildItemDetailTarget = (storeSlug, itemId, { reviewToken = '', locationId = null } = {}) => {
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
  const normalizedLocationId = normalizeLocationId(locationId);
  if (normalizedLocationId != null) params.set('location_id', String(normalizedLocationId));
  return storePath(normalizedSlug, STORE_ITEM_SUBPAGE, buildQueryString(params));
};

export const buildCatalogTarget = (storeSlug, { locationId = null } = {}) => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  if (!normalizedSlug) return '';
  const normalizedLocationId = normalizeLocationId(locationId);
  return storePath(normalizedSlug, null, normalizedLocationId == null ? '' : `?location_id=${normalizedLocationId}`);
};

export const buildOrderTarget = (storeSlug, { locationId = null } = {}) => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  if (!normalizedSlug) return '';
  const normalizedLocationId = normalizeLocationId(locationId);
  return storePath(normalizedSlug, STORE_ORDER_SUBPAGE, normalizedLocationId == null ? '' : `?location_id=${normalizedLocationId}`);
};

export const buildBookingTarget = (storeSlug, { locationId = null } = {}) => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  if (!normalizedSlug) return '';
  const normalizedLocationId = normalizeLocationId(locationId);
  return storePath(normalizedSlug, STORE_BOOKING_SUBPAGE, normalizedLocationId == null ? '' : `?location_id=${normalizedLocationId}`);
};

export const buildTrackTarget = (storeSlug, pin = '', { locationId = null } = {}) => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  if (!normalizedSlug) return '';
  const normalizedPin = String(pin || '').trim().toUpperCase();
  const params = new URLSearchParams();
  if (normalizedPin) params.set('pin', normalizedPin);
  const normalizedLocationId = normalizeLocationId(locationId);
  if (normalizedLocationId != null) params.set('location_id', String(normalizedLocationId));
  return storePath(normalizedSlug, STORE_TRACK_SUBPAGE, buildQueryString(params));
};

export const buildCanonicalStorefrontTarget = ({
  storeSlug = '',
  routeSubpage = null,
  routeServiceItemId = '',
  routeItemId = '',
  locationId = null
} = {}) => {
  const normalizedSlug = normalizeNavigationSlug(storeSlug);
  if (!normalizedSlug) return '';
  if (routeSubpage === STORE_BOOKING_SUBPAGE) return buildBookingTarget(normalizedSlug, { locationId });
  if (routeSubpage === STORE_TRACK_SUBPAGE) return buildTrackTarget(normalizedSlug, '', { locationId });
  if (routeSubpage === STORE_ORDER_SUBPAGE) return buildOrderTarget(normalizedSlug, { locationId });
  if (routeSubpage === STORE_SERVICE_SUBPAGE && String(routeServiceItemId || '').trim()) {
    return buildServiceDetailTarget(normalizedSlug, routeServiceItemId, { locationId });
  }
  if (routeSubpage === STORE_ITEM_SUBPAGE && String(routeItemId || '').trim()) {
    return buildItemDetailTarget(normalizedSlug, routeItemId, { locationId });
  }
  return buildCatalogTarget(normalizedSlug, { locationId });
};

export const isCurrentStorefrontTarget = (target) => {
  if (!target || typeof window === 'undefined') return false;
  return `${window.location.pathname}${window.location.search}` === target;
};

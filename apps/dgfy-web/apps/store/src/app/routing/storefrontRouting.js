// "/s/" is a short inbound alias for affiliate share links/QR codes (kept compact so
// the encoded QR payload stays small). It resolves the same way as /tenant-store/ and
// /store/ — outbound links built by storePath() still use the canonical /tenant-store/
// prefix; /s/ only needs to be *recognized* on the way in.
const TENANT_STORE_PATH_PATTERNS = [
  /^\/tenant-store\/([^/]+)(?:\/[^/]+){0,2}$/i,
  /^\/store\/([^/]+)(?:\/[^/]+){0,2}$/i,
  /^\/s\/([^/]+)(?:\/[^/]+){0,2}$/i
];

const TENANT_STORE_HASH_PATTERNS = [
  /^#\/tenant-store\/([^/]+)(?:\/[^/]+){0,2}$/i,
  /^#\/store\/([^/]+)(?:\/[^/]+){0,2}$/i,
  /^#\/s\/([^/]+)(?:\/[^/]+){0,2}$/i
];

const TENANT_STORE_SUBPAGE_PATTERNS = [
  /^\/tenant-store\/[^/]+\/([^/]+)(?:\/[^/]+)?$/i,
  /^\/store\/[^/]+\/([^/]+)(?:\/[^/]+)?$/i,
  /^\/s\/[^/]+\/([^/]+)(?:\/[^/]+)?$/i
];

const TENANT_STORE_SUBPAGE_HASH_PATTERNS = [
  /^#\/tenant-store\/[^/]+\/([^/]+)(?:\/[^/]+)?$/i,
  /^#\/store\/[^/]+\/([^/]+)(?:\/[^/]+)?$/i,
  /^#\/s\/[^/]+\/([^/]+)(?:\/[^/]+)?$/i
];

const normalizeRouteSlug = (value) => String(value || '').trim().toLowerCase();
let customStorefrontRouteContext = null;

export const setCustomStorefrontRouteContext = (context = null) => {
  const slug = normalizeRouteSlug(context?.slug);
  customStorefrontRouteContext = slug
    ? { slug, canonicalOrigin: String(context?.canonical_origin || '').trim() }
    : null;
};

export const getCustomStorefrontRouteContext = () => customStorefrontRouteContext;

const readQueryParam = (key, fallback = null) => {
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search || '');
  const raw = String(params.get(key) || '').trim();
  return raw || fallback;
};

export const TENANT_STORE_BASE_PATH = '/tenant-store';
export const STORE_BOOKING_SUBPAGE = 'book';
export const STORE_ORDER_SUBPAGE = 'order';
export const STORE_TRACK_SUBPAGE = 'track';
export const STORE_SERVICE_SUBPAGE = 'service';
export const STORE_ITEM_SUBPAGE = 'item';

export const storePath = (slug, subpage = null, query = '') => {
  const normalizedSlug = normalizeRouteSlug(slug);
  if (customStorefrontRouteContext?.slug === normalizedSlug) {
    return `${subpage ? `/${subpage}` : '/'}${query || ''}`;
  }
  return `${TENANT_STORE_BASE_PATH}/${encodeURIComponent(normalizedSlug)}${subpage ? `/${subpage}` : ''}${query || ''}`;
};

export const readRouteSlug = () => {
  if (typeof window === 'undefined') return null;
  if (customStorefrontRouteContext?.slug) return customStorefrontRouteContext.slug;
  const path = window.location.pathname || '';
  for (const pattern of TENANT_STORE_PATH_PATTERNS) {
    const match = path.match(pattern);
    if (match?.[1]) return normalizeRouteSlug(decodeURIComponent(match[1]));
  }
  for (const pattern of TENANT_STORE_HASH_PATTERNS) {
    const match = (window.location.hash || '').match(pattern);
    if (match?.[1]) return normalizeRouteSlug(decodeURIComponent(match[1]));
  }
  return null;
};

export const readStoreSubpage = () => {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname || '';
  if (customStorefrontRouteContext?.slug) {
    const segment = normalizeRouteSlug(path.split('/').filter(Boolean)[0]);
    return [STORE_BOOKING_SUBPAGE, STORE_ORDER_SUBPAGE, STORE_TRACK_SUBPAGE, STORE_SERVICE_SUBPAGE, STORE_ITEM_SUBPAGE, 'account'].includes(segment)
      ? segment
      : null;
  }
  for (const pattern of TENANT_STORE_SUBPAGE_PATTERNS) {
    const match = path.match(pattern);
    if (match?.[1]) return normalizeRouteSlug(decodeURIComponent(match[1]));
  }
  for (const pattern of TENANT_STORE_SUBPAGE_HASH_PATTERNS) {
    const match = (window.location.hash || '').match(pattern);
    if (match?.[1]) return normalizeRouteSlug(decodeURIComponent(match[1]));
  }
  return null;
};

export const readStoreServiceItemId = () => readQueryParam('service');

export const readStoreItemId = () => readQueryParam('item');

export const readStoreReviewToken = () => readQueryParam('review_token', '');

export const readTrackingPinFromQuery = () => String(readQueryParam('pin', '') || '').trim().toUpperCase();

export const readAffiliateShortCode = () => readQueryParam('p', '');

// #672: initial voucher-code capture from a shareable link, e.g. `?voucher=FEST2026`. Mirrors
// readAffiliateShortCode's `?p=` pattern rather than inventing a different param-reading shape.
export const readStoreVoucherCode = () => readQueryParam('voucher', '');

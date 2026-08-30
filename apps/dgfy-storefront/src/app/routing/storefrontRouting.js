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

// #452 (Phase 212): the exact generator alphabet for affiliate short codes -- see
// CODE_ALPHABET in apps/dgfy-api/src/modules/dgfy/repositories/dgfyAffiliateRepository.js. Kept
// in sync manually; if the generator alphabet ever changes, this pattern must change with it.
// Crockford-like, no 0/O/1/I. Applied strictly and BEFORE any slug handling in readRouteSlug()
// below -- a short code must never reach the slug resolver (see the guard's own comment for why).
const AFFILIATE_SHORT_CODE_PATTERN = /^AF-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/i;

const normalizeRouteSlug = (value) => String(value || '').trim().toLowerCase();
let customStorefrontRouteContext = null;
// #452 (Phase 212): set once GET /affiliate/s/:short_code resolves a /s/{short_code} path to a
// store slug. null until then -- readRouteSlug() must never fall back to the raw short-code
// segment itself. See setAffiliateShareRouteSlug below.
let affiliateShareRouteSlug = null;

export const setCustomStorefrontRouteContext = (context = null) => {
  const slug = normalizeRouteSlug(context?.slug);
  customStorefrontRouteContext = slug
    ? { slug, canonicalOrigin: String(context?.canonical_origin || '').trim() }
    : null;
};

export const getCustomStorefrontRouteContext = () => customStorefrontRouteContext;

// #452 (Phase 212): called by useAffiliateAttributionCapture once GET /affiliate/s/:short_code
// resolves a path-based short code to a store slug. Deliberately a SEPARATE module-level value
// from customStorefrontRouteContext -- that context makes storePath() emit bare `/order`-style
// paths for customer custom domains, which would corrupt every outbound link on dgfy.ph if reused
// here.
export const setAffiliateShareRouteSlug = (slug) => {
  affiliateShareRouteSlug = normalizeRouteSlug(slug) || null;
};

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
  // #452 (Phase 212): a short code (/s/AF-ABC234) must NEVER be handed to the slug resolver as
  // "af-abc234" -- resolveTenantByStoreSlug's miss path can trigger an all-tenant discovery-index
  // repair sweep, and every affiliate scan would be a distinct "unknown slug" feeding that
  // amplifier (the cause of the 2026-07-27 stage outage). This guard runs BEFORE the pattern
  // loops below and returns only the already-resolved slug (or null) -- never the raw segment.
  const shortCodeMatch = path.match(/^\/s\/([^/]+)/i);
  if (shortCodeMatch?.[1] && AFFILIATE_SHORT_CODE_PATTERN.test(shortCodeMatch[1])) {
    return affiliateShareRouteSlug;
  }
  for (const pattern of TENANT_STORE_PATH_PATTERNS) {
    const match = path.match(pattern);
    if (match?.[1]) return normalizeRouteSlug(decodeURIComponent(match[1]));
  }
  // #452 (Phase 212), RF-5 fix: the same guard as above, for the #/s/{X} hash-routing form --
  // window.location.pathname is often "/" when hash routing is in play, so the pathname-only
  // guard above never fires for a hash-form short code and it would otherwise fall straight
  // through into the generic TENANT_STORE_HASH_PATTERNS loop below and get returned as a slug.
  const hashShortCodeMatch = (window.location.hash || '').match(/^#\/s\/([^/]+)/i);
  if (hashShortCodeMatch?.[1] && AFFILIATE_SHORT_CODE_PATTERN.test(hashShortCodeMatch[1])) {
    return affiliateShareRouteSlug;
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

export const readStoreLocationId = () => {
  const raw = Number(readQueryParam('location_id'));
  return Number.isInteger(raw) && raw > 0 ? raw : null;
};

export const readStoreReviewToken = () => readQueryParam('review_token', '');

export const readTrackingPinFromQuery = () => String(readQueryParam('pin', '') || '').trim().toUpperCase();

// #452 (Phase 212): reads the affiliate short code from the /s/{short_code} path segment (and its
// #/s/{short_code} hash form, for parity with the four existing pattern arrays above). Returns the
// uppercased code only if it satisfies AFFILIATE_SHORT_CODE_PATTERN, else ''.
export const readAffiliateShortCodeFromPath = () => {
  if (typeof window === 'undefined') return '';
  const pathMatch = (window.location.pathname || '').match(/^\/s\/([^/]+)/i);
  if (pathMatch?.[1] && AFFILIATE_SHORT_CODE_PATTERN.test(pathMatch[1])) {
    return decodeURIComponent(pathMatch[1]).toUpperCase();
  }
  const hashMatch = (window.location.hash || '').match(/^#\/s\/([^/]+)/i);
  if (hashMatch?.[1] && AFFILIATE_SHORT_CODE_PATTERN.test(hashMatch[1])) {
    return decodeURIComponent(hashMatch[1]).toUpperCase();
  }
  return '';
};

// #452 (Phase 212), E1 decision (2026-08-30): path-only, no `?p=` fallback. `?p=` links are not
// meaningfully in circulation yet, so the read path is retired in the same phase as the /s/
// cutover, not kept as an indefinite back-compat shim -- see the dated Amendments block on ADR
// 0036 for the full record of this decision.
export const readAffiliateShortCode = () => readAffiliateShortCodeFromPath();

// #672: initial voucher-code capture from a shareable link, e.g. `?voucher=FEST2026`. Named after
// readAffiliateShortCode's original `?p=`-reading shape (retired per #452/Phase 212 -- that
// function now reads the /s/{short_code} path instead); this one still reads a plain query param
// and is unaffected by that retirement.
export const readStoreVoucherCode = () => readQueryParam('voucher', '');

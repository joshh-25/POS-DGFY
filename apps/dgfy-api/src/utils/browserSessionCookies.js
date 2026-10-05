import crypto from 'crypto';

export const SESSION_COOKIE_NAMES = Object.freeze({
  tenantRefresh: 'sku_refresh_token',
  tenantContext: 'sku_tenant_context',
  csrf: 'sku_csrf_token',
  dgfy: 'sku_dgfy_session',
  storefront: 'sku_store_session',
  admin: 'admin_session',
  posTerminalPairing: 'sku_pos_terminal_pairing',
  posOperatorAuthority: 'sku_pos_operator_authority',
  affiliateAttribution: 'sku_aff_attr'
});

// OPIS (DGFY Back Office, issue #2052) runs on its own origin (opis.dgfy.ph) with an
// independent browser session: company switching or logout in OPIS must never disrupt an
// active POS terminal, even when SESSION_COOKIE_DOMAIN=.dgfy.ph shares legacy sku_*
// cookies across subdomains. The opis_* namespace is selected per request by the
// x-dgfy-app-surface: opis header (a cookie-namespace selector only; it grants no
// authorization) and never falls back to or clears the sku_* POS namespace.
export const OPIS_SESSION_COOKIE_NAMES = Object.freeze({
  tenantRefresh: 'opis_refresh_token',
  tenantContext: 'opis_tenant_context',
  csrf: 'opis_csrf_token'
});

// Platform Admin is served under /admin on several product origins, but each
// origin keeps its own host-only session. The surface header selects only the
// cookie namespace; it never grants authorization.
export const ADMIN_SESSION_COOKIE_NAMES = Object.freeze({
  session: 'admin_session',
  csrf: 'admin_csrf_token'
});

export const APP_SURFACE_HEADER = 'x-dgfy-app-surface';

export const resolveSessionNamespace = (req) => {
  const surface = String(req?.headers?.[APP_SURFACE_HEADER] || '').trim().toLowerCase();
  if (surface === 'opis') return 'opis';
  if (surface === 'admin') return 'admin';
  return 'sku';
};

const tenantCookieNamesForRequest = (req) => {
  const namespace = resolveSessionNamespace(req);
  if (namespace === 'admin') return null;
  return namespace === 'opis' ? OPIS_SESSION_COOKIE_NAMES : SESSION_COOKIE_NAMES;
};

const csrfCookieNameForRequest = (req) => {
  const namespace = resolveSessionNamespace(req);
  if (namespace === 'admin') return ADMIN_SESSION_COOKIE_NAMES.csrf;
  return namespace === 'opis' ? OPIS_SESSION_COOKIE_NAMES.csrf : SESSION_COOKIE_NAMES.csrf;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REFRESH_MAX_AGE_MS = 7 * ONE_DAY_MS;
const DEFAULT_ACCESS_MAX_AGE_MS = ONE_DAY_MS;

const isProduction = () => process.env.NODE_ENV === 'production';

const parseBoolean = (value) => String(value || '').trim().toLowerCase() === 'true';

const shouldUseSecureCookies = () => {
  if (process.env.SESSION_COOKIE_SECURE != null) {
    return parseBoolean(process.env.SESSION_COOKIE_SECURE);
  }
  return isProduction();
};

const resolveCookieDomain = () => {
  const configured = String(process.env.SESSION_COOKIE_DOMAIN || '').trim();
  if (!configured) return '';
  if (configured === 'localhost' || configured === '127.0.0.1') return '';
  return configured;
};

export const parseCookies = (cookieHeader = '') => {
  const cookies = {};
  String(cookieHeader || '').split(';').forEach((entry) => {
    const [rawName, ...rawValueParts] = entry.split('=');
    const name = String(rawName || '').trim();
    if (!name) return;
    cookies[name] = decodeURIComponent(rawValueParts.join('=') || '');
  });
  return cookies;
};

export const getCookie = (req, name) => {
  if (!req?.cookies) {
    req.cookies = parseCookies(req?.headers?.cookie || '');
  }
  return req.cookies?.[name] || '';
};

const serializeCookie = (name, value, {
  httpOnly = true,
  maxAgeMs = DEFAULT_REFRESH_MAX_AGE_MS,
  sameSite = 'Lax',
  path = '/',
  clear = false
} = {}) => {
  const encodedValue = clear ? '' : encodeURIComponent(String(value || ''));
  const parts = [`${name}=${encodedValue}`, `Path=${path}`, `SameSite=${sameSite}`];
  const domain = resolveCookieDomain();
  if (domain) parts.push(`Domain=${domain}`);
  if (httpOnly) parts.push('HttpOnly');
  if (shouldUseSecureCookies()) parts.push('Secure');
  if (clear) {
    parts.push('Max-Age=0');
    parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  } else if (Number.isFinite(maxAgeMs) && maxAgeMs > 0) {
    parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  }
  return parts.join('; ');
};

const appendSetCookie = (res, cookie) => {
  if (typeof res.getHeader !== 'function' || typeof res.setHeader !== 'function') {
    res.__setCookie = [...(res.__setCookie || []), cookie];
    return;
  }
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', [cookie]);
    return;
  }
  res.setHeader('Set-Cookie', Array.isArray(existing) ? [...existing, cookie] : [existing, cookie]);
};

export const issueCsrfToken = (res, { maxAgeMs = DEFAULT_REFRESH_MAX_AGE_MS } = {}, req = null) => {
  const token = crypto.randomBytes(32).toString('base64url');
  appendSetCookie(res, serializeCookie(csrfCookieNameForRequest(req), token, {
    httpOnly: false,
    maxAgeMs
  }));
  return token;
};

export const setTenantSessionCookies = (res, { refreshToken, tenantToken }, req = null) => {
  const names = tenantCookieNamesForRequest(req);
  // Platform Admin has no tenant-context session. Never fall through and issue sku_* cookies.
  if (!names) return;
  if (refreshToken) {
    appendSetCookie(res, serializeCookie(names.tenantRefresh, refreshToken));
  }
  if (tenantToken) {
    appendSetCookie(res, serializeCookie(names.tenantContext, tenantToken));
  }
  issueCsrfToken(res, {}, req);
};

export const setBearerSessionCookie = (res, name, token, { maxAgeMs = DEFAULT_ACCESS_MAX_AGE_MS } = {}, req = null) => {
  if (!token) return;
  appendSetCookie(res, serializeCookie(name, token, { maxAgeMs }));
  issueCsrfToken(res, { maxAgeMs }, req);
};

export const clearSessionCookie = (res, name, { httpOnly = true } = {}) => {
  appendSetCookie(res, serializeCookie(name, '', { clear: true, httpOnly }));
};

export const clearTenantSessionCookies = (res, req = null) => {
  const names = tenantCookieNamesForRequest(req);
  if (!names) {
    clearSessionCookie(res, ADMIN_SESSION_COOKIE_NAMES.csrf, { httpOnly: false });
    return;
  }
  clearSessionCookie(res, names.tenantRefresh);
  clearSessionCookie(res, names.tenantContext);
  clearSessionCookie(res, csrfCookieNameForRequest(req), { httpOnly: false });
};

export const clearAllBrowserSessionCookies = (res, req = null) => {
  // OPIS logout clears only the opis_* namespace: it must never clear the sku_* POS
  // cookies that keep an active terminal signed in (issue #2052). The default sku
  // namespace keeps its existing full-clear behavior for backward compatibility.
  if (resolveSessionNamespace(req) === 'admin') {
    clearSessionCookie(res, ADMIN_SESSION_COOKIE_NAMES.session);
    clearSessionCookie(res, ADMIN_SESSION_COOKIE_NAMES.csrf, { httpOnly: false });
    return;
  }
  if (resolveSessionNamespace(req) === 'opis') {
    clearTenantSessionCookies(res, req);
    return;
  }
  Object.entries(SESSION_COOKIE_NAMES).forEach(([key, name]) => {
    clearSessionCookie(res, name, { httpOnly: key !== 'csrf' });
  });
};

export const getTenantRefreshToken = (req) => {
  const names = tenantCookieNamesForRequest(req);
  return names ? getCookie(req, names.tenantRefresh) : '';
};
export const getTenantContextToken = (req) => {
  const names = tenantCookieNamesForRequest(req);
  return names ? getCookie(req, names.tenantContext) : '';
};
export const getCsrfCookie = (req) => getCookie(req, csrfCookieNameForRequest(req));

// Affiliate attribution: a store-scoped, HttpOnly cookie holding a JSON map of
// tenant_id -> enrollment_id. A visitor can carry attribution for more than one
// store at once (per-tenant isolation); scanning a second affiliate's code for
// the same store overwrites that store's entry only (last-scan-wins).
const readAffiliateAttributionMap = (req) => {
  const raw = getCookie(req, SESSION_COOKIE_NAMES.affiliateAttribution);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

// Decision B3 (Phase 1 affiliate pricing rule engine): session-scoped, not a 30-day cookie. Omitting
// maxAgeMs entirely (rather than passing a duration) is what makes serializeCookie skip the
// Max-Age/Expires attributes below, so the browser drops this cookie when it closes rather than
// persisting it - a deliberate, live behavior change from the previous 30-day lifetime. Paired with
// removing the now-misleading attribution_window_days setting from the owner panel (decision A12) -
// that setting was never actually enforced anywhere in accrual, and session-scoping makes it
// actively wrong to keep showing.
export const setAffiliateAttributionCookie = (req, res, tenantId, enrollmentId) => {
  const normalizedTenantId = String(tenantId || '').trim();
  const normalizedEnrollmentId = String(enrollmentId || '').trim();
  if (!normalizedTenantId || !normalizedEnrollmentId) return;
  const map = readAffiliateAttributionMap(req);
  map[normalizedTenantId] = normalizedEnrollmentId;
  // Explicit null, not omitted: serializeCookie's maxAgeMs parameter defaults to
  // DEFAULT_REFRESH_MAX_AGE_MS (7 days) when the options object is left empty, which would
  // silently reintroduce a persistent cookie instead of the session-scoped one decision B3 requires.
  appendSetCookie(res, serializeCookie(SESSION_COOKIE_NAMES.affiliateAttribution, JSON.stringify(map), {
    maxAgeMs: null
  }));
};

export const getAffiliateAttributionCookie = (req, tenantId) => {
  const normalizedTenantId = String(tenantId || '').trim();
  if (!normalizedTenantId) return null;
  const map = readAffiliateAttributionMap(req);
  return map[normalizedTenantId] || null;
};

export const stripBrowserRefreshToken = (session = {}) => {
  if (!session || typeof session !== 'object') return session;
  const rest = { ...session };
  delete rest.refreshToken;
  return rest;
};

// React Native (and other non-browser API clients) have no cookie jar, so
// the httpOnly-cookie-only refresh flow below leaves them unable to refresh
// a session. Callers opt in explicitly with this header rather than being
// auto-detected, so the browser's httpOnly-cookie protection (refresh token
// never touches page JS) is unaffected by default.
export const isMobileClientRequest = (req) =>
  String(req?.headers?.['x-client-platform'] || '').trim().toLowerCase() === 'mobile';

// Cookie takes priority when present (unchanged browser behavior). Mobile
// clients have no cookie, so they submit the refresh token they were
// issued in the JSON body instead - only honored when the mobile header is
// set, so a stray body field can't be used to bypass the cookie flow.
// OPIS (opis namespace) never consumes the legacy sku_* POS cookie: strict
// isolation both directions, even under a shared SESSION_COOKIE_DOMAIN.
export const getSubmittedRefreshToken = (req) => {
  const cookieToken = getTenantRefreshToken(req);
  if (cookieToken) return cookieToken;
  if (resolveSessionNamespace(req) === 'opis') return '';
  if (isMobileClientRequest(req)) {
    return String(req?.body?.refreshToken || '').trim();
  }
  return '';
};

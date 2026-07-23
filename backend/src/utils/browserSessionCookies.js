import crypto from 'crypto';

export const SESSION_COOKIE_NAMES = Object.freeze({
  tenantRefresh: 'sku_refresh_token',
  tenantContext: 'sku_tenant_context',
  csrf: 'sku_csrf_token',
  dgfy: 'sku_dgfy_session',
  storefront: 'sku_store_session',
  admin: 'sku_admin_session',
  posTerminalPairing: 'sku_pos_terminal_pairing'
});

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

export const issueCsrfToken = (res) => {
  const token = crypto.randomBytes(32).toString('base64url');
  appendSetCookie(res, serializeCookie(SESSION_COOKIE_NAMES.csrf, token, {
    httpOnly: false,
    maxAgeMs: DEFAULT_REFRESH_MAX_AGE_MS
  }));
  return token;
};

export const setTenantSessionCookies = (res, { refreshToken, tenantToken }) => {
  if (refreshToken) {
    appendSetCookie(res, serializeCookie(SESSION_COOKIE_NAMES.tenantRefresh, refreshToken));
  }
  if (tenantToken) {
    appendSetCookie(res, serializeCookie(SESSION_COOKIE_NAMES.tenantContext, tenantToken));
  }
  issueCsrfToken(res);
};

export const setBearerSessionCookie = (res, name, token, { maxAgeMs = DEFAULT_ACCESS_MAX_AGE_MS } = {}) => {
  if (!token) return;
  appendSetCookie(res, serializeCookie(name, token, { maxAgeMs }));
  issueCsrfToken(res);
};

export const clearSessionCookie = (res, name, { httpOnly = true } = {}) => {
  appendSetCookie(res, serializeCookie(name, '', { clear: true, httpOnly }));
};

export const clearTenantSessionCookies = (res) => {
  clearSessionCookie(res, SESSION_COOKIE_NAMES.tenantRefresh);
  clearSessionCookie(res, SESSION_COOKIE_NAMES.tenantContext);
  clearSessionCookie(res, SESSION_COOKIE_NAMES.csrf, { httpOnly: false });
};

export const clearAllBrowserSessionCookies = (res) => {
  Object.entries(SESSION_COOKIE_NAMES).forEach(([key, name]) => {
    clearSessionCookie(res, name, { httpOnly: key !== 'csrf' });
  });
};

export const getTenantRefreshToken = (req) => getCookie(req, SESSION_COOKIE_NAMES.tenantRefresh);
export const getTenantContextToken = (req) => getCookie(req, SESSION_COOKIE_NAMES.tenantContext);
export const getCsrfCookie = (req) => getCookie(req, SESSION_COOKIE_NAMES.csrf);

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
export const getSubmittedRefreshToken = (req) => {
  const cookieToken = getTenantRefreshToken(req);
  if (cookieToken) return cookieToken;
  if (isMobileClientRequest(req)) {
    return String(req?.body?.refreshToken || '').trim();
  }
  return '';
};

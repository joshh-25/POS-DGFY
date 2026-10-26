import crypto from 'node:crypto';

const LOOPBACK_HOST = /^(?:localhost|[a-z0-9-]+\.localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i;
const STOREFRONT_ORIGIN_BY_ISSUER = Object.freeze({
  'https://api.dev.dgfy.ph': 'https://dev.dgfy.ph',
  'https://api.stage.dgfy.ph': 'https://stage.dgfy.ph',
  'https://api.dgfy.ph': 'https://dgfy.ph'
});
const DGLAUNDRY_ORIGIN_BY_ISSUER = Object.freeze({
  'https://api.dev.dgfy.ph': 'https://laundry.surebizcorp.com',
  'https://api.stage.dgfy.ph': 'https://dglaundry.stage.dgfy.ph',
  'https://api.dgfy.ph': 'https://dglaundry.dgfy.ph'
});

const parseQuality = (entry) => {
  const q = entry.split(';').slice(1).map((part) => part.trim()).find((part) => /^q\s*=/i.test(part));
  if (!q) return 1;
  const value = Number(q.split('=').at(-1));
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
};

const parseAccept = (header) => String(header || '').split(',').map((entry) => {
  const [mediaType] = entry.trim().split(';', 1);
  return { mediaType: String(mediaType || '').trim().toLowerCase(), quality: parseQuality(entry) };
}).filter((entry) => entry.mediaType);

const qualityFor = (entries, mediaType) => {
  const exact = entries.filter((entry) => entry.mediaType === mediaType);
  if (exact.length) return Math.max(...exact.map((entry) => entry.quality));

  const typeWildcard = `${mediaType.split('/', 1)[0]}/*`;
  const wildcard = entries.filter((entry) => entry.mediaType === typeWildcard);
  if (wildcard.length) return Math.max(...wildcard.map((entry) => entry.quality));

  const any = entries.filter((entry) => entry.mediaType === '*/*');
  return any.length ? Math.max(...any.map((entry) => entry.quality)) : 0;
};

// HTML is selected only when the request explicitly accepts text/html and its
// quality is greater than JSON's effective quality. Wildcards alone never
// turn an API request into a browser redirect.
export const prefersHtmlNavigation = (acceptHeader) => {
  const entries = parseAccept(acceptHeader);
  const hasExplicitHtml = entries.some(({ mediaType }) => mediaType === 'text/html');
  const htmlQuality = hasExplicitHtml ? qualityFor(entries, 'text/html') : 0;
  if (htmlQuality <= 0) return false;

  const jsonQuality = qualityFor(entries, 'application/json');
  return htmlQuality > jsonQuality;
};

export const normalizeConfiguredOrigin = (value, { environment = process.env.NODE_ENV } = {}) => {
  const raw = String(value || '').trim();
  if (!raw || raw !== value || raw.includes('\\') || raw.includes('*') || raw.includes('#')) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) return null;
  const loopback = LOOPBACK_HOST.test(url.hostname);
  if (url.protocol === 'http:' && (!loopback || String(environment || '').toLowerCase() === 'production')) return null;
  return url.origin;
};

export const resolveOidcIssuerOrigin = (env = process.env) => {
  const raw = String(env.DGFY_OIDC_ISSUER || '').trim();
  let issuer;
  try { issuer = new URL(raw); } catch { return null; }
  if (!['https:', 'http:'].includes(issuer.protocol) || issuer.username || issuer.password
    || !issuer.pathname.replace(/\/+$/, '').endsWith('/oidc') || issuer.search || issuer.hash) return null;
  const origin = normalizeConfiguredOrigin(issuer.origin, { environment: env.NODE_ENV });
  return origin ? { issuer: issuer.toString().replace(/\/+$/, ''), origin } : null;
};

export const resolveStorefrontOrigin = (env = process.env) => {
  const configured = normalizeConfiguredOrigin(env.STOREFRONT_PUBLIC_ORIGIN, { environment: env.NODE_ENV });
  const issuerOrigin = resolveOidcIssuerOrigin(env)?.origin;
  const expected = STOREFRONT_ORIGIN_BY_ISSUER[issuerOrigin];
  return expected ? (configured === expected ? configured : null) : configured;
};

export const resolveDglaundryRestartOrigin = (env = process.env) => {
  const configured = normalizeConfiguredOrigin(env.DGLAUNDRY_PARTNER_BASE_URL, { environment: env.NODE_ENV });
  const issuerOrigin = resolveOidcIssuerOrigin(env)?.origin;
  const expected = DGLAUNDRY_ORIGIN_BY_ISSUER[issuerOrigin];
  return expected ? (configured === expected ? configured : null) : configured;
};

export const hashInteractionBinding = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

export const buildStorefrontOidcUrl = (path, env = process.env) => {
  const origin = resolveStorefrontOrigin(env);
  if (!origin || typeof path !== 'string' || !path.startsWith('/')) return null;
  return new URL(path, origin).toString();
};

const destinationError = (message) => Object.assign(new Error(message), {
  statusCode: 400,
  code: 'INVALID_DESTINATION'
});

const hasWildcard = (value) => value.includes('*');
const isLoopback = (hostname) => {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(host);
};

const assertUrl = (value, environment) => {
  if (typeof value !== 'string' || !value.trim()) throw destinationError('A non-empty absolute destination URL is required.');
  const raw = value.trim();
  if (raw !== value || raw.includes('\\') || hasWildcard(raw) || raw.includes('#') || /%(?:2e|2f|5c)/i.test(raw)) throw destinationError('Whitespace padding, backslashes, wildcards, fragments, and encoded traversal are not allowed.');
  let parsed;
  try { parsed = new URL(raw); } catch { throw destinationError('Destination must be an absolute URL.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw destinationError('Destination must use HTTPS (or permitted loopback HTTP) without userinfo.');
  }
  if (parsed.protocol === 'http:' && (['production', 'prod', 'live'].includes(String(environment).toLowerCase()) || !isLoopback(parsed.hostname))) {
    throw destinationError('HTTP destinations are allowed only for loopback hosts in non-production environments.');
  }
  const rawPath = raw.replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i, '').split(/[?#]/, 1)[0];
  if (rawPath.split('/').some((segment) => {
    let decoded = segment;
    try {
      for (let depth = 0; depth < 4; depth += 1) {
        if (decoded === '..' || decoded.includes('/') || decoded.includes('\\')) return true;
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      }
      return decoded === '..' || decoded.includes('/') || decoded.includes('\\');
    } catch { return true; }
  })) throw destinationError('Path traversal is not allowed in destinations.');
  return { raw, parsed };
};

const canonicalUrl = (parsed) => {
  const url = new URL(parsed.href);
  url.hostname = url.hostname.toLowerCase();
  return url.href;
};

export const normalizeRegisteredOrigin = (value, environment = 'production') => {
  const { raw, parsed } = assertUrl(value, environment);
  if (!/^https?:\/\/[^/?#]+$/i.test(raw) || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw destinationError('Allowed origins must be bare scheme://host[:port] values.');
  }
  return { value: raw, canonical: parsed.origin.toLowerCase() };
};

export const validateRedirectDestination = (value, allowedOrigins, environment = 'production') => {
  const { raw, parsed } = assertUrl(value, environment);
  const origin = parsed.origin.toLowerCase();
  const allowed = Array.isArray(allowedOrigins) ? allowedOrigins : [];
  const matches = allowed.some((candidate) => {
    try { return normalizeRegisteredOrigin(candidate, environment).canonical === origin; } catch { return false; }
  });
  if (!matches) throw destinationError('Redirect destination origin is not registered for this client.');
  return { value: raw, canonical: canonicalUrl(parsed), origin };
};

export const validateDestinationLists = ({ allowedOrigins = [], redirectUris = [], postLogoutRedirectUris = [], environment = 'production' } = {}) => {
  for (const [name, values] of Object.entries({ allowed_origins: allowedOrigins, redirect_uris: redirectUris, post_logout_redirect_uris: postLogoutRedirectUris })) {
    if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value.trim())) {
      throw destinationError(`${name} must be an array of non-empty strings.`);
    }
  }
  const origins = allowedOrigins.map((value) => normalizeRegisteredOrigin(value, environment));
  const callbacks = redirectUris.map((value) => validateRedirectDestination(value, allowedOrigins, environment));
  const logoutUris = postLogoutRedirectUris.map((value) => validateRedirectDestination(value, allowedOrigins, environment));
  assertNoCanonicalCollisions(origins, 'allowed origins');
  assertNoCanonicalCollisions([...callbacks, ...logoutUris], 'redirect and post-logout URIs');
  return {
    allowed_origins: origins.map(({ value }) => value),
    redirect_uris: callbacks.map(({ value }) => value),
    post_logout_redirect_uris: logoutUris.map(({ value }) => value)
  };
};

export const assertNoCanonicalCollisions = (destinations, label = 'destinations') => {
  const seen = new Set();
  for (const destination of destinations) {
    if (seen.has(destination.canonical)) throw destinationError(`Canonical duplicate in ${label}.`);
    seen.add(destination.canonical);
  }
};

export const canonicalDestination = (value, environment = 'production') => {
  const { parsed } = assertUrl(value, environment);
  return canonicalUrl(parsed);
};

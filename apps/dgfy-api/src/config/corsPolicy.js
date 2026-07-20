const parseOriginList = (value = '') => String(value || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const PUBLIC_API_CORS_PATHS = Object.freeze([
  '/api/v1/storefront/discovery',
  '/api/v1/storefront/discovery/map-pins',
  '/api/v1/storefront/geo-search'
]);

const PUBLIC_API_CORS_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const normalizePath = (value = '') => {
  const raw = String(value || '').split('?')[0].trim();
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const matchesWildcardOrigin = (origin, wildcardPattern) => {
  if (!origin || !wildcardPattern) return false;
  try {
    const parsed = new URL(origin);
    const rawPattern = String(wildcardPattern || '').trim().toLowerCase();
    let pattern = rawPattern;
    if (rawPattern.includes('://')) {
      const parsedPattern = new URL(rawPattern.replace('*.', 'wildcard-placeholder.'));
      if (parsedPattern.protocol !== parsed.protocol) return false;
      pattern = parsedPattern.hostname.replace('wildcard-placeholder.', '*.');
    }
    if (!pattern.startsWith('*.')) return false;
    const suffix = pattern.slice(1);
    return parsed.hostname.toLowerCase().endsWith(suffix);
  } catch {
    return false;
  }
};

const isOriginAllowedByList = (origin, allowedOrigins = []) => {
  if (!origin) return true;
  return allowedOrigins.some((allowedOrigin) => {
    if (String(allowedOrigin).includes('*.')) {
      return matchesWildcardOrigin(origin, allowedOrigin);
    }
    return allowedOrigin === origin;
  });
};

const isDevelopmentOriginAllowed = (origin) => {
  if (!origin) return true;

  const developmentOriginPatterns = [
    /^http:\/\/localhost:517[0-9]$/,
    /^http:\/\/127\.0\.0\.1:517[0-9]$/,
    /^http:\/\/localhost:417[0-9]$/,
    /^http:\/\/127\.0\.0\.1:417[0-9]$/,
    /^http:\/\/localhost:5000$/,
    /^http:\/\/127\.0\.0\.1:5000$/,
    /^http:\/\/\d{1,3}(?:\.\d{1,3}){3}:517[0-9]$/,
    /^http:\/\/\d{1,3}(?:\.\d{1,3}){3}:417[0-9]$/,
    /^https?:\/\/(?:skupervisor|pos|store)\.localhost:517[0-9]$/,
    /^https?:\/\/(?:skupervisor|pos|store)\.localhost:417[0-9]$/,
    /^https?:\/\/(?:skupervisor|pos|store)\.local(?:host)?(?::\d{2,5})?$/
  ];

  if (developmentOriginPatterns.some((pattern) => pattern.test(origin))) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    const knownSurface = host === 'skupervisor.surebizcorp.com'
      || host === 'pos.surebizcorp.com'
      || host === 'surebizcorp.com'
      || host === 'store.surebizcorp.com'
      || host === 'skupervisor.dgfy.ph'
      || host === 'pos.dgfy.ph'
      || host === 'dgfy.ph'
      || host === 'store.dgfy.ph';
    return Boolean(knownSurface);
  } catch {
    return false;
  }
};

export const buildCorsPolicy = ({
  corsOrigin = '',
  publicApiCorsOrigin = '',
  isProduction = false
} = {}) => {
  const configuredCorsOrigins = parseOriginList(corsOrigin);
  const publicApiCorsOrigins = parseOriginList(publicApiCorsOrigin);

  const isExplicitOriginAllowed = (origin) => isOriginAllowedByList(origin, configuredCorsOrigins);
  const isPublicApiOriginAllowed = (origin) => isOriginAllowedByList(origin, publicApiCorsOrigins);

  const isPublicApiCorsRequest = (req = {}) => {
    const method = String(req.method || 'GET').toUpperCase();
    if (!PUBLIC_API_CORS_METHODS.has(method)) return false;
    const requestedMethod = String(req.headers?.['access-control-request-method'] || method).toUpperCase();
    if (!PUBLIC_API_CORS_METHODS.has(requestedMethod)) return false;

    const path = normalizePath(req.path || req.originalUrl || req.url);
    return PUBLIC_API_CORS_PATHS.some((allowedPath) => path === allowedPath);
  };

  const resolveCorsAccess = (origin, req = {}) => {
    if (configuredCorsOrigins.length > 0 && isExplicitOriginAllowed(origin)) {
      return { allowed: true, publicApi: false };
    }

    if (
      publicApiCorsOrigins.length > 0
      && isPublicApiCorsRequest(req)
      && isPublicApiOriginAllowed(origin)
    ) {
      return { allowed: true, publicApi: true };
    }

    if (!isProduction) {
      return { allowed: isDevelopmentOriginAllowed(origin), publicApi: false };
    }

    return {
      allowed: configuredCorsOrigins.length === 0 && isDevelopmentOriginAllowed(origin),
      publicApi: false
    };
  };

  const resolveCorsAllowed = (origin, req = {}) => resolveCorsAccess(origin, req).allowed;

  return {
    configuredCorsOrigins,
    publicApiCorsOrigins,
    isPublicApiCorsRequest,
    resolveCorsAccess,
    resolveCorsAllowed
  };
};

export const corsPolicyInternals = {
  matchesWildcardOrigin,
  normalizePath,
  parseOriginList
};

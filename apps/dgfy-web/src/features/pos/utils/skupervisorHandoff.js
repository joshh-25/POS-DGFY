const DEFAULT_LOCAL_SKUPERVISOR_ORIGIN = 'http://localhost:5173';
const DEFAULT_PUBLIC_SKUPERVISOR_ORIGIN = 'https://skupervisor.dgfy.ph';
const DEFAULT_PUBLIC_POS_ORIGIN = 'https://pos.dgfy.ph';

const normalizePath = (path = '/') => {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const normalizeQuery = (query = '') => {
  const raw = String(query || '').trim();
  if (!raw) return '';
  return raw.startsWith('?') ? raw : `?${raw}`;
};

const resolveConfiguredOrigin = () => {
  const configured = String(
    import.meta.env?.VITE_SKUPERVISOR_BASE_URL
    || import.meta.env?.VITE_SKUPERVISOR_URL
    || ''
  ).trim();

  if (!configured) return '';

  try {
    const resolved = typeof window === 'undefined'
      ? new URL(configured, DEFAULT_PUBLIC_SKUPERVISOR_ORIGIN)
      : new URL(configured, window.location.origin);
    if (!['http:', 'https:'].includes(resolved.protocol)) return '';
    return resolved.origin;
  } catch {
    return '';
  }
};

export const getSkupervisorOrigin = () => {
  const configuredOrigin = resolveConfiguredOrigin();
  if (configuredOrigin) return configuredOrigin;

  if (typeof window === 'undefined') {
    return DEFAULT_PUBLIC_SKUPERVISOR_ORIGIN;
  }

  const { protocol, hostname, port } = window.location;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  if (isLocalHost) {
    const localPort = port === '5174' || port === '5175' || port === '4174' ? '5173' : (port || '5173');
    return `${protocol}//${hostname}:${localPort}`;
  }

  if (hostname.startsWith('pos.')) {
    return `${protocol}//${hostname.replace(/^pos\./, 'skupervisor.')}`;
  }

  if (hostname.startsWith('store.')) {
    return `${protocol}//${hostname.replace(/^store\./, 'skupervisor.')}`;
  }

  if (hostname.startsWith('skupervisor.')) {
    return `${protocol}//${hostname}`;
  }

  // Storefront apex case (dgfy.ph, beta.dgfy.ph, ...) has no surface
  // prefix to replace -- prepend one instead. Falls back to the hardcoded
  // production origin only if this can't be derived at all.
  if (hostname) {
    return `${protocol}//skupervisor.${hostname}`;
  }

  return DEFAULT_PUBLIC_SKUPERVISOR_ORIGIN;
};

export const buildSkupervisorPath = (path = '/', query = '') => {
  const origin = getSkupervisorOrigin();
  const url = new URL(normalizePath(path), origin);
  const normalizedQuery = normalizeQuery(query);
  if (normalizedQuery) {
    url.search = normalizedQuery;
  }
  return url.toString();
};

export const openSkupervisorPath = (path = '/', query = '') => {
  if (typeof window === 'undefined') return buildSkupervisorPath(path, query);
  const target = buildSkupervisorPath(path, query);
  window.location.assign(target);
  return target;
};

// Carries a DGFY session over to SKUpervisor for the one deliberate
// click-through from dgfy.ph (e.g. "Open business inventory" on the account
// dashboard) - reusing the same single-use handoff token mechanism that
// already carries sessions SKUpervisor -> dgfy.ph
// (frontend/src/features/dgfyRouteHelpers.js appendDgfyHandoffToken).
// Lands on SKUpervisor's /dgfy/companies (DgfyCompanySelect.jsx), which
// exchanges the token, starts a tenant session, and continues to `next`.
// The origin is always derived from the current host via
// getSkupervisorOrigin() above - callers never supply one.
export const buildSkupervisorHandoffUrl = ({ tenantId = '', next = '/', handoffToken = '' } = {}) => {
  const params = new URLSearchParams();
  const normalizedTenantId = String(tenantId || '').trim();
  const normalizedHandoffToken = String(handoffToken || '').trim();
  if (normalizedTenantId) params.set('tenant_id', normalizedTenantId);
  params.set('next', normalizePath(next));
  if (normalizedHandoffToken) params.set('handoff_token', normalizedHandoffToken);
  return buildSkupervisorPath('/dgfy/companies', `?${params.toString()}`);
};

// The standalone POS app uses HashRouter and runs on its own origin. Keep this
// builder separate from buildSkupervisorHandoffUrl so inventory/IMS links
// continue to land on SKUpervisor while Business -> POS links land on DGFY POS.
const resolvePosOrigin = () => {
  const configured = String(import.meta.env?.VITE_POS_TERMINAL_URL || '').trim();
  if (configured) {
    try {
      return new URL(configured, DEFAULT_PUBLIC_POS_ORIGIN).origin;
    } catch {
      // Invalid optional configuration falls through to runtime derivation.
    }
  }

  if (typeof window === 'undefined') return DEFAULT_PUBLIC_POS_ORIGIN;

  const { protocol, hostname } = window.location;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (isLocalHost) {
    const localPort = String(import.meta.env?.VITE_POS_DEV_PORT || '5174').trim() || '5174';
    return `${protocol}//${hostname}:${localPort}`;
  }

  if (hostname.startsWith('skupervisor.')) {
    return `${protocol}//${hostname.replace(/^skupervisor\./, 'pos.')}`;
  }

  if (hostname.startsWith('store.')) {
    return `${protocol}//${hostname.replace(/^store\./, 'pos.')}`;
  }

  if (hostname.startsWith('pos.')) {
    return `${protocol}//${hostname}`;
  }

  return hostname ? `${protocol}//pos.${hostname}` : DEFAULT_PUBLIC_POS_ORIGIN;
};

export const getPosOrigin = () => resolvePosOrigin();

export const buildPosDgfyHandoffUrl = ({ tenantId = '', next = '/', handoffToken = '' } = {}) => {
  const params = new URLSearchParams();
  const normalizedTenantId = String(tenantId || '').trim();
  const normalizedHandoffToken = String(handoffToken || '').trim();
  if (normalizedTenantId) params.set('tenant_id', normalizedTenantId);
  params.set('next', normalizePath(next));
  if (normalizedHandoffToken) params.set('handoff_token', normalizedHandoffToken);

  const target = new URL('/', getPosOrigin());
  // apps/pos uses HashRouter; putting the query inside the hash makes it
  // available to the POS route without leaking it into the server request.
  target.hash = `/dgfy/companies?${params.toString()}`;
  return target.toString();
};

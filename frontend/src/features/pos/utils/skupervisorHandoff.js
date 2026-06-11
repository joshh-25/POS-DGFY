const DEFAULT_LOCAL_SKUPERVISOR_ORIGIN = 'http://localhost:5173';
const DEFAULT_PUBLIC_SKUPERVISOR_ORIGIN = 'https://skupervisor.dgfy.ph';

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


const sanitizeOrigin = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
};

export const resolveSkupervisorAppOrigin = () => {
  const configuredOrigin = sanitizeOrigin(import.meta.env.VITE_SKUPERVISOR_APP_ORIGIN);
  if (configuredOrigin) return configuredOrigin;
  if (typeof window === 'undefined') return '';

  const { protocol, hostname, port, origin } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:5173`;
  }
  if (port === '5174') {
    return `${protocol}//${hostname}:5173`;
  }
  if (hostname.startsWith('pos.')) {
    return `${protocol}//${hostname.replace(/^pos\./, 'skupervisor.')}`;
  }

  return origin;
};

export const buildSkupervisorPath = (pathname = '/', query = '') => {
  const origin = resolveSkupervisorAppOrigin();
  const normalizedPath = String(pathname || '/').startsWith('/') ? pathname : `/${pathname}`;
  const normalizedQuery = String(query || '').trim();
  const search = normalizedQuery
    ? (normalizedQuery.startsWith('?') ? normalizedQuery : `?${normalizedQuery}`)
    : '';
  return `${origin}${normalizedPath}${search}`;
};

export const openSkupervisorPath = (pathname = '/', query = '') => {
  if (typeof window === 'undefined') return;
  window.location.assign(buildSkupervisorPath(pathname, query));
};

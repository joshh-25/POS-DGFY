// Small subset of the origin-rewrite pattern already used by
// shared/utils/businessRegistrationUrl.js, kept local to the auth pages: it
// resolves links to skupervisor-only surfaces (legal documents) that have not
// been ported into the storefront yet.

const resolveSkupervisorOrigin = () => {
  if (typeof window === 'undefined') return 'https://skupervisor.dgfy.ph';
  const { protocol, hostname } = window.location;
  const isDev = Boolean(import.meta.env?.DEV) || hostname === 'localhost' || hostname === '127.0.0.1';
  if (isDev) {
    const port = String(import.meta.env?.VITE_SKUPERVISOR_DEV_PORT || '5173').trim() || '5173';
    return `${protocol}//${hostname}:${port}`;
  }
  if (hostname.startsWith('store.')) return `${protocol}//${hostname.replace(/^store\./, 'skupervisor.')}`;
  if (hostname.startsWith('skupervisor.')) return `${protocol}//${hostname}`;
  return `${protocol}//skupervisor.${hostname}`;
};

export const resolveSkupervisorUrl = (path = '/') => {
  const normalizedPath = String(path || '/').trim();
  const withSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  return `${resolveSkupervisorOrigin()}${withSlash}`;
};

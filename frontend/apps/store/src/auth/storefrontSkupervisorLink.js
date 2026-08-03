// Small subset of the origin-rewrite pattern already used by
// shared/utils/businessRegistrationUrl.js, kept local to the auth pages: it
// resolves links to skupervisor-only surfaces (legal documents, the company
// registration status page) that have not been ported into the storefront yet.

const DEFAULT_PUBLIC_SKUPERVISOR_ORIGIN = 'https://skupervisor.dgfy.ph';

// An explicit build-time origin always wins: the hostname rewrite below only
// understands dot-separated siblings (store.dgfy.ph -> skupervisor.dgfy.ph),
// so environments that name their apps differently (dgfy-store.example ->
// dgfy-ims.example) MUST configure this or they land on a host that does not
// exist. Mirrors resolveConfiguredOrigin() in
// frontend/src/features/pos/utils/skupervisorHandoff.js.
const resolveConfiguredSkupervisorOrigin = () => {
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

const resolveSkupervisorOrigin = () => {
  const configuredOrigin = resolveConfiguredSkupervisorOrigin();
  if (configuredOrigin) return configuredOrigin;

  if (typeof window === 'undefined') return DEFAULT_PUBLIC_SKUPERVISOR_ORIGIN;
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

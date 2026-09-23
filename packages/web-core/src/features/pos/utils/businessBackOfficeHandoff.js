const DEFAULT_PUBLIC_POS_ORIGIN = 'https://pos.dgfy.ph';
const DEFAULT_PUBLIC_OPIS_ORIGIN = 'https://opis.dgfy.ph';

const normalizePath = (path = '/') => {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

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

  if (hostname.startsWith('store.')) return `${protocol}//${hostname.replace(/^store\./, 'pos.')}`;
  if (hostname.startsWith('pos.')) return `${protocol}//${hostname}`;
  if (hostname.startsWith('opis.')) return `${protocol}//${hostname.replace(/^opis\./, 'pos.')}`;
  if (hostname.startsWith('skupervisor.')) return `${protocol}//${hostname.replace(/^skupervisor\./, 'pos.')}`;
  return hostname ? `${protocol}//pos.${hostname}` : DEFAULT_PUBLIC_POS_ORIGIN;
};

export const getBusinessBackOfficeOrigin = () => resolvePosOrigin();

export const buildBusinessBackOfficeHandoffUrl = ({ tenantId = '', next = '/backoffice/overview', handoffToken = '' } = {}) => {
  const params = new URLSearchParams();
  const normalizedTenantId = String(tenantId || '').trim();
  const normalizedHandoffToken = String(handoffToken || '').trim();
  if (normalizedTenantId) params.set('tenant_id', normalizedTenantId);
  params.set('next', normalizePath(next));
  if (normalizedHandoffToken) params.set('handoff_token', normalizedHandoffToken);

  const target = new URL('/', getBusinessBackOfficeOrigin());
  target.hash = `/dgfy/companies?${params.toString()}`;
  return target.toString();
};

// ── OPIS (DGFY Back Office, issue #2052) ──────────────────────────────────────
// POS no longer hosts the merchant Back Office; it hands off to the dedicated OPIS app.
// Supported paths and query parameters are preserved across the redirect.

const resolveOpisOrigin = () => {
  const configured = String(import.meta.env?.VITE_OPIS_URL || '').trim();
  if (configured) {
    try {
      return new URL(configured, DEFAULT_PUBLIC_OPIS_ORIGIN).origin;
    } catch {
      // Invalid optional configuration falls through to runtime derivation.
    }
  }

  if (typeof window === 'undefined') return DEFAULT_PUBLIC_OPIS_ORIGIN;

  const { protocol, hostname } = window.location;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (isLocalHost) {
    const localPort = String(import.meta.env?.VITE_OPIS_DEV_PORT || '5176').trim() || '5176';
    return `${protocol}//${hostname}:${localPort}`;
  }

  if (hostname.startsWith('opis.')) return `${protocol}//${hostname}`;
  if (hostname.startsWith('pos.')) return `${protocol}//${hostname.replace(/^pos\./, 'opis.')}`;
  if (hostname.startsWith('skupervisor.')) return `${protocol}//${hostname.replace(/^skupervisor\./, 'opis.')}`;
  if (hostname.startsWith('store.')) return `${protocol}//${hostname.replace(/^store\./, 'opis.')}`;
  return hostname ? `${protocol}//opis.${hostname}` : DEFAULT_PUBLIC_OPIS_ORIGIN;
};

export const getOpisBackOfficeOrigin = () => resolveOpisOrigin();

// @compat-seam id=opis-pos-backoffice-redirect
// OPIS serves proper paths (BrowserRouter + nginx SPA fallback), so the handoff
// is a plain same-path URL -- no hash. POS itself stays on HashRouter; only the
// emitted OPIS target changed.
export const buildOpisBackOfficeUrl = ({ path = '/backoffice/overview', search = '' } = {}) => {  const normalizedPath = normalizePath(path);
  const normalizedSearch = String(search || '').trim();
  const query = normalizedSearch.startsWith('?') || !normalizedSearch ? normalizedSearch : `?${normalizedSearch}`;
  return `${getOpisBackOfficeOrigin()}${normalizedPath}${query}`;
};

// IMS merchant-surface handoff retargeted to OPIS (issue #2052): same tenant_id / next /
// handoff_token contract as the POS handoff above, resolved against the OPIS origin whose
// /dgfy/companies route exchanges the one-time handoff exactly like POS did.
// @compat-seam id=opis-ims-merchant-handoff
export const buildOpisHandoffUrl = ({ tenantId = '', next = '/backoffice/overview', handoffToken = '' } = {}) => {
  const params = new URLSearchParams();
  const normalizedTenantId = String(tenantId || '').trim();
  const normalizedHandoffToken = String(handoffToken || '').trim();
  if (normalizedTenantId) params.set('tenant_id', normalizedTenantId);
  params.set('next', normalizePath(next));
  if (normalizedHandoffToken) params.set('handoff_token', normalizedHandoffToken);

  const target = new URL('/dgfy/companies', getOpisBackOfficeOrigin());
  target.search = params.toString();
  return target.toString();
};

// ── OPIS → POS terminal links (issue #2052 follow-up) ─────────────────────────
// OPIS serves no /terminal route, so "Open POS terminal" affordances in the Back
// Office cannot use react-router <Link> (client-side routing only, dead on the OPIS
// origin). This builder emits a real cross-origin POS URL for a plain <a> href,
// reusing the POS origin-resolution mechanism above (VITE_POS_TERMINAL_URL override,
// localhost dev-port fallback, hostname-prefix substitution).
export const buildPosTerminalUrl = ({ path = '/terminal', search = '' } = {}) => {
  const normalizedPath = normalizePath(path);
  const normalizedSearch = String(search || '').trim();
  const query = normalizedSearch.startsWith('?') || !normalizedSearch ? normalizedSearch : `?${normalizedSearch}`;
  return `${resolvePosOrigin()}${normalizedPath}${query}`;
};

// Opens an OPIS Back Office URL in a new tab with clear recovery when the popup is
// blocked: falls back to same-tab navigation so the merchant never lands on a dead
// button. Returns 'new-tab' when a tab was opened, 'same-tab' on fallback.
export const openOpisBackOffice = ({ path = '/backoffice/overview', search = '', windowObj = typeof window === 'undefined' ? null : window } = {}) => {
  const url = buildOpisBackOfficeUrl({ path, search });
  if (!windowObj) return 'same-tab';
  try {
    const opened = windowObj.open(url, '_blank', 'noopener,noreferrer');
    if (opened) return 'new-tab';
  } catch {
    // A blocked or failed popup falls through to same-tab navigation below.
  }
  windowObj.location.assign(url);
  return 'same-tab';
};

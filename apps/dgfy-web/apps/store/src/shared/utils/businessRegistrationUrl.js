const isDev = Boolean(typeof import.meta !== 'undefined' && import.meta.env?.DEV);

const isLocalLikeHostname = (hostname = '') => {
  const value = String(hostname || '').trim().toLowerCase();
  if (!value) return false;
  if (value === 'localhost' || value === '127.0.0.1' || value === '0.0.0.0') return true;
  if (value.endsWith('.local')) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(value)) return true;
  return false;
};

const isLocalRuntime = () => {
  if (typeof window === 'undefined') return isDev;
  return isDev || isLocalLikeHostname(window.location.hostname);
};

const resolveLocalOriginForPort = (port) => {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || '127.0.0.1';
  return `${protocol}//${hostname}:${port}`;
};

const resolveDevSkupervisorOrigin = () => (
  resolveLocalOriginForPort(String(import.meta.env?.VITE_SKUPERVISOR_DEV_PORT || '5173').trim() || '5173')
  || 'http://127.0.0.1:5173'
);

// Derives the sibling skupervisor origin from the CURRENT origin instead of
// hardcoding production, so this works on any environment (beta.dgfy.ph ->
// skupervisor.beta.dgfy.ph, store.dgfy.ph -> skupervisor.dgfy.ph, etc.)
// without needing a per-environment VITE_DGFY_AUTH_URL build arg. Mirrors
// the pattern already used by frontend/src/features/pos/utils/skupervisorHandoff.js.
const resolvePublicSkupervisorOrigin = () => {
  if (typeof window === 'undefined') return 'https://skupervisor.dgfy.ph';
  const { protocol, hostname } = window.location;
  if (hostname.startsWith('pos.')) return `${protocol}//${hostname.replace(/^pos\./, 'skupervisor.')}`;
  if (hostname.startsWith('store.')) return `${protocol}//${hostname.replace(/^store\./, 'skupervisor.')}`;
  if (hostname.startsWith('skupervisor.')) return `${protocol}//${hostname}`;
  return `${protocol}//skupervisor.${hostname}`;
};

const DEFAULT_DGFY_AUTH_URL = isLocalRuntime()
  ? `${resolveDevSkupervisorOrigin()}/dgfy/auth`
  : `${resolvePublicSkupervisorOrigin()}/dgfy/auth`;

const normalizeUrl = (configured, fallbackUrl) => {
  const trimmed = String(configured || '').trim();
  if (!trimmed) return fallbackUrl;

  try {
    const target = new URL(trimmed);
    if (!target.pathname || target.pathname === '/') {
      target.pathname = new URL(fallbackUrl).pathname;
    }
    return target.toString();
  } catch {
    return fallbackUrl;
  }
};

const normalizeDgfyAuthBaseUrl = () => (
  normalizeUrl(import.meta.env?.VITE_DGFY_AUTH_URL, DEFAULT_DGFY_AUTH_URL)
);

// Business registration is hosted in-app at dgfy.ph/business/grow now, so this
// returns a same-origin path instead of the old skupervisor /register-company
// URL. The optional handoff token is still honoured for inbound cross-app links
// (POS/skupervisor), which StorefrontBusinessGrowPage exchanges on mount.
export const BUSINESS_REGISTRATION_PATH = '/business/grow';

export const buildBusinessRegistrationUrl = (handoffToken = '') => {
  const search = new URLSearchParams();
  if (handoffToken) {
    search.set('handoff_token', handoffToken);
  }
  return `${BUSINESS_REGISTRATION_PATH}${search.toString() ? `?${search.toString()}` : ''}`;
};

// SKUpervisor keeps its own login (business owners/developers sign in with
// their DGFY account there, same as dgfy.ph/login does here) - so "Business
// Login" must land on SKUpervisor's DGFY sign-in (/dgfy/auth), not its
// staff-only IMS form (/login), which expects a company token this visitor
// doesn't have yet.
export const buildBusinessLoginUrl = () => {
  const target = new URL(normalizeDgfyAuthBaseUrl());
  target.pathname = '/dgfy/auth';
  target.search = '';
  target.hash = '';
  return target.toString();
};

export const buildPosTerminalUrl = (search = '') => {
  const normalizedSearch = String(search || '').trim();
  const terminalPath = `/terminal${normalizedSearch && normalizedSearch.startsWith('?') ? normalizedSearch : (normalizedSearch ? `?${normalizedSearch}` : '')}`;
  const configured = String(import.meta.env?.VITE_POS_TERMINAL_URL || '').trim();
  if (configured) {
    try {
      const target = new URL(configured);
      target.pathname = '/terminal';
      target.search = terminalPath.includes('?') ? terminalPath.slice(terminalPath.indexOf('?')) : '';
      return target.toString();
    } catch {
      return configured;
    }
  }
  if (typeof window === 'undefined') return terminalPath;
  const { protocol, hostname } = window.location;
  if (isLocalRuntime()) return `${resolveLocalOriginForPort(String(import.meta.env?.VITE_POS_DEV_PORT || '5174').trim() || '5174')}${terminalPath}`;
  if (hostname.startsWith('store.')) return `${protocol}//${hostname.replace(/^store\./, 'pos.')}${terminalPath}`;
  if (hostname.startsWith('pos.')) return `${protocol}//${hostname}${terminalPath}`;
  return `${protocol}//pos.${hostname}${terminalPath}`;
};

export const buildPosAppUrl = () => {
  const terminalUrl = buildPosTerminalUrl();
  try {
    const target = new URL(terminalUrl, typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1');
    target.pathname = '/';
    target.search = '';
    target.hash = '';
    return target.toString();
  } catch {
    return terminalUrl.replace(/\/terminal(?:\?.*)?$/, '/');
  }
};

export const buildDgfyAuthUrl = ({
  intent = 'customer',
  mode = 'sign-in',
  returnTo = '',
  reason = '',
  email = ''
} = {}) => {
  const target = new URL(normalizeDgfyAuthBaseUrl());
  target.pathname = '/dgfy/auth';
  target.search = '';
  target.hash = '';
  target.searchParams.set('intent', String(intent || '').trim() === 'register-business' ? 'register-business' : 'customer');
  target.searchParams.set('mode', String(mode || '').trim() === 'create-account' ? 'create-account' : 'sign-in');
  if (returnTo) target.searchParams.set('return_to', String(returnTo).trim());
  if (reason) target.searchParams.set('reason', String(reason).trim());
  if (email) target.searchParams.set('email', String(email).trim());
  return target.toString();
};

// Password reset is hosted in-app at dgfy.ph/reset-password now, so this returns
// a same-origin path instead of the old skupervisor /dgfy/reset-password URL.
export const buildDgfyResetPasswordUrl = ({
  intent = 'customer',
  returnTo = '',
  email = ''
} = {}) => {
  const search = new URLSearchParams();
  search.set('intent', String(intent || '').trim() === 'register-business' ? 'register-business' : 'customer');
  search.set('mode', 'sign-in');
  if (returnTo) search.set('return_to', String(returnTo).trim());
  if (email) search.set('email', String(email).trim());
  return `/reset-password?${search.toString()}`;
};

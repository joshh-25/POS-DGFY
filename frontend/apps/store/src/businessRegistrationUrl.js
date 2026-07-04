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

const DEFAULT_BUSINESS_REGISTRATION_URL = isLocalRuntime()
  ? `${resolveDevSkupervisorOrigin()}/register-company`
  : `${resolvePublicSkupervisorOrigin()}/register-company`;
const DEFAULT_DGFY_AUTH_URL = isLocalRuntime()
  ? `${resolveDevSkupervisorOrigin()}/dgfy/auth`
  : `${resolvePublicSkupervisorOrigin()}/dgfy/auth`;
const DEFAULT_DGFY_RESET_URL = isLocalRuntime()
  ? `${resolveDevSkupervisorOrigin()}/dgfy/reset-password`
  : `${resolvePublicSkupervisorOrigin()}/dgfy/reset-password`;

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

const normalizeBusinessRegistrationBaseUrl = () => (
  normalizeUrl(import.meta.env?.VITE_SKUPERVISOR_REGISTRATION_URL, DEFAULT_BUSINESS_REGISTRATION_URL)
);

const normalizeDgfyAuthBaseUrl = () => (
  normalizeUrl(import.meta.env?.VITE_DGFY_AUTH_URL, DEFAULT_DGFY_AUTH_URL)
);

const normalizeDgfyResetBaseUrl = () => (
  normalizeUrl(import.meta.env?.VITE_DGFY_RESET_URL, DEFAULT_DGFY_RESET_URL)
);

export const buildBusinessRegistrationUrl = (handoffToken = '') => {
  const target = new URL(normalizeBusinessRegistrationBaseUrl());
  target.searchParams.set('source', 'dgfy');
  target.searchParams.set('auth', 'login');
  if (handoffToken) {
    target.searchParams.set('handoff_token', handoffToken);
  }
  target.hash = 'business-registration';
  return target.toString();
};

export const buildBusinessLoginUrl = () => {
  const target = new URL(normalizeDgfyAuthBaseUrl());
  target.pathname = '/login';
  target.search = '';
  target.hash = '';
  return target.toString();
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

export const buildDgfyResetPasswordUrl = ({
  intent = 'customer',
  returnTo = '',
  email = ''
} = {}) => {
  const target = new URL(normalizeDgfyResetBaseUrl());
  target.pathname = '/dgfy/reset-password';
  target.search = '';
  target.hash = '';
  target.searchParams.set('intent', String(intent || '').trim() === 'register-business' ? 'register-business' : 'customer');
  target.searchParams.set('mode', 'sign-in');
  if (returnTo) target.searchParams.set('return_to', String(returnTo).trim());
  if (email) target.searchParams.set('email', String(email).trim());
  return target.toString();
};

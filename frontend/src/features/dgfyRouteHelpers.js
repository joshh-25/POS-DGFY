export const DGFY_AUTH_ROUTE = '/dgfy/auth';
export const DGFY_RESET_ROUTE = '/dgfy/reset-password';
export const DGFY_REGISTER_COMPANY_ROUTE = '/register-company';
export const DGFY_REGISTER_COMPANY_ENTRY = '/register-company?source=dgfy&auth=login#business-registration';

export const normalizeDgfyIntent = (value) => (
  String(value || '').trim().toLowerCase() === 'register-business' ? 'register-business' : 'customer'
);

export const normalizeDgfyMode = (value) => (
  String(value || '').trim().toLowerCase() === 'create-account' ? 'create-account' : 'sign-in'
);

export const readDgfyRouteParams = (searchParams) => {
  const intent = normalizeDgfyIntent(searchParams?.get?.('intent'));
  const mode = normalizeDgfyMode(searchParams?.get?.('mode'));
  const reason = String(searchParams?.get?.('reason') || '').trim().toLowerCase();
  const returnTo = String(searchParams?.get?.('return_to') || '').trim();
  const email = String(searchParams?.get?.('email') || '').trim();
  return {
    intent,
    mode,
    reason,
    returnTo,
    email
  };
};

export const buildDgfyRouteSearch = ({
  intent = 'customer',
  mode = 'sign-in',
  returnTo = '',
  reason = '',
  email = ''
} = {}) => {
  const params = new URLSearchParams();
  params.set('intent', normalizeDgfyIntent(intent));
  params.set('mode', normalizeDgfyMode(mode));
  if (returnTo) params.set('return_to', String(returnTo).trim());
  if (reason) params.set('reason', String(reason).trim());
  if (email) params.set('email', String(email).trim());
  return `?${params.toString()}`;
};

export const buildDgfyAuthPath = (options = {}) => `${DGFY_AUTH_ROUTE}${buildDgfyRouteSearch(options)}`;
export const buildDgfyResetPath = (options = {}) => `${DGFY_RESET_ROUTE}${buildDgfyRouteSearch(options)}`;

export const resolveLocalOriginForPort = (port) => {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || '127.0.0.1';
  return `${protocol}//${hostname}:${port}`;
};

export const isLocalLikeHostname = (hostname = '') => {
  const value = String(hostname || '').trim().toLowerCase();
  if (!value) return false;
  if (value === 'localhost' || value === '127.0.0.1' || value === '0.0.0.0') return true;
  if (value.endsWith('.local')) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(value)) return true;
  return false;
};

export const isLocalRuntime = () => {
  if (typeof window === 'undefined') return Boolean(typeof import.meta !== 'undefined' && import.meta.env?.DEV);
  return Boolean(typeof import.meta !== 'undefined' && import.meta.env?.DEV) || isLocalLikeHostname(window.location.hostname);
};

export const resolveCurrentAppOrigin = () => {
  if (typeof window === 'undefined') return '';
  return window.location.origin || resolveLocalOriginForPort(window.location.port || '5174');
};

export const resolveFrontendPublicAssetUrl = (assetPath = '') => {
  const normalizedPath = String(assetPath || '').trim();
  if (!normalizedPath) return '';
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  const pathname = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  const origin = resolveCurrentAppOrigin();
  return origin ? `${origin}${pathname}` : pathname;
};

export const resolveStorefrontAccountUrl = () => {
  const isDev = isLocalRuntime();
  const configuredDevPort = String(import.meta.env?.VITE_STOREFRONT_DEV_PORT || '5175').trim() || '5175';
  const defaultUrl = isDev
    ? `${resolveLocalOriginForPort(configuredDevPort) || 'http://127.0.0.1:5175'}/map-dgfy/account`
    : 'https://dgfy.ph/map-dgfy/account';

  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STOREFRONT_ACCOUNT_URL) {
    return import.meta.env.VITE_STOREFRONT_ACCOUNT_URL;
  }

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.includes('skupervisor.')) {
      return origin.replace('skupervisor.', '') + '/map-dgfy/account';
    }
    if (isDev) {
      const currentPort = String(window.location.port || '').trim();
      if (currentPort && currentPort !== '5173' && currentPort !== '5174') {
        return `${origin}/map-dgfy/account`;
      }
      if (currentPort === '5174') {
        return `${resolveLocalOriginForPort(configuredDevPort)}/map-dgfy/account`;
      }
    }
  }
  return defaultUrl;
};

export const resolvePosTerminalUrl = (search = '') => {
  const normalizedSearch = String(search || '').trim();
  const terminalPath = `/terminal${normalizedSearch && normalizedSearch.startsWith('?') ? normalizedSearch : (normalizedSearch ? `?${normalizedSearch}` : '')}`;

  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_POS_TERMINAL_URL) {
    try {
      const configured = new URL(import.meta.env.VITE_POS_TERMINAL_URL);
      configured.search = terminalPath.includes('?') ? terminalPath.slice(terminalPath.indexOf('?')) : '';
      return configured.toString();
    } catch {
      return import.meta.env.VITE_POS_TERMINAL_URL;
    }
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    if (isLocalRuntime()) return `${resolveLocalOriginForPort(String(import.meta.env?.VITE_POS_DEV_PORT || '5174').trim() || '5174')}${terminalPath}`;
    if (hostname.startsWith('skupervisor.')) return `${protocol}//${hostname.replace(/^skupervisor\./, 'pos.')}${terminalPath}`;
    if (hostname.startsWith('store.')) return `${protocol}//${hostname.replace(/^store\./, 'pos.')}${terminalPath}`;
    if (hostname.startsWith('pos.')) return `${protocol}//${hostname}${terminalPath}`;
    return `${protocol}//pos.${hostname}${terminalPath}`;
  }

  return terminalPath;
};

export const resolveStorefrontHomeUrl = () => {
  const accountUrl = resolveStorefrontAccountUrl();
  try {
    const target = new URL(accountUrl);
    target.pathname = '/';
    target.search = '';
    target.hash = '';
    return target.toString();
  } catch {
    return accountUrl.replace(/\/map-dgfy\/account.*$/i, '/');
  }
};

// Mirrors STORE_BOOKING_SUBPAGE / STORE_ORDER_SUBPAGE / STORE_TRACK_SUBPAGE /
// STORE_SERVICE_SUBPAGE / STORE_ITEM_SUBPAGE from
// apps/store/src/app/routing/storefrontRouting.js - duplicated here rather
// than imported since this file is shared across independent apps (auth,
// terminal, storefront) and must not depend on a single app's route module.
const CUSTOM_DOMAIN_STORE_SUBPAGES = ['book', 'order', 'track', 'service', 'item'];
const DGFY_ACCOUNT_PATHS = new Set(['/map-dgfy/account', '/tenant-store/account']);

const isValidStorefrontReturnPath = (pathname = '') => {
  const normalizedPath = String(pathname || '').trim().replace(/\/+$/, '') || '/';
  if (normalizedPath === '/map-dgfy/account') return true;
  if (normalizedPath === '/tenant-store/account') return true;
  // dgfy.ph/business/grow: in-store business registration (formerly
  // skupervisor's /register-company), so post-login returns can land back
  // there instead of bouncing to the generic account dashboard.
  if (normalizedPath === '/business/grow') return true;
  if (/^\/tenant-store\/[^/]+(?:\/[^/]+)?$/i.test(normalizedPath)) return true;
  if (/^\/store\/[^/]+(?:\/[^/]+)?$/i.test(normalizedPath)) return true;
  if (/^\/store-template(?:\/[^/]+)?$/i.test(normalizedPath)) return true;
  if (/^\/storefront-template(?:\/[^/]+)?$/i.test(normalizedPath)) return true;
  // Custom-domain routing mode (see setCustomStorefrontRouteContext) mounts a
  // tenant's storefront directly at the domain root, so subpages have no
  // /tenant-store/<slug> or /store-template prefix - just a bare subpage
  // segment (or root for the catalog/home page).
  if (normalizedPath === '/') return true;
  if (CUSTOM_DOMAIN_STORE_SUBPAGES.includes(normalizedPath.slice(1).toLowerCase())) return true;
  return false;
};

const resolveApprovedDgfyAccountOrigins = () => {
  const origins = new Set(['https://dgfy.ph']);
  const candidates = [
    resolveStorefrontAccountUrl(),
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_STOREFRONT_ACCOUNT_URL : ''
  ];

  candidates.forEach((candidate) => {
    try {
      if (candidate) origins.add(new URL(candidate).origin);
    } catch {
      // Invalid optional configuration must not expand the redirect allowlist.
    }
  });

  return origins;
};

const isApprovedAbsoluteStorefrontTarget = (url) => {
  if (!isValidStorefrontReturnPath(url.pathname)) return false;
  const normalizedPath = String(url.pathname || '').replace(/\/+$/, '') || '/';
  if (!DGFY_ACCOUNT_PATHS.has(normalizedPath)) return true;
  return resolveApprovedDgfyAccountOrigins().has(url.origin);
};

export const normalizeDgfyReturnTarget = (target = '') => {
  const normalizedTarget = String(target || '').trim();
  if (!normalizedTarget) return '';

  // A protocol-relative URL can leave the current origin and must never be
  // treated as an internal route.
  if (normalizedTarget.startsWith('//')) return resolveStorefrontAccountUrl();

  // Single-slash paths stay on the current origin. The router remains
  // responsible for deciding whether the local route exists.
  if (normalizedTarget.startsWith('/')) return normalizedTarget;

  if (hasAbsoluteNavigationTarget(normalizedTarget)) {
    try {
      const url = new URL(normalizedTarget);
      if (!isApprovedAbsoluteStorefrontTarget(url)) {
        return resolveStorefrontAccountUrl();
      }
      return url.toString();
    } catch {
      return resolveStorefrontAccountUrl();
    }
  }

  return resolveStorefrontAccountUrl();
};

export const resolveDgfyPostAuthTarget = ({ intent = 'customer', returnTo = '' } = {}) => {
  if (returnTo) return normalizeDgfyReturnTarget(returnTo);
  if (normalizeDgfyIntent(intent) === 'register-business') {
    return DGFY_REGISTER_COMPANY_ENTRY;
  }
  return resolveStorefrontAccountUrl();
};

export const hasAbsoluteNavigationTarget = (target = '') => /^https?:\/\//i.test(String(target || '').trim());

export const appendDgfyHandoffToken = (target = '', handoffToken = '') => {
  const requestedTarget = String(target || '').trim();
  const normalizedTarget = normalizeDgfyReturnTarget(requestedTarget);
  const normalizedToken = String(handoffToken || '').trim();
  if (!normalizedTarget || !normalizedToken || !hasAbsoluteNavigationTarget(normalizedTarget)) {
    return normalizedTarget;
  }

  if (requestedTarget.startsWith('//')) return normalizedTarget;
  if (hasAbsoluteNavigationTarget(requestedTarget)) {
    try {
      if (!isApprovedAbsoluteStorefrontTarget(new URL(requestedTarget))) return normalizedTarget;
    } catch {
      return normalizedTarget;
    }
  }

  try {
    const url = new URL(normalizedTarget);
    url.searchParams.set('handoff_token', normalizedToken);
    return url.toString();
  } catch {
    return normalizedTarget;
  }
};

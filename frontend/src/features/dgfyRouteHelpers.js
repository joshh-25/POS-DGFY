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
  return window.location.origin || resolveLocalOriginForPort(window.location.port || '5180');
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
      if (currentPort === '5180') {
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
    const currentOrigin = window.location.origin;
    if (isLocalRuntime()) {
      const configuredDevPort = String(import.meta.env?.VITE_POS_DEV_PORT || '5174').trim() || '5174';
      return `${resolveLocalOriginForPort(configuredDevPort)}${terminalPath}`;
    }
    if (currentOrigin.includes('skupervisor.')) {
      return `${currentOrigin.replace('skupervisor.', 'pos.')}${terminalPath}`;
    }
    return `${currentOrigin}${terminalPath}`;
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

const isValidStorefrontReturnPath = (pathname = '') => {
  const normalizedPath = String(pathname || '').trim().replace(/\/+$/, '') || '/';
  if (normalizedPath === '/map-dgfy/account') return true;
  if (normalizedPath === '/tenant-store/account') return true;
  if (/^\/tenant-store\/[^/]+(?:\/[^/]+)?$/i.test(normalizedPath)) return true;
  if (/^\/store\/[^/]+(?:\/[^/]+)?$/i.test(normalizedPath)) return true;
  if (/^\/store-template(?:\/[^/]+)?$/i.test(normalizedPath)) return true;
  if (/^\/storefront-template(?:\/[^/]+)?$/i.test(normalizedPath)) return true;
  return false;
};

export const normalizeDgfyReturnTarget = (target = '') => {
  const normalizedTarget = String(target || '').trim();
  if (!normalizedTarget) return '';

  if (hasAbsoluteNavigationTarget(normalizedTarget)) {
    try {
      const url = new URL(normalizedTarget);
      if (!isValidStorefrontReturnPath(url.pathname)) {
        return resolveStorefrontAccountUrl();
      }
      return url.toString();
    } catch {
      return resolveStorefrontAccountUrl();
    }
  }

  if (normalizedTarget.startsWith('/')) {
    return isValidStorefrontReturnPath(normalizedTarget)
      ? normalizedTarget
      : resolveStorefrontAccountUrl();
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
  const normalizedTarget = String(target || '').trim();
  const normalizedToken = String(handoffToken || '').trim();
  if (!normalizedTarget || !normalizedToken || !hasAbsoluteNavigationTarget(normalizedTarget)) {
    return normalizedTarget;
  }
  try {
    const url = new URL(normalizedTarget);
    url.searchParams.set('handoff_token', normalizedToken);
    return url.toString();
  } catch {
    return normalizedTarget;
  }
};

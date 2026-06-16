const CSRF_COOKIE_KEY = 'sku_csrf_token';

let accessToken = '';
let companyToken = '';
let refreshInFlight = null;

const readRuntimeCompanyToken = () => {
  if (typeof window === 'undefined') return '';
  const runtime = window.__DGFY_POS_RUNTIME__;
  return String(runtime?.companyToken || '').trim();
};

const resolveCompanyToken = () => {
  const resolved = companyToken || readRuntimeCompanyToken();
  if (resolved && resolved !== companyToken) {
    companyToken = resolved;
  }
  return companyToken;
};

const resolveApiBaseUrl = () => {
  const configured = (import.meta.env.VITE_API_URL || '').trim();
  if (!configured) return '/api/v1';
  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(configured, window.location.origin);
      const configuredLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
      const runtimeLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
      if (configuredLocal && !runtimeLocal) return '/api/v1';
    } catch {
      return configured;
    }
  }
  return configured;
};

const readCookie = (name) => {
  if (typeof document === 'undefined') return '';
  const prefix = `${name}=`;
  return String(document.cookie || '')
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length) || '';
};

export const getCsrfToken = () => decodeURIComponent(readCookie(CSRF_COOKIE_KEY));

export const setBrowserSession = ({ token, companyToken: nextCompanyToken } = {}) => {
  if (token !== undefined) accessToken = String(token || '').trim();
  if (nextCompanyToken !== undefined) companyToken = String(nextCompanyToken || '').trim();
  if (typeof window !== 'undefined') {
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent('auth:session-updated')
      : new Event('auth:session-updated');
    window.dispatchEvent(event);
  }
};

export const clearBrowserSession = () => {
  accessToken = '';
  companyToken = '';
};

export const getAccessToken = () => accessToken;
export const getCompanyToken = () => resolveCompanyToken();

export const getAuthHeaders = ({ includeCsrf = false } = {}) => {
  const headers = {};
  const resolvedCompanyToken = resolveCompanyToken();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (resolvedCompanyToken) headers['x-company-token'] = resolvedCompanyToken;
  const csrfToken = includeCsrf ? getCsrfToken() : '';
  if (csrfToken) headers['x-csrf-token'] = csrfToken;
  return headers;
};

export const refreshBrowserSession = async () => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${resolveApiBaseUrl()}/auth/refresh-token`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders({ includeCsrf: true })
        },
        body: '{}',
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data?.message || 'Session refresh failed');
        error.response = { status: response.status, data };
        throw error;
      }
      const session = data?.data || {};
      setBrowserSession({
        token: session.token,
        companyToken: session.company?.token || companyToken
      });
      return session.token || '';
    } finally {
      clearTimeout(timeout);
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
};

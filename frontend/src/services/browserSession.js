const CSRF_COOKIE_KEY = 'sku_csrf_token';

let accessToken = '';
let companyToken = '';
let refreshInFlight = null;
let csrfBootstrapInFlight = null;

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

export const ensureCsrfToken = async ({ force = false } = {}) => {
  const currentToken = getCsrfToken();
  if (currentToken && !force) return currentToken;
  if (typeof fetch !== 'function') return '';
  if (csrfBootstrapInFlight) return csrfBootstrapInFlight;

  csrfBootstrapInFlight = (async () => {
    const response = await fetch(`${resolveApiBaseUrl()}/auth/csrf-token`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = new Error(data?.message || 'CSRF token bootstrap failed');
      error.response = { status: response.status, data };
      throw error;
    }
    return getCsrfToken();
  })().finally(() => {
    csrfBootstrapInFlight = null;
  });

  return csrfBootstrapInFlight;
};

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
export const getCompanyToken = () => companyToken;

export const getAuthHeaders = ({ includeCsrf = false } = {}) => {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (companyToken) headers['x-company-token'] = companyToken;
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
      await ensureCsrfToken();
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

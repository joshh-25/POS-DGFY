import axios from 'axios';
import {
  canRefreshBrowserSession,
  getAccessToken,
  getCompanyToken,
  getAuthHeaders,
  getBrowserSessionSnapshot,
  ensureCsrfToken,
  refreshBrowserSession,
  setBrowserSession
} from './browserSession.js';
import { clearClientSession } from './sessionCleanup.js';
import { emitGlobalApiError } from '../utils/errorHandler.js';
import { resolveApiBaseUrl, getRuntimeConfig } from '../utils/runtimeConfig.js';
import { tagRequestFailureContext } from '../observability/sentryClient.js';

const isTestEnvironment = (() => {
  try {
    return import.meta.env?.MODE === 'test';
  } catch {
    return false;
  }
})();

const logDebug = (...args) => {
  if (!isTestEnvironment) console.debug(...args);
};

const logWarn = (...args) => {
  if (!isTestEnvironment) console.warn(...args);
};

const logError = (...args) => {
  if (!isTestEnvironment) console.error(...args);
};

const formatApiValidationError = (data) => {
  if (!data) return 'No validation details returned.';
  if (typeof data === 'string') return data;

  const message = data.message || data.error || data.error_message || data.details;
  const fieldErrors = Array.isArray(data.errors)
    ? data.errors
        .map((entry) => {
          if (!entry) return null;
          if (typeof entry === 'string') return entry;
          const field = entry.field || entry.path || entry.param || entry.key;
          const detail = entry.message || entry.msg || entry.error || entry.reason;
          if (field && detail) return `${field}: ${detail}`;
          return detail || field || null;
        })
        .filter(Boolean)
    : [];

  const parts = [message, ...fieldErrors].filter(Boolean);
  if (parts.length > 0) return parts.join(' | ');

  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
};

const API_BASE_URL = resolveApiBaseUrl(import.meta.env, typeof window !== 'undefined' ? window.location : undefined);
const RUNTIME_CONFIG = getRuntimeConfig(import.meta.env, typeof window !== 'undefined' ? window.location : undefined);

const buildDesktopHashRedirect = (path, search = '') => {
  const normalizedPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${String(path || '')}`;
  const normalizedSearch = String(search || '').trim();
  const hashTarget = `#${normalizedPath}${normalizedSearch}`;

  if (typeof window === 'undefined') {
    return `/dist-apps/pos/index.html${hashTarget}`;
  }

  const protocol = String(window.location?.protocol || '').toLowerCase();
  if (protocol === 'dgfypos:') {
    return `dgfypos://app/dist-apps/pos/index.html${hashTarget}`;
  }

  return `/dist-apps/pos/index.html${hashTarget}`;
};

const getSessionExpiredRedirect = () => {
  const appSurface = RUNTIME_CONFIG.appSurface || String(import.meta.env.VITE_APP_SURFACE || '').trim().toLowerCase();
  if (RUNTIME_CONFIG.isDesktopShell && appSurface === 'pos') {
    return buildDesktopHashRedirect('/terminal', '?reason=session_expired');
  }
  if (appSurface === 'pos') {
    return '/?reason=session_expired';
  }

  const pathname =
    typeof window !== 'undefined' && typeof window?.location?.pathname === 'string'
      ? window.location.pathname
      : '';

  if (pathname.startsWith('/terminal')) {
    return '/terminal?reason=session_expired';
  }
  return '/login?reason=session_expired';
};

const getPhoneCompletionRedirect = () => (
  RUNTIME_CONFIG.isDesktopShell
    ? buildDesktopHashRedirect('/settings', '?tab=profile&reason=phone_required')
    : '/settings?tab=profile&reason=phone_required'
);

const resolveRequestPath = (url = '') => {
  try {
    return new URL(String(url || ''), 'http://local').pathname;
  } catch {
    return String(url || '');
  }
};

const isSessionRefreshRequest = (url = '') => resolveRequestPath(url).endsWith('/auth/refresh-token');

const setRequestHeader = (headers, name, value) => {
  if (!headers || !value) return;
  if (typeof headers.set === 'function') {
    headers.set(name, value);
    return;
  }
  headers[name] = value;
};

const getRequestHeader = (headers, name) => {
  if (!headers) return '';
  if (typeof headers.get === 'function') {
    return String(headers.get(name) || '').trim();
  }
  return String(headers[name] || headers[name.toLowerCase()] || '').trim();
};

const readBearerToken = (headers) => {
  const authorization = getRequestHeader(headers, 'Authorization');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
};

const getResponseReasonCode = (error) => String(
  error?.response?.data?.errors?.reason_code
  || error?.response?.data?.error_code
  || error?.response?.data?.code
  || ''
).trim();

const NON_REFRESHABLE_401_REASONS = new Set([
  'POS_TERMINAL_PAIRING_INVALID'
]);

export const isPublicOrAuthRequest = (url = '') => {
  const path = resolveRequestPath(url);
  return (
    path.endsWith('/auth/login') ||
    path.endsWith('/auth/lookup') ||
    path.endsWith('/auth/register') ||
    path.endsWith('/auth/email-otp/request') ||
    path.includes('/dgfy/auth/') ||
    path.endsWith('/dgfy/legal-terms/current') ||
    path.startsWith('/store/') ||
    path.startsWith('/stores/') ||
    path.startsWith('/public/')
  );
};

const shouldPreflightBrowserSession = (config = {}) => (
  canRefreshBrowserSession() &&
  !config.skipAuthRefresh &&
  !isSessionRefreshRequest(config.url) &&
  !isPublicOrAuthRequest(config.url)
);

const isAdminRequest = (url = '') => {
  const path = resolveRequestPath(url);
  return path.startsWith('/admin/') || path.startsWith('/dgfy/admin/');
};

const shouldRepairTenantContext = (config = {}, token = '', companyToken = '') => (
  !config.skipTenantAuthHeaders &&
  shouldPreflightBrowserSession(config) &&
  !isAdminRequest(config.url) &&
  Boolean(token) &&
  !companyToken
);

const isAlreadyOnPhoneCompletionRoute = () => {
  if (typeof window === 'undefined') return false;
  const pathname = window.location?.pathname || '';
  const search = window.location?.search || '';
  return pathname === '/settings' && new URLSearchParams(search).get('tab') === 'profile';
};

const dispatchSessionExpiredEvent = () => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }

  if (typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('auth:session-expired'));
    return;
  }

  if (typeof Event === 'function') {
    window.dispatchEvent(new Event('auth:session-expired'));
  }
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Single-tab mutex ────────────────────────────────────────────────────────
// Prevents parallel 401s within a single tab from each firing a separate
// refresh request. Only one refresh is ever in-flight at a time; subsequent
// 401s queue and retry with the new token once the single refresh completes.
let isRefreshing = false;
let failedQueue = []; // Array of { resolve, reject } for queued requests

// Tracks whether THIS tab initiated the current refresh.
// Tabs that received 'token-refresh-started' from another tab set isRefreshing=true
// but must NOT reset it in .finally() — only the leader resets it there.
let iAmRefreshLeader = false;

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

// ── Cross-tab coordination via BroadcastChannel ─────────────────────────────
// Solves the multi-tab RTR race condition:
//   - Tab A gets 401, broadcasts 'token-refresh-started', starts the refresh.
//   - Tab B gets 401, receives the broadcast, sets isRefreshing=true locally,
//     queues its request — it does NOT start a competing refresh.
//   - Tab A completes and broadcasts 'token-refresh-success' without credentials.
//   - Tab B rehydrates through the HttpOnly refresh cookie and drains its queue.
// Without this, Tab B would fire its own refresh with the already-blacklisted
// token (RTR), get a 401, and force-logout the user.
const authChannel = (() => {
  try { return new BroadcastChannel('sku_auth'); } catch { return null; }
})();

if (authChannel) {
  authChannel.onmessage = ({ data }) => {
    if (data.type === 'token-refresh-started') {
      // Another tab is leading — mark ourselves as refreshing so new 401s queue.
      isRefreshing = true;
    }
    if (data.type === 'token-refresh-success') {
      // Another tab completed refresh. Tokens never cross BroadcastChannel;
      // rehydrate this tab through the authoritative HttpOnly cookie instead.
      const finishCrossTabRefresh = async () => {
        const nextToken = await refreshBrowserSession().catch(() => '');
        if (isRefreshing) {
          if (nextToken) processQueue(null, nextToken);
          else processQueue(new Error('Session refresh failed'), null);
          isRefreshing = false;
        }
      };
      finishCrossTabRefresh();
    }
    if (data.type === 'session-expired' || data.type === 'auth:logout') {
      // Another tab's refresh failed, or the user logged out in another tab.
      // Clear local state and lock this tab immediately.
      dispatchSessionExpiredEvent();
      clearClientSession({
        reason: 'session_expired',
        broadcast: false,
        emitAuthEvents: false,
        redirectTo: getSessionExpiredRedirect()
      });
    }
    if (data.type === 'tenant-switched') {
      window.dispatchEvent(new CustomEvent('auth:tenant-switched', {
        detail: {
          tenantId: data.tenantId || '',
          companyName: data.companyName || ''
        }
      }));
      clearClientSession({
        reason: 'company_switch_other_tab',
        broadcast: false,
        emitAuthEvents: false,
        redirectTo: '/'
      });
    }
  };
}

// Re-broadcast deliberate logout to other tabs.
// authService.js dispatches 'auth:logout' locally; we forward it via BroadcastChannel
// so other open tabs can show the session-expired banner.
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', (event) => {
    if (event?.detail?.broadcast === false) return;
    authChannel?.postMessage({ type: 'auth:logout' });
  });
}

// Request interceptor - Add JWT token to headers
api.interceptors.request.use(
  async (config) => {
    config.headers = config.headers || {};
    const explicitToken = readBearerToken(config.headers);
    const explicitCompanyToken = getRequestHeader(config.headers, 'x-company-token');
    let token = explicitToken || getAccessToken();
    let companyToken = explicitCompanyToken || getCompanyToken();

    if (
      (!token && shouldPreflightBrowserSession(config)) ||
      shouldRepairTenantContext(config, token, companyToken)
    ) {
      const preflightToken = token;
      const refreshedToken = await refreshBrowserSession().catch(() => '');
      token = refreshedToken || preflightToken || getAccessToken();
      companyToken = getCompanyToken();
    }

    const method = String(config.method || 'get').toLowerCase();
    const isUnsafeMethod = !['get', 'head', 'options'].includes(method);
    if (
      isUnsafeMethod
      && shouldPreflightBrowserSession(config)
      && !getAuthHeaders({ includeCsrf: true })['x-csrf-token']
    ) {
      await ensureCsrfToken().catch(() => '');
    }
    const authHeaders = getAuthHeaders({
      includeCsrf: isUnsafeMethod
    });

    if (token && !config.skipTenantAuthHeaders) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Only add stored companyToken if request doesn't already have one set
    // This allows login/register to use a different token than what's stored
    if (companyToken && !config.skipTenantAuthHeaders && !explicitCompanyToken) {
      setRequestHeader(config.headers, 'x-company-token', companyToken);
    }
    if (authHeaders['x-csrf-token']) {
      // Refresh rotates the CSRF cookie. Always replace a header carried by a
      // retried Axios config so cookie and header remain the same generation.
      setRequestHeader(config.headers, 'x-csrf-token', authHeaders['x-csrf-token']);
    }
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    const requestSession = getBrowserSessionSnapshot();
    config._authSessionGeneration = requestSession.generation;
    config._authTokenAtDispatch = readBearerToken(config.headers);
    config._authCompanyTokenAtDispatch = getRequestHeader(config.headers, 'x-company-token');

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle token refresh and errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401
      && originalRequest
      && !originalRequest._staleAuthRetry
      && !originalRequest.skipAuthRefresh
      && !isPublicOrAuthRequest(originalRequest.url)
      && !NON_REFRESHABLE_401_REASONS.has(getResponseReasonCode(error))
    ) {
      const currentSession = getBrowserSessionSnapshot();
      const requestGeneration = Number(originalRequest._authSessionGeneration);
      const requestToken = String(originalRequest._authTokenAtDispatch || '').trim();
      const staleGeneration = Number.isFinite(requestGeneration)
        && requestGeneration !== currentSession.generation;
      const staleToken = Boolean(
        requestToken
        && currentSession.token
        && requestToken !== currentSession.token
      );

      if ((staleGeneration || staleToken) && currentSession.token) {
        originalRequest._staleAuthRetry = true;
        originalRequest.headers = originalRequest.headers || {};
        setRequestHeader(originalRequest.headers, 'Authorization', `Bearer ${currentSession.token}`);
        if (currentSession.companyToken) {
          setRequestHeader(originalRequest.headers, 'x-company-token', currentSession.companyToken);
        }
        return api(originalRequest);
      }
    }

    if (
      error.response?.status === 403
      && getResponseReasonCode(error) === 'CSRF_TOKEN_REQUIRED'
      && originalRequest
      && !originalRequest._csrfRetry
      && !isPublicOrAuthRequest(originalRequest.url)
    ) {
      originalRequest._csrfRetry = true;
      const csrfToken = await ensureCsrfToken({ force: true }).catch(() => '');
      if (csrfToken) {
        originalRequest.headers = originalRequest.headers || {};
        setRequestHeader(originalRequest.headers, 'x-csrf-token', csrfToken);
        return api(originalRequest);
      }
    }

    // Handle 401 errors (unauthorized)
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      canRefreshBrowserSession() &&
      !originalRequest.skipAuthRefresh &&
      !isPublicOrAuthRequest(originalRequest.url) &&
      !NON_REFRESHABLE_401_REASONS.has(getResponseReasonCode(error))
    ) {
      // A refresh is already in-flight (either started by this tab or by another tab
      // that broadcast 'token-refresh-started') — queue this request so it retries
      // with the new token once the single refresh completes.
      if (isRefreshing) {
        if (failedQueue.length >= 20) {
          // Queue cap: Dashboard fires at most 6 concurrent calls; 20 is a safe ceiling.
          // Reject immediately rather than grow the queue unboundedly during a long refresh.
          return Promise.reject(error);
        }
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest._retry = true; // prevent double-refresh if this retry also gets a 401
          originalRequest.headers = originalRequest.headers || {};
          setRequestHeader(originalRequest.headers, 'Authorization', `Bearer ${token}`);
          const ct = getCompanyToken();
          if (ct) setRequestHeader(originalRequest.headers, 'x-company-token', ct);
          return api(originalRequest);
        });
      }

      // First 401 in this tab — acquire the lock, announce leadership, perform the refresh
      originalRequest._retry = true;
      isRefreshing = true;
      iAmRefreshLeader = true;
      const refreshSession = getBrowserSessionSnapshot();
      authChannel?.postMessage({ type: 'token-refresh-started' }); // tell other tabs to queue

      return new Promise((resolve, reject) => {
        const companyToken = getCompanyToken();

        logDebug('🔄 [Auth] Refreshing token...', { companyToken });

        ensureCsrfToken()
          .then(() => axios.post(
          `${API_BASE_URL}/auth/refresh-token`,
          {},
          {
            headers: getAuthHeaders({ includeCsrf: true }),
            timeout: 15000,
            withCredentials: true
          }
        ))
          .then(({ data }) => {
            const session = data?.data || {};
            const token = session.token || '';
            const resolvedCompanyToken = session.company?.token || getCompanyToken();
            const currentSession = getBrowserSessionSnapshot();
            const refreshWasSuperseded = currentSession.generation !== refreshSession.generation
              || currentSession.token !== refreshSession.token;

            if (refreshWasSuperseded && currentSession.token) {
              setRequestHeader(originalRequest.headers, 'Authorization', `Bearer ${currentSession.token}`);
              if (currentSession.companyToken) {
                setRequestHeader(originalRequest.headers, 'x-company-token', currentSession.companyToken);
              }
              processQueue(null, currentSession.token);
              resolve(api(originalRequest));
              return;
            }

            setBrowserSession({
              token,
              companyToken: resolvedCompanyToken
            });

            // Broadcast success BEFORE draining the local queue so that other tabs
            // adopt the new token and drain their own queues concurrently.
            authChannel?.postMessage({
              type: 'token-refresh-success'
            });

            setRequestHeader(originalRequest.headers, 'Authorization', `Bearer ${token}`);
            if (resolvedCompanyToken) {
              setRequestHeader(originalRequest.headers, 'x-company-token', resolvedCompanyToken);
            }

            processQueue(null, token); // unblock all queued requests with new token
            resolve(api(originalRequest));
          })
          .catch(err => {
            const currentSession = getBrowserSessionSnapshot();
            const refreshWasSuperseded = currentSession.generation !== refreshSession.generation
              || currentSession.token !== refreshSession.token;
            if (refreshWasSuperseded && currentSession.token) {
              setRequestHeader(originalRequest.headers, 'Authorization', `Bearer ${currentSession.token}`);
              if (currentSession.companyToken) {
                setRequestHeader(originalRequest.headers, 'x-company-token', currentSession.companyToken);
              }
              processQueue(null, currentSession.token);
              resolve(api(originalRequest));
              return;
            }

            logError('❌ [Auth] Token refresh failed:', err);
            processQueue(err, null); // fail all queued requests in this tab
            authChannel?.postMessage({ type: 'session-expired' }); // lock other tabs as well
            clearClientSession({
              reason: 'session_expired',
              broadcast: false,
              emitAuthEvents: false,
              redirectTo: getSessionExpiredRedirect()
            });
            reject(err);
          })
          .finally(() => {
            // Only the tab that STARTED the refresh resets the leader state here.
            // Follower tabs reset isRefreshing when they receive 'token-refresh-success'
            // or 'session-expired' via the BroadcastChannel message handler.
            if (iAmRefreshLeader) {
              isRefreshing = false;
              iAmRefreshLeader = false;
            }
          });
      });
    }

    // Handle stale tenant context (Tenant no longer exists or user removed)
    if (error.response?.status === 404 &&
      (error.response?.data?.message?.includes('Tenant') || error.response?.data?.message?.includes('company token'))) {
      logWarn('⚠️ [Auth] Stale company token detected, clearing...');
      localStorage.removeItem('companyToken');
      // Don't necessarily redirect to login here, just clear the token
      // Most protected routes will redirect if they need a tenant
    }

    if (
      error.response?.status === 428 &&
      error.response?.data?.error_code === 'PHONE_NUMBER_REQUIRED' &&
      typeof window !== 'undefined' &&
      !isAlreadyOnPhoneCompletionRoute()
    ) {
      window.location.href = getPhoneCompletionRedirect();
    }

    // Handle 429 rate-limit responses: attach a normalized retryAfterSeconds
    // (mirroring what apps/store/src/services/requestJson.js already exposes)
    // so callers can back off instead of retrying at their normal cadence into
    // a limiter that's already rejecting them.
    if (error.response?.status === 429) {
      const headers = error.response?.headers || {};
      const retryAfterHeader = headers['retry-after'] ?? headers['Retry-After'];
      const retryAfterSeconds = Number(
        error.response?.data?.retryAfterSeconds
        ?? retryAfterHeader
      );
      error.retryAfterSeconds = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds
        : null;
    }

    // Log detailed validation errors for 422 responses
    if (error.response?.status === 422) {
      logError(`❌ API 422 Validation Error: ${formatApiValidationError(error.response.data)}`);
      if (error.response.data.errors) {
        if (!isTestEnvironment) {
          console.table(error.response.data.errors);
        }
      }
    }

    // Global error notification path for 5xx and network/no-response failures.
    // Components can opt out on a request-by-request basis using skipGlobalErrorToast.
    // Capability blocks still emit their status event so shell-level capability
    // notices can update without showing a generic global error toast.
    const responseCode = error.response?.data?.code || error.response?.data?.error_code || error.response?.data?.error?.code;
    const shouldEmitSuppressedCapabilityStatus =
      error?.config?.skipGlobalErrorToast === true &&
      (responseCode === 'TENANT_CAPABILITY_DISABLED' || responseCode === 'CUSTOMER_ACCESS_MODE_BLOCKED');
    if (!error?.config?.skipGlobalErrorToast || shouldEmitSuppressedCapabilityStatus) {
      emitGlobalApiError({ error, source: 'tenant-api' });
    }

    return Promise.reject(error);
  }
);

// Separate, trailing interceptor rather than folding into the block above:
// that block retries/refreshes/queues extensively (CSRF retry, 401 refresh
// with a request queue), and most of those paths resolve successfully on
// retry. Registering this one after it means axios only reaches it once an
// error has propagated past every retry above with nothing left to recover
// it -- a genuine, final failure -- without this needing to know about any
// of that retry logic itself.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestId = error.response?.headers?.['x-request-id'] || error.response?.data?.request_id;
    tagRequestFailureContext({
      requestId,
      url: error.config?.url,
      status: error.response?.status
    });
    return Promise.reject(error);
  }
);

export default api;

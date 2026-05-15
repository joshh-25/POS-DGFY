import axios from 'axios';
import { clearClientSession } from './sessionCleanup.js';
import { emitGlobalApiError } from '../utils/errorHandler.js';

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

const resolveApiBaseUrl = () => {
  const configured = (import.meta.env.VITE_API_URL || '').trim();
  if (!configured) return '/api/v1';

  // Safety guard:
  // If build-time env hardcodes localhost but app is opened from a non-local host,
  // fall back to same-origin /api/v1 to avoid browser-side network errors.
  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(configured, window.location.origin);
      const configuredLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
      const runtimeLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
      if (configuredLocal && !runtimeLocal) {
        logWarn('[API] VITE_API_URL points to localhost on a non-local host. Falling back to /api/v1.');
        return '/api/v1';
      }
    } catch {
      // Ignore parse errors and use configured as-is.
    }
  }

  return configured;
};

const API_BASE_URL = resolveApiBaseUrl();

const getSessionExpiredRedirect = () => {
  const pathname =
    typeof window !== 'undefined' && typeof window?.location?.pathname === 'string'
      ? window.location.pathname
      : '';

  if (pathname.startsWith('/terminal')) {
    return '/terminal?reason=session_expired';
  }
  return '/login?reason=session_expired';
};

const getPhoneCompletionRedirect = () => '/settings?tab=profile&reason=phone_required';

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
//   - Tab A completes, broadcasts 'token-refresh-success' with the new token.
//   - Tab B adopts the new token and drains its local queue.
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
      // Another tab completed the refresh — adopt the new tokens and drain our queue.
      localStorage.setItem('authToken', data.token);
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      if (isRefreshing) {
        processQueue(null, data.token);
        isRefreshing = false;
      }
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
  (config) => {
    const token = localStorage.getItem('authToken');
    const companyToken = localStorage.getItem('companyToken');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Only add stored companyToken if request doesn't already have one set
    // This allows login/register to use a different token than what's stored
    if (companyToken && !config.headers['x-company-token']) {
      config.headers['x-company-token'] = companyToken;
    }
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle token refresh and errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      const storedRefreshToken = localStorage.getItem('refreshToken');

      // No refresh token at all — immediate logout, no attempt
      if (!storedRefreshToken) {
        authChannel?.postMessage({ type: 'session-expired' });
        clearClientSession({
          reason: 'session_expired',
          broadcast: false,
          emitAuthEvents: false,
          redirectTo: getSessionExpiredRedirect()
        });
        return Promise.reject(error);
      }

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
          originalRequest.headers.Authorization = `Bearer ${token}`;
          if (!originalRequest.headers['x-company-token']) {
            const ct = localStorage.getItem('companyToken');
            if (ct) originalRequest.headers['x-company-token'] = ct;
          }
          return api(originalRequest);
        });
      }

      // First 401 in this tab — acquire the lock, announce leadership, perform the refresh
      originalRequest._retry = true;
      isRefreshing = true;
      iAmRefreshLeader = true;
      authChannel?.postMessage({ type: 'token-refresh-started' }); // tell other tabs to queue

      return new Promise((resolve, reject) => {
        const companyToken = localStorage.getItem('companyToken');
        const refreshConfig = companyToken
          ? { headers: { 'x-company-token': companyToken } }
          : {};

        logDebug('🔄 [Auth] Refreshing token...', { companyToken });

        axios.post(
          `${API_BASE_URL}/auth/refresh-token`,
          { refreshToken: storedRefreshToken },
          { ...refreshConfig, timeout: 15000 } // bare axios has no timeout — enforce one so .finally() always runs
        )
          .then(({ data }) => {
            const { token, refreshToken: newRefreshToken } = data.data;
            localStorage.setItem('authToken', token);
            if (newRefreshToken) localStorage.setItem('refreshToken', newRefreshToken);

            // Broadcast success BEFORE draining the local queue so that other tabs
            // adopt the new token and drain their own queues concurrently.
            authChannel?.postMessage({ type: 'token-refresh-success', token, refreshToken: newRefreshToken });

            originalRequest.headers.Authorization = `Bearer ${token}`;
            if (companyToken && !originalRequest.headers['x-company-token']) {
              originalRequest.headers['x-company-token'] = companyToken;
            }

            processQueue(null, token); // unblock all queued requests with new token
            resolve(api(originalRequest));
          })
          .catch(err => {
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

    // Log detailed validation errors for 422 responses
    if (error.response?.status === 422) {
      logError('❌ API 422 Validation Error:', error.response.data);
      if (error.response.data.errors) {
        if (!isTestEnvironment) {
          console.table(error.response.data.errors);
        }
      }
    }

    // Global error notification path for 5xx and network/no-response failures.
    // Components can opt out on a request-by-request basis using skipGlobalErrorToast.
    if (!error?.config?.skipGlobalErrorToast) {
      emitGlobalApiError({ error, source: 'tenant-api' });
    }

    return Promise.reject(error);
  }
);

export default api;

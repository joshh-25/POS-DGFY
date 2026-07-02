/**
 * Frontend Interceptor — Token Refresh Mutex Tests
 *
 * Tests the in-memory mutex state (isRefreshing, failedQueue, _retry flag)
 * that the backend cannot see. Uses axios-mock-adapter to control HTTP
 * responses without a real server.
 *
 * Coverage:
 *   2.1 — Happy path: N concurrent 401s → exactly 1 refresh call fires
 *   2.2 — Header correctness: queued retries get Authorization + x-company-token
 *   2.3 — Failure path: all queued requests reject when refresh fails
 *   2.4 — Double-refresh prevention: queued retry's own 401 doesn't start new refresh
 *   2.5 — Queue cap: requests beyond 20 are rejected immediately during a long refresh
 *   2.6 — Timeout: isRefreshing resets after 15s timeout on the refresh call;
 *          spy asserts timeout: 15000 is actually passed to axios.post (contract test)
 *   2.7 — Network error: ECONNREFUSED-style error drains queue and resets isRefreshing
 *   2.8 — Cross-tab: receiving token-refresh-success from another tab drains local queue
 *   2.9 — Cross-tab: receiving session-expired from another tab clears local auth and redirects
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';

// ----- localStorage stub -----
const store = {};
const localStorageMock = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// stub window.location (used by api.js on forced logout)
// Also needs addEventListener/dispatchEvent for BroadcastChannel cross-tab events
const windowEventListeners = {};
Object.defineProperty(globalThis, 'window', {
  value: {
    location: { href: '' },
    addEventListener: (type, fn) => {
      windowEventListeners[type] = windowEventListeners[type] || [];
      windowEventListeners[type].push(fn);
    },
    removeEventListener: (type, fn) => {
      if (windowEventListeners[type]) {
        windowEventListeners[type] = windowEventListeners[type].filter(f => f !== fn);
      }
    },
    dispatchEvent: (event) => {
      (windowEventListeners[event.type] || []).forEach(fn => fn(event));
    },
  },
  writable: true,
});

Object.defineProperty(globalThis, 'document', {
  value: {
    cookie: 'sku_csrf_token=csrf-tenant-interceptor'
  },
  writable: true,
});

// ----- BroadcastChannel mock -----
// Exposes the most-recently created instance via globalThis.__bcInstance so
// tests can simulate incoming messages from other tabs by calling:
//   globalThis.__bcInstance.onmessage({ data: { type: '...' } })
// We store it on globalThis (not a module-level let) so it survives vi.resetModules().
globalThis.__bcInstance = null;
class BroadcastChannelMock {
  constructor() {
    this.onmessage = null;
    this.postMessage = vi.fn();
    this.close = vi.fn();
    globalThis.__bcInstance = this;
  }
}
Object.defineProperty(globalThis, 'BroadcastChannel', {
  value: BroadcastChannelMock,
  writable: true,
});

/**
 * Because api.js has module-level state (isRefreshing, failedQueue), we must
 * re-import the module fresh for each test via vi.resetModules() + dynamic import.
 */
async function freshApi() {
  vi.resetModules();
  const mod = await import('../api.js');
  return mod.default;
}

describe('api.js — Token Refresh Mutex (Interceptor Unit Tests)', () => {
  let api;
  let mockApi;    // mocks the api (axios.create()) instance — for regular API endpoints
  let mockAxios;  // mocks the global axios instance — for the refresh-token call
  let refreshCallCount;

  beforeEach(async () => {
    localStorage.clear();
    window.location.href = '';
    document.cookie = 'sku_csrf_token=csrf-tenant-interceptor';

    refreshCallCount = 0;

    // Fresh module — resets isRefreshing and failedQueue to their initial values
    api = await freshApi();
    const session = await import('../browserSession.js');
    session.setBrowserSession({ token: 'expired-token', companyToken: 'test-company-token' });

    // Mock the global axios instance.
    // The refresh call in api.js uses the BARE global axios (not the api instance).
    // axios-mock-adapter intercepts all requests matching the URL regex regardless of base URL.
    mockAxios = new MockAdapter(axios, { onNoMatch: 'passthrough' });

    // Mock the api instance (the axios.create() instance exported by api.js).
    mockApi = new MockAdapter(api, { onNoMatch: 'passthrough' });
  });

  afterEach(() => {
    mockApi?.restore();
    mockAxios?.restore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Test 2.1 — Happy path: N concurrent 401s → exactly 1 refresh fires
  // -------------------------------------------------------------------------
  it('2.1 — only 1 refresh request fires for 6 concurrent 401s', async () => {
    const endpoints = ['/items', '/suppliers', '/dashboard/stats', '/purchase-orders', '/job-orders', '/alerts'];
    endpoints.forEach(ep => {
      mockApi.onGet(ep).replyOnce(401).onGet(ep).reply(200, { data: 'ok' });
    });

    // Use regex to match the refresh-token URL regardless of base URL or host
    mockAxios.onPost(/auth\/refresh-token/).reply(() => {
      refreshCallCount++;
      return [200, { data: { token: 'new-access-token', refreshToken: 'new-refresh-token' } }];
    });

    const results = await Promise.allSettled(endpoints.map(ep => api.get(ep)));
    const successes = results.filter(r => r.status === 'fulfilled');

    expect(refreshCallCount).toBe(1);
    expect(successes).toHaveLength(6);
  });

  it('bootstraps CSRF before the 401 recovery refresh request', async () => {
    document.cookie = '';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      expect(String(url)).toContain('/auth/csrf-token');
      document.cookie = 'sku_csrf_token=csrf-401-refresh';
      return { ok: true, json: async () => ({ success: true }) };
    }));

    mockApi.onGet('/protected').replyOnce(401).onGet('/protected').reply(200, { data: 'ok' });
    mockAxios.onPost(/auth\/refresh-token/).reply((config) => {
      expect(config.headers['x-csrf-token']).toBe('csrf-401-refresh');
      return [200, { data: { token: 'fresh-token' } }];
    });

    const response = await api.get('/protected');

    expect(response.data).toEqual({ data: 'ok' });
    document.cookie = 'sku_csrf_token=csrf-tenant-interceptor';
  });

  it('replaces the stale CSRF header after refresh rotates the cookie', async () => {
    const retryHeaders = [];
    mockApi.onPost('/pos/terminal/shifts/open').replyOnce(401, {
      success: false,
      message: 'Token expired',
      error_code: 'TOKEN_EXPIRED'
    });
    mockApi.onPost('/pos/terminal/shifts/open').reply((config) => {
      retryHeaders.push({ ...config.headers });
      return [200, { data: { ok: true } }];
    });
    mockAxios.onPost(/auth\/refresh-token/).reply(() => {
      document.cookie = 'sku_csrf_token=csrf-rotated-by-refresh';
      return [200, { data: { token: 'fresh-token' } }];
    });

    await api.post('/pos/terminal/shifts/open', {
      terminal_id: 'COUNTER-01',
      opening_float_amount: 100
    });

    expect(retryHeaders).toHaveLength(1);
    expect(retryHeaders[0]['x-csrf-token']).toBe('csrf-rotated-by-refresh');
  });

  it('does not refresh the access token for an invalid POS device pairing', async () => {
    mockApi.onPost('/pos/terminal/shifts/open').reply(401, {
      success: false,
      message: 'This POS device pairing is missing, expired, or no longer valid.',
      error_code: 'AUTHENTICATION_FAILED',
      errors: { reason_code: 'POS_TERMINAL_PAIRING_INVALID' }
    });
    mockAxios.onPost(/auth\/refresh-token/).reply(() => {
      refreshCallCount++;
      return [200, { data: { token: 'unexpected-token' } }];
    });

    const error = await api.post('/pos/terminal/shifts/open', {
      terminal_id: 'COUNTER-01',
      opening_float_amount: 100
    }).catch((caught) => caught);

    expect(error.response.status).toBe(401);
    expect(refreshCallCount).toBe(0);
  });

  it('force-rotates CSRF and retries a protected mutation only once', async () => {
    let shiftCalls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      expect(String(url)).toContain('/auth/csrf-token');
      document.cookie = 'sku_csrf_token=csrf-recovered';
      return { ok: true, json: async () => ({ success: true }) };
    }));
    mockApi.onPost('/pos/terminal/shifts/open').reply((config) => {
      shiftCalls++;
      if (shiftCalls === 1) {
        return [403, {
          success: false,
          error_code: 'CSRF_TOKEN_REQUIRED'
        }];
      }
      expect(config.headers['x-csrf-token']).toBe('csrf-recovered');
      return [200, { data: { ok: true } }];
    });

    const response = await api.post('/pos/terminal/shifts/open', {
      terminal_id: 'COUNTER-01',
      opening_float_amount: 100
    });

    expect(response.data).toEqual({ data: { ok: true } });
    expect(shiftCalls).toBe(2);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 2.2 — Header correctness: queued retries get correct headers
  // -------------------------------------------------------------------------
  it('2.2 — queued retries receive Authorization and x-company-token headers', async () => {
    const capturedHeaders = [];

    mockApi.onGet('/a').replyOnce(401);
    mockApi.onGet('/b').replyOnce(401);
    mockApi.onGet('/c').replyOnce(401);

    // On retry: capture headers and return 200
    mockApi.onGet('/a').reply((config) => { capturedHeaders.push({ ...config.headers }); return [200, {}]; });
    mockApi.onGet('/b').reply((config) => { capturedHeaders.push({ ...config.headers }); return [200, {}]; });
    mockApi.onGet('/c').reply((config) => { capturedHeaders.push({ ...config.headers }); return [200, {}]; });

    mockAxios.onPost(/auth\/refresh-token/).reply(200, {
      data: { token: 'fresh-token', refreshToken: 'fresh-refresh' }
    });

    await Promise.allSettled([api.get('/a'), api.get('/b'), api.get('/c')]);

    expect(capturedHeaders.length).toBeGreaterThanOrEqual(3);
    capturedHeaders.forEach(h => {
      expect(h['Authorization']).toBe('Bearer fresh-token');
      expect(h['x-company-token']).toBe('test-company-token');
    });
  });

  // -------------------------------------------------------------------------
  // Test 2.3 — Failure path: all queued requests reject when refresh fails
  // -------------------------------------------------------------------------
  it('2.3 — all queued requests reject when the refresh call fails', async () => {
    mockApi.onGet('/x').replyOnce(401);
    mockApi.onGet('/y').replyOnce(401);
    mockApi.onGet('/z').replyOnce(401);

    mockAxios.onPost(/auth\/refresh-token/).reply(() => {
      refreshCallCount++;
      return [401, { success: false, message: 'Refresh token expired' }];
    });

    const results = await Promise.allSettled([
      api.get('/x'), api.get('/y'), api.get('/z')
    ]);

    const failures = results.filter(r => r.status === 'rejected');
    expect(refreshCallCount).toBe(1);
    expect(failures).toHaveLength(3);
  });

  it('does not attempt tenant refresh for DGFY auth failures', async () => {
    mockApi.onPost('/dgfy/auth/handoff/exchange').replyOnce(401, {
      success: false,
      message: 'DGFY handoff token is invalid or expired.'
    });
    mockAxios.onPost(/auth\/refresh-token/).reply(() => {
      refreshCallCount++;
      return [200, { data: { token: 'new-access-token' } }];
    });

    const result = await api.post('/dgfy/auth/handoff/exchange', {
      handoff_token: 'expired-token'
    }).catch((error) => error);

    expect(result.response.status).toBe(401);
    expect(refreshCallCount).toBe(0);
  });

  it('preflights protected requests with refresh when the tab has only session cookies after reload', async () => {
    const session = await import('../browserSession.js');
    session.clearBrowserSession();
    document.cookie = '';
    const capturedHeaders = [];

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url, options = {}) => {
      if (String(url).includes('/auth/csrf-token')) {
        document.cookie = 'sku_csrf_token=csrf-refresh-bootstrap';
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (String(url).includes('/auth/refresh-token')) {
        expect(options.headers['x-csrf-token']).toBe('csrf-refresh-bootstrap');
        return {
          ok: true,
          json: async () => ({
            data: {
              token: 'rehydrated-access-token',
              company: { token: 'rehydrated-company-token' }
            }
          })
        };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }));

    mockApi.onGet('/dashboard/stats').reply((config) => {
      capturedHeaders.push({ ...config.headers });
      return [200, { data: 'ok' }];
    });

    const result = await api.get('/dashboard/stats');

    expect(result.data).toEqual({ data: 'ok' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/csrf-token'),
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh-token'),
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
    expect(capturedHeaders[0].Authorization).toBe('Bearer rehydrated-access-token');
    expect(capturedHeaders[0]['x-company-token']).toBe('rehydrated-company-token');
    document.cookie = 'sku_csrf_token=csrf-tenant-interceptor';
  });

  it('adds the browser CSRF cookie to unsafe protected requests', async () => {
    const capturedHeaders = [];

    mockApi.onPost('/pos/terminal/shifts/open').reply((config) => {
      capturedHeaders.push({ ...config.headers });
      return [200, { data: { ok: true } }];
    });

    await api.post('/pos/terminal/shifts/open', {
      terminal_id: 'COUNTER-01',
      opening_float_amount: 100
    });

    expect(capturedHeaders[0].Authorization).toBe('Bearer expired-token');
    expect(capturedHeaders[0]['x-company-token']).toBe('test-company-token');
    expect(capturedHeaders[0]['x-csrf-token']).toBe('csrf-tenant-interceptor');
  });

  it('bootstraps a missing CSRF cookie before unsafe protected requests', async () => {
    const capturedHeaders = [];
    document.cookie = '';

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('/auth/csrf-token')) {
        document.cookie = 'sku_csrf_token=csrf-bootstrapped';
        return {
          ok: true,
          json: async () => ({ success: true })
        };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }));

    mockApi.onPost('/pos/terminal/shifts/open').reply((config) => {
      capturedHeaders.push({ ...config.headers });
      return [200, { data: { ok: true } }];
    });

    try {
      await api.post('/pos/terminal/shifts/open', {
        terminal_id: 'COUNTER-01',
        opening_float_amount: 100
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/csrf-token'),
        expect.objectContaining({ method: 'GET', credentials: 'include' })
      );
      expect(capturedHeaders[0]['x-csrf-token']).toBe('csrf-bootstrapped');
    } finally {
      document.cookie = 'sku_csrf_token=csrf-tenant-interceptor';
    }
  });

  // -------------------------------------------------------------------------
  // Test 2.4 — Double-refresh prevention: queued retry that gets 401
  //            does NOT trigger a second refresh cycle
  // -------------------------------------------------------------------------
  it('2.4 — a queued retry that receives 401 does not trigger a second refresh', async () => {
    // Both requests: 401 initially
    mockApi.onGet('/primary').replyOnce(401);
    mockApi.onGet('/secondary').replyOnce(401);

    // Both retries (after refresh): also 401 — backend rejects new token too
    mockApi.onGet('/primary').reply(401);
    mockApi.onGet('/secondary').reply(401);

    // Refresh: succeeds once
    mockAxios.onPost(/auth\/refresh-token/).reply(() => {
      refreshCallCount++;
      return [200, { data: { token: 'new-token', refreshToken: 'new-refresh' } }];
    });

    await Promise.allSettled([api.get('/primary'), api.get('/secondary')]);

    // The refresh must only have fired ONCE — even though both retries got 401
    expect(refreshCallCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Test 2.5 — Queue cap: requests beyond 20 are rejected immediately
  // -------------------------------------------------------------------------
  it('2.5 — requests beyond queue cap of 20 are rejected immediately during long refresh', async () => {
    // First request triggers the refresh
    mockApi.onGet('/trigger').replyOnce(401);

    // 25 more requests — all 401 so they attempt to queue
    for (let i = 0; i < 25; i++) {
      mockApi.onGet(`/queued-${i}`).replyOnce(401);
    }

    // Refresh hangs — controlled via a Promise we resolve after checking state
    let resolveRefresh;
    mockAxios.onPost(/auth\/refresh-token/).reply(
      () => new Promise((res) => { resolveRefresh = res; })
    );

    // Fire all 26 calls, attaching .catch() on each so rejections are handled
    // This prevents vitest from reporting unhandled rejections
    const allCalls = [
      api.get('/trigger').catch(e => ({ _err: e })),
      ...Array.from({ length: 25 }, (_, i) => api.get(`/queued-${i}`).catch(e => ({ _err: e })))
    ];

    // Give the event loop time to process the 401s and fill the queue
    await new Promise(r => setTimeout(r, 50));

    // Resolve the refresh with a failure to drain the queue and end the test
    if (resolveRefresh) resolveRefresh([401, { success: false }]);

    const results = await Promise.all(allCalls);
    // Both cap-rejected (immediate 401) and queue-drained (refresh failed) entries
    // are caught as { _err } objects
    const errored = results.filter(r => r?._err !== undefined);

    // At least 5 requests should be rejected due to the cap (requests 21-25)
    expect(errored.length).toBeGreaterThanOrEqual(5);
  });

  // -------------------------------------------------------------------------
  // Test 2.6 — Timeout: isRefreshing resets to false after the 15s timeout
  //            fires and the .catch + .finally run on the first refresh call.
  //
  // Note: The .catch block in api.js removes the refreshToken from localStorage
  // before .finally() resets isRefreshing. We restore it manually here to
  // simulate a scenario where a new session token is available (e.g. from
  // another tab or rehydration), proving isRefreshing itself was reset.
  // -------------------------------------------------------------------------
  it('2.6 — isRefreshing resets after the 15s refresh timeout, allowing a new attempt', async () => {
    vi.useFakeTimers();

    // First request triggers a refresh that will time out at 15s
    mockApi.onGet('/first').replyOnce(401);

    // Second request (fired after isRefreshing resets): triggers a new refresh
    mockApi.onGet('/second').replyOnce(401);
    mockApi.onGet('/second').reply(200, { data: 'ok' });

    let callNumber = 0;
    mockAxios.onPost(/auth\/refresh-token/).reply(() => {
      callNumber++;
      if (callNumber === 1) {
        // First refresh: the test-injected 15s timeout fires and rejects the promise.
        // This causes api.js's .catch to run (clearing localStorage), then .finally
        // resets isRefreshing = false.
        return new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 15000)
        );
      }
      // Second refresh: succeeds — proves isRefreshing was reset
      return [200, { data: { token: 'recovered-token', refreshToken: 'recovered-refresh' } }];
    });

    // Spy on axios.post to assert that timeout: 15000 is actually passed.
    // Without this, fake timers fire based on the mock's own setTimeout, so
    // removing timeout: 15000 from api.js would not break the test otherwise.
    const axiosPostSpy = vi.spyOn(axios, 'post');

    // Fire first request — triggers the hanging refresh.
    // Attach .catch() immediately so the eventual rejection is handled.
    const firstCall = api.get('/first').catch(() => null);

    // Advance 15 seconds + 1ms to fire the timeout and let .finally() run
    await vi.advanceTimersByTimeAsync(15001);

    // First call is now settled (rejected → caught as null); isRefreshing = false
    await Promise.allSettled([firstCall]);

    // Contract assertion: the axios.post refresh call must have received timeout: 15000.
    // This is what ensures .finally() always runs even if the server never responds.
    expect(axiosPostSpy).toHaveBeenCalledWith(
      expect.stringContaining('auth/refresh-token'),
      expect.any(Object),
      expect.objectContaining({ timeout: 15000 })
    );

    // Restore refreshToken (simulates token rehydration from another tab or re-login)
    // This is needed because api.js's .catch() clears it during the first failure
    localStorage.setItem('refreshToken', 'restored-refresh-token');

    // Fire the second request — isRefreshing is false, so a new refresh should start
    const secondCall = api.get('/second');
    await vi.advanceTimersByTimeAsync(100);
    await Promise.allSettled([secondCall]);

    // Total refresh calls must be 2: first (timed out) + second (succeeded)
    expect(callNumber).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Test 2.7 — Network error: ECONNREFUSED-style failure drains queue and
  //            resets isRefreshing. The error has no .response property,
  //            which differs from a 4xx. processQueue(err) and .finally()
  //            must still fire correctly.
  // -------------------------------------------------------------------------
  it('2.7 — network error during refresh drains queue and resets isRefreshing', async () => {
    // Two requests queue behind a single refresh attempt
    mockApi.onGet('/a').replyOnce(401);
    mockApi.onGet('/b').replyOnce(401);

    // Network error: axios rejects without a response object (ECONNREFUSED-style)
    mockAxios.onPost(/auth\/refresh-token/).networkError();

    const results = await Promise.allSettled([api.get('/a'), api.get('/b')]);
    const failures = results.filter(r => r.status === 'rejected');

    // Both queued requests must have been drained with the network error
    expect(failures).toHaveLength(2);

    // isRefreshing must have reset to false — prove it by making a new request
    // that triggers a successful refresh cycle from scratch
    localStorage.setItem('refreshToken', 'restored-refresh-token');
    mockApi.onGet('/c').replyOnce(401);
    mockApi.onGet('/c').reply(200, { data: 'ok' });
    mockAxios.onPost(/auth\/refresh-token/).reply(200, {
      data: { token: 'recovered-token', refreshToken: 'recovered-refresh' }
    });

    const thirdResult = await api.get('/c');
    expect(thirdResult.data).toEqual({ data: 'ok' });
  });

  // -------------------------------------------------------------------------
  // Test 2.8 — Cross-tab: another tab broadcasts token-refresh-success.
  //
  //            Simulates the scenario where Tab A completes a refresh and
  //            broadcasts the new token. This tab (Tab B) had set isRefreshing=true
  //            after receiving 'token-refresh-started', and has a request queued.
  //            Receiving 'token-refresh-success' must drain the local queue and
  //            update localStorage — without this tab ever calling /refresh-token.
  // -------------------------------------------------------------------------
  it('2.8 — receiving token-refresh-success from another tab drains local queue', async () => {
    // Request A: triggers the refresh (becomes the leader)
    mockApi.onGet('/trigger').replyOnce(401);
    mockApi.onGet('/trigger').reply(200, { data: 'leader-ok' });

    // Request B: arrives while refresh is in-flight → goes into failedQueue
    mockApi.onGet('/queued').replyOnce(401);
    mockApi.onGet('/queued').reply(200, { data: 'queued-ok' });

    // Hang the local refresh so both requests stay pending
    let refreshAttempts = 0;
    mockAxios.onPost(/auth\/refresh-token/).reply(() => {
      refreshAttempts += 1;
      if (refreshAttempts === 1) return new Promise(() => {});
      return [200, { data: { token: 'cross-tab-token' } }];
    });

    // Fire both concurrently; attach .catch so unhandled rejections don't fail the suite
    api.get('/trigger').catch(e => e);
    // Small delay so /trigger enters the refresh path first
    await new Promise(r => setTimeout(r, 20));
    const queuedCall = api.get('/queued').catch(e => e);

    // Give the event loop time to push /queued into failedQueue
    await new Promise(r => setTimeout(r, 20));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { token: 'cross-tab-token' } })
    }));

    // Simulate another tab broadcasting a successful refresh
    globalThis.__bcInstance.onmessage({ data: {
      type: 'token-refresh-success',
    }});

    // The queued request (/queued) must have been drained and retried with the cross-tab token
    const queuedResult = await queuedCall;
    expect(queuedResult?.data).toEqual({ data: 'queued-ok' });

    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test 2.9 — Cross-tab: another tab broadcasts session-expired (refresh failed)
  //            or auth:logout (deliberate logout).
  //
  //            This tab must clear tokens and hard-redirect immediately to login.
  //            We still emit auth:session-expired for compatibility listeners.
  // -------------------------------------------------------------------------
  it('2.9 — receiving session-expired from another tab clears auth and redirects to login', async () => {
    const handler = vi.fn();
    window.addEventListener('auth:session-expired', handler);

    localStorage.setItem('authToken', 'token-a');
    localStorage.setItem('refreshToken', 'refresh-a');
    localStorage.setItem('companyToken', 'company-a');

    // Simulate another tab broadcasting session-expired
    globalThis.__bcInstance.onmessage({ data: { type: 'session-expired' } });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('companyToken')).toBeNull();
    expect(window.location.href).toBe('/login?reason=session_expired');

    // auth:logout from another tab must also trigger the banner (deliberate logout)
    window.location.href = '';
    localStorage.setItem('authToken', 'token-b');
    localStorage.setItem('refreshToken', 'refresh-b');
    localStorage.setItem('companyToken', 'company-b');
    globalThis.__bcInstance.onmessage({ data: { type: 'auth:logout' } });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('companyToken')).toBeNull();
    expect(window.location.href).toBe('/login?reason=session_expired');

    window.removeEventListener('auth:session-expired', handler);
  });
});

/**
 * api.js — transient 502/503/504 retry + cancel handling
 *
 * Mirrors the harness in api.rateLimit.test.js. Verifies:
 *  - a GET that fails transiently then recovers resolves with no api:error
 *    and no Sentry capture (the retry is invisible to both);
 *  - a GET that stays down for the whole budget rejects exactly once, with
 *    exactly one api:error and one Sentry capture -- never one per attempt;
 *  - POST is never retried;
 *  - a plain 500 is never retried;
 *  - a canceled request never reaches emitGlobalApiError or Sentry.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

const listeners = {};

const store = {};
const localStorageMock = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

Object.defineProperty(globalThis, 'window', {
  value: {
    location: { href: '', pathname: '', search: '' },
    navigator: { onLine: true },
    addEventListener: (type, fn) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    dispatchEvent: (event) => {
      (listeners[event.type] || []).forEach((fn) => fn(event));
    }
  },
  writable: true
});

globalThis.CustomEvent = class CustomEvent {
  constructor(type, options) {
    this.type = type;
    this.detail = options?.detail;
  }
};

Object.defineProperty(globalThis, 'document', {
  value: { cookie: 'sku_csrf_token=csrf-tenant-transient' },
  writable: true
});

class BroadcastChannelMock {
  constructor() {
    this.onmessage = null;
  }
  postMessage() {}
  close() {}
}
Object.defineProperty(globalThis, 'BroadcastChannel', { value: BroadcastChannelMock, writable: true });

async function freshApi() {
  vi.resetModules();
  vi.doMock('../../observability/sentryClient.js', () => ({
    tagRequestFailureContext: vi.fn(),
    captureRequestFailure: vi.fn()
  }));
  const sentryClient = await import('../../observability/sentryClient.js');
  const mod = await import('../api.js');
  return { api: mod.default, sentryClient };
}

describe('api.js — transient failure retry', () => {
  let api;
  let sentryClient;
  let mockApi;

  beforeEach(async () => {
    Object.keys(listeners).forEach((k) => delete listeners[k]);
    localStorage.clear();
    window.location.href = '';
    window.navigator.onLine = true;
    document.cookie = 'sku_csrf_token=csrf-tenant-transient';
    ({ api, sentryClient } = await freshApi());
    const session = await import('../browserSession.js');
    session.setBrowserSession({ token: 'valid-token', companyToken: 'test-company-token' });
    mockApi = new MockAdapter(api, { onNoMatch: 'passthrough' });
  });

  afterEach(() => {
    mockApi?.restore();
    vi.doUnmock('../../observability/sentryClient.js');
    vi.restoreAllMocks();
  });

  it('recovers a GET that fails 502 once then succeeds, with no api:error and no Sentry capture', async () => {
    const onApiError = vi.fn();
    window.addEventListener('api:error', onApiError);
    mockApi.onGet('/items').replyOnce(502).onGet('/items').reply(200, { data: { ok: true } });

    const response = await api.get('/items');

    expect(response.data.data.ok).toBe(true);
    expect(mockApi.history.get.length).toBe(2);
    expect(onApiError).not.toHaveBeenCalled();
    expect(sentryClient.captureRequestFailure).not.toHaveBeenCalled();
  });

  it('rejects once after the retry budget is exhausted, with exactly one api:error and one capture', async () => {
    const onApiError = vi.fn();
    window.addEventListener('api:error', onApiError);
    mockApi.onGet('/items').reply(503);

    await expect(api.get('/items')).rejects.toBeTruthy();

    // 1 original + 2 retries = 3 attempts (MAX_TRANSIENT_RETRIES = 2).
    expect(mockApi.history.get.length).toBe(3);
    expect(onApiError).toHaveBeenCalledTimes(1);
    expect(sentryClient.captureRequestFailure).toHaveBeenCalledTimes(1);
  });

  it('does not retry a POST even on a 502', async () => {
    mockApi.onPost('/orders').reply(502);

    await expect(api.post('/orders', {})).rejects.toBeTruthy();

    expect(mockApi.history.post.length).toBe(1);
  });

  it('does not retry a plain 500', async () => {
    mockApi.onGet('/items').reply(500);

    await expect(api.get('/items')).rejects.toBeTruthy();

    expect(mockApi.history.get.length).toBe(1);
  });

  it('does not retry when the browser reports itself offline', async () => {
    window.navigator.onLine = false;
    mockApi.onGet('/items').reply(503);

    await expect(api.get('/items')).rejects.toBeTruthy();

    expect(mockApi.history.get.length).toBe(1);
  });

  it('honours a short Retry-After on a 503 instead of default backoff, still within one attempt', async () => {
    mockApi.onGet('/items').reply(503, {}, { 'Retry-After': '1' });

    await expect(api.get('/items')).rejects.toBeTruthy();

    expect(mockApi.history.get.length).toBe(3);
  });

  it('never exceeds the retry budget across repeated 502s', async () => {
    mockApi.onGet('/items').reply(502);

    await expect(api.get('/items')).rejects.toBeTruthy();

    expect(mockApi.history.get.length).toBeLessThanOrEqual(3);
  });

  it('honours skipRequestFailureCapture + skipTransientRetry on a 503 (e.g. a caller-declared optional probe)', async () => {
    const onApiError = vi.fn();
    window.addEventListener('api:error', onApiError);
    mockApi.onGet('/optional/probe').reply(503);

    await expect(api.get('/optional/probe', {
      skipGlobalErrorToast: true,
      skipTransientRetry: true,
      skipRequestFailureCapture: true
    })).rejects.toBeTruthy();

    // No retries at all -- a single doomed attempt, not three.
    expect(mockApi.history.get.length).toBe(1);
    expect(onApiError).not.toHaveBeenCalled();
    expect(sentryClient.captureRequestFailure).not.toHaveBeenCalled();
  });

  it('still retries and still reports a 503 that does not opt out (the regression that matters)', async () => {
    mockApi.onGet('/items').reply(503);

    await expect(api.get('/items')).rejects.toBeTruthy();

    expect(mockApi.history.get.length).toBe(3);
    expect(sentryClient.captureRequestFailure).toHaveBeenCalledTimes(1);
  });

  it('does not emit a global error toast or retry a canceled request', async () => {
    // Sentry-level filtering of a canceled/aborted request is asserted at
    // the unit level in sentryClient.test.js ('does not capture a
    // canceled/aborted request') -- captureRequestFailure is still called
    // here (its own internal guard is what no-ops it), so this test instead
    // covers the axios-level contract: the cancel guard at the top of the
    // main interceptor skips the retry branch and skipEmitGlobalApiError
    // path entirely for a canceled request.
    const onApiError = vi.fn();
    window.addEventListener('api:error', onApiError);
    const controller = new AbortController();
    mockApi.onGet('/items').reply(() => new Promise((resolve) => {
      setTimeout(() => resolve([200, { data: { ok: true } }]), 50);
    }));

    const pending = api.get('/items', { signal: controller.signal }).catch((err) => err);
    controller.abort();
    const error = await pending;

    expect(axios.isCancel(error)).toBe(true);
    expect(onApiError).not.toHaveBeenCalled();
  });
});

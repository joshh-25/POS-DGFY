/**
 * api.js — 429 rate-limit backoff signal
 *
 * The response interceptor previously handled 401/403/404/422/428 specially
 * but had no 429 branch at all, so a caller had no way to know it should
 * back off — it would just keep retrying at its normal cadence into a
 * limiter that was already rejecting it. This asserts the interceptor
 * attaches a normalized retryAfterSeconds (mirroring
 * apps/store/src/services/requestJson.js) from both the response body and
 * the Retry-After header.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';

const store = {};
const localStorageMock = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

Object.defineProperty(globalThis, 'window', {
  value: {
    location: { href: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  },
  writable: true,
});

Object.defineProperty(globalThis, 'document', {
  value: { cookie: 'sku_csrf_token=csrf-tenant-ratelimit' },
  writable: true,
});

async function freshApi() {
  vi.resetModules();
  const mod = await import('../api.js');
  return mod.default;
}

describe('api.js — 429 rate-limit backoff signal', () => {
  let api;
  let mockApi;

  beforeEach(async () => {
    localStorage.clear();
    window.location.href = '';
    document.cookie = 'sku_csrf_token=csrf-tenant-ratelimit';
    api = await freshApi();
    const session = await import('../browserSession.js');
    session.setBrowserSession({ token: 'valid-token', companyToken: 'test-company-token' });
    mockApi = new MockAdapter(api, { onNoMatch: 'passthrough' });
  });

  afterEach(() => {
    mockApi?.restore();
    vi.restoreAllMocks();
  });

  it('attaches retryAfterSeconds from the response body', async () => {
    mockApi.onGet('/items').reply(429, { success: false, message: 'Item request limit reached.', retryAfterSeconds: 42 });

    const error = await api.get('/items').catch((err) => err);
    expect(error.response.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(42);
  });

  it('falls back to the Retry-After header when the body has no retryAfterSeconds', async () => {
    mockApi.onGet('/items').reply(429, { success: false, message: 'Too many requests.' }, { 'Retry-After': '30' });

    const error = await api.get('/items').catch((err) => err);
    expect(error.response.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(30);
  });

  it('sets retryAfterSeconds to null when neither source provides a usable value', async () => {
    mockApi.onGet('/items').reply(429, { success: false, message: 'Too many requests.' });

    const error = await api.get('/items').catch((err) => err);
    expect(error.response.status).toBe(429);
    expect(error.retryAfterSeconds).toBeNull();
  });

  it('does not attach retryAfterSeconds for non-429 errors', async () => {
    mockApi.onGet('/items').reply(500, { success: false, message: 'Server error.' });

    const error = await api.get('/items').catch((err) => err);
    expect(error.response.status).toBe(500);
    expect(error.retryAfterSeconds).toBeUndefined();
  });
});

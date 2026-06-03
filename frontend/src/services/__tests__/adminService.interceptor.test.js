import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { adminApi, getFeedback, login, logout } from '../adminService.js';

const listeners = {};

Object.defineProperty(globalThis, 'window', {
  value: {
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

const sessionStorageMock = (() => {
  const store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
  };
})();

Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, writable: true });

describe('adminService interceptor global error behavior', () => {
  let mockAdminApi;

  beforeEach(async () => {
    Object.keys(listeners).forEach((k) => delete listeners[k]);
    sessionStorage.clear();
    mockAdminApi = new MockAdapter(adminApi, { onNoMatch: 'passthrough' });
    mockAdminApi.onPost('/admin/login').reply(200, { success: true, token: 'valid-admin-token' });
    await login('admin', 'password');
  });

  afterEach(async () => {
    await logout();
    mockAdminApi?.restore();
    vi.restoreAllMocks();
  });

  it('emits api:error and legacy api:server-error for 5xx', async () => {
    const onApiError = vi.fn();
    const onLegacy = vi.fn();
    window.addEventListener('api:error', onApiError);
    window.addEventListener('api:server-error', onLegacy);
    mockAdminApi.onGet('/admin/feedback').reply(500, { message: 'Admin server exploded' });

    await expect(getFeedback()).rejects.toBeTruthy();

    expect(onApiError).toHaveBeenCalledTimes(1);
    expect(onApiError.mock.calls[0][0].detail).toMatchObject({
      kind: 'server',
      source: 'admin-api',
      status: 500,
      message: 'Admin server exploded',
      url: '/admin/feedback',
      method: 'GET'
    });
    expect(onApiError.mock.calls[0][0].detail.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    );
    expect(onLegacy).toHaveBeenCalledTimes(1);
  });

  it('emits network kind on no-response errors', async () => {
    const onApiError = vi.fn();
    const onLegacy = vi.fn();
    window.addEventListener('api:error', onApiError);
    window.addEventListener('api:server-error', onLegacy);
    mockAdminApi.onGet('/admin/feedback').networkError();

    await expect(getFeedback()).rejects.toBeTruthy();

    expect(onApiError).toHaveBeenCalledTimes(1);
    expect(onApiError.mock.calls[0][0].detail.kind).toBe('network');
    expect(onLegacy).not.toHaveBeenCalled();
  });

  it('respects skipGlobalErrorToast flag on direct adminApi calls', async () => {
    const onApiError = vi.fn();
    window.addEventListener('api:error', onApiError);
    mockAdminApi.onGet('/skip-global').reply(500, { message: 'Skip' });

    await expect(adminApi.get('/skip-global', { skipGlobalErrorToast: true })).rejects.toBeTruthy();
    expect(onApiError).not.toHaveBeenCalled();
  });

  it('does not emit api:error for 4xx errors', async () => {
    const onApiError = vi.fn();
    const onLegacy = vi.fn();
    window.addEventListener('api:error', onApiError);
    window.addEventListener('api:server-error', onLegacy);
    mockAdminApi.onGet('/admin/feedback').reply(403, { message: 'Forbidden' });

    await expect(getFeedback()).rejects.toBeTruthy();
    expect(onApiError).not.toHaveBeenCalled();
    expect(onLegacy).not.toHaveBeenCalled();
  });
});

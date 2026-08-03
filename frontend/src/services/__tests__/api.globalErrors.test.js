import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';

const listeners = {};

const localStorageMock = (() => {
  const store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

Object.defineProperty(globalThis, 'window', {
  value: {
    location: { href: '', pathname: '', search: '' },
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
  const mod = await import('../api.js');
  return mod.default;
}

describe('api.js global error events', () => {
  let api;
  let mockApi;

  beforeEach(async () => {
    Object.keys(listeners).forEach((k) => delete listeners[k]);
    localStorage.clear();
    window.location.href = '';
    window.location.pathname = '';
    window.location.search = '';
    api = await freshApi();
    mockApi = new MockAdapter(api, { onNoMatch: 'passthrough' });
  });

  afterEach(() => {
    mockApi?.restore();
    vi.restoreAllMocks();
  });

  it('emits api:error and legacy api:server-error for 5xx', async () => {
    const onApiError = vi.fn();
    const onLegacy = vi.fn();
    window.addEventListener('api:error', onApiError);
    window.addEventListener('api:server-error', onLegacy);
    mockApi.onGet('/boom').reply(500, { message: 'Server exploded' });

    await expect(api.get('/boom')).rejects.toBeTruthy();

    expect(onApiError).toHaveBeenCalledTimes(1);
    expect(onApiError.mock.calls[0][0].detail).toMatchObject({
      kind: 'server',
      status: 500,
      source: 'tenant-api',
      message: 'Server exploded',
      url: '/boom',
      method: 'GET'
    });
    expect(onApiError.mock.calls[0][0].detail.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    );
    expect(onLegacy).toHaveBeenCalledTimes(1);
  });

  it('emits api:error only for network/no-response errors', async () => {
    const onApiError = vi.fn();
    const onLegacy = vi.fn();
    window.addEventListener('api:error', onApiError);
    window.addEventListener('api:server-error', onLegacy);
    mockApi.onGet('/offline').networkError();

    await expect(api.get('/offline')).rejects.toBeTruthy();

    expect(onApiError).toHaveBeenCalledTimes(1);
    expect(onApiError.mock.calls[0][0].detail.kind).toBe('network');
    expect(onLegacy).not.toHaveBeenCalled();
  });

  it('does not emit api:error for a canceled request', async () => {
    // Regression guard for EmployeeCreditReportPanel.jsx, which aborts its
    // in-flight report request on every dateFrom/dateTo/refreshKey change --
    // before the cancel guard, a CanceledError has no response but DOES
    // carry error.request, so errorHandler.js's `isNetwork` check classified
    // it as a network failure and fired this exact toast on every keystroke.
    const onApiError = vi.fn();
    window.addEventListener('api:error', onApiError);
    const controller = new AbortController();
    mockApi.onGet('/reports/employee-credit').reply(() => new Promise((resolve) => {
      setTimeout(() => resolve([200, { data: {} }]), 50);
    }));

    const pending = api.get('/reports/employee-credit', { signal: controller.signal }).catch((err) => err);
    controller.abort();
    await pending;

    expect(onApiError).not.toHaveBeenCalled();
  });

  it('respects skipGlobalErrorToast request flag', async () => {
    const onApiError = vi.fn();
    window.addEventListener('api:error', onApiError);
    mockApi.onGet('/skip').reply(500, { message: 'Skip me' });

    await expect(api.get('/skip', { skipGlobalErrorToast: true })).rejects.toBeTruthy();
    expect(onApiError).not.toHaveBeenCalled();
  });

  it('still emits suppressed tenant capability status events for skipped requests', async () => {
    const onApiError = vi.fn();
    const onCapabilityBlocked = vi.fn();
    window.addEventListener('api:error', onApiError);
    window.addEventListener('tenant:capability-blocked', onCapabilityBlocked);
    mockApi.onGet('/pos/orders/incoming').reply(403, {
      error_code: 'TENANT_CAPABILITY_DISABLED',
      capability: 'tenant_pos_enabled',
      message: 'POS is disabled for this tenant by platform admin.'
    });

    await expect(api.get('/pos/orders/incoming', { skipGlobalErrorToast: true })).rejects.toBeTruthy();

    expect(onApiError).not.toHaveBeenCalled();
    expect(onCapabilityBlocked).toHaveBeenCalledTimes(1);
    expect(onCapabilityBlocked.mock.calls[0][0].detail).toMatchObject({
      title: 'Platform admin changed your permissions',
      code: 'TENANT_CAPABILITY_DISABLED',
      capability: 'tenant_pos_enabled',
      suppressToast: true
    });
  });

  it('does not emit api:error for 4xx errors', async () => {
    const onApiError = vi.fn();
    const onLegacy = vi.fn();
    window.addEventListener('api:error', onApiError);
    window.addEventListener('api:server-error', onLegacy);
    mockApi.onGet('/missing').reply(404, { message: 'Not found' });

    await expect(api.get('/missing')).rejects.toBeTruthy();
    expect(onApiError).not.toHaveBeenCalled();
    expect(onLegacy).not.toHaveBeenCalled();
  });

  it('redirects legacy users to profile completion when the API requires a phone number', async () => {
    const onApiError = vi.fn();
    window.addEventListener('api:error', onApiError);
    mockApi.onGet('/dashboard/stats').reply(428, {
      success: false,
      error_code: 'PHONE_NUMBER_REQUIRED'
    });

    await expect(api.get('/dashboard/stats')).rejects.toBeTruthy();

    expect(window.location.href).toBe('/settings?tab=profile&reason=phone_required');
    expect(onApiError).not.toHaveBeenCalled();
  });

  it('does not redirect repeatedly while already on the profile completion route', async () => {
    window.location.pathname = '/settings';
    window.location.search = '?tab=profile';
    mockApi.onGet('/users/me').reply(428, {
      success: false,
      error_code: 'PHONE_NUMBER_REQUIRED'
    });

    await expect(api.get('/users/me')).rejects.toBeTruthy();

    expect(window.location.href).toBe('');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import useStore from '../../store/useStore.js';
import { registerClientCacheResetter } from '../cacheRegistry.js';
import { clearClientSession, getAuthEpoch } from '../sessionCleanup.js';

const storage = {};
const localStorageMock = {
  getItem: (key) => storage[key] ?? null,
  setItem: (key, value) => { storage[key] = String(value); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach((key) => delete storage[key]); }
};

const windowListeners = {};
const windowMock = {
  location: { href: '' },
  addEventListener: (type, fn) => {
    windowListeners[type] = windowListeners[type] || [];
    windowListeners[type].push(fn);
  },
  removeEventListener: (type, fn) => {
    if (windowListeners[type]) {
      windowListeners[type] = windowListeners[type].filter((handler) => handler !== fn);
    }
  },
  dispatchEvent: (event) => {
    (windowListeners[event.type] || []).forEach((handler) => handler(event));
  }
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true
});

Object.defineProperty(globalThis, 'window', {
  value: windowMock,
  writable: true
});

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
}

describe('sessionCleanup', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.getState().reset();
    window.location.href = '';
  });

  it('clears auth storage, resets store, clears registered caches, and bumps auth epoch', () => {
    localStorage.setItem('authToken', 'token-a');
    localStorage.setItem('refreshToken', 'refresh-a');
    localStorage.setItem('companyToken', 'company-a');
    localStorage.setItem('authEpoch', '4');

    useStore.getState().setItems([{ id: 1 }]);
    useStore.getState().setCurrentUser({ id: 9, name: 'Alice' });

    const cacheResetter = vi.fn();
    const unregister = registerClientCacheResetter('session-cleanup-test', cacheResetter);
    const logoutHandler = vi.fn();
    window.addEventListener('auth:logout', logoutHandler);

    clearClientSession({
      reason: 'manual_logout',
      broadcast: false,
      emitAuthEvents: true,
      redirectTo: null
    });

    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('companyToken')).toBeNull();
    expect(getAuthEpoch()).toBe(5);

    expect(useStore.getState().items).toEqual([]);
    expect(useStore.getState().currentUser).toBeNull();
    expect(cacheResetter).toHaveBeenCalledTimes(1);

    expect(logoutHandler).toHaveBeenCalledTimes(1);
    expect(logoutHandler.mock.calls[0][0].detail).toMatchObject({
      reason: 'manual_logout',
      broadcast: false
    });

    window.removeEventListener('auth:logout', logoutHandler);
    unregister();
  });

  it('skips auth event emission when emitAuthEvents=false', () => {
    localStorage.setItem('authToken', 'token-a');
    const logoutHandler = vi.fn();
    window.addEventListener('auth:logout', logoutHandler);

    clearClientSession({
      emitAuthEvents: false,
      redirectTo: null
    });

    expect(logoutHandler).not.toHaveBeenCalled();
    window.removeEventListener('auth:logout', logoutHandler);
  });

  it('redirects when redirectTo is provided', () => {
    clearClientSession({
      emitAuthEvents: false,
      redirectTo: '/login?reason=session_expired'
    });

    expect(window.location.href).toContain('/login?reason=session_expired');
  });
});

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const storage = {};
const localStorageMock = {
  getItem: (key) => storage[key] ?? null,
  setItem: (key, value) => { storage[key] = String(value); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach((key) => delete storage[key]); }
};

class BroadcastChannelMock {
  constructor() {
    this.onmessage = null;
  }

  postMessage() {}
  close() {}
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true
});

Object.defineProperty(globalThis, 'window', {
  value: {
    location: { href: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {}
  },
  writable: true
});

Object.defineProperty(globalThis, 'BroadcastChannel', {
  value: BroadcastChannelMock,
  writable: true
});

let buildItemsCacheScope;
let clearBrowserSession;
let setBrowserSession;

describe('useItems cache scope isolation', () => {
  beforeAll(async () => {
    ({ buildItemsCacheScope } = await import('../useItems.js'));
    ({ clearBrowserSession, setBrowserSession } = await import('../../services/browserSession.js'));
  });

  beforeEach(() => {
    localStorage.clear();
    clearBrowserSession();
  });

  it('changes cache scope when auth epoch changes', () => {
    const params = { limit: 1000, search: 'milk' };
    setBrowserSession({ companyToken: 'tenant-a' });
    localStorage.setItem('authEpoch', '1');
    const scopeA = buildItemsCacheScope(params);

    localStorage.setItem('authEpoch', '2');
    const scopeB = buildItemsCacheScope(params);

    expect(scopeA).not.toBe(scopeB);
  });

  it('changes cache scope when company token changes', () => {
    const params = { limit: 1000 };
    localStorage.setItem('authEpoch', '8');
    setBrowserSession({ companyToken: 'tenant-a' });
    const scopeA = buildItemsCacheScope(params);

    setBrowserSession({ companyToken: 'tenant-b' });
    const scopeB = buildItemsCacheScope(params);

    expect(scopeA).not.toBe(scopeB);
  });

  it('keeps cache scope stable for same session identity', () => {
    const params = { limit: 1000, category: 'raw_material' };
    localStorage.setItem('authEpoch', '3');
    setBrowserSession({ companyToken: 'tenant-a' });

    const scopeA = buildItemsCacheScope(params);
    const scopeB = buildItemsCacheScope(params);

    expect(scopeA).toBe(scopeB);
  });
});

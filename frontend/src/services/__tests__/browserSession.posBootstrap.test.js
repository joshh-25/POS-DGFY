import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const successfulRefreshResponse = () => ({
  ok: true,
  json: async () => ({
    data: {
      token: 'refreshed-access-token',
      company: { token: 'tenant-company-token' }
    }
  })
});

const createStorageMock = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => {
      values.set(String(key), String(value));
    },
    removeItem: (key) => {
      values.delete(String(key));
    },
    clear: () => {
      values.clear();
    }
  };
};

describe('standalone POS browser session bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_APP_SURFACE', 'pos');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulRefreshResponse()));
    const sessionStorage = createStorageMock();
    vi.stubGlobal('window', {
      sessionStorage,
      dispatchEvent: vi.fn()
    });
    globalThis.window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('does not consume an existing tenant cookie on a fresh POS page load without a persisted POS session', async () => {
    const session = await import('../browserSession.js');

    await expect(session.refreshBrowserSession()).resolves.toBe('');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(session.getAccessToken()).toBe('');
    expect(session.canRefreshBrowserSession()).toBe(false);
  });

  it('allows cookie refresh after an explicit POS login establishes the page session', async () => {
    const session = await import('../browserSession.js');
    session.setBrowserSession({
      token: 'explicit-pos-login-token',
      companyToken: 'tenant-company-token'
    });

    expect(session.canRefreshBrowserSession()).toBe(true);
    await expect(session.refreshBrowserSession()).resolves.toBe('refreshed-access-token');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(session.getAccessToken()).toBe('refreshed-access-token');
  });

  it('restores the standalone POS session after a page reload', async () => {
    const firstSession = await import('../browserSession.js');
    firstSession.setBrowserSession({
      token: 'explicit-pos-login-token',
      companyToken: 'tenant-company-token'
    });

    vi.resetModules();
    vi.stubEnv('VITE_APP_SURFACE', 'pos');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulRefreshResponse()));

    const reloadedSession = await import('../browserSession.js');
    expect(reloadedSession.getAccessToken()).toBe('explicit-pos-login-token');
    expect(reloadedSession.getCompanyToken()).toBe('tenant-company-token');
    expect(reloadedSession.canRefreshBrowserSession()).toBe(true);
  });

  it('allows one cookie-backed POS restore after a successful company switch handoff', async () => {
    globalThis.window.sessionStorage.setItem('pos_company_switch_handoff_v1', JSON.stringify({
      tenantId: 'tenant-switched',
      createdAt: Date.now()
    }));

    const session = await import('../browserSession.js');

    expect(session.canRefreshBrowserSession()).toBe(true);
    await expect(session.refreshBrowserSession()).resolves.toBe('refreshed-access-token');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.window.sessionStorage.getItem('pos_company_switch_handoff_v1')).toBeNull();
  });

  it('requires explicit login again after the POS session is cleared', async () => {
    const session = await import('../browserSession.js');
    session.setBrowserSession({ token: 'explicit-pos-login-token' });
    session.clearBrowserSession();

    expect(session.canRefreshBrowserSession()).toBe(false);
    expect(globalThis.window.sessionStorage.getItem('pos_browser_session_v1')).toBeNull();
    await expect(session.refreshBrowserSession()).resolves.toBe('');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

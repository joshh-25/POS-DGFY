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
    expect(reloadedSession.getAccessToken()).toBe('');
    expect(reloadedSession.getCompanyToken()).toBe('');
    expect(reloadedSession.canRefreshBrowserSession()).toBe(true);
    await expect(reloadedSession.refreshBrowserSession()).resolves.toBe('refreshed-access-token');
    expect(reloadedSession.getAccessToken()).toBe('refreshed-access-token');
    expect(reloadedSession.getCompanyToken()).toBe('tenant-company-token');
  });

  it('persists only a non-sensitive active marker for standalone POS reload', async () => {
    const session = await import('../browserSession.js');
    session.setBrowserSession({
      token: 'must-not-be-persisted',
      companyToken: 'must-not-be-persisted-either'
    });

    const stored = globalThis.window.sessionStorage.getItem('pos_browser_session_v1');
    expect(JSON.parse(stored)).toEqual({ active: true });
    expect(stored).not.toContain('must-not-be-persisted');
  });

  it('allows one cookie-backed POS restore after a successful company switch handoff', async () => {
    globalThis.window.sessionStorage.setItem('pos_company_switch_handoff_v1', JSON.stringify({
      tenantId: 'tenant-switched',
      createdAt: Date.now()
    }));

    const session = await import('../browserSession.js');

    expect(session.canRefreshBrowserSession()).toBe(true);
    expect(session.getFreshPosCompanySwitchHandoff()).toEqual({ tenantId: 'tenant-switched' });
    await expect(session.refreshBrowserSession()).resolves.toBe('refreshed-access-token');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.window.sessionStorage.getItem('pos_company_switch_handoff_v1')).toBeNull();
  });

  it('creates and consumes a short-lived, credential-free DGFY Business handoff for a selected POS company', async () => {
    const session = await import('../browserSession.js');
    session.setBrowserSession({
      token: 'dgfy-tenant-access-token',
      companyToken: 'dgfy-tenant-company-token'
    });

    session.preparePosDgfyTenantHandoff({ tenantId: 'tenant-from-business' });

    const stored = globalThis.window.sessionStorage.getItem('pos_dgfy_tenant_handoff_v1');
    expect(JSON.parse(stored)).toMatchObject({ tenantId: 'tenant-from-business' });
    expect(stored).not.toContain('dgfy-tenant-access-token');
    expect(stored).not.toContain('dgfy-tenant-company-token');
    expect(session.consumePosDgfyTenantHandoff()).toEqual({ tenantId: 'tenant-from-business' });
    expect(globalThis.window.sessionStorage.getItem('pos_dgfy_tenant_handoff_v1')).toBeNull();
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

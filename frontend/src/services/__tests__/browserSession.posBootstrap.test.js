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

describe('standalone POS browser session bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_APP_SURFACE', 'pos');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulRefreshResponse()));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('does not consume an existing tenant cookie on a fresh POS page load', async () => {
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

  it('requires explicit login again after the POS session is cleared', async () => {
    const session = await import('../browserSession.js');
    session.setBrowserSession({ token: 'explicit-pos-login-token' });
    session.clearBrowserSession();

    expect(session.canRefreshBrowserSession()).toBe(false);
    await expect(session.refreshBrowserSession()).resolves.toBe('');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

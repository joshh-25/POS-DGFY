// @vitest-environment jsdom

import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('OPIS tenant-context mismatch recovery', () => {
  let api;
  let apiMock;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_APP_SURFACE', 'opis');
    window.history.replaceState({}, '', '/');
    localStorage.clear();
    document.cookie = 'opis_csrf_token=csrf-opis; path=/';
    vi.stubGlobal('fetch', vi.fn());

    ({ default: api } = await import('../api.js'));
    apiMock = new MockAdapter(api);
  });

  afterEach(() => {
    apiMock?.restore();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('rehydrates OPIS from the cookie-backed session before retrying a safe read', async () => {
    const session = await import('../browserSession.js');
    session.setBrowserSession({
      token: 'stale-opis-token',
      companyToken: 'stale-opis-company'
    });

    const refreshRequests = [];
    globalThis.fetch.mockImplementation(async (url, options) => {
      if (String(url).includes('/auth/refresh-token')) {
        refreshRequests.push(options);
        return {
          ok: true,
          json: async () => ({
            data: {
              token: 'fresh-opis-token',
              company: { token: 'cookie-opis-company' }
            }
          })
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const retryHeaders = [];
    apiMock.onGet('/users/me').replyOnce(409, {
      success: false,
      message: 'The active company changed. Refresh the POS and retry.',
      error_code: 'TENANT_SESSION_CONTEXT_MISMATCH'
    });
    apiMock.onGet('/users/me').reply((config) => {
      retryHeaders.push({ ...config.headers });
      return [200, { data: { user_id: 7, role: 'admin' } }];
    });

    const response = await api.get('/users/me');

    expect(response.data.data).toEqual({ user_id: 7, role: 'admin' });
    expect(refreshRequests).toHaveLength(1);
    expect(refreshRequests[0].headers.Authorization).toBeUndefined();
    expect(refreshRequests[0].headers['x-company-token']).toBeUndefined();
    expect(refreshRequests[0].headers['x-dgfy-app-surface']).toBe('opis');
    expect(retryHeaders).toHaveLength(1);
    expect(retryHeaders[0].Authorization).toBe('Bearer fresh-opis-token');
    expect(retryHeaders[0]['x-company-token']).toBe('cookie-opis-company');
    expect(session.getAccessToken()).toBe('fresh-opis-token');
    expect(session.getCompanyToken()).toBe('cookie-opis-company');
  });

  it('does not replay unsafe mutations after a tenant-context mismatch', async () => {
    const session = await import('../browserSession.js');
    session.setBrowserSession({
      token: 'stale-opis-token',
      companyToken: 'stale-opis-company'
    });

    apiMock.onPost('/business-admin/customers').reply(409, {
      success: false,
      message: 'The active company changed. Refresh the POS and retry.',
      error_code: 'TENANT_SESSION_CONTEXT_MISMATCH'
    });

    const error = await api.post('/business-admin/customers', { name: 'Example' })
      .catch((requestError) => requestError);

    expect(error.response?.status).toBe(409);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(session.getAccessToken()).toBe('stale-opis-token');
    expect(session.getCompanyToken()).toBe('stale-opis-company');
  });
});

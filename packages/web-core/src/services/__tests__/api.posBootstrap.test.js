// @vitest-environment jsdom

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('standalone POS API session bootstrap', () => {
  let apiMock;
  let axiosMock;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_APP_SURFACE', 'pos');
    window.sessionStorage.clear();
    document.cookie = 'sku_csrf_token=csrf-pos-session';

    const { default: api } = await import('../api.js');
    apiMock = new MockAdapter(api);
    axiosMock = new MockAdapter(axios);
  });

  afterEach(() => {
    apiMock?.restore();
    axiosMock?.restore();
    vi.unstubAllEnvs();
  });

  it('sends browser credentials with POS API requests so pairing cookies are retained', async () => {
    const { default: api } = await import('../api.js');

    expect(api.defaults.withCredentials).toBe(true);
  });

  it('does not exchange an existing cookie after an anonymous POS request returns 401', async () => {
    let refreshCallCount = 0;
    apiMock.onGet('/pos/catalog').reply(401, {
      success: false,
      message: 'Authentication required'
    });
    axiosMock.onPost(/auth\/refresh-token/).reply(() => {
      refreshCallCount += 1;
      return [200, { data: { token: 'unexpected-token' } }];
    });

    const { default: api } = await import('../api.js');
    const error = await api.get('/pos/catalog').catch((requestError) => requestError);

    expect(error.response?.status).toBe(401);
    expect(refreshCallCount).toBe(0);
  });

  it('refreshes an established POS session on the first 401 and retries once with the new token', async () => {
    const { default: api } = await import('../api.js');
    const session = await import('../browserSession.js');
    session.setBrowserSession({
      token: 'expired-pos-token',
      companyToken: 'masu-company-token'
    });

    const retryHeaders = [];
    apiMock.onGet('/users/me').replyOnce(401, {
      success: false,
      message: 'Token expired'
    });
    apiMock.onGet('/users/me').reply((config) => {
      retryHeaders.push({ ...config.headers });
      return [200, { data: { user_id: 6, role: 'cashier' } }];
    });
    axiosMock.onPost(/auth\/refresh-token/).reply(200, {
      data: {
        token: 'refreshed-pos-token',
        company: { token: 'masu-company-token' }
      }
    });

    const response = await api.get('/users/me');

    expect(response.data.data).toEqual({ user_id: 6, role: 'cashier' });
    expect(retryHeaders).toHaveLength(1);
    expect(retryHeaders[0].Authorization).toBe('Bearer refreshed-pos-token');
    expect(retryHeaders[0]['x-company-token']).toBe('masu-company-token');
    expect(session.getAccessToken()).toBe('refreshed-pos-token');
  });

  it('clears an established POS session when refresh fails', async () => {
    const { default: api } = await import('../api.js');
    const session = await import('../browserSession.js');
    session.setBrowserSession({
      token: 'expired-pos-token',
      companyToken: 'masu-company-token'
    });

    apiMock.onGet('/users/me').reply(401, {
      success: false,
      message: 'Token expired'
    });
    axiosMock.onPost(/auth\/refresh-token/).reply(401, {
      success: false,
      message: 'Refresh token expired'
    });

    const error = await api.get('/users/me').catch((requestError) => requestError);

    expect(error.response?.status).toBe(401);
    expect(session.getAccessToken()).toBe('');
    expect(session.getCompanyToken()).toBe('');
    expect(window.sessionStorage.getItem('pos_browser_session_v1')).toBeNull();
  });

  it('preserves an explicitly supplied candidate tenant session on its verification request', async () => {
    const { default: api } = await import('../api.js');
    const session = await import('../browserSession.js');
    session.setBrowserSession({
      token: 'currently-active-token',
      companyToken: 'currently-active-company'
    });

    let requestHeaders;
    apiMock.onGet('/users/me').reply((config) => {
      requestHeaders = { ...config.headers };
      return [200, { data: { user_id: 7, role: 'admin' } }];
    });

    await api.get('/users/me', {
      skipAuthRefresh: true,
      headers: {
        Authorization: 'Bearer candidate-tenant-token',
        'x-company-token': 'candidate-company-token'
      }
    });

    expect(requestHeaders.Authorization).toBe('Bearer candidate-tenant-token');
    expect(requestHeaders['x-company-token']).toBe('candidate-company-token');
    expect(session.getAccessToken()).toBe('currently-active-token');
    expect(session.getCompanyToken()).toBe('currently-active-company');
  });

  it('retries a stale 401 with the newer tenant session without refreshing or clearing it', async () => {
    const { default: api } = await import('../api.js');
    const session = await import('../browserSession.js');
    session.setBrowserSession({
      token: 'old-tenant-token',
      companyToken: 'old-company-token'
    });

    let releaseOldRequest;
    let refreshCallCount = 0;
    const retryHeaders = [];
    apiMock.onGet('/users/me').replyOnce(() => new Promise((resolve) => {
      releaseOldRequest = resolve;
    }));
    apiMock.onGet('/users/me').reply((config) => {
      retryHeaders.push({ ...config.headers });
      return [200, { data: { user_id: 6, role: 'cashier' } }];
    });
    axiosMock.onPost(/auth\/refresh-token/).reply(() => {
      refreshCallCount += 1;
      return [200, { data: { token: 'unexpected-refresh-token' } }];
    });

    const pendingRequest = api.get('/users/me');
    await vi.waitFor(() => expect(releaseOldRequest).toBeTypeOf('function'));
    session.setBrowserSession({
      token: 'new-tenant-token',
      companyToken: 'new-company-token'
    });
    releaseOldRequest([401, {
      success: false,
      message: 'Token expired'
    }]);

    const response = await pendingRequest;

    expect(response.data.data).toEqual({ user_id: 6, role: 'cashier' });
    expect(refreshCallCount).toBe(0);
    expect(retryHeaders).toHaveLength(1);
    expect(retryHeaders[0].Authorization).toBe('Bearer new-tenant-token');
    expect(retryHeaders[0]['x-company-token']).toBe('new-company-token');
    expect(session.getAccessToken()).toBe('new-tenant-token');
    expect(session.getCompanyToken()).toBe('new-company-token');
  });

  it('does not clear a newer session when an older in-flight refresh fails', async () => {
    const { default: api } = await import('../api.js');
    const session = await import('../browserSession.js');
    session.setBrowserSession({
      token: 'expired-old-token',
      companyToken: 'old-company-token'
    });

    let releaseRefresh;
    const retryHeaders = [];
    apiMock.onGet('/users/me').replyOnce(401, {
      success: false,
      message: 'Token expired'
    });
    apiMock.onGet('/users/me').reply((config) => {
      retryHeaders.push({ ...config.headers });
      return [200, { data: { user_id: 8, role: 'admin' } }];
    });
    axiosMock.onPost(/auth\/refresh-token/).reply(() => new Promise((resolve) => {
      releaseRefresh = resolve;
    }));

    const pendingRequest = api.get('/users/me');
    await vi.waitFor(() => expect(releaseRefresh).toBeTypeOf('function'));
    session.setBrowserSession({
      token: 'new-session-token',
      companyToken: 'new-session-company'
    });
    releaseRefresh([401, {
      success: false,
      message: 'Old refresh token expired'
    }]);

    const response = await pendingRequest;

    expect(response.data.data).toEqual({ user_id: 8, role: 'admin' });
    expect(retryHeaders).toHaveLength(1);
    expect(retryHeaders[0].Authorization).toBe('Bearer new-session-token');
    expect(retryHeaders[0]['x-company-token']).toBe('new-session-company');
    expect(session.getAccessToken()).toBe('new-session-token');
    expect(session.getCompanyToken()).toBe('new-session-company');
    expect(window.sessionStorage.getItem('pos_browser_session_v1')).toBe(JSON.stringify({ active: true }));
  });
});

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
});

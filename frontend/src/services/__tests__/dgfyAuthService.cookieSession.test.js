import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet, apiPost, setBrowserSessionMock, clearClientSessionMock } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  setBrowserSessionMock: vi.fn(),
  clearClientSessionMock: vi.fn()
}));

const dgfyCookieConfig = {
  skipAuthRefresh: true,
  skipTenantAuthHeaders: true,
  withCredentials: true
};
const dgfyBusinessBridgeConfig = {
  withCredentials: true
};

vi.mock('../api.js', () => ({
  default: {
    get: apiGet,
    post: apiPost
  }
}));

vi.mock('../browserSession.js', () => ({
  setBrowserSession: setBrowserSessionMock
}));

vi.mock('../sessionCleanup.js', () => ({
  clearClientSession: clearClientSessionMock
}));

describe('dgfyAuthService cookie session rehydration', () => {
  beforeEach(async () => {
    apiGet.mockReset();
    apiPost.mockReset();
    setBrowserSessionMock.mockReset();
    clearClientSessionMock.mockReset();
    const service = await import('../dgfyAuthService.js');
    service.clearDgfySession();
  });

  it('calls /dgfy/auth/me without a bearer header when only the HttpOnly cookie can identify the browser session', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        data: {
          account: {
            id: 'acct-cookie',
            email: 'customer@example.test'
          }
        }
      }
    });

    const service = await import('../dgfyAuthService.js');
    const result = await service.fetchDgfyMe('');

    expect(apiGet).toHaveBeenCalledWith('/dgfy/auth/me', dgfyCookieConfig);
    expect(result.account.email).toBe('customer@example.test');
    expect(service.getStoredDgfyToken()).toBe('');
    expect(service.getStoredDgfyAccount().id).toBe('acct-cookie');
  });

  it('keeps bearer header support for in-memory DGFY access tokens', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        data: {
          account: {
            id: 'acct-token',
            email: 'token@example.test'
          }
        }
      }
    });

    const service = await import('../dgfyAuthService.js');
    await service.fetchDgfyMe('dgfy-access-token');

    expect(apiGet).toHaveBeenCalledWith('/dgfy/auth/me', {
      headers: {
        Authorization: 'Bearer dgfy-access-token'
      },
      ...dgfyCookieConfig
    });
    expect(service.getStoredDgfyToken()).toBe('dgfy-access-token');
  });

  it('starts tenant sessions with cookie credentials when no DGFY bearer token is in memory', async () => {
    apiPost.mockResolvedValueOnce({
      data: {
        data: {
          token: 'tenant-token',
          company: {
            token: 'token-cookie-company'
          }
        }
      }
    });

    const service = await import('../dgfyAuthService.js');
    await service.startDgfyTenantSession({
      tenantId: 'tenant-cookie',
      companyToken: 'token-cookie-company'
    }, '');

    expect(apiPost).toHaveBeenCalledWith('/dgfy/auth/tenant-session', {
      tenant_id: 'tenant-cookie',
      company_token: 'token-cookie-company'
    }, dgfyCookieConfig);
    expect(setBrowserSessionMock).toHaveBeenCalledWith({
      token: 'tenant-token',
      companyToken: 'token-cookie-company'
    });
  });

  it('logs out DGFY cookie sessions when no bearer token is in memory', async () => {
    apiPost.mockResolvedValueOnce({ data: { data: {} } });

    const service = await import('../dgfyAuthService.js');
    await service.logoutDgfyAccount('');

    expect(apiPost).toHaveBeenCalledWith('/dgfy/auth/logout', {}, dgfyCookieConfig);
  });

  it('lists switchable DGFY companies through the DGFY cookie when no bearer token is in memory', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        data: {
          companies: [],
          business_step_up: { verified: false }
        }
      }
    });

    const service = await import('../dgfyAuthService.js');
    const result = await service.listDgfyAccountCompanies('');

    expect(apiGet).toHaveBeenCalledWith('/dgfy/account/companies', dgfyCookieConfig);
    expect(result.business_step_up.verified).toBe(false);
  });

  it('falls back to the tenant auth bridge when no DGFY cookie session is available', async () => {
    apiGet
      .mockRejectedValueOnce({
        response: {
          status: 401,
          data: {
            message: 'DGFY account authentication is required.'
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            companies: [],
            business_step_up: { verified: false }
          }
        }
      });

    const service = await import('../dgfyAuthService.js');
    const result = await service.listDgfyAccountCompanies('');

    expect(apiGet).toHaveBeenNthCalledWith(1, '/dgfy/account/companies', dgfyCookieConfig);
    expect(apiGet).toHaveBeenNthCalledWith(2, '/dgfy/account/companies', dgfyBusinessBridgeConfig);
    expect(result.business_step_up.verified).toBe(false);
  });

  it('keeps DGFY bearer isolation for company switching endpoints when a token is provided', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        data: {
          companies: [],
          business_step_up: { verified: false }
        }
      }
    });

    const service = await import('../dgfyAuthService.js');
    await service.listDgfyAccountCompanies('dgfy-access-token');

    expect(apiGet).toHaveBeenCalledWith('/dgfy/account/companies', {
      headers: {
        Authorization: 'Bearer dgfy-access-token'
      },
      ...dgfyCookieConfig
    });
  });

  it('clears stale DGFY business tokens and retries switcher loading through the tenant auth bridge', async () => {
    apiGet
      .mockRejectedValueOnce({
        response: {
          status: 401,
          data: {
            message: 'Invalid DGFY account token.'
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            companies: [{
              tenant_id: 'tenant-1',
              company_name: 'Kate Store',
              can_switch: true
            }],
            business_step_up: { verified: true }
          }
        }
      });

    const service = await import('../dgfyAuthService.js');
    service.storeDgfySession({
      token: 'stale-dgfy-token',
      account: { id: 'acct-stale' }
    });
    const result = await service.listDgfyAccountCompanies();

    expect(apiGet).toHaveBeenNthCalledWith(1, '/dgfy/account/companies', {
      headers: {
        Authorization: 'Bearer stale-dgfy-token'
      },
      ...dgfyCookieConfig
    });
    expect(apiGet).toHaveBeenNthCalledWith(2, '/dgfy/account/companies', dgfyBusinessBridgeConfig);
    expect(service.getStoredDgfyToken()).toBe('');
    expect(service.getStoredDgfyAccount()).toBe(null);
    expect(result.companies[0].company_name).toBe('Kate Store');
  });

  it('uses the DGFY cookie before the tenant membership bridge so accepted companies remain visible from IMS', async () => {
    apiGet
      .mockResolvedValueOnce({
        data: {
          data: {
            companies: [{
              tenant_id: 'tenant-accepted',
              company_name: 'Accepted Cafe',
              can_switch: true
            }],
            business_step_up: { verified: true }
          }
        }
      });

    const service = await import('../dgfyAuthService.js');
    const result = await service.listDgfyAccountCompanies('');

    expect(apiGet).toHaveBeenCalledWith('/dgfy/account/companies', dgfyCookieConfig);
    expect(result.companies[0].company_name).toBe('Accepted Cafe');
  });

  it('keeps the IMS not-linked error when DGFY cookie is missing and the tenant bridge is not linked', async () => {
    const tenantBridgeError = {
      response: {
        status: 401,
        data: {
          message: 'This IMS user is not linked to a DGFY account membership. Sign in with DGFY or accept an invitation first.'
        }
      }
    };
    apiGet
      .mockRejectedValueOnce({
        response: {
          status: 401,
          data: {
            message: 'DGFY account authentication is required.'
          }
        }
      })
      .mockRejectedValueOnce(tenantBridgeError);

    const service = await import('../dgfyAuthService.js');

    await expect(service.listDgfyAccountCompanies('')).rejects.toBe(tenantBridgeError);
    expect(apiGet).toHaveBeenNthCalledWith(1, '/dgfy/account/companies', dgfyCookieConfig);
    expect(apiGet).toHaveBeenNthCalledWith(2, '/dgfy/account/companies', dgfyBusinessBridgeConfig);
  });

  it('switches DGFY companies with cookie credentials and resets tenant client state', async () => {
    apiPost.mockResolvedValueOnce({
      data: {
        data: {
          token: 'tenant-token',
          company: {
            id: 'tenant-1',
            name: 'Switch Foods',
            token: 'token-switch-company'
          }
        }
      }
    });

    const service = await import('../dgfyAuthService.js');
    await service.switchDgfyCompany({
      tenantId: 'tenant-1',
      emailOtpCode: '123456'
    }, '');

    expect(apiPost).toHaveBeenCalledWith('/dgfy/account/companies/tenant-1/switch', {
      email_otp_code: '123456'
    }, dgfyCookieConfig);
    expect(clearClientSessionMock).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'company_switch',
      broadcast: false,
      redirectTo: null
    }));
    expect(setBrowserSessionMock).toHaveBeenCalledWith({
      token: 'tenant-token',
      companyToken: 'token-switch-company'
    });
  });
});

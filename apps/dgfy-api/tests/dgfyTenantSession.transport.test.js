import { jest } from '@jest/globals';

const mockStartDgfyTenantSessionUseCase = jest.fn();
const mockLoginDgfyAccountUseCase = jest.fn();
const mockSwitchDgfyCompanyUseCase = jest.fn();
const mockRecordDgfyCompanySwitchOutcomeUseCase = jest.fn();
const mockBlacklistToken = jest.fn();

jest.unstable_mockModule('../src/modules/dgfy/index.js', () => ({
  acceptDgfyInvitationUseCase: jest.fn(),
  changeDgfyPasswordUseCase: jest.fn(),
  configureDgfyCompanyDayClosePinUseCase: jest.fn(),
  completeDgfyPasswordResetUseCase: jest.fn(),
  createDgfyHandoffUseCase: jest.fn(),
  createDgfyInvitationUseCase: jest.fn(),
  exchangeDgfyHandoffUseCase: jest.fn(),
  getDgfyLegalTermsUseCase: jest.fn(),
  leaveDgfyCompanyUseCase: jest.fn(),
  listDgfyAccountCompaniesUseCase: jest.fn(),
  preflightDgfyAccountRegistrationUseCase: jest.fn(),
  registerDgfyAccountUseCase: jest.fn(),
  loginDgfyAccountUseCase: mockLoginDgfyAccountUseCase,
  getDgfyMeUseCase: jest.fn(),
  rejectDgfyInvitationUseCase: jest.fn(),
  recordDgfyCompanySwitchOutcomeUseCase: mockRecordDgfyCompanySwitchOutcomeUseCase,
  requestDgfyBusinessStepUpUseCase: jest.fn(),
  requestDgfyPasswordResetUseCase: jest.fn(),
  requestDgfyEmailVerificationUseCase: jest.fn(),
  searchDgfyBusinessAccountsUseCase: jest.fn(),
  startDgfyPosSessionUseCase: jest.fn(),
  startDgfyTenantSessionUseCase: mockStartDgfyTenantSessionUseCase,
  switchDgfyCompanyUseCase: mockSwitchDgfyCompanyUseCase,
  transferDgfyCompanyOwnershipUseCase: jest.fn(),
  updateDgfyProfileUseCase: jest.fn(),
  verifyDgfyEmailUseCase: jest.fn()
}));

jest.unstable_mockModule('../src/services/authService.js', () => ({
  blacklistToken: mockBlacklistToken,
  isTokenBlacklisted: jest.fn().mockResolvedValue(false),
  verifyToken: jest.fn()
}));

let loginDgfyAccount;
let startDgfyTenantSession;
let switchDgfyCompany;

beforeAll(async () => {
  ({
    loginDgfyAccount,
    startDgfyTenantSession,
    switchDgfyCompany
  } = await import('../src/modules/dgfy/controllers/dgfyAuthHandlers.js'));
});

const createRes = () => {
  const headers = new Map();
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    getHeader: jest.fn((name) => headers.get(String(name).toLowerCase())),
    setHeader: jest.fn((name, value) => {
      headers.set(String(name).toLowerCase(), value);
    })
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('dgfy tenant-session transport contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets normal tenant session cookies and strips refresh token from JSON', async () => {
    mockStartDgfyTenantSessionUseCase.mockResolvedValue({
      success: true,
      data: {
        payload: {
          success: true,
          data: {
            user_id: 10,
            email: 'founder@example.test',
            token: 'tenant-access-token',
            refreshToken: 'tenant-refresh-token',
            expiresIn: 86400,
            company: {
              id: 44,
              name: 'Auto Foods',
              token: 'company-token-44'
            },
            onboarding: { tenant_onboarding_state: 'not_started' }
          },
          message: 'SKUpervisor session started.'
        }
      }
    });

    const req = {
      dgfyAccount: { id: 'dgfy-account-1', email: 'founder@example.test' },
      body: { tenant_id: 44, company_token: 'company-token-44' }
    };
    const res = createRes();

    await startDgfyTenantSession(req, res);

    expect(mockStartDgfyTenantSessionUseCase).toHaveBeenCalledWith({
      account: req.dgfyAccount,
      body: req.body
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        user_id: 10,
        email: 'founder@example.test',
        token: 'tenant-access-token',
        expiresIn: 86400,
        company: {
          id: 44,
          name: 'Auto Foods',
          token: 'company-token-44'
        },
        onboarding: { tenant_onboarding_state: 'not_started' }
      },
      message: 'SKUpervisor session started.'
    });

    const cookies = res.setHeader.mock.calls
      .filter(([name]) => String(name).toLowerCase() === 'set-cookie')
      .at(-1)?.[1] || [];
    expect(cookies.join(';')).toContain('sku_refresh_token=tenant-refresh-token');
    expect(cookies.join(';')).toContain('sku_tenant_context=company-token-44');
    expect(cookies.join(';')).toContain('sku_csrf_token=');
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('refreshToken');
  });

  it('keeps the refresh token in the JSON body for a mobile client (no cookie jar to rely on)', async () => {
    mockStartDgfyTenantSessionUseCase.mockResolvedValue({
      success: true,
      data: {
        payload: {
          success: true,
          data: {
            user_id: 10,
            email: 'founder@example.test',
            token: 'tenant-access-token',
            refreshToken: 'tenant-refresh-token',
            expiresIn: 86400,
            company: {
              id: 44,
              name: 'Auto Foods',
              token: 'company-token-44'
            },
            onboarding: { tenant_onboarding_state: 'not_started' }
          },
          message: 'SKUpervisor session started.'
        }
      }
    });

    const req = {
      dgfyAccount: { id: 'dgfy-account-1', email: 'founder@example.test' },
      body: { tenant_id: 44, company_token: 'company-token-44' },
      headers: { 'x-client-platform': 'mobile' }
    };
    const res = createRes();

    await startDgfyTenantSession(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refreshToken: 'tenant-refresh-token' })
      })
    );

    // The cookie is still set too - harmless for a client with no cookie
    // jar, and keeps a mixed browser/native WebView caller working either way.
    const cookies = res.setHeader.mock.calls
      .filter(([name]) => String(name).toLowerCase() === 'set-cookie')
      .at(-1)?.[1] || [];
    expect(cookies.join(';')).toContain('sku_refresh_token=tenant-refresh-token');
  });

  it('does not set tenant cookies when membership authorization fails', async () => {
    mockStartDgfyTenantSessionUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'AUTHORIZATION_FAILED',
        statusCode: 403,
        message: 'No active company membership is available for this DGFY account.'
      }
    });

    const req = {
      dgfyAccount: { id: 'dgfy-account-1' },
      body: { company_token: 'company-token-44' }
    };
    const res = createRes();

    await startDgfyTenantSession(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'No active company membership is available for this DGFY account.'
    });
    expect(res.setHeader).not.toHaveBeenCalledWith('Set-Cookie', expect.anything());
  });

  it('revokes the previous tenant session and rotates tenant cookies when switching companies', async () => {
    mockSwitchDgfyCompanyUseCase.mockResolvedValue({
      success: true,
      auditContext: {
        account: { id: 'dgfy-account-1', email: 'founder@example.test' },
        membership: {
          id: 22,
          tenant_id: 'tenant-2',
          tenant_user_id: 20,
          role: 'cashier',
          role_preset_key: 'cashier'
        },
        tenantId: 'tenant-2',
        evidence: {
          current_tenant_id: 'tenant-1',
          current_tenant_user_id: 10,
          target_tenant_user_id: 20,
          target_role: 'cashier',
          target_role_preset_key: 'cashier',
          auth_source: 'tenant_membership'
        }
      },
      data: {
        payload: {
          success: true,
          data: {
            user_id: 20,
            email: 'founder@example.test',
            token: 'new-tenant-access-token',
            refreshToken: 'new-tenant-refresh-token',
            expiresIn: 86400,
            company: {
              id: 'tenant-2',
              name: 'Second Company',
              token: 'company-token-2'
            }
          },
          message: 'Company switched.'
        }
      }
    });

    const req = {
      dgfyAccount: { id: 'dgfy-account-1', email: 'founder@example.test' },
      params: { tenant_id: 'tenant-2' },
      body: {},
      user: { user_id: 10, tenant_id: 'tenant-1' },
      dgfyAuthSource: 'tenant_membership',
      headers: {
        cookie: 'sku_refresh_token=old-refresh-token; sku_tenant_context=company-token-1',
        'x-previous-tenant-access-token': 'old-access-token',
        'x-request-id': 'req-company-switch'
      },
      ip: '127.0.0.1',
      get: jest.fn(() => 'test-agent')
    };
    const res = createRes();

    await switchDgfyCompany(req, res);

    expect(mockBlacklistToken).toHaveBeenCalledTimes(2);
    expect(mockBlacklistToken).toHaveBeenCalledWith('old-refresh-token');
    expect(mockBlacklistToken).toHaveBeenCalledWith('old-access-token');
    expect(mockRecordDgfyCompanySwitchOutcomeUseCase).toHaveBeenCalledWith(expect.objectContaining({
      account: expect.objectContaining({ id: 'dgfy-account-1' }),
      membership: expect.objectContaining({
        id: 22,
        tenant_user_id: 20,
        role: 'cashier',
        role_preset_key: 'cashier'
      }),
      tenantId: 'tenant-2',
      result: 'success',
      metadata: expect.objectContaining({
        request_id: 'req-company-switch',
        ip_address: '127.0.0.1',
        user_agent: 'test-agent'
      }),
      evidence: expect.objectContaining({
        current_tenant_id: 'tenant-1',
        current_tenant_user_id: 10,
        target_tenant_user_id: 20,
        target_role: 'cashier',
        target_role_preset_key: 'cashier',
        previous_session_revoked: true,
        new_session_issued: true,
        session_rotated: true
      })
    }));
    expect(mockBlacklistToken.mock.invocationCallOrder.at(-1))
      .toBeLessThan(mockRecordDgfyCompanySwitchOutcomeUseCase.mock.invocationCallOrder[0]);
    expect(res.status).toHaveBeenCalledWith(200);

    const cookies = res.setHeader.mock.calls
      .filter(([name]) => String(name).toLowerCase() === 'set-cookie')
      .at(-1)?.[1] || [];
    expect(cookies.join(';')).toContain('sku_refresh_token=;');
    expect(cookies.join(';')).toContain('sku_tenant_context=;');
    expect(cookies.join(';')).toContain('sku_refresh_token=new-tenant-refresh-token');
    expect(cookies.join(';')).toContain('sku_tenant_context=company-token-2');
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('new-tenant-refresh-token');
  });

  it('audits a failed company switch when previous-session revocation fails', async () => {
    mockSwitchDgfyCompanyUseCase.mockResolvedValue({
      success: true,
      auditContext: {
        account: { id: 'dgfy-account-1', email: 'founder@example.test' },
        membership: {
          id: 22,
          tenant_id: 'tenant-2',
          tenant_user_id: 20,
          role: 'cashier',
          role_preset_key: 'cashier'
        },
        tenantId: 'tenant-2',
        evidence: {
          current_tenant_id: 'tenant-1',
          current_tenant_user_id: 10,
          target_tenant_user_id: 20,
          target_role: 'cashier',
          target_role_preset_key: 'cashier',
          auth_source: 'tenant_membership'
        }
      },
      data: {
        payload: {
          success: true,
          data: {
            user_id: 20,
            token: 'new-tenant-access-token',
            refreshToken: 'new-tenant-refresh-token',
            company: {
              id: 'tenant-2',
              token: 'company-token-2'
            }
          }
        }
      }
    });
    mockBlacklistToken.mockRejectedValueOnce(new Error('blacklist unavailable'));

    const req = {
      dgfyAccount: { id: 'dgfy-account-1', email: 'founder@example.test' },
      params: { tenant_id: 'tenant-2' },
      body: {},
      user: { user_id: 10, tenant_id: 'tenant-1' },
      dgfyAuthSource: 'tenant_membership',
      headers: {
        cookie: 'sku_refresh_token=old-refresh-token',
        'x-request-id': 'req-company-switch-failed'
      },
      ip: '127.0.0.1',
      get: jest.fn(() => 'test-agent')
    };
    const res = createRes();

    await expect(switchDgfyCompany(req, res))
      .rejects
      .toThrow('blacklist unavailable');

    expect(mockRecordDgfyCompanySwitchOutcomeUseCase).toHaveBeenCalledWith(expect.objectContaining({
      result: 'failure',
      reason: 'blacklist unavailable',
      metadata: expect.objectContaining({
        request_id: 'req-company-switch-failed'
      }),
      evidence: expect.objectContaining({
        reason_code: 'SESSION_ROTATION_FAILED',
        previous_session_revoked: false,
        new_session_issued: false,
        session_rotated: false
      })
    }));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('dgfy login cookie lifetime contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['standard', 24 * 60 * 60],
    ['remembered device', 30 * 24 * 60 * 60]
  ])('aligns the %s DGFY and CSRF cookie lifetimes', async (_label, expiresIn) => {
    mockLoginDgfyAccountUseCase.mockResolvedValue({
      success: true,
      data: {
        payload: {
          success: true,
          data: {
            account: { id: 'dgfy-account-1', email: 'owner@example.test' },
            token: 'dgfy-access-token',
            expiresIn,
            rememberDevice: expiresIn > 24 * 60 * 60
          }
        }
      }
    });

    const req = {
      body: {
        email: 'owner@example.test',
        password: 'password123',
        remember_device: expiresIn > 24 * 60 * 60
      }
    };
    const res = createRes();

    await loginDgfyAccount(req, res);

    expect(mockLoginDgfyAccountUseCase).toHaveBeenCalledWith({ body: req.body });
    expect(res.status).toHaveBeenCalledWith(200);

    const cookies = res.setHeader.mock.calls
      .filter(([name]) => String(name).toLowerCase() === 'set-cookie')
      .at(-1)?.[1] || [];
    const dgfyCookie = cookies.find((cookie) => cookie.startsWith('sku_dgfy_session='));
    const csrfCookie = cookies.find((cookie) => cookie.startsWith('sku_csrf_token='));

    expect(dgfyCookie).toContain(`Max-Age=${expiresIn}`);
    expect(dgfyCookie).toContain('HttpOnly');
    expect(csrfCookie).toContain(`Max-Age=${expiresIn}`);
    expect(csrfCookie).not.toContain('HttpOnly');
  });
});

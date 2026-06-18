import { jest } from '@jest/globals';

const mockStartDgfyTenantSessionUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/dgfy/index.js', () => ({
  acceptDgfyInvitationUseCase: jest.fn(),
  changeDgfyPasswordUseCase: jest.fn(),
  completeDgfyPasswordResetUseCase: jest.fn(),
  createDgfyHandoffUseCase: jest.fn(),
  createDgfyInvitationUseCase: jest.fn(),
  exchangeDgfyHandoffUseCase: jest.fn(),
  getDgfyLegalTermsUseCase: jest.fn(),
  leaveDgfyCompanyUseCase: jest.fn(),
  listDgfyAccountCompaniesUseCase: jest.fn(),
  registerDgfyAccountUseCase: jest.fn(),
  loginDgfyAccountUseCase: jest.fn(),
  getDgfyMeUseCase: jest.fn(),
  rejectDgfyInvitationUseCase: jest.fn(),
  requestDgfyBusinessStepUpUseCase: jest.fn(),
  requestDgfyPasswordResetUseCase: jest.fn(),
  requestDgfyEmailVerificationUseCase: jest.fn(),
  searchDgfyBusinessAccountsUseCase: jest.fn(),
  startDgfyPosSessionUseCase: jest.fn(),
  startDgfyTenantSessionUseCase: mockStartDgfyTenantSessionUseCase,
  switchDgfyCompanyUseCase: jest.fn(),
  transferDgfyCompanyOwnershipUseCase: jest.fn(),
  updateDgfyProfileUseCase: jest.fn(),
  verifyDgfyEmailUseCase: jest.fn()
}));

jest.unstable_mockModule('../src/services/authService.js', () => ({
  blacklistToken: jest.fn(),
  isTokenBlacklisted: jest.fn().mockResolvedValue(false),
  verifyToken: jest.fn()
}));

let startDgfyTenantSession;

beforeAll(async () => {
  ({ startDgfyTenantSession } = await import('../src/modules/dgfy/controllers/dgfyAuthHandlers.js'));
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
});

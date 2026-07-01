import { jest } from '@jest/globals';

const resolveInvitationTenantTokenByToken = jest.fn();
const findTenantByToken = jest.fn();
const findTenantById = jest.fn();
const getConnection = jest.fn();
const getTenantModels = jest.fn();
const dbRun = jest.fn((_context, callback) => callback());

jest.unstable_mockModule('../src/services/landlordService.js', () => ({
  resolveInvitationTenantTokenByToken,
  findTenantByToken,
  findTenantById
}));

jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
  default: { getConnection }
}));

jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
  getTenantModels
}));

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
  default: { run: dbRun }
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const { tenantHandler } = await import('../src/middleware/tenantHandler.js');

describe('tenantHandler email OTP invitation routing', () => {
  const originalRefreshSecret = process.env.REFRESH_TOKEN_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REFRESH_TOKEN_SECRET = 'test_refresh_secret_for_tenant_handler!';
    resolveInvitationTenantTokenByToken.mockResolvedValue('tenant-token-1');
    findTenantById.mockResolvedValue({
      id: 'tenant-1',
      name: 'Acme Foods',
      company_token: 'tenant-token-1',
      status: 'active',
      plan: 'premium'
    });
    findTenantByToken.mockResolvedValue({
      id: 'tenant-1',
      name: 'Acme Foods',
      status: 'active',
      plan: 'premium'
    });
    getConnection.mockResolvedValue({ dialect: 'mysql' });
    getTenantModels.mockReturnValue({ User: { modelName: 'User' } });
  });

  afterAll(() => {
    process.env.REFRESH_TOKEN_SECRET = originalRefreshSecret;
  });

  it('resolves token-only invitation OTP requests into tenant context', async () => {
    const req = {
      path: '/api/v1/auth/email-otp/request',
      headers: {},
      body: {
        purpose: 'invitation_acceptance',
        invitation_token: 'invite-token'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await tenantHandler(req, res, next);

    expect(resolveInvitationTenantTokenByToken).toHaveBeenCalledWith('invite-token');
    expect(req.headers['x-company-token']).toBe('tenant-token-1');
    expect(findTenantByToken).toHaveBeenCalledWith('tenant-token-1');
    expect(req.tenant).toEqual(expect.objectContaining({ id: 'tenant-1' }));
    expect(dbRun).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      tenantToken: 'tenant-token-1'
    }), next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows global DGFY account OTP requests without company token', async () => {
    const req = {
      path: '/api/v1/auth/email-otp/request',
      headers: {},
      body: {
        purpose: 'dgfy_account_verification',
        email: 'new-founder@example.test'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await tenantHandler(req, res, next);

    expect(resolveInvitationTenantTokenByToken).not.toHaveBeenCalled();
    expect(findTenantByToken).not.toHaveBeenCalled();
    expect(dbRun).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'default',
      tenantContextFailure: 'dgfy_global_otp'
    }), next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('ignores stale tenant tokens on global DGFY account OTP requests', async () => {
    const req = {
      path: '/api/v1/auth/email-otp/request',
      headers: {
        'x-company-token': 'stale-token'
      },
      body: {
        purpose: 'dgfy_account_verification',
        email: 'new-founder@example.test'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await tenantHandler(req, res, next);

    expect(findTenantByToken).not.toHaveBeenCalled();
    expect(resolveInvitationTenantTokenByToken).not.toHaveBeenCalled();
    expect(req.headers['x-company-token']).toBeUndefined();
    expect(dbRun).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'default',
      tenantContextFailure: 'dgfy_global_otp'
    }), next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('ignores a stale tenant-context cookie for global DGFY account OTP requests', async () => {
    const req = {
      path: '/api/v1/auth/email-otp/request',
      headers: {
        cookie: 'sku_tenant_context=token-original'
      },
      body: {
        purpose: 'dgfy_account_verification',
        email: 'new-founder@example.test'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await tenantHandler(req, res, next);

    expect(findTenantByToken).not.toHaveBeenCalled();
    expect(req.headers['x-company-token']).toBeUndefined();
    expect(dbRun).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'default',
      tenantContextFailure: 'missing_token'
    }), next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('still rejects tenant-scoped OTP requests without company token or invitation token', async () => {
    const req = {
      path: '/api/v1/auth/email-otp/request',
      headers: {},
      body: {
        purpose: 'company_registration',
        email: 'founder@example.test'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await tenantHandler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Company token is required for authentication.',
      error_code: 'TENANT_TOKEN_REQUIRED'
    }));
  });

  it('recovers refresh-token tenant context from the signed refresh cookie when tenant context cookie is missing', async () => {
    const jwt = await import('jsonwebtoken');
    const refreshToken = jwt.default.sign({
      user_id: 7,
      type: 'refresh',
      tenant_id: 'tenant-1'
    }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });

    const req = {
      path: '/api/v1/auth/refresh-token',
      headers: {
        cookie: `sku_refresh_token=${encodeURIComponent(refreshToken)}`
      },
      body: {}
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await tenantHandler(req, res, next);

    expect(findTenantById).toHaveBeenCalledWith('tenant-1');
    expect(req.headers['x-company-token']).toBe('tenant-token-1');
    expect(dbRun).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      tenantToken: 'tenant-token-1'
    }), next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('recovers DGFY tenant-membership bridge tenant context from the tenant context cookie', async () => {
    findTenantByToken.mockResolvedValueOnce({
      id: 'tenant-bridge',
      name: 'Bridge Cafe',
      status: 'active',
      plan: 'premium'
    });
    const req = {
      path: '/api/v1/dgfy/account/companies',
      headers: {
        'x-dgfy-auth-mode': 'tenant_membership',
        cookie: 'sku_tenant_context=tenant-token-bridge'
      },
      body: {}
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await tenantHandler(req, res, next);

    expect(req.headers['x-company-token']).toBe('tenant-token-bridge');
    expect(findTenantByToken).toHaveBeenCalledWith('tenant-token-bridge');
    expect(dbRun).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-bridge',
      tenantToken: 'tenant-token-bridge'
    }), next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

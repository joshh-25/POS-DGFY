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
});

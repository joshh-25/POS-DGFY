import { jest } from '@jest/globals';

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

const loadAuthenticate = async ({ paymentsEnabledFlag }) => {
  jest.resetModules();

  const mockVerifyToken = jest.fn();
  const mockIsTokenBlacklisted = jest.fn();
  const mockFindByPk = jest.fn();

  jest.unstable_mockModule('../src/services/authService.js', () => ({
    verifyToken: mockVerifyToken,
    isTokenBlacklisted: mockIsTokenBlacklisted
  }));

  jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
      getStore: jest.fn(() => ({
        tenantId: 'tenant-ctx-1'
      })),
      get: jest.fn(() => ({
        findByPk: mockFindByPk
      }))
    }
  }));

  jest.unstable_mockModule('../src/config/paymentsFeature.js', () => ({
    paymentsEnabled: paymentsEnabledFlag
  }));

  const authModule = await import('../src/middleware/auth.js');

  return {
    authenticate: authModule.authenticate,
    mockVerifyToken,
    mockIsTokenBlacklisted,
    mockFindByPk
  };
};

describe('authenticate middleware subscription gate behavior', () => {
  it('allows standard tenant with inactive subscription when payments are disabled', async () => {
    const {
      authenticate,
      mockVerifyToken,
      mockIsTokenBlacklisted,
      mockFindByPk
    } = await loadAuthenticate({ paymentsEnabledFlag: false });

    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockVerifyToken.mockReturnValue({ user_id: 11, tenant_id: 'tenant-ctx-1' });
    mockFindByPk.mockResolvedValue({
      user_id: 11,
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin',
      permissions: ['settings:view'],
      is_master_admin: true,
      is_active: true,
      deleted_at: null
    });

    const req = {
      headers: {
        authorization: 'Bearer valid-token',
        'x-company-token': 'token-acme'
      },
      baseUrl: '/api/v1/users',
      path: '/me',
      tenant: {
        id: 'tenant-ctx-1',
        status: 'active',
        plan: 'standard',
        subscription_status: 'inactive',
        current_period_end: null
      }
    };
    const res = createRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks premium tenant with inactive subscription when payments are enabled', async () => {
    const {
      authenticate,
      mockVerifyToken,
      mockIsTokenBlacklisted,
      mockFindByPk
    } = await loadAuthenticate({ paymentsEnabledFlag: true });

    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockVerifyToken.mockReturnValue({ user_id: 12, tenant_id: 'tenant-ctx-1' });
    mockFindByPk.mockResolvedValue({
      user_id: 12,
      username: 'premium-admin',
      email: 'premium@example.com',
      role: 'admin',
      permissions: ['settings:view'],
      is_master_admin: true,
      is_active: true,
      deleted_at: null
    });

    const req = {
      headers: {
        authorization: 'Bearer premium-token',
        'x-company-token': 'token-premium'
      },
      baseUrl: '/api/v1/users',
      path: '/me',
      tenant: {
        id: 'tenant-ctx-1',
        status: 'active',
        plan: 'premium',
        subscription_status: 'inactive',
        current_period_end: null
      }
    };
    const res = createRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Your subscription has expired. Please renew to continue.',
      subscriptionStatus: 'inactive'
    }));
  });
});

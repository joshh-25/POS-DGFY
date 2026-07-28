import { jest } from '@jest/globals';

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

const loadAuthenticate = async ({ enforcePhoneCompletion }) => {
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
      getStore: jest.fn(() => ({ tenantId: 'tenant-ctx-1' })),
      get: jest.fn(() => ({ findByPk: mockFindByPk }))
    }
  }));

  jest.unstable_mockModule('../src/config/paymentsFeature.js', () => ({
    paymentsEnabled: false
  }));

  jest.unstable_mockModule('../src/config/phoneCompletionRollout.js', () => ({
    isPhoneCompletionEnforcedForTenant: jest.fn(() => enforcePhoneCompletion)
  }));

  const authModule = await import('../src/middleware/auth.js');
  return {
    authenticate: authModule.authenticate,
    mockVerifyToken,
    mockIsTokenBlacklisted,
    mockFindByPk
  };
};

const buildRequest = (overrides = {}) => ({
  method: 'GET',
  originalUrl: '/api/v1/dashboard/stats',
  headers: {
    authorization: 'Bearer valid-token',
    'x-company-token': 'token-acme'
  },
  baseUrl: '/api/v1/dashboard',
  path: '/stats',
  tenant: {
    id: 'tenant-ctx-1',
    status: 'active',
    plan: 'standard',
    subscription_status: 'inactive',
    current_period_end: null
  },
  ...overrides
});

const configureUser = ({ mockVerifyToken, mockIsTokenBlacklisted, mockFindByPk }) => {
  mockIsTokenBlacklisted.mockResolvedValue(false);
  mockVerifyToken.mockReturnValue({ user_id: 11, tenant_id: 'tenant-ctx-1' });
  mockFindByPk.mockResolvedValue({
    user_id: 11,
    username: 'legacy-user',
    email: 'legacy@example.com',
    phone_number: null,
    role: 'staff',
    permissions: [],
    is_master_admin: false,
    is_active: true,
    deleted_at: null
  });
};

describe('authenticate middleware phone completion gate behavior', () => {
  it('allows normal requests in observe mode', async () => {
    const loaded = await loadAuthenticate({ enforcePhoneCompletion: false });
    configureUser(loaded);
    const res = createRes();
    const next = jest.fn();

    await loaded.authenticate(buildRequest(), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('preserves explicit company-local permissions for an admin-labeled membership', async () => {
    const loaded = await loadAuthenticate({ enforcePhoneCompletion: false });
    configureUser(loaded);
    loaded.mockFindByPk.mockResolvedValue({
      user_id: 11,
      username: 'company-admin',
      email: 'admin@example.com',
      phone_number: '+639000000000',
      role: 'admin',
      permissions: ['users:view'],
      is_master_admin: false,
      is_active: true,
      deleted_at: null
    });
    const req = buildRequest();
    const res = createRes();
    const next = jest.fn();

    await loaded.authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.permissions).toEqual(['users:view']);
    expect(req.user.permissions).not.toEqual(expect.arrayContaining(['pos:view', 'pos:transact']));
  });

  it('blocks normal requests when enforcement is active', async () => {
    const loaded = await loadAuthenticate({ enforcePhoneCompletion: true });
    configureUser(loaded);
    const res = createRes();
    const next = jest.fn();

    await loaded.authenticate(buildRequest(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(428);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error_code: 'PHONE_NUMBER_REQUIRED'
    }));
  });

  it('keeps profile remediation open while enforcement is active', async () => {
    const loaded = await loadAuthenticate({ enforcePhoneCompletion: true });
    configureUser(loaded);
    const res = createRes();
    const next = jest.fn();

    await loaded.authenticate(buildRequest({
      originalUrl: '/api/v1/users/me?tab=profile',
      baseUrl: '/api/v1/users',
      path: '/me'
    }), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

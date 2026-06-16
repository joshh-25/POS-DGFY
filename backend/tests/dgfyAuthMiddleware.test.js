import { jest } from '@jest/globals';

const mockVerifyToken = jest.fn();
const mockIsTokenBlacklisted = jest.fn();
const mockAuthenticate = jest.fn();
const mockFindById = jest.fn();
const mockFindByAcceptedTenantUserMembership = jest.fn();

jest.unstable_mockModule('../src/services/authService.js', () => ({
  verifyToken: mockVerifyToken,
  isTokenBlacklisted: mockIsTokenBlacklisted
}));

jest.unstable_mockModule('../src/middleware/auth.js', () => ({
  authenticate: mockAuthenticate
}));

jest.unstable_mockModule('../src/modules/dgfy/index.js', () => ({
  dgfyAccountRepository: {
    findById: mockFindById,
    findByAcceptedTenantUserMembership: mockFindByAcceptedTenantUserMembership
  }
}));

let authenticateDgfyAccountOrTenantMembership;

beforeAll(async () => {
  ({ authenticateDgfyAccountOrTenantMembership } = await import('../src/middleware/dgfyAuth.js'));
});

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('authenticateDgfyAccountOrTenantMembership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsTokenBlacklisted.mockResolvedValue(false);
  });

  it('authenticates through a DGFY token when one is provided', async () => {
    const req = {
      headers: {
        authorization: 'Bearer dgfy-token'
      }
    };
    const res = createRes();
    const next = jest.fn();
    const account = { id: 'dgfy-1', is_active: true, deleted_at: null };

    mockVerifyToken.mockReturnValue({ token_scope: 'dgfy', dgfy_account_id: 'dgfy-1' });
    mockFindById.mockResolvedValue(account);

    await authenticateDgfyAccountOrTenantMembership(req, res, next);

    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(mockFindById).toHaveBeenCalledWith('dgfy-1');
    expect(req.dgfyAccount).toBe(account);
    expect(req.dgfyAuthSource).toBe('dgfy_session');
    expect(next).toHaveBeenCalledWith();
  });

  it('falls back to an explicit accepted tenant membership for IMS switcher requests', async () => {
    const req = {
      headers: {},
      tenant: { id: 'tenant-1' },
      user: null
    };
    const res = createRes();
    const next = jest.fn();
    const account = { id: 'dgfy-ims', is_active: true, deleted_at: null };

    mockAuthenticate.mockImplementation(async (request, _response, done) => {
      request.user = { user_id: 42, tenant_id: 'tenant-1' };
      request.tenant = { id: 'tenant-1' };
      done();
    });
    mockFindByAcceptedTenantUserMembership.mockResolvedValue(account);

    await authenticateDgfyAccountOrTenantMembership(req, res, next);

    expect(mockAuthenticate).toHaveBeenCalled();
    expect(mockFindByAcceptedTenantUserMembership).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      tenantUserId: 42
    });
    expect(req.dgfyAccount).toBe(account);
    expect(req.dgfyAuthSource).toBe('tenant_membership');
    expect(next).toHaveBeenCalledWith();
  });

  it('treats normal IMS bearer tokens as tenant auth instead of DGFY tokens on mixed routes', async () => {
    const req = {
      headers: {
        authorization: 'Bearer ims-tenant-token'
      },
      tenant: { id: 'tenant-1' },
      user: null
    };
    const res = createRes();
    const next = jest.fn();
    const account = { id: 'dgfy-ims', is_active: true, deleted_at: null };

    mockVerifyToken.mockReturnValue({ user_id: 42, tenant_id: 'tenant-1' });
    mockAuthenticate.mockImplementation(async (request, _response, done) => {
      request.user = { user_id: 42, tenant_id: 'tenant-1' };
      request.tenant = { id: 'tenant-1' };
      done();
    });
    mockFindByAcceptedTenantUserMembership.mockResolvedValue(account);

    await authenticateDgfyAccountOrTenantMembership(req, res, next);

    expect(mockAuthenticate).toHaveBeenCalled();
    expect(mockIsTokenBlacklisted).not.toHaveBeenCalled();
    expect(mockFindById).not.toHaveBeenCalled();
    expect(mockFindByAcceptedTenantUserMembership).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      tenantUserId: 42
    });
    expect(req.dgfyAccount).toBe(account);
    expect(req.dgfyAuthSource).toBe('tenant_membership');
    expect(next).toHaveBeenCalledWith();
  });

  it('does not infer a DGFY account from tenant auth when no membership exists', async () => {
    const req = {
      headers: {},
      tenant: { id: 'tenant-1' }
    };
    const res = createRes();
    const next = jest.fn();

    mockAuthenticate.mockImplementation(async (request, _response, done) => {
      request.user = { user_id: 42, email: 'same@example.test', tenant_id: 'tenant-1' };
      done();
    });
    mockFindByAcceptedTenantUserMembership.mockResolvedValue(null);

    await authenticateDgfyAccountOrTenantMembership(req, res, next);

    expect(mockFindByAcceptedTenantUserMembership).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      tenantUserId: 42
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'This IMS user is not linked to a DGFY account membership. Sign in with DGFY or accept an invitation first.'
    });
    expect(next).not.toHaveBeenCalled();
  });
});

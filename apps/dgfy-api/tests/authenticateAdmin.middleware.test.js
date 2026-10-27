import { jest } from '@jest/globals';

const mockVerifyToken = jest.fn();
const mockIsTokenBlacklisted = jest.fn();
const mockResolveSessionAuthority = jest.fn();

jest.unstable_mockModule('../src/services/authService.js', () => ({
  verifyToken: mockVerifyToken,
  isTokenBlacklisted: mockIsTokenBlacklisted
}));

jest.unstable_mockModule('../src/modules/platformAdmin/repositories/platformAdminRepository.js', () => ({
  createPlatformAdminRepository: () => ({ resolveSessionAuthority: mockResolveSessionAuthority })
}));

let authenticateAdmin;

beforeAll(async () => {
  const authMiddleware = await import('../src/middleware/auth.js');
  authenticateAdmin = authMiddleware.authenticateAdmin;
});

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('authenticateAdmin middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when admin token is blacklisted', async () => {
    mockIsTokenBlacklisted.mockResolvedValue(true);

    const req = { headers: { authorization: 'Bearer revoked-token' } };
    const res = createRes();
    const next = jest.fn();

    await authenticateAdmin(req, res, next);

    expect(mockIsTokenBlacklisted).toHaveBeenCalledWith('revoked-token');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Admin token has been revoked. Please login again.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when verified token is not admin-scoped', async () => {
    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockVerifyToken.mockReturnValue({
      type: 'access',
      role: 'staff'
    });

    const req = { headers: { authorization: 'Bearer staff-token' } };
    const res = createRes();
    const next = jest.fn();

    await authenticateAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Admin access required'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects legacy admin tokens that have no revocable database session', async () => {
    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockVerifyToken.mockReturnValue({
      type: 'admin',
      role: 'admin',
      username: 'skupervisor'
    });

    const req = { headers: { authorization: 'Bearer valid-admin-token' } };
    const res = createRes();
    const next = jest.fn();

    await authenticateAdmin(req, res, next);

    expect(req.admin).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Please sign in again to establish a secure admin session'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows the DGLaundry registration decision route for an active cookie-session authority with admin.tenants', async () => {
    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockVerifyToken.mockReturnValue({
      type: 'platform_admin',
      admin_id: 'admin-1',
      session_id: 'session-1',
      auth_version: 3
    });
    mockResolveSessionAuthority.mockResolvedValue({
      user: { id: 'admin-1', username: 'tenant-admin', is_master: false },
      permissions: ['admin.tenants'],
      session: { id: 'session-1' }
    });

    const req = {
      headers: { cookie: 'admin_session=session-token' },
      originalUrl: '/api/v1/admin/tenants/dglaundry-registration-intents/intent-42/decision'
    };
    const res = createRes();
    const next = jest.fn();

    await authenticateAdmin(req, res, next);

    expect(mockResolveSessionAuthority).toHaveBeenCalledWith({
      adminId: 'admin-1',
      sessionId: 'session-1',
      authVersion: 3
    });
    expect(req.admin.permissions).toEqual(['admin.tenants']);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects DGLaundry registration review when the active session lacks admin.tenants', async () => {
    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockVerifyToken.mockReturnValue({
      type: 'platform_admin',
      admin_id: 'admin-2',
      session_id: 'session-2',
      auth_version: 1
    });
    mockResolveSessionAuthority.mockResolvedValue({
      user: { id: 'admin-2', username: 'feedback-admin', is_master: false },
      permissions: ['admin.feedback'],
      session: { id: 'session-2' }
    });

    const req = {
      headers: { cookie: 'admin_session=session-token' },
      originalUrl: '/api/v1/admin/tenants/dglaundry-registration-intents/intent-42'
    };
    const res = createRes();
    const next = jest.fn();

    await authenticateAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Access denied for this Platform Admin page',
      required_permissions: ['admin.tenants']
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects the tenant detail route when its database-backed admin session is missing', async () => {
    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockVerifyToken.mockReturnValue({
      type: 'platform_admin',
      admin_id: 'admin-3',
      session_id: 'revoked-session',
      auth_version: 1
    });
    mockResolveSessionAuthority.mockResolvedValue(null);

    const req = {
      headers: { cookie: 'admin_session=session-token' },
      originalUrl: '/api/v1/admin/tenants/tenant-42'
    };
    const res = createRes();
    const next = jest.fn();

    await authenticateAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Admin session is expired or revoked' });
    expect(next).not.toHaveBeenCalled();
  });
});

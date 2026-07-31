import { jest } from '@jest/globals';

const mockVerifyToken = jest.fn();
const mockIsTokenBlacklisted = jest.fn();

jest.unstable_mockModule('../src/services/authService.js', () => ({
  verifyToken: mockVerifyToken,
  isTokenBlacklisted: mockIsTokenBlacklisted
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

  it('attaches admin context and calls next for valid token', async () => {
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

    expect(req.admin).toEqual({
      username: 'skupervisor',
      role: 'admin',
      financial_role: 'platform_admin'
    });
    expect(next).toHaveBeenCalledTimes(1);
  });
});

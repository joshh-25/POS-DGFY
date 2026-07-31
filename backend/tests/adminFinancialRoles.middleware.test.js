import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/services/authService.js', () => ({
  verifyToken: jest.fn(),
  isTokenBlacklisted: jest.fn()
}));

let authorizeAdminFinancialRoles;

beforeAll(async () => {
  const authMiddleware = await import('../src/middleware/auth.js');
  authorizeAdminFinancialRoles = authMiddleware.authorizeAdminFinancialRoles;
});

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('authorizeAdminFinancialRoles', () => {
  it('allows a configured finance approver', () => {
    const middleware = authorizeAdminFinancialRoles('finance_approver');
    const req = {
      admin: {
        username: 'finance.approver',
        role: 'admin',
        financial_role: 'finance_approver'
      }
    };
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('preserves full financial access for a platform admin', () => {
    const middleware = authorizeAdminFinancialRoles('finance_approver');
    const req = {
      admin: {
        username: 'platform.admin',
        role: 'admin',
        financial_role: 'platform_admin'
      }
    };
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('blocks a finance viewer from payout approval actions', () => {
    const middleware = authorizeAdminFinancialRoles('finance_approver');
    const req = {
      admin: {
        username: 'finance.viewer',
        role: 'admin',
        financial_role: 'finance_viewer'
      }
    };
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

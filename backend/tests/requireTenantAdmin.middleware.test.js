import { describe, expect, it, jest } from '@jest/globals';
import { requireTenantAdmin } from '../src/middleware/auth.js';

const createRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe('requireTenantAdmin middleware', () => {
  it('allows tenant admins and master admins', () => {
    const adminNext = jest.fn();
    requireTenantAdmin({ user: { role: 'admin', is_master_admin: false } }, createRes(), adminNext);
    expect(adminNext).toHaveBeenCalledTimes(1);

    const masterNext = jest.fn();
    requireTenantAdmin({ user: { role: 'cashier', is_master_admin: true } }, createRes(), masterNext);
    expect(masterNext).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-admin user before category lifecycle access', () => {
    const res = createRes();
    const next = jest.fn();

    requireTenantAdmin({ user: { role: 'cashier', is_master_admin: false } }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Admin access is required to manage categories.'
    });
    expect(next).not.toHaveBeenCalled();
  });
});

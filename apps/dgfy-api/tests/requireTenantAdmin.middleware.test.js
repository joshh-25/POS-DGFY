import { describe, expect, it, jest } from '@jest/globals';
import { requireTenantAdmin } from '../src/middleware/auth.js';

const createRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe('requireTenantAdmin middleware', () => {
  it('allows users with category management permission and master admins', () => {
    const categoryManagerNext = jest.fn();
    requireTenantAdmin({
      user: {
        role: 'cashier',
        is_master_admin: false,
        permissions: ['categories:manage']
      }
    }, createRes(), categoryManagerNext);
    expect(categoryManagerNext).toHaveBeenCalledTimes(1);

    const masterNext = jest.fn();
    requireTenantAdmin({ user: { role: 'cashier', is_master_admin: true } }, createRes(), masterNext);
    expect(masterNext).toHaveBeenCalledTimes(1);
  });

  it('rejects a role admin whose explicit permissions omit category management', () => {
    const res = createRes();
    const next = jest.fn();

    requireTenantAdmin({
      user: {
        role: 'admin',
        is_master_admin: false,
        permissions: ['pos:view']
      }
    }, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Category management permission is required.',
      required: 'categories:manage'
    });
    expect(next).not.toHaveBeenCalled();
  });
});

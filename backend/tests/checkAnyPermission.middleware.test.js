import { jest } from '@jest/globals';
import { checkAnyPermission } from '../src/middleware/auth.js';

const createResponse = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('checkAnyPermission middleware', () => {
  it('allows a user with the mode-native permission', () => {
    const req = {
      user: {
        permissions: ['services:bookings:manage'],
        is_master_admin: false
      }
    };
    const res = createResponse();
    const next = jest.fn();

    checkAnyPermission(['services:bookings:manage', 'pos:transact'])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows temporary generic fallback permissions', () => {
    const req = {
      user: {
        permissions: ['pos:transact'],
        is_master_admin: false
      }
    };
    const res = createResponse();
    const next = jest.fn();

    checkAnyPermission(['fnb:checks:manage', 'pos:transact'])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('denies unrelated permissions and returns the accepted list', () => {
    const req = {
      user: {
        permissions: ['items:view'],
        is_master_admin: false
      }
    };
    const res = createResponse();
    const next = jest.fn();

    checkAnyPermission(['fnb:checks:manage', 'pos:transact'])(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      required: ['fnb:checks:manage', 'pos:transact']
    }));
  });

  it('keeps master-admin bypass behavior', () => {
    const req = {
      user: {
        permissions: [],
        is_master_admin: true
      }
    };
    const res = createResponse();
    const next = jest.fn();

    checkAnyPermission(['services:dashboard:view'])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

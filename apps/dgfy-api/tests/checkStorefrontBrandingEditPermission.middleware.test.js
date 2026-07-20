import { jest } from '@jest/globals';

import { checkStorefrontBrandingEditPermission } from '../src/middleware/auth.js';

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('checkStorefrontBrandingEditPermission middleware', () => {
  it('allows master admin', () => {
    const req = {
      user: {
        role: 'staff',
        is_master_admin: true,
        permissions: []
      }
    };
    const res = createRes();
    const next = jest.fn();

    checkStorefrontBrandingEditPermission(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows admin role without micropermission', () => {
    const req = {
      user: {
        role: 'admin',
        is_master_admin: false,
        permissions: ['settings:edit']
      }
    };
    const res = createRes();
    const next = jest.fn();

    checkStorefrontBrandingEditPermission(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows non-admin with micropermission', () => {
    const req = {
      user: {
        role: 'manager',
        is_master_admin: false,
        permissions: ['settings:view', 'settings:storefront_branding_edit']
      }
    };
    const res = createRes();
    const next = jest.fn();

    checkStorefrontBrandingEditPermission(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects non-admin without micropermission', () => {
    const req = {
      user: {
        role: 'manager',
        is_master_admin: false,
        permissions: ['settings:view', 'settings:edit']
      }
    };
    const res = createRes();
    const next = jest.fn();

    checkStorefrontBrandingEditPermission(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      required: 'settings:storefront_branding_edit'
    }));
  });
});

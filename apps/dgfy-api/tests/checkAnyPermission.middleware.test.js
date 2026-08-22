import { jest } from '@jest/globals';
import { checkAnyPermission } from '../src/middleware/auth.js';
import { buildModePermissionRequirements } from '../src/config/modeRbacFallback.js';
import dbStore from '../src/utils/dbStore.js';

const createResponse = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('checkAnyPermission middleware', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows a user with the mode-native permission', async () => {
    const req = {
      user: {
        permissions: ['services:bookings:manage'],
        is_master_admin: false
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await checkAnyPermission(['services:bookings:manage', 'pos:transact'])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows temporary generic fallback permissions', async () => {
    const auditCreate = jest.fn().mockResolvedValue({});
    jest.spyOn(dbStore, 'get').mockReturnValue({ create: auditCreate });
    const req = {
      user: {
        user_id: 42,
        username: 'legacy-cashier',
        tenant_id: 'tenant-1',
        permissions: ['pos:transact'],
        is_master_admin: false
      },
      method: 'POST',
      originalUrl: '/api/v1/services/bookings',
      requestId: 'request-1',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' }
    };
    const res = createResponse();
    const next = jest.fn();

    await checkAnyPermission(buildModePermissionRequirements('fnb:checks:manage', 'pos:transact'))(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'authorization_fallback',
      entity_id: 42,
      event_type: 'mode_rbac_generic_fallback_used',
      actor_username: 'legacy-cashier',
      request_id: 'request-1',
      changes: expect.objectContaining({
        tenant_id: 'tenant-1',
        primary_permission: 'fnb:checks:manage',
        fallback_permission: 'pos:transact',
        path: '/api/v1/services/bookings'
      })
    }));
  });

  it('does not audit a regular OR permission list as mode fallback', async () => {
    const auditCreate = jest.fn().mockResolvedValue({});
    jest.spyOn(dbStore, 'get').mockReturnValue({ create: auditCreate });
    const req = {
      user: {
        user_id: 42,
        permissions: ['pos:transact'],
        is_master_admin: false
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await checkAnyPermission(['fnb:checks:manage', 'pos:transact'])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('denies unrelated permissions and returns the accepted list', async () => {
    const req = {
      user: {
        permissions: ['items:view'],
        is_master_admin: false
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await checkAnyPermission(['fnb:checks:manage', 'pos:transact'])(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      required: ['fnb:checks:manage', 'pos:transact']
    }));
  });

  it('keeps master-admin bypass behavior', async () => {
    const req = {
      user: {
        permissions: [],
        is_master_admin: true
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await checkAnyPermission(['services:dashboard:view'])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

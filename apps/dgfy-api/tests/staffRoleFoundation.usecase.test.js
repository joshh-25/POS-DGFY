import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
  buildAssignStaffRoleToUserUseCase,
  buildSetStaffRoleStatusUseCase,
  buildUpdateStaffRoleUseCase
} from '../src/modules/staff/usecases/staffRoleUseCases.js';
import staffRoleRoutes from '../src/routes/staffRoles.js';
import { requireTenantAdminRole } from '../src/middleware/auth.js';
import { resolveEffectivePermissions } from '../src/utils/userPermissions.js';

const context = (work) => {
  const transaction = {
    finished: false,
    commit: jest.fn(async function commit() { this.finished = 'commit'; }),
    rollback: jest.fn(async function rollback() { this.finished = 'rollback'; })
  };
  return dbStore.run({ sequelize: { transaction: async () => transaction }, tenantId: 12 }, () => work(transaction));
};
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
const role = (id = 4) => ({ staff_role_id: id, name: 'Warehouse', is_active: true, capabilities: ['orders:pack'] });

describe('staff-role foundation', () => {
  it('clears a stored override in the assignment transaction and audits the prior snapshot', async () => {
    const target = {
      user_id: 7, role: 'staff', staff_role_id: null, permission_mode: 'custom', permissions: ['pos:transact'],
      update: jest.fn(async function update(values) { Object.assign(this, values); })
    };
    const repository = {
      findUserById: jest.fn().mockResolvedValue(target),
      findById: jest.fn().mockResolvedValue(role()),
      createAuditLog: jest.fn().mockResolvedValue({})
    };
    const evict = jest.fn();
    await context(async (transaction) => {
      const result = await buildAssignStaffRoleToUserUseCase({ repository, invalidateUserCache: evict })({ userId: 7, staffRoleId: 4, actorUserId: 1 });
      expect(result.success).toBe(true);
      expect(target.update).toHaveBeenCalledWith({ staff_role_id: 4, permissions: [], permission_mode: 'inherit' }, { transaction });
      expect(repository.createAuditLog.mock.calls[0][0].changes).toMatchObject({
        previous_staff_role_id: null,
        previous_permissions: ['pos:transact'], permissions: [],
        previous_permission_mode: 'custom', permission_mode: 'inherit',
        permission_overrides_cleared: true
      });
      expect(repository.createAuditLog.mock.calls[0][0]).toMatchObject({ entity_type: 'user', entity_id: 7 });
      expect(transaction.commit).toHaveBeenCalledTimes(1);
      expect(evict).not.toHaveBeenCalled();
      expect(resolveEffectivePermissions({ ...target, staffRole: role() })).toEqual(['orders:pack']);
      await nextTurn();
      expect(evict).toHaveBeenCalledWith(12, 7);
    });
  });

  it('clearing a staff role also leaves permissions empty', async () => {
    const target = { user_id: 7, staff_role_id: 4, permission_mode: 'inherit', permissions: ['orders:pack'], update: jest.fn() };
    const repository = { findUserById: jest.fn().mockResolvedValue(target), createAuditLog: jest.fn() };
    await context(async (transaction) => {
      const result = await buildAssignStaffRoleToUserUseCase({ repository })({ userId: 7, staffRoleId: null, actorUserId: 1 });
      expect(result.success).toBe(true);
      expect(target.update).toHaveBeenCalledWith({ staff_role_id: null, permissions: [], permission_mode: 'custom' }, { transaction });
      expect(result.data.assignment).toMatchObject({ permission_mode: 'custom', effective_permissions: [] });
    });
  });

  it.each([
    ['edit', buildUpdateStaffRoleUseCase, { staffRoleId: 4, payload: { capabilities: ['orders:pack'] }, actorUserId: 1 }],
    ['deactivate', buildSetStaffRoleStatusUseCase, { staffRoleId: 4, isActive: false, actorUserId: 1 }]
  ])('evicts all assigned users after %s commits', async (_name, build, input) => {
    const repository = {
      findById: jest.fn().mockResolvedValue(role()),
      update: jest.fn(async (row, values) => Object.assign(row, values)),
      findUsersByRoleId: jest.fn().mockResolvedValue([{ user_id: 7 }, { user_id: 8 }]),
      cancelPendingInvitationsForRole: jest.fn().mockResolvedValue({ count: 0, userIds: [] }),
      createAuditLog: jest.fn()
    };
    const evict = jest.fn();
    await context(async (transaction) => {
      const result = await build({ repository, invalidateUserCache: evict })(input);
      expect(result.success).toBe(true);
      expect(repository.findUsersByRoleId).toHaveBeenCalledWith(4, { transaction });
      expect(evict).not.toHaveBeenCalled();
      await nextTurn();
      expect(evict.mock.calls).toEqual([[12, 7], [12, 8]]);
    });
  });

  it('cancels pending invitations in the deactivation transaction and reports synchronized count', async () => {
    const activeRole = role();
    const repository = {
      findById: jest.fn().mockResolvedValue(activeRole),
      update: jest.fn(async (row, values) => Object.assign(row, values)),
      findUsersByRoleId: jest.fn().mockResolvedValue([]),
      cancelPendingInvitationsForRole: jest.fn().mockResolvedValue({ count: 3, userIds: [11, 12, 13] }),
      createAuditLog: jest.fn()
    };
    const synchronizeInvitationCancellations = jest.fn().mockResolvedValue({ cancelled_count: 3 });
    await context(async (transaction) => {
      const result = await buildSetStaffRoleStatusUseCase({ repository, synchronizeInvitationCancellations })({
        staffRoleId: 4,
        isActive: false,
        actorUserId: 1
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        cancelled_invitation_count: 3,
        invitation_sync_status: 'complete'
      });
      expect(repository.cancelPendingInvitationsForRole).toHaveBeenCalledWith(4, {
        actorUserId: 1,
        cancelledAt: expect.any(Date),
        transaction
      });
      expect(repository.createAuditLog.mock.calls[0][0].changes).toMatchObject({
        previous_is_active: true,
        is_active: false,
        cancelled_pending_invitations_count: 3
      });
      expect(synchronizeInvitationCancellations).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: 12,
        staffRoleId: 4,
        actorUserId: 1
      }));
    });
  });

  it('returns a retry warning when landlord cancellation synchronization fails', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(role()),
      update: jest.fn(async (row, values) => Object.assign(row, values)),
      findUsersByRoleId: jest.fn().mockResolvedValue([]),
      cancelPendingInvitationsForRole: jest.fn().mockResolvedValue({ count: 2, userIds: [11, 12] }),
      createAuditLog: jest.fn()
    };
    await context(async () => {
      const result = await buildSetStaffRoleStatusUseCase({
        repository,
        synchronizeInvitationCancellations: jest.fn().mockRejectedValue(new Error('landlord unavailable'))
      })({ staffRoleId: 4, isActive: false, actorUserId: 1 });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        invitation_sync_status: 'retry_required',
        cancelled_invitation_count: 2
      });
      expect(result.data.invitation_sync_message).toContain('needs retry');
    });
  });

  it('puts the tenant-admin guard on every role write route', () => {
    const writes = staffRoleRoutes.stack
      .filter((layer) => layer.route && Object.keys(layer.route.methods).some((method) => method !== 'get'));
    expect(writes).toHaveLength(4);
    for (const layer of writes) {
      expect(layer.route.stack.map((entry) => entry.handle)).toContain(requireTenantAdminRole);
    }
  });

  it('retains the existing permission gate on role read routes', () => {
    const reads = staffRoleRoutes.stack
      .filter((layer) => layer.route && layer.route.methods.get);
    expect(reads).toHaveLength(2);
    for (const layer of reads) {
      expect(layer.route.stack.map((entry) => entry.handle)).not.toContain(requireTenantAdminRole);
    }
  });

  it.each([
    [{ role: 'admin' }, true],
    [{ role: 'staff', is_master_admin: true }, true],
    [{ role: 'manager', permissions: ['users:manage'] }, false],
    [{ role: 'cashier' }, false],
    [{ role: 'staff', permissions: ['users:manage'] }, false]
  ])('applies admin/owner write authority to %p', (user, allowed) => {
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    requireTenantAdminRole({ user }, res, next);
    if (allowed) expect(next).toHaveBeenCalledTimes(1);
    else expect(res.status).toHaveBeenCalledWith(403);
  });
});

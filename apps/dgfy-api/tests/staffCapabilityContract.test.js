import { STAFF_CAPABILITIES, STAFF_CAPABILITY_DEPRECATED, isKnownStaffCapability } from '../src/modules/shared/constants/staffCapabilities.js';
import { getAllPermissions, PERMISSIONS } from '../src/config/permissions.js';
import { hasEffectivePermission, resolveEffectivePermissions } from '../src/utils/userPermissions.js';
import { assertStaffAssignment } from '../src/modules/staff/services/assertStaffAssignment.js';
import { __testables as validatorTestables } from '../src/validators/staffRoleValidator.js';

describe('staff capability contract', () => {
  test('shared catalog exactly matches backend permission values', () => {
    expect(new Set(STAFF_CAPABILITIES)).toEqual(new Set(getAllPermissions()));
  });
  test('catalog is frozen and has no duplicate slugs', () => {
    expect(Object.isFrozen(STAFF_CAPABILITIES)).toBe(true);
    expect(new Set(STAFF_CAPABILITIES).size).toBe(STAFF_CAPABILITIES.length);
  });
  test('new fulfillment capabilities are known', () => {
    expect(isKnownStaffCapability(' orders:pack ')).toBe(true);
    expect(STAFF_CAPABILITIES).toEqual(expect.arrayContaining([
      PERMISSIONS.STAFF_FULFILLMENT.actions.PACK_ASSIGNED_ORDERS,
      PERMISSIONS.STAFF_FULFILLMENT.actions.VIEW_ASSIGNED_ORDERS,
      PERMISSIONS.STAFF_FULFILLMENT.actions.VIEW_ASSIGNED_DELIVERY_RUNS,
      PERMISSIONS.STAFF_FULFILLMENT.actions.ACT_ASSIGNED_DELIVERY_RUNS,
      PERMISSIONS.STAFF_FULFILLMENT.actions.LOAD_DELIVERY_RUNS,
      PERMISSIONS.STAFF_FULFILLMENT.actions.ACT_ASSIGNED_DELIVERY_JOBS,
      PERMISSIONS.STAFF_FULFILLMENT.actions.COLLECT_ASSIGNED_BALANCE
    ]));
  });
  test('deprecated catalog is intentionally empty', () => { expect(STAFF_CAPABILITY_DEPRECATED).toEqual({}); });
  test('explicit permissions outrank an active staff role', () => {
    expect(resolveEffectivePermissions({ permissions: ['items:view'], staffRole: { is_active: true, capabilities: ['orders:pack'] } })).toEqual(['items:view']);
  });
  test('active staff role outranks legacy role defaults when explicit permissions are empty', () => {
    expect(resolveEffectivePermissions({ role: 'staff', permissions: [], staffRole: { is_active: true, capabilities: ['orders:pack'] } })).toEqual(['orders:pack']);
  });
  test('inactive staff role falls back to legacy role defaults', () => {
    expect(resolveEffectivePermissions({ role: 'staff', permissions: [], staffRole: { is_active: false, capabilities: ['orders:pack'] } })).toEqual(expect.arrayContaining(['items:view']));
  });
  test('inactive staff role never escalates a cashier-base assignee to the full cashier preset (#1901)', () => {
    const permissions = resolveEffectivePermissions({
      role: 'cashier',
      permissions: [],
      staffRole: { is_active: false, capabilities: ['orders:pack'] }
    });
    expect(permissions).not.toContain('pos:transact');
    expect(permissions).toContain('items:view');
    expect(permissions).not.toContain('items:edit');
    expect(permissions).not.toContain('items:delete');
  });
  test('cashier account with no staff-role assignment keeps the full cashier preset (#1901)', () => {
    const permissions = resolveEffectivePermissions({ role: 'cashier', permissions: [] });
    expect(permissions).toContain('pos:transact');
  });
  test('cashier compatibility ceiling rejects delete while explicit permissions remain authoritative', () => {
    const permissions = resolveEffectivePermissions({ role: 'cashier', permissions: ['items:delete'] });
    expect(permissions).toEqual([]);
    expect(permissions).not.toContain('items:delete');
  });
  test('cashier compatibility floor is bypassed by an assigned staff role', () => {
    expect(resolveEffectivePermissions({ role: 'cashier', permissions: [], staffRole: { is_active: true, capabilities: ['orders:pack'] } })).toEqual(['orders:pack']);
  });
  test('broad POS permission bypasses narrow assignment proof for compatibility', async () => {
    await expect(assertStaffAssignment({ user: { permissions: ['pos:transact'] }, resourceType: 'order', resourceId: 1 })).resolves.toBeUndefined();
  });
  test('narrow assignment guard returns stable denial reason without capability', async () => {
    await expect(assertStaffAssignment({ user: { user_id: 1, permissions: [] }, resourceType: 'order', resourceId: 1 })).rejects.toMatchObject({ code: 'AUTHORIZATION_FAILED', details: { reason_code: 'NOT_PERMITTED' } });
  });
  test('deactivating a staff role restores the narrow-assignment denial for a cashier-base account (#1901)', async () => {
    const user = { user_id: 7, role: 'cashier', permissions: [], staffRole: { is_active: false, capabilities: ['orders:pack'] } };
    await expect(assertStaffAssignment({ user, resourceType: 'order', resourceId: 1 }))
      .rejects.toMatchObject({ code: 'AUTHORIZATION_FAILED', details: { reason_code: 'NOT_PERMITTED' } });
  });
  test('role validator preserves capability arrays for use-case catalog validation', () => {
    const { error } = validatorTestables.roleBody.validate({ name: 'Picker', capabilities: ['orders:pack'] });
    expect(error).toBeUndefined();
  });
});

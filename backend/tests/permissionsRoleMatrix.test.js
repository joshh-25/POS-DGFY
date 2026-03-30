import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, getAllPermissions } from '../src/config/permissions.js';
import { USER_ROLES } from '../src/config/userRoles.js';

describe('role/micro-permission matrix hardening', () => {
  it('defines default permission arrays for every supported role', () => {
    for (const role of USER_ROLES) {
      expect(Array.isArray(DEFAULT_ROLE_PERMISSIONS[role])).toBe(true);
      expect(DEFAULT_ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });

  it('contains only valid permission keys and no duplicates per role', () => {
    const known = new Set(getAllPermissions());

    for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      expect(new Set(permissions).size).toBe(permissions.length);
      for (const permission of permissions) {
        expect(known.has(permission)).toBe(true);
      }
      expect(USER_ROLES.includes(role)).toBe(true);
    }
  });

  it('keeps cashier scoped to POS operations and non-admin visibility', () => {
    const cashier = new Set(DEFAULT_ROLE_PERMISSIONS.cashier);
    expect(cashier.has(PERMISSIONS.POS.actions.VIEW_POS)).toBe(true);
    expect(cashier.has(PERMISSIONS.POS.actions.TRANSACT_POS)).toBe(true);
    expect(cashier.has(PERMISSIONS.POS.actions.CLOSE_DAY_POS)).toBe(true);
    expect(cashier.has(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS)).toBe(false);
    expect(cashier.has(PERMISSIONS.SYSTEM.actions.MANAGE_USERS)).toBe(false);
    expect(cashier.has(PERMISSIONS.ORDERS.actions.APPROVE_PO)).toBe(false);
  });

  it('keeps PO/DO/JO specialized roles isolated by write domain', () => {
    const po = new Set(DEFAULT_ROLE_PERMISSIONS.po);
    const doRole = new Set(DEFAULT_ROLE_PERMISSIONS.do);
    const jo = new Set(DEFAULT_ROLE_PERMISSIONS.jo);

    expect(po.has(PERMISSIONS.ORDERS.actions.RECEIVE_PO)).toBe(true);
    expect(po.has(PERMISSIONS.DISPATCH.actions.DISPATCH_DO)).toBe(false);
    expect(po.has(PERMISSIONS.ORDERS.actions.COMPLETE_JO)).toBe(false);

    expect(doRole.has(PERMISSIONS.DISPATCH.actions.DISPATCH_DO)).toBe(true);
    expect(doRole.has(PERMISSIONS.ORDERS.actions.RECEIVE_PO)).toBe(false);
    expect(doRole.has(PERMISSIONS.ORDERS.actions.COMPLETE_JO)).toBe(false);

    expect(jo.has(PERMISSIONS.ORDERS.actions.COMPLETE_JO)).toBe(true);
    expect(jo.has(PERMISSIONS.ORDERS.actions.RECEIVE_PO)).toBe(false);
    expect(jo.has(PERMISSIONS.DISPATCH.actions.DISPATCH_DO)).toBe(false);
  });
});

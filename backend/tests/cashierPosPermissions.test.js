import { describe, expect, it } from '@jest/globals';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '../src/config/permissions.js';

describe('cashier POS least-privilege defaults', () => {
  it('grants normal cashier operations and excludes privileged fiscal and management actions', () => {
    const permissions = new Set(DEFAULT_ROLE_PERMISSIONS.cashier);

    expect(permissions).toEqual(new Set([
      PERMISSIONS.INVENTORY.actions.VIEW_ITEMS,
      PERMISSIONS.POS.actions.VIEW_POS,
      PERMISSIONS.POS.actions.TRANSACT_POS,
      PERMISSIONS.POS.actions.USE_EMPLOYEE_CREDIT,
      PERMISSIONS.POS.actions.CLOSE_SHIFT_POS,
      PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT
    ]));

    expect(permissions.has(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER)).toBe(false);
    expect(permissions.has(PERMISSIONS.POS.actions.CLOSE_DAY_POS)).toBe(false);
    expect(permissions.has(PERMISSIONS.POS.actions.VOID_POS_TRANSACTION)).toBe(false);
    expect(permissions.has(PERMISSIONS.POS.actions.MANAGE_ESALES_REPORTS)).toBe(false);
    expect(permissions.has(PERMISSIONS.POS.actions.MANAGE_FISCAL_TERMINALS)).toBe(false);
    expect(permissions.has(PERMISSIONS.POS.actions.PRICE_OVERRIDE_POS)).toBe(false);
    expect(permissions.has(PERMISSIONS.POS.actions.SWITCH_LOCATION_POS)).toBe(false);
  });
});

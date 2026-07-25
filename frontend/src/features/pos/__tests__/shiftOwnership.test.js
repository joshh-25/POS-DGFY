import { describe, expect, it } from 'vitest';
import {
  isShiftOwnedByUser,
  isShiftOwnedByUserId,
  resolvePosUserId
} from '../utils/shiftOwnership.js';

describe('POS shift ownership', () => {
  it('uses the permanent user ID for both admins and cashiers', () => {
    expect(resolvePosUserId({ user_id: 1, role: 'admin' })).toBe(1);
    expect(resolvePosUserId({ user_id: 42, role: 'cashier' })).toBe(42);
  });

  it('allows the same user to resume the shift they opened', () => {
    expect(isShiftOwnedByUserId({ cashier_id: 1 }, 1)).toBe(true);
    expect(isShiftOwnedByUser({ cashier_id: 1 }, { user_id: 1, role: 'admin' })).toBe(true);
  });

  it('does not grant ownership to another user or an invalid identity', () => {
    expect(isShiftOwnedByUserId({ cashier_id: 1 }, 2)).toBe(false);
    expect(isShiftOwnedByUserId({ cashier_id: 1 }, null)).toBe(false);
    expect(isShiftOwnedByUserId(null, 1)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { hasPosDiscountAuthorization } from '../terminalWorkspaceUtils.js';

describe('terminal workspace discount authorization', () => {
  it('recognizes built-in discount authorizers', () => {
    expect(hasPosDiscountAuthorization({ role: 'Manager' })).toBe(true);
    expect(hasPosDiscountAuthorization({ is_master_admin: true, role: 'cashier' })).toBe(true);
  });

  it('recognizes explicit discount authorization', () => {
    expect(hasPosDiscountAuthorization({ role: 'staff', permissions: ['pos:discount_authorize'] })).toBe(true);
  });

  it('does not treat void access as discount authorization', () => {
    expect(hasPosDiscountAuthorization({ role: 'cashier', permissions: ['pos:void'] })).toBe(false);
  });
});

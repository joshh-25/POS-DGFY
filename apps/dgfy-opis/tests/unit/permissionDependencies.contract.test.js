import { describe, expect, it } from 'vitest';
import {
  isPermissionEffective,
  normalizePermissionDependencies,
  normalizePermissionSelections
} from '@sieitzz/shared-constants/permissionDependencies';

describe('role-based permission dependencies', () => {
  it('requires module view access before an action becomes effective', () => {
    expect(isPermissionEffective(['items:create'], 'items:create')).toBe(false);
    expect(isPermissionEffective(['items:view', 'items:create'], 'items:create')).toBe(true);
    expect(isPermissionEffective(['vouchers:manage'], 'vouchers:manage')).toBe(false);
  });

  it('removes orphaned action grants when a parent module is revoked', () => {
    expect(normalizePermissionDependencies([
      'items:create',
      'items:edit',
      'items:view',
      'pos:transact',
      'pos:view'
    ])).toEqual([
      'items:create',
      'items:edit',
      'items:view',
      'pos:transact',
      'pos:view'
    ]);
    expect(normalizePermissionDependencies(['items:create', 'items:edit'])).toEqual([]);
    expect(normalizePermissionDependencies(['vouchers:manage', 'vouchers:view'])).toEqual([
      'vouchers:manage',
      'vouchers:view'
    ]);
  });

  it('keeps intentionally selected child grants for the permission editor', () => {
    expect(normalizePermissionSelections(['items:create', 'items:create', 'items:view'])).toEqual([
      'items:create',
      'items:view'
    ]);
    expect(isPermissionEffective(['items:create'], 'items:create')).toBe(false);
  });
});

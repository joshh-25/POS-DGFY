import { describe, expect, it } from 'vitest';
import { shouldOpenBranchDirectoryOnHydrate } from '../posBranchDirectoryEntry.js';

describe('shouldOpenBranchDirectoryOnHydrate', () => {
  it.each([
    ['master admin', { canViewBranchLocations: true }],
    ['pos:branch_view user', { canViewBranchLocations: true }],
    ['unlocked session', { canViewBranchLocations: true, storedLockActive: false }]
  ])('does not open for a background refresh (%s)', (_label, overrides) => {
    expect(shouldOpenBranchDirectoryOnHydrate({
      isDgfyPosSurface: true,
      background: true,
      ...overrides
    })).toBe(false);
  });

  it('opens on initial hydration for a branch-view user without a tenant handoff or stored lock', () => {
    expect(shouldOpenBranchDirectoryOnHydrate({
      isDgfyPosSurface: true,
      canViewBranchLocations: true,
      storedLockActive: false,
      background: false
    })).toBe(true);
  });

  it('does not open for a cashier without branch-view permission', () => {
    expect(shouldOpenBranchDirectoryOnHydrate({
      isDgfyPosSurface: true,
      canViewBranchLocations: false
    })).toBe(false);
  });

  it('does not open when a tenant handoff or stored lock is present', () => {
    expect(shouldOpenBranchDirectoryOnHydrate({
      isDgfyPosSurface: true,
      canViewBranchLocations: true,
      dgfyTenantId: 'tenant-1'
    })).toBe(false);
    expect(shouldOpenBranchDirectoryOnHydrate({
      isDgfyPosSurface: true,
      canViewBranchLocations: true,
      storedLockActive: true
    })).toBe(false);
  });
});

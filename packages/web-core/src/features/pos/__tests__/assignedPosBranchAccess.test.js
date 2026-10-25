import { describe, expect, it } from 'vitest';
import {
  canOperateAssignedPosBranch,
  hasPosBranchActionPermission
} from '../utils/assignedPosBranchAccess.js';

const restrictedAdmin = {
  isMasterAdmin: false,
  permissions: [
    'pos:view',
    'pos:transact',
    'pos:shift_access',
    'pos:attendance:view',
    'pos:attendance:operate'
  ],
  locationIds: [7]
};

describe('assigned POS branch operation access', () => {
  it('allows a non-master admin with effective operating permissions and a location grant', () => {
    expect(canOperateAssignedPosBranch({
      ...restrictedAdmin,
      locationId: 7,
      action: 'open'
    })).toBe(true);
    expect(canOperateAssignedPosBranch({
      ...restrictedAdmin,
      locationId: 7,
      action: 'resume'
    })).toBe(true);
  });

  it('requires a matching assigned location even when the action permissions are present', () => {
    expect(canOperateAssignedPosBranch({
      ...restrictedAdmin,
      locationId: 8,
      action: 'open'
    })).toBe(false);
    expect(canOperateAssignedPosBranch({
      ...restrictedAdmin,
      locationIds: [],
      locationId: 7,
      action: 'resume'
    })).toBe(false);
  });

  it('requires effective permission prerequisites for each action', () => {
    expect(canOperateAssignedPosBranch({
      isMasterAdmin: false,
      permissions: ['pos:transact'],
      locationIds: [7],
      locationId: 7,
      action: 'open'
    })).toBe(false);
    expect(canOperateAssignedPosBranch({
      isMasterAdmin: false,
      permissions: ['pos:view', 'pos:attendance:view'],
      locationIds: [7],
      locationId: 7,
      action: 'resume'
    })).toBe(false);
  });

  it('keeps read-only branch viewing separate from shift operation', () => {
    const branchViewer = {
      isMasterAdmin: false,
      permissions: ['pos:view', 'pos:branch_view'],
      locationIds: [7]
    };

    expect(canOperateAssignedPosBranch({
      ...branchViewer,
      locationId: 7,
      action: 'open'
    })).toBe(false);
    expect(canOperateAssignedPosBranch({
      ...branchViewer,
      locationId: 7,
      action: 'resume'
    })).toBe(false);
  });

  it('keeps the explicit tenant-wide master-admin authority', () => {
    const masterAdmin = { isMasterAdmin: true, permissions: [], locationIds: [] };

    expect(canOperateAssignedPosBranch({
      ...masterAdmin,
      locationId: 99,
      action: 'open'
    })).toBe(true);
    expect(canOperateAssignedPosBranch({
      ...masterAdmin,
      locationId: 99,
      action: 'resume'
    })).toBe(true);
  });

  it('rejects incomplete location data and unknown actions', () => {
    expect(hasPosBranchActionPermission({
      ...restrictedAdmin,
      action: 'switch'
    })).toBe(false);
    expect(canOperateAssignedPosBranch({
      ...restrictedAdmin,
      locationId: 0,
      action: 'open'
    })).toBe(false);
  });
});

import { isPermissionEffective } from '@sieitzz/shared-constants/permissionDependencies';

const BRANCH_ACTION_PERMISSIONS = Object.freeze({
  open: ['pos:view', 'pos:transact'],
  resume: ['pos:view', 'pos:attendance:view', 'pos:attendance:operate']
});

const normalizeLocationId = (value) => {
  const locationId = Number(value);
  return Number.isInteger(locationId) && locationId > 0 ? locationId : 0;
};

export const hasPosBranchActionPermission = ({
  permissions = [],
  isMasterAdmin = false,
  action
} = {}) => {
  const requiredPermissions = BRANCH_ACTION_PERMISSIONS[action];
  if (!requiredPermissions) return false;

  return requiredPermissions.every((permission) => (
    isPermissionEffective(permissions, permission, isMasterAdmin === true)
  ));
};

export const canOperateAssignedPosBranch = ({
  permissions = [],
  isMasterAdmin = false,
  locationIds = [],
  locationId,
  action
} = {}) => {
  const normalizedLocationId = normalizeLocationId(locationId);
  if (!normalizedLocationId) return false;

  const hasTenantWideLocationAuthority = isMasterAdmin === true;
  const hasExplicitLocationGrant = Array.isArray(locationIds)
    && locationIds.some((assignedLocationId) => (
      normalizeLocationId(assignedLocationId) === normalizedLocationId
    ));
  if (!hasTenantWideLocationAuthority && !hasExplicitLocationGrant) return false;

  return hasPosBranchActionPermission({ permissions, isMasterAdmin, action });
};

import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.js';
import { isPermissionEffective } from '@sieitzz/shared-constants/permissionDependencies';

export const PERMISSION_MODES = Object.freeze({
  INHERIT: 'inherit',
  CUSTOM: 'custom'
});

export const normalizePermissionMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === PERMISSION_MODES.CUSTOM
    ? PERMISSION_MODES.CUSTOM
    : PERMISSION_MODES.INHERIT;
};

export const normalizePermissionArray = (rawPermissions) => {
  let normalized = rawPermissions;

  if (typeof normalized === 'string') {
    try {
      normalized = JSON.parse(normalized);
    } catch {
      normalized = [];
    }
  }

  if (!Array.isArray(normalized)) {
    return [];
  }

  return Array.from(
    new Set(
      normalized
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
    )
  );
};

export const resolveEffectivePermissions = (user) => {
  const explicitPermissions = normalizePermissionArray(user?.permissions);

  const assignedStaffRoleId = user?.staff_role_id != null ? String(user.staff_role_id) : '';
  const hydratedStaffRoleId = user?.staffRole?.staff_role_id != null
    ? String(user.staffRole.staff_role_id)
    : '';
  const hasAssignedStaffRole = Boolean(assignedStaffRoleId || hydratedStaffRoleId);
  const staffRoleAssignmentMatches = !assignedStaffRoleId
    || (Boolean(hydratedStaffRoleId) && assignedStaffRoleId === hydratedStaffRoleId);
  const staffRoleActive = staffRoleAssignmentMatches && user?.staffRole?.is_active === true;

  // An assigned role is a revocable authority source. Do this before trusting
  // either legacy explicit permissions or the pre-resolved auth shortcut so a
  // deactivated, missing, or mismatched tenant role cannot retain stale grants.
  if (hasAssignedStaffRole && !staffRoleActive) return [];

  // authenticate() already resolves the database row before attaching req.user.
  // Treat that array as authoritative, including an intentional empty custom set;
  // resolving it a second time would silently restore role defaults.
  if (user?.permissions_resolved === true) {
    return explicitPermissions;
  }

  const staffRolePermissions = normalizePermissionArray(user?.staffRole?.capabilities);
  const role = String(user?.role || 'staff').trim().toLowerCase();

  // New rows have an explicit mode. `custom` is authoritative even when the
  // stored array is empty; `inherit` intentionally ignores the stored array.
  if (normalizePermissionMode(user?.permission_mode) === PERMISSION_MODES.CUSTOM) {
    return explicitPermissions.filter((permission) => (
      role === 'cashier' ? permission !== 'items:delete' : true
    ));
  }

  if (normalizePermissionMode(user?.permission_mode) === PERMISSION_MODES.INHERIT
    && user?.permission_mode !== undefined
    && user?.permission_mode !== null
    && String(user.permission_mode).trim() !== '') {
    if (staffRoleActive) return staffRolePermissions;
    if (hasAssignedStaffRole) return [];
    const inherited = DEFAULT_ROLE_PERMISSIONS[role];
    return Array.isArray(inherited) ? [...inherited] : [];
  }

  // A tenant-assigned staff role is its own explicit role system. The legacy cashier floor/ceiling
  // applies only when resolution falls through to the compatibility cashier role.
  if (explicitPermissions.length === 0 && staffRoleActive) {
    return staffRolePermissions;
  }

  // An assigned role is authoritative even for legacy rows that predate the explicit
  // permission_mode column. If the assignment cannot be hydrated or is inactive, fail closed
  // instead of restoring a broad legacy role preset.
  if (explicitPermissions.length === 0 && hasAssignedStaffRole && !staffRoleActive) return [];

  if (role === 'cashier') {
    const cashierPermissions = explicitPermissions.length > 0
      ? explicitPermissions
      : (DEFAULT_ROLE_PERMISSIONS.cashier || []);
    return Array.from(new Set(cashierPermissions))
      .filter((permission) => permission !== 'items:delete');
  }

  if (explicitPermissions.length > 0) return explicitPermissions;

  const defaults = DEFAULT_ROLE_PERMISSIONS[role];
  return Array.isArray(defaults) ? [...defaults] : [];
};

export const hasEffectivePermission = (user, permission) => (
  user?.is_master_admin === true
  || isPermissionEffective(resolveEffectivePermissions(user), permission)
);

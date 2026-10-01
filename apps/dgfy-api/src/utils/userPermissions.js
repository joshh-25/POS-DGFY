import { DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.js';

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
  const staffRolePermissions = normalizePermissionArray(user?.staffRole?.capabilities);
  const role = String(user?.role || 'staff').trim().toLowerCase();
  const hasAssignedStaffRole = user?.staffRole != null;
  const staffRoleActive = user?.staffRole?.is_active === true;

  // A tenant-assigned staff role is its own explicit role system. The legacy cashier floor/ceiling
  // applies only when resolution falls through to the compatibility cashier role.
  if (explicitPermissions.length === 0 && staffRoleActive) {
    return staffRolePermissions;
  }

  if (role === 'cashier') {
    // #1901: an assigned but inactive staff role must not restore the broad cashier preset,
    // including pos:transact. Preserve the view-only catalog defaults on this fallback.
    if (explicitPermissions.length === 0 && hasAssignedStaffRole && !staffRoleActive) {
      const viewOnlyDefaults = DEFAULT_ROLE_PERMISSIONS.staff || [];
      return Array.from(new Set(viewOnlyDefaults))
        .filter((permission) => permission !== 'items:delete');
    }

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
  || resolveEffectivePermissions(user).includes(permission)
);

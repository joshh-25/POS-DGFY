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
  if (explicitPermissions.length > 0) {
    return explicitPermissions;
  }

  const role = String(user?.role || 'staff').trim().toLowerCase();
  const defaults = DEFAULT_ROLE_PERMISSIONS[role];
  return Array.isArray(defaults) ? [...defaults] : [];
};

export const hasEffectivePermission = (user, permission) => (
  user?.is_master_admin === true
  || resolveEffectivePermissions(user).includes(permission)
);

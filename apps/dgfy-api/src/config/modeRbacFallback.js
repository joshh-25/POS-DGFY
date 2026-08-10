const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);

export const isModeRbacGenericFallbackEnabled = () => {
  const raw = String(process.env.MODE_RBAC_GENERIC_FALLBACK_ENABLED ?? 'true')
    .trim()
    .toLowerCase();

  return !DISABLED_VALUES.has(raw);
};

export const buildModePermissionRequirements = (primary, fallback = null) => {
  const permissions = [primary].filter(Boolean);
  if (fallback && isModeRbacGenericFallbackEnabled()) {
    permissions.push(fallback);
  }
  return permissions;
};

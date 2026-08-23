const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);

export const isModeRbacGenericFallbackEnabled = () => {
  const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const raw = String(process.env.MODE_RBAC_GENERIC_FALLBACK_ENABLED ?? (isProduction ? 'false' : 'true'))
    .trim()
    .toLowerCase();

  return !DISABLED_VALUES.has(raw);
};

export const buildModePermissionRequirements = (primary, fallback = null) => {
  const permissions = [primary].filter(Boolean);
  if (fallback && isModeRbacGenericFallbackEnabled()) {
    permissions.push(fallback);
    Object.defineProperty(permissions, '__modeRbacFallback', {
      value: Object.freeze({ primary, fallback }),
      enumerable: false,
      configurable: false,
      writable: false
    });
  }
  return permissions;
};

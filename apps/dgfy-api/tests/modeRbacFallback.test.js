import {
  buildModePermissionRequirements,
  isModeRbacGenericFallbackEnabled
} from '../src/config/modeRbacFallback.js';

describe('mode RBAC generic fallback switch', () => {
  const originalValue = process.env.MODE_RBAC_GENERIC_FALLBACK_ENABLED;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.MODE_RBAC_GENERIC_FALLBACK_ENABLED;
    } else {
      process.env.MODE_RBAC_GENERIC_FALLBACK_ENABLED = originalValue;
    }
  });

  it('keeps generic fallback enabled by default for compatibility', () => {
    delete process.env.MODE_RBAC_GENERIC_FALLBACK_ENABLED;

    expect(isModeRbacGenericFallbackEnabled()).toBe(true);
    expect(buildModePermissionRequirements('services:bookings:manage', 'pos:transact')).toEqual([
      'services:bookings:manage',
      'pos:transact'
    ]);
  });

  it.each(['false', '0', 'no', 'off'])('can disable generic fallback with %s', (value) => {
    process.env.MODE_RBAC_GENERIC_FALLBACK_ENABLED = value;

    expect(isModeRbacGenericFallbackEnabled()).toBe(false);
    expect(buildModePermissionRequirements('fnb:checks:manage', 'pos:transact')).toEqual([
      'fnb:checks:manage'
    ]);
  });
});

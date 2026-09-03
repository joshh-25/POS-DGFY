import {
  buildPermissionGroupsForMode,
  describeUserRolePreset,
  getModeRolePreset,
  getModeRoleCatalog,
  getRoleCatalogMode,
  getRolePresetsForMode,
  ROLE_CATALOG_VERSION
} from '../src/config/modeRolePresets.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/config/permissions.js';

describe('mode-aware role preset catalog', () => {
  it('normalizes workflow modes to the correct role catalog family', () => {
    expect(getRoleCatalogMode('services')).toBe('services');
    expect(getRoleCatalogMode('fnb')).toBe('fnb');
    expect(getRoleCatalogMode('hospitality')).toBe('hospitality');
    expect(getRoleCatalogMode('msme')).toBe('msme');
    // An unrecognized mode string (corrupted setting, decommissioned mode
    // name, typo) now resolves through the neutral msme fallback rather than
    // silently borrowing food_manufacturing's full production/inventory RBAC
    // catalog. See UNKNOWN_WORKFLOW_MODE_FALLBACK in @sieitzz/shared-constants.
    expect(getRoleCatalogMode('unknown-mode')).toBe('msme');
  });

  it('resolves Tier 2/3 modes with no bespoke RBAC contract to the generic preset family, not food_manufacturing', () => {
    ['retail', 'healthcare', 'ticketing_transport', 'logistics_distribution', 'education_institutions'].forEach((mode) => {
      expect(getRoleCatalogMode(mode)).toBe('generic');
    });

    const genericPresets = getRolePresetsForMode('retail').map((preset) => preset.key);
    expect(genericPresets).toEqual(expect.arrayContaining([
      'generic_admin',
      'generic_manager',
      'generic_cashier',
      'generic_inventory_clerk',
      'generic_viewer'
    ]));

    expect(buildPermissionGroupsForMode('healthcare').map((group) => group.key)).toEqual(
      expect.arrayContaining(['INVENTORY', 'POS', 'STOCK', 'REPORTS'])
    );
    expect(buildPermissionGroupsForMode('healthcare').map((group) => group.key)).not.toContain('ORDERS');
    expect(buildPermissionGroupsForMode('healthcare').map((group) => group.key)).not.toContain('DISPATCH');
    expect(buildPermissionGroupsForMode('healthcare').map((group) => group.key)).not.toContain('FNB');
  });

  it('exposes the required Services, F&B, and Hospitality presets with mode-native permissions', () => {
    const servicesPresets = getRolePresetsForMode('services').map((preset) => preset.key);
    expect(servicesPresets).toEqual(expect.arrayContaining([
      'services_admin',
      'services_manager',
      'services_provider',
      'services_scheduler',
      'services_front_desk_cashier',
      'services_inventory_clerk',
      'services_viewer'
    ]));

    const fnbPresets = getRolePresetsForMode('fnb').map((preset) => preset.key);
    expect(fnbPresets).toEqual(expect.arrayContaining([
      'fnb_admin',
      'fnb_restaurant_manager',
      'fnb_server',
      'fnb_cashier',
      'fnb_kitchen_staff',
      'fnb_host_reservations',
      'fnb_inventory_controller',
      'fnb_viewer'
    ]));

    const hospitalityPresets = getRolePresetsForMode('hospitality').map((preset) => preset.key);
    expect(hospitalityPresets).toEqual(expect.arrayContaining([
      'hospitality_admin',
      'hospitality_general_manager',
      'hospitality_front_desk_manager',
      'hospitality_front_desk_agent',
      'hospitality_housekeeping_manager',
      'hospitality_housekeeper',
      'hospitality_maintenance_staff',
      'hospitality_revenue_manager',
      'hospitality_finance_billing',
      'hospitality_concierge',
      'hospitality_viewer'
    ]));

    expect(getModeRolePreset('services_scheduler', 'services').permissions).toEqual(expect.arrayContaining([
      'services:bookings:manage',
      'services:waitlist:manage'
    ]));
    expect(getModeRolePreset('fnb_kitchen_staff', 'fnb').permissions).toEqual(expect.arrayContaining([
      'fnb:kitchen:view',
      'fnb:kitchen:manage'
    ]));
    expect(getModeRolePreset('hospitality_front_desk_agent', 'hospitality').permissions).toEqual(expect.arrayContaining([
      'hospitality:reservations:manage',
      'hospitality:folios:manage'
    ]));
    expect(getModeRolePreset('hospitality_housekeeper', 'hospitality').permissions).toEqual(expect.arrayContaining([
      'hospitality:housekeeping:view',
      'hospitality:housekeeping:manage'
    ]));
  });

  it('rejects presets that belong to a different active mode unless any-mode lookup is explicit', () => {
    expect(getModeRolePreset('fnb_server', 'services')).toBeNull();
    expect(getModeRolePreset('fnb_server', 'services', { allowAnyMode: true })).toMatchObject({
      key: 'fnb_server',
      mode: 'fnb'
    });
  });

  it('returns visible permission groups scoped to the active mode', () => {
    expect(buildPermissionGroupsForMode('services').map((group) => group.key)).toEqual(expect.arrayContaining(['SERVICES', 'POS']));
    expect(buildPermissionGroupsForMode('services').map((group) => group.key)).not.toContain('FNB');
    expect(buildPermissionGroupsForMode('fnb').map((group) => group.key)).toEqual(expect.arrayContaining(['FNB', 'POS']));
    expect(buildPermissionGroupsForMode('hospitality').map((group) => group.key)).toEqual(expect.arrayContaining(['HOSPITALITY', 'POS']));
    expect(buildPermissionGroupsForMode('hospitality').map((group) => group.key)).not.toContain('FNB');
    expect(buildPermissionGroupsForMode('hospitality').map((group) => group.key)).not.toContain('SERVICES');
  });

  it('marks users without a role preset as legacy and mismatched presets for review', () => {
    expect(describeUserRolePreset({ role: 'cashier' }, 'services')).toMatchObject({
      role_preset_key: null,
      role_preset_label: 'Legacy Cashier',
      role_preset_status: 'legacy'
    });
    expect(describeUserRolePreset({ role: 'cashier', role_preset_key: 'fnb_cashier' }, 'services')).toMatchObject({
      role_preset_label: 'Cashier',
      role_preset_status: 'mode_mismatch',
      role_preset_mode: 'fnb'
    });
  });

  it('returns a complete role catalog payload for the user-management API', () => {
    const catalog = getModeRoleCatalog('services');
    expect(catalog).toMatchObject({
      workflow_mode: 'services'
    });
    expect(catalog.presets.length).toBeGreaterThan(0);
    expect(catalog.permission_groups.length).toBeGreaterThan(0);
  });
  // #1493 (Phase 263): Accounting is a preset, not a `users.role` ENUM value, and voucher-campaign
  // management is restricted to Admin + Accounting. These tests pin both halves -- the preset
  // existing with the right shape, and `manager` no longer carrying `vouchers:manage`.
  describe('Accounting preset family and the Admin + Accounting voucher restriction (#1493)', () => {
    const MODE_TO_ACCOUNTING_PRESET = {
      msme: 'msme_accounting',
      retail: 'generic_accounting',
      food_manufacturing: 'food_manufacturing_accounting',
      services: 'services_accounting',
      fnb: 'fnb_accounting',
      hospitality: 'hospitality_accounting'
    };

    it('exposes exactly one Accounting preset in every mode family', () => {
      Object.entries(MODE_TO_ACCOUNTING_PRESET).forEach(([mode, expectedKey]) => {
        const accountingPresets = getRolePresetsForMode(mode).filter((preset) => preset.key.endsWith('_accounting'));
        expect(accountingPresets).toHaveLength(1);
        expect(accountingPresets[0].key).toBe(expectedKey);
      });
    });

    it('gives every Accounting preset the same shape: compatibility role manager, rank 5, tenant scope', () => {
      Object.entries(MODE_TO_ACCOUNTING_PRESET).forEach(([mode, key]) => {
        expect(getModeRolePreset(key, mode)).toMatchObject({
          key,
          label: 'Accounting',
          role: 'manager',
          rank: 5,
          location_scope: 'tenant'
        });
      });
    });

    it('grants Accounting voucher management plus reporting, and nothing else', () => {
      Object.entries(MODE_TO_ACCOUNTING_PRESET).forEach(([mode, key]) => {
        expect(getModeRolePreset(key, mode).permissions.sort()).toEqual([
          'reports:export',
          'reports:view',
          'vouchers:manage',
          'vouchers:view'
        ]);
      });
    });

    it('withdraws vouchers:manage from the manager role while keeping vouchers:view', () => {
      expect(DEFAULT_ROLE_PERMISSIONS.manager).not.toContain('vouchers:manage');
      expect(DEFAULT_ROLE_PERMISSIONS.manager).toContain('vouchers:view');
      // settings:edit is untouched on purpose -- routes/pricelists.js still accepts it, so
      // managers keep pricelist management. See ADR 0020's 2026-09-03 amendment.
      expect(DEFAULT_ROLE_PERMISSIONS.manager).toContain('settings:edit');
    });

    it('keeps vouchers:manage on admin, the other half of "Admin + Accounting"', () => {
      expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain('vouchers:manage');
      ['msme_admin', 'generic_admin', 'food_manufacturing_admin', 'services_admin', 'fnb_admin', 'hospitality_admin']
        .forEach((key) => {
          expect(getModeRolePreset(key, null, { allowAnyMode: true }).permissions).toContain('vouchers:manage');
        });
    });

    it('propagates the manager narrowing to food_manufacturing_manager, which inherits managerPermissions', () => {
      expect(getModeRolePreset('food_manufacturing_manager', 'food_manufacturing').permissions)
        .not.toContain('vouchers:manage');
    });

    it('leaves no non-admin, non-accounting preset holding vouchers:manage', () => {
      Object.keys(MODE_TO_ACCOUNTING_PRESET).forEach((mode) => {
        getRolePresetsForMode(mode)
          .filter((preset) => !preset.key.endsWith('_admin') && !preset.key.endsWith('_accounting'))
          .forEach((preset) => {
            expect(preset.permissions).not.toContain('vouchers:manage');
          });
      });
    });

    it('bumps ROLE_CATALOG_VERSION so cached clients refetch the new catalog', () => {
      expect(ROLE_CATALOG_VERSION).toBe('2026-09-03.mode-aware-rbac-v4');
    });
  });
});

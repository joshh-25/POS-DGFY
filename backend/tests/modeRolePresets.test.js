import {
  buildPermissionGroupsForMode,
  describeUserRolePreset,
  getModeRolePreset,
  getModeRoleCatalog,
  getRoleCatalogMode,
  getRolePresetsForMode
} from '../src/config/modeRolePresets.js';

describe('mode-aware role preset catalog', () => {
  it('normalizes workflow modes to the correct role catalog family', () => {
    expect(getRoleCatalogMode('services')).toBe('services');
    expect(getRoleCatalogMode('fnb')).toBe('fnb');
    expect(getRoleCatalogMode('hospitality')).toBe('hospitality');
    expect(getRoleCatalogMode('msme')).toBe('msme');
    expect(getRoleCatalogMode('unknown-mode')).toBe('food_manufacturing');
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
});

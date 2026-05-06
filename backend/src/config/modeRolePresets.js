import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, getAllPermissions } from './permissions.js';
import {
  DEFAULT_WORKFLOW_MODE,
  normalizeWorkflowMode,
  resolveWorkflowModeFamily
} from '../modules/shared/constants/workflowModes.js';

const uniq = (permissions = []) => Array.from(new Set(permissions.filter(Boolean)));

const shared = {
  inventoryView: [
    PERMISSIONS.INVENTORY.actions.VIEW_ITEMS,
    PERMISSIONS.SUPPLIERS.actions.VIEW_SUPPLIERS,
    PERMISSIONS.STOCK.actions.VIEW_MOVEMENTS,
    PERMISSIONS.STOCK.actions.VIEW_BATCHES
  ],
  inventoryManage: [
    ...Object.values(PERMISSIONS.INVENTORY.actions),
    ...Object.values(PERMISSIONS.SUPPLIERS.actions),
    ...Object.values(PERMISSIONS.STOCK.actions)
  ],
  posCashier: [
    PERMISSIONS.POS.actions.VIEW_POS,
    PERMISSIONS.POS.actions.TRANSACT_POS,
    PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER,
    PERMISSIONS.POS.actions.CLOSE_DAY_POS,
    PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT
  ],
  reportsView: [
    PERMISSIONS.REPORTS.actions.VIEW_REPORTS
  ],
  systemView: [
    PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS
  ],
  userAdmin: [
    PERMISSIONS.SYSTEM.actions.VIEW_USERS,
    PERMISSIONS.SYSTEM.actions.MANAGE_USERS,
    PERMISSIONS.SYSTEM.actions.DELETE_USERS
  ]
};

const services = PERMISSIONS.SERVICES.actions;
const fnb = PERMISSIONS.FNB.actions;

const preset = ({
  key,
  label,
  mode,
  role = 'staff',
  rank = 3,
  locationScope = 'assigned',
  permissions = []
}) => ({
  key,
  label,
  mode,
  role,
  rank,
  location_scope: locationScope,
  permissions: uniq(permissions)
});

const adminPreset = (key, label, mode) => preset({
  key,
  label,
  mode,
  role: 'admin',
  rank: 7,
  locationScope: 'tenant',
  permissions: getAllPermissions()
});

const managerPermissions = uniq(DEFAULT_ROLE_PERMISSIONS.manager);

const MODE_ROLE_PRESETS = Object.freeze({
  msme: [
    adminPreset('msme_admin', 'Owner / Admin', 'msme'),
    preset({
      key: 'msme_manager',
      label: 'Manager',
      mode: 'msme',
      role: 'manager',
      rank: 6,
      locationScope: 'tenant',
      permissions: [
        ...shared.inventoryManage,
        ...shared.posCashier,
        PERMISSIONS.POS.actions.PRICE_OVERRIDE_POS,
        PERMISSIONS.REPORTS.actions.VIEW_REPORTS,
        PERMISSIONS.REPORTS.actions.EXPORT_REPORTS,
        ...shared.systemView
      ]
    }),
    preset({
      key: 'msme_cashier',
      label: 'Cashier',
      mode: 'msme',
      role: 'cashier',
      rank: 4,
      permissions: DEFAULT_ROLE_PERMISSIONS.cashier
    }),
    preset({
      key: 'msme_inventory_clerk',
      label: 'Inventory Clerk',
      mode: 'msme',
      role: 'staff',
      rank: 3,
      permissions: [
        ...shared.inventoryView,
        PERMISSIONS.INVENTORY.actions.CREATE_ITEMS,
        PERMISSIONS.INVENTORY.actions.EDIT_ITEMS,
        PERMISSIONS.STOCK.actions.CREATE_ADJUSTMENT
      ]
    }),
    preset({
      key: 'msme_viewer',
      label: 'Viewer',
      mode: 'msme',
      role: 'staff',
      rank: 3,
      permissions: [
        ...shared.inventoryView,
        ...shared.reportsView
      ]
    })
  ],
  food_manufacturing: [
    adminPreset('food_manufacturing_admin', 'Food Manufacturing Admin', 'food_manufacturing'),
    preset({
      key: 'food_manufacturing_manager',
      label: 'Food Manufacturing Manager',
      mode: 'food_manufacturing',
      role: 'manager',
      rank: 6,
      locationScope: 'tenant',
      permissions: managerPermissions
    }),
    preset({
      key: 'food_manufacturing_purchase_officer',
      label: 'Purchase Officer',
      mode: 'food_manufacturing',
      role: 'po',
      rank: 5,
      permissions: DEFAULT_ROLE_PERMISSIONS.po
    }),
    preset({
      key: 'food_manufacturing_production_lead',
      label: 'Production Lead',
      mode: 'food_manufacturing',
      role: 'jo',
      rank: 5,
      permissions: DEFAULT_ROLE_PERMISSIONS.jo
    }),
    preset({
      key: 'food_manufacturing_dispatch_officer',
      label: 'Dispatch Officer',
      mode: 'food_manufacturing',
      role: 'do',
      rank: 5,
      permissions: DEFAULT_ROLE_PERMISSIONS.do
    }),
    preset({
      key: 'food_manufacturing_cashier',
      label: 'Cashier',
      mode: 'food_manufacturing',
      role: 'cashier',
      rank: 4,
      permissions: DEFAULT_ROLE_PERMISSIONS.cashier
    }),
    preset({
      key: 'food_manufacturing_inventory_controller',
      label: 'Inventory Controller',
      mode: 'food_manufacturing',
      role: 'staff',
      rank: 4,
      permissions: [
        ...shared.inventoryManage,
        ...shared.reportsView
      ]
    }),
    preset({
      key: 'food_manufacturing_viewer',
      label: 'Viewer',
      mode: 'food_manufacturing',
      role: 'staff',
      rank: 3,
      permissions: DEFAULT_ROLE_PERMISSIONS.staff
    })
  ],
  services: [
    adminPreset('services_admin', 'Services Admin', 'services'),
    preset({
      key: 'services_manager',
      label: 'Services Manager',
      mode: 'services',
      role: 'manager',
      rank: 6,
      locationScope: 'tenant',
      permissions: [
        ...shared.inventoryManage,
        ...shared.posCashier,
        PERMISSIONS.POS.actions.PRICE_OVERRIDE_POS,
        ...Object.values(services),
        PERMISSIONS.REPORTS.actions.VIEW_REPORTS,
        PERMISSIONS.REPORTS.actions.EXPORT_REPORTS,
        ...shared.systemView
      ]
    }),
    preset({
      key: 'services_provider',
      label: 'Provider',
      mode: 'services',
      role: 'staff',
      rank: 4,
      permissions: [
        services.VIEW_DASHBOARD,
        services.VIEW_CATALOG,
        services.VIEW_RESOURCES,
        services.VIEW_BOOKINGS,
        services.MANAGE_BOOKINGS,
        services.VIEW_WAITLIST,
        services.VIEW_CLIENTS,
        PERMISSIONS.POS.actions.VIEW_POS
      ]
    }),
    preset({
      key: 'services_scheduler',
      label: 'Scheduler',
      mode: 'services',
      role: 'staff',
      rank: 4,
      permissions: [
        services.VIEW_DASHBOARD,
        services.VIEW_CATALOG,
        services.VIEW_RESOURCES,
        services.VIEW_BOOKINGS,
        services.MANAGE_BOOKINGS,
        services.VIEW_WAITLIST,
        services.MANAGE_WAITLIST,
        services.VIEW_CLIENTS,
        services.VIEW_REMINDERS
      ]
    }),
    preset({
      key: 'services_front_desk_cashier',
      label: 'Front Desk / Cashier',
      mode: 'services',
      role: 'cashier',
      rank: 4,
      permissions: [
        ...shared.posCashier,
        services.VIEW_DASHBOARD,
        services.VIEW_CATALOG,
        services.VIEW_BOOKINGS,
        services.MANAGE_BOOKINGS,
        services.VIEW_WAITLIST,
        services.MANAGE_WAITLIST
      ]
    }),
    preset({
      key: 'services_inventory_clerk',
      label: 'Inventory Clerk',
      mode: 'services',
      role: 'staff',
      rank: 3,
      permissions: [
        ...shared.inventoryView,
        PERMISSIONS.INVENTORY.actions.CREATE_ITEMS,
        PERMISSIONS.INVENTORY.actions.EDIT_ITEMS,
        PERMISSIONS.STOCK.actions.CREATE_ADJUSTMENT
      ]
    }),
    preset({
      key: 'services_viewer',
      label: 'Viewer',
      mode: 'services',
      role: 'staff',
      rank: 3,
      permissions: [
        services.VIEW_DASHBOARD,
        services.VIEW_CATALOG,
        services.VIEW_RESOURCES,
        services.VIEW_BOOKINGS,
        services.VIEW_WAITLIST,
        services.VIEW_CLIENTS,
        ...shared.reportsView
      ]
    })
  ],
  fnb: [
    adminPreset('fnb_admin', 'F&B Admin', 'fnb'),
    preset({
      key: 'fnb_restaurant_manager',
      label: 'Restaurant Manager',
      mode: 'fnb',
      role: 'manager',
      rank: 6,
      locationScope: 'tenant',
      permissions: [
        ...shared.inventoryManage,
        ...shared.posCashier,
        PERMISSIONS.POS.actions.PRICE_OVERRIDE_POS,
        ...Object.values(fnb),
        PERMISSIONS.REPORTS.actions.VIEW_REPORTS,
        PERMISSIONS.REPORTS.actions.EXPORT_REPORTS,
        ...shared.systemView
      ]
    }),
    preset({
      key: 'fnb_server',
      label: 'Server',
      mode: 'fnb',
      role: 'cashier',
      rank: 4,
      permissions: [
        fnb.VIEW_DASHBOARD,
        fnb.VIEW_MENU,
        fnb.VIEW_DINING,
        fnb.MANAGE_DINING,
        fnb.VIEW_CHECKS,
        fnb.MANAGE_CHECKS,
        PERMISSIONS.POS.actions.VIEW_POS,
        PERMISSIONS.POS.actions.TRANSACT_POS
      ]
    }),
    preset({
      key: 'fnb_cashier',
      label: 'Cashier',
      mode: 'fnb',
      role: 'cashier',
      rank: 4,
      permissions: [
        ...shared.posCashier,
        fnb.VIEW_DASHBOARD,
        fnb.VIEW_MENU,
        fnb.VIEW_DINING,
        fnb.VIEW_CHECKS,
        fnb.MANAGE_CHECKS
      ]
    }),
    preset({
      key: 'fnb_kitchen_staff',
      label: 'Kitchen Staff',
      mode: 'fnb',
      role: 'staff',
      rank: 3,
      permissions: [
        fnb.VIEW_DASHBOARD,
        fnb.VIEW_MENU,
        fnb.VIEW_KITCHEN,
        fnb.MANAGE_KITCHEN
      ]
    }),
    preset({
      key: 'fnb_host_reservations',
      label: 'Host / Reservations',
      mode: 'fnb',
      role: 'staff',
      rank: 3,
      permissions: [
        fnb.VIEW_DASHBOARD,
        fnb.VIEW_DINING,
        fnb.VIEW_RESERVATIONS,
        fnb.MANAGE_RESERVATIONS,
        fnb.VIEW_CHECKS
      ]
    }),
    preset({
      key: 'fnb_inventory_controller',
      label: 'Inventory Controller',
      mode: 'fnb',
      role: 'staff',
      rank: 4,
      permissions: [
        ...shared.inventoryManage,
        fnb.VIEW_MENU,
        fnb.MANAGE_MENU,
        fnb.VIEW_KITCHEN
      ]
    }),
    preset({
      key: 'fnb_viewer',
      label: 'Viewer',
      mode: 'fnb',
      role: 'staff',
      rank: 3,
      permissions: [
        fnb.VIEW_DASHBOARD,
        fnb.VIEW_MENU,
        fnb.VIEW_DINING,
        fnb.VIEW_KITCHEN,
        fnb.VIEW_CHECKS,
        fnb.VIEW_RESERVATIONS,
        ...shared.reportsView
      ]
    })
  ]
});

const PERMISSION_GROUP_VISIBILITY = Object.freeze({
  msme: ['INVENTORY', 'SUPPLIERS', 'POS', 'STOCK', 'REPORTS', 'AI', 'SYSTEM'],
  food_manufacturing: ['INVENTORY', 'SUPPLIERS', 'ORDERS', 'DISPATCH', 'POS', 'STOCK', 'REPORTS', 'AI', 'SYSTEM'],
  services: ['INVENTORY', 'SUPPLIERS', 'SERVICES', 'POS', 'STOCK', 'REPORTS', 'AI', 'SYSTEM'],
  fnb: ['INVENTORY', 'SUPPLIERS', 'FNB', 'POS', 'STOCK', 'REPORTS', 'AI', 'SYSTEM']
});

export const ROLE_CATALOG_VERSION = '2026-05-06.mode-aware-rbac-v1';

export const getRoleCatalogMode = (mode) => {
  const normalized = normalizeWorkflowMode(mode || DEFAULT_WORKFLOW_MODE);
  const family = resolveWorkflowModeFamily(normalized);
  return MODE_ROLE_PRESETS[family] ? family : 'food_manufacturing';
};

export const getRolePresetsForMode = (mode) => MODE_ROLE_PRESETS[getRoleCatalogMode(mode)].map((entry) => ({
  ...entry,
  permissions: [...entry.permissions]
}));

export const getModeRolePreset = (rolePresetKey, mode = null, { allowAnyMode = false } = {}) => {
  const normalizedKey = String(rolePresetKey || '').trim();
  if (!normalizedKey) return null;

  const modes = allowAnyMode ? Object.keys(MODE_ROLE_PRESETS) : [getRoleCatalogMode(mode)];
  for (const modeKey of modes) {
    const found = MODE_ROLE_PRESETS[modeKey].find((entry) => entry.key === normalizedKey);
    if (found) {
      return {
        ...found,
        permissions: [...found.permissions]
      };
    }
  }
  return null;
};

export const buildPermissionGroupsForMode = (mode) => {
  const modeKey = getRoleCatalogMode(mode);
  const groupKeys = PERMISSION_GROUP_VISIBILITY[modeKey] || PERMISSION_GROUP_VISIBILITY.food_manufacturing;
  return groupKeys.map((groupKey) => ({
    key: groupKey,
    label: PERMISSIONS[groupKey].label,
    permissions: { ...PERMISSIONS[groupKey].actions }
  }));
};

export const getModeRoleCatalog = (mode) => {
  const modeKey = getRoleCatalogMode(mode);
  return {
    version: ROLE_CATALOG_VERSION,
    workflow_mode: modeKey,
    presets: getRolePresetsForMode(modeKey),
    permission_groups: buildPermissionGroupsForMode(modeKey)
  };
};

export const describeUserRolePreset = (user, mode) => {
  const activeMode = getRoleCatalogMode(mode);
  const rolePresetKey = String(user?.role_preset_key || '').trim();

  if (!rolePresetKey) {
    const role = String(user?.role || 'staff').trim().toLowerCase();
    const label = role ? `Legacy ${role.replace(/_/g, ' ')}` : 'Legacy role';
    return {
      role_preset_key: null,
      role_preset_label: label.replace(/\b\w/g, (char) => char.toUpperCase()),
      role_preset_status: 'legacy',
      role_preset_mode: null
    };
  }

  const activePreset = getModeRolePreset(rolePresetKey, activeMode);
  if (activePreset) {
    return {
      role_preset_key: activePreset.key,
      role_preset_label: activePreset.label,
      role_preset_status: 'current',
      role_preset_mode: activePreset.mode
    };
  }

  const anyPreset = getModeRolePreset(rolePresetKey, null, { allowAnyMode: true });
  if (anyPreset) {
    return {
      role_preset_key: anyPreset.key,
      role_preset_label: anyPreset.label,
      role_preset_status: 'mode_mismatch',
      role_preset_mode: anyPreset.mode
    };
  }

  return {
    role_preset_key: rolePresetKey,
    role_preset_label: 'Unknown Role Preset',
    role_preset_status: 'unknown',
    role_preset_mode: null
  };
};

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
const hospitality = PERMISSIONS.HOSPITALITY.actions;

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
        PERMISSIONS.POS.actions.OVERRIDE_DELIVERY_FEE,
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
  // Tier 2/3 modes with no bespoke RBAC contract yet (retail, healthcare,
  // ticketing_transport, logistics_distribution, education_institutions)
  // resolve here instead of silently borrowing food_manufacturing's
  // production-flavored role catalog. Deliberately mirrors msme's shape
  // (the platform's other vertical-agnostic tier) but kept as its own
  // catalog identity so a mode's role_preset_mode reads "generic", not
  // "msme", and so msme's own evolution doesn't drag these modes along.
  generic: [
    adminPreset('generic_admin', 'Owner / Admin', 'generic'),
    preset({
      key: 'generic_manager',
      label: 'Manager',
      mode: 'generic',
      role: 'manager',
      rank: 6,
      locationScope: 'tenant',
      permissions: [
        ...shared.inventoryManage,
        ...shared.posCashier,
        PERMISSIONS.POS.actions.PRICE_OVERRIDE_POS,
        PERMISSIONS.POS.actions.OVERRIDE_DELIVERY_FEE,
        PERMISSIONS.REPORTS.actions.VIEW_REPORTS,
        PERMISSIONS.REPORTS.actions.EXPORT_REPORTS,
        ...shared.systemView
      ]
    }),
    preset({
      key: 'generic_cashier',
      label: 'Cashier',
      mode: 'generic',
      role: 'cashier',
      rank: 4,
      permissions: DEFAULT_ROLE_PERMISSIONS.cashier
    }),
    preset({
      key: 'generic_inventory_clerk',
      label: 'Inventory Clerk',
      mode: 'generic',
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
      key: 'generic_viewer',
      label: 'Viewer',
      mode: 'generic',
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
        PERMISSIONS.POS.actions.OVERRIDE_DELIVERY_FEE,
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
        PERMISSIONS.POS.actions.OVERRIDE_DELIVERY_FEE,
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
  ],
  hospitality: [
    adminPreset('hospitality_admin', 'Hospitality Admin', 'hospitality'),
    preset({
      key: 'hospitality_general_manager',
      label: 'General Manager',
      mode: 'hospitality',
      role: 'manager',
      rank: 6,
      locationScope: 'tenant',
      permissions: [
        ...shared.inventoryManage,
        ...shared.posCashier,
        PERMISSIONS.POS.actions.PRICE_OVERRIDE_POS,
        PERMISSIONS.POS.actions.OVERRIDE_DELIVERY_FEE,
        ...Object.values(hospitality),
        PERMISSIONS.REPORTS.actions.VIEW_REPORTS,
        PERMISSIONS.REPORTS.actions.EXPORT_REPORTS,
        ...shared.systemView
      ]
    }),
    preset({
      key: 'hospitality_front_desk_manager',
      label: 'Front Desk Manager',
      mode: 'hospitality',
      role: 'manager',
      rank: 5,
      permissions: [
        hospitality.VIEW_DASHBOARD,
        hospitality.VIEW_RESERVATIONS,
        hospitality.MANAGE_RESERVATIONS,
        hospitality.VIEW_ROOMS,
        hospitality.MANAGE_ROOMS,
        hospitality.VIEW_GUESTS,
        hospitality.MANAGE_GUESTS,
        hospitality.VIEW_FOLIOS,
        hospitality.MANAGE_FOLIOS,
        ...shared.posCashier
      ]
    }),
    preset({
      key: 'hospitality_front_desk_agent',
      label: 'Front Desk Agent',
      mode: 'hospitality',
      role: 'cashier',
      rank: 4,
      permissions: [
        hospitality.VIEW_DASHBOARD,
        hospitality.VIEW_RESERVATIONS,
        hospitality.MANAGE_RESERVATIONS,
        hospitality.VIEW_ROOMS,
        hospitality.VIEW_GUESTS,
        hospitality.MANAGE_GUESTS,
        hospitality.VIEW_FOLIOS,
        hospitality.MANAGE_FOLIOS,
        PERMISSIONS.POS.actions.VIEW_POS,
        PERMISSIONS.POS.actions.TRANSACT_POS,
        PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT
      ]
    }),
    preset({
      key: 'hospitality_housekeeping_manager',
      label: 'Housekeeping Manager',
      mode: 'hospitality',
      role: 'manager',
      rank: 5,
      permissions: [
        hospitality.VIEW_DASHBOARD,
        hospitality.VIEW_ROOMS,
        hospitality.VIEW_HOUSEKEEPING,
        hospitality.MANAGE_HOUSEKEEPING,
        hospitality.VIEW_MAINTENANCE,
        hospitality.VIEW_AMENITIES,
        ...shared.inventoryView
      ]
    }),
    preset({
      key: 'hospitality_housekeeper',
      label: 'Housekeeper',
      mode: 'hospitality',
      role: 'staff',
      rank: 3,
      permissions: [
        hospitality.VIEW_ROOMS,
        hospitality.VIEW_HOUSEKEEPING,
        hospitality.MANAGE_HOUSEKEEPING
      ]
    }),
    preset({
      key: 'hospitality_maintenance_staff',
      label: 'Maintenance Staff',
      mode: 'hospitality',
      role: 'staff',
      rank: 3,
      permissions: [
        hospitality.VIEW_ROOMS,
        hospitality.VIEW_MAINTENANCE,
        hospitality.MANAGE_MAINTENANCE
      ]
    }),
    preset({
      key: 'hospitality_revenue_manager',
      label: 'Revenue Manager',
      mode: 'hospitality',
      role: 'manager',
      rank: 5,
      locationScope: 'tenant',
      permissions: [
        hospitality.VIEW_DASHBOARD,
        hospitality.VIEW_RESERVATIONS,
        hospitality.VIEW_RATES,
        hospitality.MANAGE_RATES,
        hospitality.VIEW_REPORTS,
        PERMISSIONS.REPORTS.actions.VIEW_REPORTS,
        PERMISSIONS.REPORTS.actions.EXPORT_REPORTS
      ]
    }),
    preset({
      key: 'hospitality_finance_billing',
      label: 'Finance / Billing',
      mode: 'hospitality',
      role: 'manager',
      rank: 5,
      permissions: [
        hospitality.VIEW_DASHBOARD,
        hospitality.VIEW_RESERVATIONS,
        hospitality.VIEW_GUESTS,
        hospitality.VIEW_FOLIOS,
        hospitality.MANAGE_FOLIOS,
        hospitality.VIEW_REPORTS,
        PERMISSIONS.REPORTS.actions.VIEW_REPORTS,
        PERMISSIONS.REPORTS.actions.EXPORT_REPORTS
      ]
    }),
    preset({
      key: 'hospitality_concierge',
      label: 'Concierge / Guest Services',
      mode: 'hospitality',
      role: 'staff',
      rank: 3,
      permissions: [
        hospitality.VIEW_DASHBOARD,
        hospitality.VIEW_RESERVATIONS,
        hospitality.VIEW_GUESTS,
        hospitality.MANAGE_GUESTS,
        hospitality.VIEW_AMENITIES,
        hospitality.VIEW_FACILITIES,
        hospitality.MANAGE_FACILITIES
      ]
    }),
    preset({
      key: 'hospitality_viewer',
      label: 'Viewer',
      mode: 'hospitality',
      role: 'staff',
      rank: 3,
      permissions: [
        hospitality.VIEW_DASHBOARD,
        hospitality.VIEW_RESERVATIONS,
        hospitality.VIEW_ROOMS,
        hospitality.VIEW_GUESTS,
        hospitality.VIEW_HOUSEKEEPING,
        hospitality.VIEW_MAINTENANCE,
        hospitality.VIEW_FOLIOS,
        hospitality.VIEW_RATES,
        hospitality.VIEW_AMENITIES,
        hospitality.VIEW_FACILITIES,
        ...shared.reportsView
      ]
    })
  ]
});

// VOUCHERS (#655) is listed alongside SYSTEM in every mode -- vouchers, like tenant settings, are a
// general merchant-admin capability, not mode-specific the way FNB/HOSPITALITY/SERVICES are.
const PERMISSION_GROUP_VISIBILITY = Object.freeze({
  msme: ['INVENTORY', 'SUPPLIERS', 'POS', 'STOCK', 'REPORTS', 'AI', 'SYSTEM', 'VOUCHERS'],
  generic: ['INVENTORY', 'SUPPLIERS', 'POS', 'STOCK', 'REPORTS', 'AI', 'SYSTEM', 'VOUCHERS'],
  food_manufacturing: ['INVENTORY', 'SUPPLIERS', 'ORDERS', 'DISPATCH', 'POS', 'STOCK', 'REPORTS', 'AI', 'SYSTEM', 'VOUCHERS'],
  services: ['INVENTORY', 'SUPPLIERS', 'SERVICES', 'POS', 'STOCK', 'REPORTS', 'AI', 'SYSTEM', 'VOUCHERS'],
  fnb: ['INVENTORY', 'SUPPLIERS', 'FNB', 'POS', 'STOCK', 'REPORTS', 'AI', 'SYSTEM', 'VOUCHERS'],
  hospitality: ['INVENTORY', 'SUPPLIERS', 'HOSPITALITY', 'POS', 'STOCK', 'REPORTS', 'AI', 'SYSTEM', 'VOUCHERS']
});

// Bumped for #655: PERMISSION_GROUP_VISIBILITY gained a VOUCHERS entry in every mode, so a client
// that cached the previous catalog by version needs to know to refetch.
export const ROLE_CATALOG_VERSION = '2026-05-19.mode-aware-rbac-v3';

export const getRoleCatalogMode = (mode) => {
  const normalized = normalizeWorkflowMode(mode || DEFAULT_WORKFLOW_MODE);
  const family = resolveWorkflowModeFamily(normalized);
  return MODE_ROLE_PRESETS[family] ? family : 'generic';
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
  const groupKeys = PERMISSION_GROUP_VISIBILITY[modeKey] || PERMISSION_GROUP_VISIBILITY.generic;
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

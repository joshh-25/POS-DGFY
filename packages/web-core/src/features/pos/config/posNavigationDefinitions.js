/**
 * Canonical POS navigation and permission-editor registry.
 *
 * Navigation is a discoverability concern; API authorization remains the source
 * of truth.  The registry deliberately records whether a destination has a
 * dedicated grant, shares a grant with another destination, is a composite
 * surface, or is governed by a role/capability gate.  Consumers must not turn
 * a navigation-only or composite entry into a fake parent permission.
 */

const freezeGroups = (groups = []) => Object.freeze(groups.map((group) => Object.freeze({
  ...group,
  permissions: Object.freeze([...(group.permissions || [])])
})));

const defineNavigation = (definition) => Object.freeze({
  ...definition,
  permissionGroups: freezeGroups(definition.permissionGroups),
  navIds: Object.freeze([...(definition.navIds || [definition.id])])
});

const SELL = defineNavigation({
  id: 'sell',
  label: 'Sell',
  viewMode: 'checkout',
  iconKey: 'ShoppingCart',
  accessModel: 'dedicated',
  accessPermission: 'pos:transact',
  permissionGroups: [
    {
      id: 'sell-pricing',
      label: 'Pricing & Discounts',
      description: 'Control pricing and discount options.',
      permissions: ['pos:discount_authorize', 'pos:price_override', 'pos:delivery_fee_override']
    },
    {
      id: 'sell-credit',
      label: 'Employee Credit',
      description: 'Use employee credit during a sale.',
      permissions: ['pos:employee_credit:use']
    }
  ]
});

const HISTORY_AND_ORDERS = defineNavigation({
  id: 'history-orders',
  navIds: ['history', 'orders'],
  navLabels: { history: 'History', orders: 'Orders' },
  label: 'History & Orders',
  description: 'History and incoming orders share the POS view grant.',
  viewMode: 'history',
  iconKey: 'ClipboardList',
  accessModel: 'shared',
  sharedPermissionLabel: 'POS view access is shared by History and Orders.',
  permissionGroups: [
    {
      id: 'history-orders-access',
      label: 'History & Orders access',
      description: 'This shared grant controls both destinations; branch and workflow gates still apply.',
      permissions: [
        'pos:view',
        'pos:branch_view',
        'pos:delivery_run_variance_resolve',
        'pos:reprint',
        'pos:void',
        'pos:refund'
      ]
    }
  ]
});

const SHIFT = defineNavigation({
  id: 'shift',
  label: 'Shift',
  description: 'Manage shifts, locations, cash, attendance, and terminal operations.',
  viewMode: 'shift_controls',
  iconKey: 'ListChecks',
  accessModel: 'composite',
  accessDescription: 'Access based on enabled shift actions; there is no separate Shift master toggle.',
  permissionGroups: [
    {
      id: 'shift-controls',
      label: 'Shift & Cash',
      description: 'The policy parent and cash/shift operations are individual guarded actions.',
      permissions: [
        'pos:shift_access',
        'pos:shift_close',
        'pos:close_day',
        'pos:cash_drawer_adjust',
        'pos:shift_force_close',
        'pos:switch_location'
      ]
    },
    {
      id: 'shift-operations',
      label: 'Terminal Operations',
      description: 'Manage fiscal, e-sales, attendance, and employee operations.',
      permissions: [
        'pos:fiscal_terminals:manage',
        'pos:esales:manage',
        'pos:employees:manage',
        'pos:attendance:view',
        'pos:attendance:operate',
        'pos:attendance:manage',
        'pos:employee_credit:manage',
        'pos:employee_credit:report'
      ]
    }
  ]
});

const ITEMS = defineNavigation({
  id: 'items',
  label: 'Items',
  description: 'Manage the item catalog and category actions.',
  viewMode: 'items',
  iconKey: 'ClipboardList',
  accessModel: 'dedicated',
  accessPermission: 'items:view',
  permissionGroups: [
    {
      id: 'items-management',
      label: 'Inventory Management',
      description: 'Control item and category actions available from the Items workspace.',
      permissions: ['items:create', 'items:edit', 'items:delete', 'items:export', 'items:import', 'categories:manage']
    }
  ]
});

const REPORTS = defineNavigation({
  id: 'reports',
  label: 'Report',
  description: 'View and export business reports.',
  viewMode: 'reports',
  iconKey: 'BarChart3',
  accessModel: 'dedicated',
  accessPermission: 'reports:view',
  permissionGroups: [
    {
      id: 'reports-analytics',
      label: 'Reports & Analytics',
      description: 'Control report export access.',
      permissions: ['reports:export']
    }
  ]
});

const SERVICES = defineNavigation({
  id: 'services',
  label: 'Services',
  description: 'Service access is projected by the API from workflow capability and effective grants.',
  viewMode: 'services',
  iconKey: 'CalendarCheck',
  accessModel: 'server_capability',
  accessDescription: 'The API decides service access; the UI does not infer it from POS or inventory grants.',
  permissionGroups: [
    {
      id: 'services-dashboard',
      label: 'Service access',
      description: 'Direct service grants and approved non-production fallback grants are evaluated by the API.',
      permissions: ['services:dashboard:view']
    },
    {
      id: 'services-catalog',
      label: 'Service Catalog',
      description: 'Control service catalog access and authoring.',
      permissions: ['services:catalog:view', 'services:catalog:manage']
    },
    {
      id: 'services-operations',
      label: 'Service Operations',
      description: 'Control bookings, waitlists, resources, clients, and reminders.',
      permissions: [
        'services:resources:view',
        'services:resources:manage',
        'services:bookings:view',
        'services:bookings:manage',
        'services:waitlist:view',
        'services:waitlist:manage',
        'services:clients:view',
        'services:reminders:view',
        'services:reminders:manage'
      ]
    }
  ]
});

const VOUCHERS_AND_PRICELISTS = defineNavigation({
  id: 'vouchers-pricelists',
  navIds: ['vouchers', 'pricelists'],
  navLabels: { vouchers: 'Vouchers', pricelists: 'Pricelists' },
  label: 'Vouchers & Pricelists',
  description: 'These POS destinations intentionally share the voucher view grant.',
  viewMode: 'settings_vouchers',
  iconKey: 'Ticket',
  accessModel: 'shared',
  sharedPermissionLabel: 'Vouchers and Pricelists share vouchers:view; management remains destination-specific on the API.',
  permissionGroups: [
    {
      id: 'voucher-controls',
      label: 'Vouchers & Pricelists access',
      description: 'View is shared; voucher and pricelist management are enforced by their respective APIs.',
      permissions: ['vouchers:view', 'vouchers:manage']
    }
  ]
});

const AFFILIATES = defineNavigation({
  id: 'affiliates',
  label: 'Affiliates',
  description: 'View and manage affiliate workflows.',
  viewMode: 'settings_affiliates',
  iconKey: 'Briefcase',
  accessModel: 'dedicated',
  accessPermission: 'affiliates:view',
  permissionGroups: [
    {
      id: 'affiliate-controls',
      label: 'Affiliate Operations',
      description: 'Control affiliate settings and cashouts.',
      permissions: ['affiliates:manage', 'affiliates:settings', 'affiliates:cashout_approve', 'affiliates:cashout_pay']
    }
  ]
});

const SETTINGS = defineNavigation({
  id: 'settings',
  label: 'Settings',
  description: 'Profile, POS setup, and storefront tools.',
  viewMode: 'settings_profile',
  iconKey: 'Settings',
  accessModel: 'dedicated',
  accessPermission: 'settings:view',
  permissionGroups: [
    {
      id: 'settings-management',
      label: 'POS Settings',
      description: 'Control settings and storefront configuration owned by POS.',
      permissions: ['settings:edit', 'settings:storefront_branding_edit']
    }
  ]
});

const TERMINAL_SETUP = defineNavigation({
  id: 'terminal-setup',
  label: 'Terminal setup',
  description: 'Local terminal, queue, device, and printer controls.',
  viewMode: 'terminal_setup',
  iconKey: 'Settings2',
  accessModel: 'navigation_only',
  accessDescription: 'Availability is governed by terminal setup and settings capability checks, not a standalone permission.',
  permissionGroups: []
});

const AUDIT = defineNavigation({
  id: 'audit',
  label: 'Audit',
  description: 'Admin-only activity log for POS and account changes.',
  viewMode: 'audit',
  iconKey: 'ClipboardCheck',
  accessModel: 'role_gate',
  accessDescription: 'The API role gate is authoritative; there is no independent POS button permission.',
  permissionGroups: []
});

const APPROVALS = defineNavigation({
  id: 'approvals',
  label: 'Approvals',
  description: 'Review POS void and parked-sale requests.',
  viewMode: 'approvals',
  iconKey: 'ShieldCheck',
  accessModel: 'capability_gate',
  accessDescription: 'The API approval capability and role restrictions are authoritative.',
  permissionGroups: []
});

const ONBOARDING = defineNavigation({
  id: 'onboarding',
  label: 'Onboarding',
  description: 'Continue tenant onboarding inside POS.',
  viewMode: 'settings_profile',
  iconKey: 'Settings',
  accessModel: 'navigation_only',
  accessDescription: 'Shown only during catalog-only onboarding; it has no standalone grant.',
  permissionGroups: []
});

const FNB_SERVICE = defineNavigation({
  id: 'fnb-service',
  label: 'F&B service',
  description: 'Food and beverage dining operations.',
  viewMode: 'fnb_service',
  iconKey: 'Utensils',
  accessModel: 'feature_flag',
  active: false,
  visibilityReason: 'Intentionally hidden while SHOW_FNB_SERVICE_IN_POS_NAVIGATION is false.',
  permissionGroups: []
});

export const POS_NAVIGATION_DEFINITIONS = Object.freeze([
  SELL,
  HISTORY_AND_ORDERS,
  SHIFT,
  ITEMS,
  REPORTS,
  SERVICES,
  VOUCHERS_AND_PRICELISTS,
  AFFILIATES,
  SETTINGS,
  TERMINAL_SETUP,
  AUDIT,
  APPROVALS,
  ONBOARDING,
  FNB_SERVICE
]);
export const POS_NAVIGATION_DEFINITIONS_BY_ID = Object.freeze(
  Object.fromEntries(POS_NAVIGATION_DEFINITIONS.flatMap((definition) => (
    definition.navIds.map((id) => [id, definition])
  )))
);

export const POS_PERMISSION_EDITOR_DEFINITIONS = POS_NAVIGATION_DEFINITIONS.filter((definition) => (
  definition.active !== false
));

export const getPosNavigationDefinition = (id) => (
  POS_NAVIGATION_DEFINITIONS_BY_ID[String(id || '').trim()] || null
);

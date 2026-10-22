// Tenant staff capability slugs shared by native clients and the API.
// Keep this list literal and review it alongside config/permissions.js; the contract test
// rejects drift between the two surfaces.
export const STAFF_CAPABILITIES = Object.freeze([
  'business_admin:access', 'business_admin:branches:view_all', 'business_admin:costs:view', 'business_admin:high_risk:approve',
  'expenses:view', 'expenses:create', 'expenses:void',
  'items:view', 'items:create', 'items:edit', 'items:delete', 'items:export', 'items:import',
  'suppliers:view', 'suppliers:create', 'suppliers:edit', 'suppliers:delete', 'suppliers:export', 'suppliers:import',
  'po:view', 'po:create', 'po:edit', 'po:approve', 'po:receive', 'po:delete',
  'jo:view', 'jo:create', 'jo:edit', 'jo:approve', 'jo:complete', 'jo:delete',
  'do:view', 'do:create', 'do:dispatch', 'do:delete',
  'pos:view', 'pos:transact', 'pos:discount_authorize', 'pos:price_override', 'pos:delivery_fee_override',
  'pos:cash_drawer_adjust', 'pos:delivery_run_variance_resolve', 'pos:shift_access', 'pos:shift_close', 'pos:close_day', 'pos:reprint', 'pos:void', 'pos:refund', 'pos:shift_force_close',
  'pos:fiscal_terminals:manage', 'pos:esales:manage', 'pos:switch_location', 'pos:branch_view', 'pos:employees:manage',
  'pos:attendance:view', 'pos:attendance:operate', 'pos:attendance:manage', 'pos:employee_credit:use',
  'pos:employee_credit:manage', 'pos:employee_credit:report',
  'affiliates:view', 'affiliates:manage', 'affiliates:settings', 'affiliates:cashout_approve', 'affiliates:cashout_pay',
  'downpayment:view', 'downpayment:settings', 'vouchers:view', 'vouchers:manage',
  'tenant_revenue:fee_policy:view', 'tenant_revenue:fee_policy:edit',
  'services:dashboard:view', 'services:catalog:view', 'services:catalog:manage', 'services:resources:view',
  'services:resources:manage', 'services:bookings:view', 'services:bookings:manage', 'services:waitlist:view',
  'services:waitlist:manage', 'services:clients:view', 'services:reminders:view', 'services:reminders:manage',
  'fnb:dashboard:view', 'fnb:menu:view', 'fnb:menu:manage', 'fnb:dining:view', 'fnb:dining:manage',
  'fnb:kitchen:view', 'fnb:kitchen:manage', 'fnb:checks:view', 'fnb:checks:manage', 'fnb:reservations:view',
  'fnb:reservations:manage', 'fnb:service_charge:view', 'fnb:service_charge:manage',
  'hospitality:dashboard:view', 'hospitality:reservations:view', 'hospitality:reservations:manage',
  'hospitality:rooms:view', 'hospitality:rooms:manage', 'hospitality:guests:view', 'hospitality:guests:manage',
  'hospitality:housekeeping:view', 'hospitality:housekeeping:manage', 'hospitality:maintenance:view',
  'hospitality:maintenance:manage', 'hospitality:folios:view', 'hospitality:folios:manage', 'hospitality:rates:view',
  'hospitality:rates:manage', 'hospitality:amenities:view', 'hospitality:amenities:manage', 'hospitality:facilities:view',
  'hospitality:facilities:manage', 'hospitality:reports:view',
  'stock:view', 'stock:adjust', 'batches:view', 'batches:edit', 'reports:view', 'reports:export',
  'ai:chat', 'ai:action', 'settings:view', 'settings:edit', 'settings:storefront_branding_edit',
  'categories:manage', 'users:manage', 'users:view', 'users:delete', 'audit:view',
  'orders:pack', 'orders:view_assigned', 'delivery_runs:view_assigned', 'delivery_runs:act',
  'delivery_runs:load', 'delivery_jobs:act_assigned', 'orders:collect_assigned_balance'
]);

export const STAFF_CAPABILITY_DEPRECATED = Object.freeze({});

export const isKnownStaffCapability = (slug) => (
  typeof slug === 'string' && STAFF_CAPABILITIES.includes(slug.trim())
);

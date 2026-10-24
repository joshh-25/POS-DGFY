// Parent permissions gate the child actions that appear under the same module.
// Keep this list explicit: some permissions (for example pos:branch_view) are
// intentionally independent read scopes and must not inherit pos:view.
export const PERMISSION_PREREQUISITES = Object.freeze({
  'items:create': ['items:view'],
  'items:edit': ['items:view'],
  'items:delete': ['items:view'],
  'items:export': ['items:view'],
  'items:import': ['items:view'],
  'pos:transact': ['pos:view'],
  'pos:discount_authorize': ['pos:transact'],
  'pos:price_override': ['pos:transact'],
  'pos:delivery_fee_override': ['pos:transact'],
  'pos:shift_access': ['pos:view'],
  'pos:cash_drawer_adjust': ['pos:shift_access'],
  'pos:delivery_run_variance_resolve': ['pos:view'],
  'pos:shift_close': ['pos:shift_access'],
  'pos:close_day': ['pos:shift_access'],
  'pos:reprint': ['pos:shift_access'],
  'pos:void': ['pos:view'],
  'pos:refund': ['pos:view'],
  'pos:shift_force_close': ['pos:shift_access'],
  'pos:fiscal_terminals:manage': ['pos:shift_access'],
  'pos:esales:manage': ['pos:shift_access'],
  'pos:switch_location': ['pos:shift_access'],
  'pos:employees:manage': ['pos:shift_access'],
  'pos:attendance:view': ['pos:view'],
  'pos:attendance:operate': ['pos:attendance:view'],
  'pos:attendance:manage': ['pos:attendance:view'],
  'pos:employee_credit:use': ['pos:transact'],
  'pos:employee_credit:manage': ['pos:view'],
  'pos:employee_credit:report': ['pos:view'],
  'vouchers:manage': ['vouchers:view'],
  'reports:export': ['reports:view'],
  'settings:edit': ['settings:view'],
  'services:catalog:view': ['services:dashboard:view'],
  'services:catalog:manage': ['services:dashboard:view'],
  'services:resources:view': ['services:dashboard:view'],
  'services:resources:manage': ['services:dashboard:view'],
  'services:bookings:view': ['services:dashboard:view'],
  'services:bookings:manage': ['services:dashboard:view'],
  'services:waitlist:view': ['services:dashboard:view'],
  'services:waitlist:manage': ['services:dashboard:view'],
  'services:clients:view': ['services:dashboard:view'],
  'services:reminders:view': ['services:dashboard:view'],
  'services:reminders:manage': ['services:dashboard:view'],
  'stock:adjust': ['stock:view'],
  'batches:edit': ['batches:view'],
  'ai:action': ['ai:chat']
});

const normalizePermissions = (permissions) => (
  Array.isArray(permissions)
    ? Array.from(new Set(permissions.map((permission) => String(permission || '').trim()).filter(Boolean)))
    : []
);

// Keep the selections made in the permission editor intact. A child grant may
// be temporarily ineffective while its parent button is disabled, but it is
// still an intentional selection and should become effective when the parent
// is enabled again.
export const normalizePermissionSelections = (permissions) => normalizePermissions(permissions);

export const getPermissionPrerequisites = (permission) => (
  Array.isArray(PERMISSION_PREREQUISITES[permission])
    ? PERMISSION_PREREQUISITES[permission]
    : []
);

export const isPermissionEffective = (permissions, permission, isMasterAdmin = false) => {
  if (isMasterAdmin) return true;

  const granted = new Set(normalizePermissions(permissions));
  const visited = new Set();
  const visit = (candidate) => {
    if (!candidate || visited.has(candidate)) return true;
    visited.add(candidate);
    if (!granted.has(candidate)) return false;
    return getPermissionPrerequisites(candidate).every(visit);
  };

  return visit(String(permission || '').trim());
};

// Remove child grants whose parent access is absent before a permission list is
// persisted. This keeps role records internally consistent instead of storing
// grants that can never be used.
export const normalizePermissionDependencies = (permissions) => {
  let normalized = normalizePermissions(permissions);
  let changed = true;

  while (changed) {
    changed = false;
    const next = normalized.filter((permission) => {
      const effective = isPermissionEffective(normalized, permission);
      if (!effective) changed = true;
      return effective;
    });
    normalized = next;
  }

  return normalized;
};

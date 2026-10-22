import { PERMISSIONS } from '../../../config/permissions.js';
import { hasEffectivePermission } from '../../../utils/userPermissions.js';

const isAdminLikeUser = (user = {}) => (
    user?.is_master_admin === true
    || String(user?.role || '').trim().toLowerCase() === 'admin'
);

export const canEditBusinessIdentity = (user = {}) => isAdminLikeUser(user);

const canUsePermission = (user, permission) => (
    isAdminLikeUser(user) || userHasBusinessAdminPermission(user, permission)
);

// These are deliberately a projection of existing owner permissions. Business Admin access
// only controls which settings sections are discoverable; it never becomes an edit grant for
// the settings, user, attendance, location, or payment APIs.
export const BUSINESS_ADMIN_SETTINGS_SECTIONS = Object.freeze({
    profile: Object.freeze({
        scope: 'tenant',
        viewPermission: PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
        editPermission: PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
    }),
    pos: Object.freeze({
        scope: 'tenant',
        viewPermission: PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
        editPermission: PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
    }),
    taxes: Object.freeze({
        scope: 'tenant',
        viewPermission: PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
        editPermission: PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
    }),
    discounts: Object.freeze({
        scope: 'tenant',
        viewPermission: PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
        editPermission: PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
    }),
    storefront: Object.freeze({
        scope: 'tenant',
        viewPermission: PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
        editPermission: PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS,
        brandingPermission: PERMISSIONS.SYSTEM.actions.EDIT_STOREFRONT_BRANDING
    }),
    delivery: Object.freeze({
        scope: 'tenant',
        viewPermission: PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
        editPermission: PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
    }),
    branches: Object.freeze({
        scope: 'branch',
        viewPermission: PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
        editPermission: PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
    }),
    team: Object.freeze({
        scope: 'branch',
        viewPermission: PERMISSIONS.SYSTEM.actions.VIEW_USERS,
        editPermission: PERMISSIONS.SYSTEM.actions.MANAGE_USERS
    }),
    attendance: Object.freeze({
        scope: 'branch',
        viewPermission: PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
        editPermission: PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
    }),
    payments: Object.freeze({
        scope: 'tenant',
        viewPermission: PERMISSIONS.DOWNPAYMENT.actions.VIEW_DOWNPAYMENT_SETTINGS,
        editPermission: PERMISSIONS.DOWNPAYMENT.actions.MANAGE_DOWNPAYMENT_SETTINGS
    }),
    processing_fees: Object.freeze({
        scope: 'tenant',
        viewPermission: PERMISSIONS.TENANT_REVENUE.actions.VIEW_FEE_POLICY,
        editPermission: PERMISSIONS.TENANT_REVENUE.actions.EDIT_FEE_POLICY
    }),
    registers: Object.freeze({
        scope: 'branch',
        viewPermission: PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
        editPermission: PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
    })
});

export const userHasBusinessAdminPermission = (user, permission) => (
    hasEffectivePermission(user, permission)
);

export const resolveBusinessAdminAccess = (user = {}) => {
    const role = String(user?.role || '').trim().toLowerCase();
    if (role === 'cashier') {
        return { allowed: false, scope: 'none', reason: 'Cashier users cannot access Business Admin.' };
    }

    if (user?.is_master_admin || role === 'admin') {
        return { allowed: true, scope: 'all' };
    }

    if (!userHasBusinessAdminPermission(user, PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS)) {
        return { allowed: false, scope: 'none', reason: 'Business Admin access is required.' };
    }

    const canViewAllBranches = userHasBusinessAdminPermission(
        user,
        PERMISSIONS.BUSINESS_ADMIN.actions.VIEW_ALL_BRANCHES
    );
    return { allowed: true, scope: canViewAllBranches ? 'all' : 'assigned' };
};

export const buildBusinessAdminSettingsCapabilities = (user = {}, scope = 'assigned') => {
    const normalizedScope = scope === 'all' ? 'all' : 'assigned';
    return Object.fromEntries(Object.entries(BUSINESS_ADMIN_SETTINGS_SECTIONS).map(([key, definition]) => {
        const employeeEdit = key === 'team'
            && canUsePermission(user, PERMISSIONS.POS.actions.MANAGE_EMPLOYEES);
        const employeeCreditEdit = key === 'team'
            && canUsePermission(user, PERMISSIONS.POS.actions.MANAGE_EMPLOYEE_CREDIT);
        const ownerView = canUsePermission(user, definition.viewPermission);
        const ownerEdit = canUsePermission(user, definition.editPermission);
        const branchEdit = (key === 'branches' || key === 'registers')
            ? normalizedScope === 'all' && ownerEdit
            : ownerEdit;
        return [
            key,
            {
                scope: definition.scope,
                // Employee directory/credit APIs use their own manage permissions as both
                // the read and write boundary. Project those capabilities into Team & access
                // without granting users:view/users:manage to the editor user.
                view: ownerView || employeeEdit || employeeCreditEdit,
                edit: branchEdit || employeeEdit || employeeCreditEdit,
                ...(definition.brandingPermission
                    ? { branding: canUsePermission(user, definition.brandingPermission) }
                    : {}),
                ...(key === 'team'
                    ? {
                        user_view: ownerView,
                        user_edit: ownerEdit,
                        employee_edit: employeeEdit,
                        employee_credit_edit: employeeCreditEdit
                    }
                    : {}),
                // Branch authoring changes the tenant's location set. Keep it visible to
                // assigned users, but expose edit authority only to users with tenant-wide
                // Business Admin scope plus the existing settings:edit permission.
                ...(key === 'branches'
                    ? { edit: normalizedScope === 'all' && ownerEdit }
                    : {}),
                ...(key === 'registers'
                    ? { edit: normalizedScope === 'all' && ownerEdit }
                    : {})
            }
        ];
    }));
};

export const buildBusinessAdminCapabilities = (user = {}) => ({
    view_all_branches: Boolean(
        user?.is_master_admin
        || String(user?.role || '').trim().toLowerCase() === 'admin'
        || userHasBusinessAdminPermission(user, PERMISSIONS.BUSINESS_ADMIN.actions.VIEW_ALL_BRANCHES)
    ),
    view_costs: Boolean(
        user?.is_master_admin
        || String(user?.role || '').trim().toLowerCase() === 'admin'
        || userHasBusinessAdminPermission(user, PERMISSIONS.BUSINESS_ADMIN.actions.VIEW_COSTS)
    ),
    view_expenses: canUsePermission(user, PERMISSIONS.EXPENSES.actions.VIEW),
    create_expenses: canUsePermission(user, PERMISSIONS.EXPENSES.actions.CREATE),
    void_expenses: canUsePermission(user, PERMISSIONS.EXPENSES.actions.VOID),
    approve_high_risk: Boolean(
        user?.is_master_admin
        || userHasBusinessAdminPermission(user, PERMISSIONS.BUSINESS_ADMIN.actions.APPROVE_HIGH_RISK)
    ),
    // This is the exact authorization projection used by the Business Admin
    // approval list/decision use cases: Back Office access, tenant-wide scope,
    // and high-risk approval authority are all required. Keep this separate
    // from approve_high_risk so the UI cannot expose a decision control to a
    // user who may hold the approval grant but not the required scope.
    can_decide_high_risk: (() => {
        const access = resolveBusinessAdminAccess(user);
        const canReview = user?.is_master_admin === true
            || userHasBusinessAdminPermission(user, PERMISSIONS.BUSINESS_ADMIN.actions.APPROVE_HIGH_RISK);
        return Boolean(access.allowed && access.scope === 'all' && canReview);
    })(),
    manage_branches: Boolean(
        user?.is_master_admin
        || String(user?.role || '').trim().toLowerCase() === 'admin'
        || (
            userHasBusinessAdminPermission(user, PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS)
            && userHasBusinessAdminPermission(user, PERMISSIONS.BUSINESS_ADMIN.actions.VIEW_ALL_BRANCHES)
            && userHasBusinessAdminPermission(user, PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS)
        )
    ),
    manage_employees: Boolean(
        user?.is_master_admin
        || String(user?.role || '').trim().toLowerCase() === 'admin'
        || (
            userHasBusinessAdminPermission(user, PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS)
            && userHasBusinessAdminPermission(user, PERMISSIONS.BUSINESS_ADMIN.actions.VIEW_ALL_BRANCHES)
            && userHasBusinessAdminPermission(user, PERMISSIONS.SYSTEM.actions.MANAGE_USERS)
        )
    ),
    request_refunds: Boolean(
        user?.is_master_admin
        || String(user?.role || '').trim().toLowerCase() === 'admin'
        || userHasBusinessAdminPermission(user, PERMISSIONS.POS.actions.REFUND_TRANSACTION)
    ),
    force_close_shifts: Boolean(
        user?.is_master_admin
        || String(user?.role || '').trim().toLowerCase() === 'admin'
        || userHasBusinessAdminPermission(user, PERMISSIONS.POS.actions.FORCE_CLOSE_SHIFT)
    ),
    view_processing_fee_policy: canUsePermission(
        user,
        PERMISSIONS.TENANT_REVENUE.actions.VIEW_FEE_POLICY
    ),
    edit_processing_fee_policy: canUsePermission(
        user,
        PERMISSIONS.TENANT_REVENUE.actions.EDIT_FEE_POLICY
    ),
    view_audit: Boolean(
        user?.is_master_admin
        || String(user?.role || '').trim().toLowerCase() === 'admin'
        || userHasBusinessAdminPermission(user, PERMISSIONS.SYSTEM.actions.VIEW_AUDIT)
    ),
    settings_sections: buildBusinessAdminSettingsCapabilities(user, resolveBusinessAdminAccess(user).scope)
});

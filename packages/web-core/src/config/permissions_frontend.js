// Hand-maintained mirror of apps/dgfy-api/src/config/permissions.js's PERMISSIONS -- group-for-group,
// action-for-action. This file is ONLY the degraded-path fallback: the live source of truth for the
// admin UI is the server-driven `roleCatalog.permission_groups` (GET /users/role-catalog, built by
// apps/dgfy-api/src/config/modeRolePresets.js's buildPermissionGroupsForMode). PERMISSION_GROUPS below
// is what PermissionMatrix.jsx / PermissionPickerModal.jsx fall back to when that fetch hasn't loaded.
//
// #673: this file had drifted from the backend independently -- missing groups, missing actions, a
// misplaced action, and mismatched key names. Reconciled to mirror the backend exactly. A parity test
// (src/config/__tests__/permissionsFrontendParity.test.js) now guards this from silently drifting
// again -- whoever changes either copy must update both together and keep that suite green.

// PERMISSION_GROUPS format for PermissionMatrix and PermissionPickerModal.
// Uses "permissions" instead of "actions" for consistency with those components.
export const PERMISSION_GROUPS = {
    INVENTORY: {
        label: "Inventory Management",
        permissions: {
            VIEW_ITEMS: "items:view",
            CREATE_ITEMS: "items:create",
            EDIT_ITEMS: "items:edit",
            DELETE_ITEMS: "items:delete",
            EXPORT_ITEMS: "items:export",
            IMPORT_ITEMS: "items:import"
        }
    },
    SUPPLIERS: {
        label: "Supplier Management",
        permissions: {
            VIEW_SUPPLIERS: "suppliers:view",
            CREATE_SUPPLIERS: "suppliers:create",
            EDIT_SUPPLIERS: "suppliers:edit",
            DELETE_SUPPLIERS: "suppliers:delete",
            EXPORT_SUPPLIERS: "suppliers:export",
            IMPORT_SUPPLIERS: "suppliers:import"
        }
    },
    ORDERS: {
        label: "Order Management",
        permissions: {
            VIEW_PO: "po:view",
            CREATE_PO: "po:create",
            EDIT_PO: "po:edit",
            APPROVE_PO: "po:approve",
            RECEIVE_PO: "po:receive",
            DELETE_PO: "po:delete",
            VIEW_JO: "jo:view",
            CREATE_JO: "jo:create",
            EDIT_JO: "jo:edit",
            APPROVE_JO: "jo:approve",
            COMPLETE_JO: "jo:complete",
            DELETE_JO: "jo:delete"
        }
    },
    DISPATCH: {
        label: "Dispatch Orders",
        permissions: {
            VIEW_DO: "do:view",
            CREATE_DO: "do:create",
            DISPATCH_DO: "do:dispatch",
            DELETE_DO: "do:delete"
        }
    },
    POS: {
        label: "Point of Sale",
        permissions: {
            VIEW_POS: "pos:view",
            TRANSACT_POS: "pos:transact",
            AUTHORIZE_DISCOUNTS: "pos:discount_authorize",
            PRICE_OVERRIDE_POS: "pos:price_override",
            ADJUST_CASH_DRAWER: "pos:cash_drawer_adjust",
            CLOSE_SHIFT_POS: "pos:shift_close",
            CLOSE_DAY_POS: "pos:close_day",
            REPRINT_POS_RECEIPT: "pos:reprint",
            VOID_POS_TRANSACTION: "pos:void",
            MANAGE_FISCAL_TERMINALS: "pos:fiscal_terminals:manage",
            MANAGE_ESALES_REPORTS: "pos:esales:manage",
            SWITCH_LOCATION_POS: "pos:switch_location",
            MANAGE_EMPLOYEES: "pos:employees:manage",
            USE_EMPLOYEE_CREDIT: "pos:employee_credit:use",
            MANAGE_EMPLOYEE_CREDIT: "pos:employee_credit:manage",
            VIEW_EMPLOYEE_CREDIT_REPORT: "pos:employee_credit:report"
        }
    },
    // #673. Mirrored in full even though no workflow mode currently lists AFFILIATES in
    // modeRolePresets.js's PERMISSION_GROUP_VISIBILITY (the live catalog never surfaces this group
    // today, for any tenant) -- this fallback is a maximal superset, not mode-aware, and these grants
    // are enforced server-side regardless (userValidator.js does not whitelist against
    // PERMISSION_GROUP_VISIBILITY), so hiding it here would just be a different kind of drift.
    AFFILIATES: {
        label: "Affiliates Program",
        permissions: {
            VIEW_AFFILIATES: "affiliates:view",
            MANAGE_AFFILIATES: "affiliates:manage",
            MANAGE_AFFILIATE_SETTINGS: "affiliates:settings",
            APPROVE_AFFILIATE_CASHOUTS: "affiliates:cashout_approve",
            PAY_AFFILIATE_CASHOUTS: "affiliates:cashout_pay"
        }
    },
    // #848 (Phase 143). Mirrors apps/dgfy-api/src/config/permissions.js's DOWNPAYMENT group verbatim
    // -- was missing from this fallback since Phase 138 (#820) added the group backend-side, which
    // is exactly the drift #673's parity test above exists to catch (confirmed red on `develop`
    // before this fix: "frontend is missing group DOWNPAYMENT"). Landed independently on `develop`
    // via #853's release batch before this branch merged it -- same fix, same content, this
    // branch's own copy is a no-op kept only for the comment.
    DOWNPAYMENT: {
        label: "Downpayment & Partial Payment",
        permissions: {
            VIEW_DOWNPAYMENT_SETTINGS: "downpayment:view",
            MANAGE_DOWNPAYMENT_SETTINGS: "downpayment:settings"
        }
    },
    // #655. This PERMISSION_GROUPS export is only the degraded-path fallback -- the live source is
    // the server-driven `roleCatalog.permission_groups` (GET /users/role-catalog, built by
    // apps/dgfy-api/src/config/modeRolePresets.js's buildPermissionGroupsForMode). Kept in sync so a
    // failed/empty catalog fetch still shows this group rather than silently omitting it.
    VOUCHERS: {
        label: "Vouchers",
        permissions: {
            VIEW: "vouchers:view",
            MANAGE: "vouchers:manage"
        }
    },
    SERVICES: {
        label: "Services",
        permissions: {
            VIEW_DASHBOARD: "services:dashboard:view",
            VIEW_CATALOG: "services:catalog:view",
            MANAGE_CATALOG: "services:catalog:manage",
            VIEW_RESOURCES: "services:resources:view",
            MANAGE_RESOURCES: "services:resources:manage",
            VIEW_BOOKINGS: "services:bookings:view",
            MANAGE_BOOKINGS: "services:bookings:manage",
            VIEW_WAITLIST: "services:waitlist:view",
            MANAGE_WAITLIST: "services:waitlist:manage",
            VIEW_CLIENTS: "services:clients:view",
            VIEW_REMINDERS: "services:reminders:view",
            MANAGE_REMINDERS: "services:reminders:manage"
        }
    },
    FNB: {
        label: "Food & Beverage",
        permissions: {
            VIEW_DASHBOARD: "fnb:dashboard:view",
            VIEW_MENU: "fnb:menu:view",
            MANAGE_MENU: "fnb:menu:manage",
            VIEW_DINING: "fnb:dining:view",
            MANAGE_DINING: "fnb:dining:manage",
            VIEW_KITCHEN: "fnb:kitchen:view",
            MANAGE_KITCHEN: "fnb:kitchen:manage",
            VIEW_CHECKS: "fnb:checks:view",
            MANAGE_CHECKS: "fnb:checks:manage",
            VIEW_RESERVATIONS: "fnb:reservations:view",
            MANAGE_RESERVATIONS: "fnb:reservations:manage",
            VIEW_SERVICE_CHARGE: "fnb:service_charge:view",
            MANAGE_SERVICE_CHARGE: "fnb:service_charge:manage"
        }
    },
    // #673. Mirrored to match the backend's HOSPITALITY group (scoped to the `hospitality` workflow
    // mode in modeRolePresets.js's PERMISSION_GROUP_VISIBILITY).
    HOSPITALITY: {
        label: "Hospitality",
        permissions: {
            VIEW_DASHBOARD: "hospitality:dashboard:view",
            VIEW_RESERVATIONS: "hospitality:reservations:view",
            MANAGE_RESERVATIONS: "hospitality:reservations:manage",
            VIEW_ROOMS: "hospitality:rooms:view",
            MANAGE_ROOMS: "hospitality:rooms:manage",
            VIEW_GUESTS: "hospitality:guests:view",
            MANAGE_GUESTS: "hospitality:guests:manage",
            VIEW_HOUSEKEEPING: "hospitality:housekeeping:view",
            MANAGE_HOUSEKEEPING: "hospitality:housekeeping:manage",
            VIEW_MAINTENANCE: "hospitality:maintenance:view",
            MANAGE_MAINTENANCE: "hospitality:maintenance:manage",
            VIEW_FOLIOS: "hospitality:folios:view",
            MANAGE_FOLIOS: "hospitality:folios:manage",
            VIEW_RATES: "hospitality:rates:view",
            MANAGE_RATES: "hospitality:rates:manage",
            VIEW_AMENITIES: "hospitality:amenities:view",
            MANAGE_AMENITIES: "hospitality:amenities:manage",
            VIEW_FACILITIES: "hospitality:facilities:view",
            MANAGE_FACILITIES: "hospitality:facilities:manage",
            VIEW_REPORTS: "hospitality:reports:view"
        }
    },
    // #673. Action keys renamed from VIEW_STOCK/ADJUST_STOCK to VIEW_MOVEMENTS/CREATE_ADJUSTMENT to
    // match the backend exactly (string values unchanged: "stock:view"/"stock:adjust"). This changes
    // the displayed label on the degraded-path fallback UI only -- PermissionMatrix.jsx and
    // PermissionPickerModal.jsx render the raw key with underscores turned to spaces.
    STOCK: {
        label: "Stock Control",
        permissions: {
            VIEW_MOVEMENTS: "stock:view",
            CREATE_ADJUSTMENT: "stock:adjust",
            VIEW_BATCHES: "batches:view",
            EDIT_BATCHES: "batches:edit"
        }
    },
    REPORTS: {
        label: "Reports & Analytics",
        permissions: {
            VIEW_REPORTS: "reports:view",
            EXPORT_REPORTS: "reports:export"
        }
    },
    AI: {
        label: "AI Assistant",
        permissions: {
            AI_CHAT_VIEW: "ai:chat",
            AI_CHAT_ACTION: "ai:action"
        }
    },
    // #673. MANAGE_CATEGORIES moved here from INVENTORY to match the backend, which files it under
    // SYSTEM. Label corrected from "Administration" to "System Administration" to match the backend.
    SYSTEM: {
        label: "System Administration",
        permissions: {
            VIEW_SETTINGS: "settings:view",
            EDIT_SETTINGS: "settings:edit",
            EDIT_STOREFRONT_BRANDING: "settings:storefront_branding_edit",
            MANAGE_CATEGORIES: "categories:manage",
            MANAGE_USERS: "users:manage",
            VIEW_USERS: "users:view",
            DELETE_USERS: "users:delete",
            VIEW_AUDIT: "audit:view"
        }
    }
};

export const PERMISSIONS = {
    // --- INVENTORY MANAGEMENT ---
    INVENTORY: {
        label: "Inventory Management",
        actions: {
            VIEW_ITEMS: "items:view",     // View item list and details
            CREATE_ITEMS: "items:create", // Create new items
            EDIT_ITEMS: "items:edit",     // Edit existing items
            DELETE_ITEMS: "items:delete", // Delete items (soft delete)
            EXPORT_ITEMS: "items:export", // Export items to CSV
            IMPORT_ITEMS: "items:import", // Import items from CSV
        }
    },

    // --- SUPPLIER MANAGEMENT ---
    SUPPLIERS: {
        label: "Supplier Management",
        actions: {
            VIEW_SUPPLIERS: "suppliers:view",
            CREATE_SUPPLIERS: "suppliers:create",
            EDIT_SUPPLIERS: "suppliers:edit",
            DELETE_SUPPLIERS: "suppliers:delete", // Admin only usually
            EXPORT_SUPPLIERS: "suppliers:export",
            IMPORT_SUPPLIERS: "suppliers:import",
        }
    },

    // --- ORDER MANAGEMENT (PO & JO) ---
    ORDERS: {
        label: "Order Management",
        actions: {
            VIEW_PO: "po:view",       // View Purchase Orders
            CREATE_PO: "po:create",   // Create/Draft POs
            EDIT_PO: "po:edit",       // Edit Draft POs
            APPROVE_PO: "po:approve", // Finalize POs (Manager/Admin)
            RECEIVE_PO: "po:receive", // Receive stock from PO (Web & Mobile QR)
            DELETE_PO: "po:delete",   // Archive/Restore/Delete POs

            VIEW_JO: "jo:view",       // View Job Orders
            CREATE_JO: "jo:create",   // Create/Draft JOs
            EDIT_JO: "jo:edit",       // Edit Draft JOs
            APPROVE_JO: "jo:approve", // Finalize JOs
            COMPLETE_JO: "jo:complete", // Complete JO (Production) (Web & Mobile QR)
            DELETE_JO: "jo:delete",   // Archive/Restore/Delete JOs
        }
    },

    // --- DISPATCH ORDERS ---
    DISPATCH: {
        label: "Dispatch Orders",
        actions: {
            VIEW_DO: "do:view",         // View Dispatch Order list and details
            CREATE_DO: "do:create",     // Create and edit draft Dispatch Orders; confirm
            DISPATCH_DO: "do:dispatch", // Execute dispatch (triggers stock deduction)
            DELETE_DO: "do:delete",     // Cancel and archive Dispatch Orders
        }
    },

    // --- POINT OF SALE ---
    POS: {
        label: "Point of Sale",
        actions: {
            VIEW_POS: "pos:view",           // View POS transactions and reports
            TRANSACT_POS: "pos:transact",   // Execute POS checkout transactions
            AUTHORIZE_DISCOUNTS: "pos:discount_authorize", // Authorize POS discounts with an individual PIN
            PRICE_OVERRIDE_POS: "pos:price_override", // Override line-item sale price during checkout
            OVERRIDE_DELIVERY_FEE: "pos:delivery_fee_override", // Override an order's delivery fee while payment is unsettled (Phase 238, #1330)
            ADJUST_CASH_DRAWER: "pos:cash_drawer_adjust", // Record cash in/out and shift cash adjustments
            CLOSE_SHIFT_POS: "pos:shift_close", // Close the cashier's current terminal shift
            CLOSE_DAY_POS: "pos:close_day", // Close active terminal shift and generate day-end reconciliation
            REPRINT_POS_RECEIPT: "pos:reprint", // Reprint historical POS receipts
            VOID_POS_TRANSACTION: "pos:void", // Void completed POS transactions with governed fiscal evidence
            MANAGE_FISCAL_TERMINALS: "pos:fiscal_terminals:manage", // Register and verify fiscal terminals
            MANAGE_ESALES_REPORTS: "pos:esales:manage", // Generate and update eSales reporting packages
            SWITCH_LOCATION_POS: "pos:switch_location", // Switch terminal shift location using governed flow
            MANAGE_EMPLOYEES: "pos:employees:manage", // Manage non-login employee directory records
            VIEW_ATTENDANCE: "pos:attendance:view", // View the signed-in cashier's attendance state
            OPERATE_ATTENDANCE: "pos:attendance:operate", // Time in/out and start/end breaks for self
            MANAGE_ATTENDANCE: "pos:attendance:manage", // Correct attendance with an auditable reason
            USE_EMPLOYEE_CREDIT: "pos:employee_credit:use", // Accept Employee Credit as a governed POS tender
            MANAGE_EMPLOYEE_CREDIT: "pos:employee_credit:manage", // Configure eligibility, limits, and balances
            VIEW_EMPLOYEE_CREDIT_REPORT: "pos:employee_credit:report" // View the non-cash Employee Credit ledger
        }
    },

    // --- AFFILIATES PROGRAM ---
    AFFILIATES: {
        label: "Affiliates Program",
        actions: {
            VIEW_AFFILIATES: "affiliates:view",                       // View affiliate list, balances, settings
            MANAGE_AFFILIATES: "affiliates:manage",                   // Provision affiliates, override rates, suspend/revoke
            MANAGE_AFFILIATE_SETTINGS: "affiliates:settings",         // Enable program, change default rate/window/min cashout
            APPROVE_AFFILIATE_CASHOUTS: "affiliates:cashout_approve", // Approve or reject affiliate cashout requests
            PAY_AFFILIATE_CASHOUTS: "affiliates:cashout_pay",         // Mark an approved cashout as paid
        }
    },

    // --- DOWNPAYMENT (Phase 138, #820) ---
    DOWNPAYMENT: {
        label: "Downpayment & Partial Payment",
        actions: {
            VIEW_DOWNPAYMENT_SETTINGS: "downpayment:view",       // View per-store payment mode / downpayment policy
            MANAGE_DOWNPAYMENT_SETTINGS: "downpayment:settings", // Change payment mode, downpayment amount/type, refundability
        }
    },

    // --- VOUCHERS (#655) ---
    // Split out of SYSTEM.VIEW_SETTINGS/EDIT_SETTINGS, which Phase 103 (#614) deliberately reused as
    // a scoping shortcut -- see routes/vouchers.js's own comment. Dual-gated for one release
    // alongside the legacy SYSTEM pair (see routes/vouchers.js) so no existing admin/manager loses
    // access before the deploy-time backfill (scripts/backfill-role-permissions.js) has run.
    VOUCHERS: {
        label: "Vouchers",
        actions: {
            VIEW: "vouchers:view",     // View voucher campaigns
            MANAGE: "vouchers:manage", // Create, edit, and change lifecycle status of voucher campaigns
        }
    },

    // --- SERVICES MODE ---
    SERVICES: {
        label: "Services",
        actions: {
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

    // --- FOOD & BEVERAGE MODE ---
    FNB: {
        label: "Food & Beverage",
        actions: {
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

    // --- HOSPITALITY MODE ---
    HOSPITALITY: {
        label: "Hospitality",
        actions: {
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

    // --- STOCK CONTROL ---
    STOCK: {
        label: "Stock Control",
        actions: {
            VIEW_MOVEMENTS: "stock:view",     // View movement history
            CREATE_ADJUSTMENT: "stock:adjust", // Create manual stock adjustments
            VIEW_BATCHES: "batches:view",     // View FIFO batches
            EDIT_BATCHES: "batches:edit",     // Edit batch details (e.g. expiry)
        }
    },

    // --- REPORTS & ANALYTICS ---
    REPORTS: {
        label: "Reports & Analytics",
        actions: {
            VIEW_REPORTS: "reports:view", // Access Reports page
            EXPORT_REPORTS: "reports:export", // Download report data
        }
    },

    // --- AI ASSISTANT ---
    AI: {
        label: "AI Assistant",
        actions: {
            AI_CHAT_VIEW: "ai:chat",     // Access AI Chat interface and ask questions
            AI_CHAT_ACTION: "ai:action", // Confirm and execute AI-proposed actions
        }
    },

    // --- SYSTEM ADMINISTRATION ---
    SYSTEM: {
        label: "System Administration",
        actions: {
            VIEW_SETTINGS: "settings:view",  // View system settings
            EDIT_SETTINGS: "settings:edit",  // Change system settings
            EDIT_STOREFRONT_BRANDING: "settings:storefront_branding_edit", // Upload/remove storefront cover + profile assets
            MANAGE_CATEGORIES: "categories:manage", // Create, update, deactivate, delete, and reassign categories
            MANAGE_USERS: "users:manage",    // Manage other users (Master Admin/Admin)
            VIEW_USERS: "users:view",        // View other users (Admin/Manager)
            DELETE_USERS: "users:delete",    // Remove/Deactivate users (Admin/Manager)
            VIEW_AUDIT: "audit:view",        // View audit logs
        }
    }
};

// Helper: Get all permission values as a flat array
export const getAllPermissions = () => {
    const all = [];
    Object.values(PERMISSIONS).forEach(group => {
        Object.values(group.actions).forEach(permission => {
            all.push(permission);
        });
    });
    return all;
};

// Helper: Default permissions for migrated roles
export const DEFAULT_ROLE_PERMISSIONS = {
    admin: getAllPermissions(), // Admin gets everything by default (legacy support)
    manager: [
        ...Object.values(PERMISSIONS.INVENTORY.actions),
        ...Object.values(PERMISSIONS.SUPPLIERS.actions),
        ...Object.values(PERMISSIONS.ORDERS.actions),
        ...Object.values(PERMISSIONS.DISPATCH.actions),
        ...Object.values(PERMISSIONS.POS.actions),
        ...Object.values(PERMISSIONS.STOCK.actions),
        ...Object.values(PERMISSIONS.REPORTS.actions),
        PERMISSIONS.AI.actions.AI_CHAT_VIEW,
        PERMISSIONS.AI.actions.AI_CHAT_ACTION,
        PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
        PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS,
        PERMISSIONS.SYSTEM.actions.VIEW_USERS,
        PERMISSIONS.SYSTEM.actions.DELETE_USERS,
        PERMISSIONS.SYSTEM.actions.VIEW_AUDIT,
        PERMISSIONS.AFFILIATES.actions.VIEW_AFFILIATES,
        PERMISSIONS.DOWNPAYMENT.actions.VIEW_DOWNPAYMENT_SETTINGS,
        // #1493: manager keeps read access to voucher campaigns but no longer manages them.
        // `vouchers:manage` is now Admin plus the mode-native `*_accounting` presets only -- see
        // modeRolePresets.js and ADR 0020's 2026-09-03 amendment.
        //
        // Two things this does NOT do, both deliberate:
        //   1. It does not revoke `vouchers:manage` from managers who already have it baked into
        //      their stored `users.permissions` array. `resolveEffectivePermissions` only re-derives
        //      role defaults when that array is empty, and scripts/backfill-role-permissions.js is
        //      additive, so #655's own backfill may have written it there. Revoking those rows is
        //      scripts/revoke-manager-voucher-manage.js, run deliberately by an operator.
        //   2. It does not cost managers pricelist management. `vouchers:manage` is shared with
        //      Pricelists (#732), but routes/pricelists.js still accepts the `settings:edit` arm and
        //      is untouched by this change -- only routes/vouchers.js retired it.
        PERMISSIONS.VOUCHERS.actions.VIEW
    ],
    staff: [
        PERMISSIONS.INVENTORY.actions.VIEW_ITEMS,
        PERMISSIONS.SUPPLIERS.actions.VIEW_SUPPLIERS,
        PERMISSIONS.ORDERS.actions.VIEW_PO,
        PERMISSIONS.ORDERS.actions.VIEW_JO,
        PERMISSIONS.DISPATCH.actions.VIEW_DO,
        PERMISSIONS.POS.actions.VIEW_POS,
        PERMISSIONS.STOCK.actions.VIEW_MOVEMENTS,
        PERMISSIONS.AI.actions.AI_CHAT_VIEW, // Read-only chat
        // Explicitly NO create/edit/delete/approve/action
    ],
    cashier: [
        PERMISSIONS.INVENTORY.actions.VIEW_ITEMS,
        PERMISSIONS.INVENTORY.actions.EDIT_ITEMS,
        PERMISSIONS.POS.actions.VIEW_POS,
        PERMISSIONS.POS.actions.TRANSACT_POS,
        PERMISSIONS.POS.actions.VIEW_ATTENDANCE,
        PERMISSIONS.POS.actions.OPERATE_ATTENDANCE,
        PERMISSIONS.POS.actions.USE_EMPLOYEE_CREDIT,
        PERMISSIONS.POS.actions.CLOSE_SHIFT_POS,
        PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT,
    ],
    po: [
        PERMISSIONS.INVENTORY.actions.VIEW_ITEMS,
        PERMISSIONS.SUPPLIERS.actions.VIEW_SUPPLIERS,
        PERMISSIONS.ORDERS.actions.VIEW_PO,
        PERMISSIONS.ORDERS.actions.CREATE_PO,
        PERMISSIONS.ORDERS.actions.EDIT_PO,
        PERMISSIONS.ORDERS.actions.APPROVE_PO,
        PERMISSIONS.ORDERS.actions.RECEIVE_PO,
        PERMISSIONS.STOCK.actions.VIEW_MOVEMENTS,
        PERMISSIONS.REPORTS.actions.VIEW_REPORTS
    ],
    do: [
        PERMISSIONS.INVENTORY.actions.VIEW_ITEMS,
        PERMISSIONS.DISPATCH.actions.VIEW_DO,
        PERMISSIONS.DISPATCH.actions.CREATE_DO,
        PERMISSIONS.DISPATCH.actions.DISPATCH_DO,
        PERMISSIONS.DISPATCH.actions.DELETE_DO,
        PERMISSIONS.STOCK.actions.VIEW_MOVEMENTS,
        PERMISSIONS.REPORTS.actions.VIEW_REPORTS
    ],
    jo: [
        PERMISSIONS.INVENTORY.actions.VIEW_ITEMS,
        PERMISSIONS.ORDERS.actions.VIEW_JO,
        PERMISSIONS.ORDERS.actions.CREATE_JO,
        PERMISSIONS.ORDERS.actions.EDIT_JO,
        PERMISSIONS.ORDERS.actions.APPROVE_JO,
        PERMISSIONS.ORDERS.actions.COMPLETE_JO,
        PERMISSIONS.STOCK.actions.VIEW_MOVEMENTS,
        PERMISSIONS.REPORTS.actions.VIEW_REPORTS
    ]
};

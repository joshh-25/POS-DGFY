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
            PRICE_OVERRIDE_POS: "pos:price_override", // Override line-item sale price during checkout
            ADJUST_CASH_DRAWER: "pos:cash_drawer_adjust", // Record cash in/out and shift cash adjustments
            CLOSE_DAY_POS: "pos:close_day", // Close active terminal shift and generate day-end reconciliation
            REPRINT_POS_RECEIPT: "pos:reprint", // Reprint historical POS receipts
            SWITCH_LOCATION_POS: "pos:switch_location" // Switch terminal shift location using governed flow
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
        PERMISSIONS.SYSTEM.actions.VIEW_AUDIT
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
        PERMISSIONS.POS.actions.VIEW_POS,
        PERMISSIONS.POS.actions.TRANSACT_POS,
        PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER,
        PERMISSIONS.POS.actions.CLOSE_DAY_POS,
        PERMISSIONS.POS.actions.REPRINT_POS_RECEIPT,
        PERMISSIONS.STOCK.actions.VIEW_MOVEMENTS,
        PERMISSIONS.REPORTS.actions.VIEW_REPORTS
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

export const PERMISSIONS = {
    INVENTORY: {
        label: "Inventory Management",
        actions: {
            VIEW_ITEMS: "items:view",
            CREATE_ITEMS: "items:create",
            EDIT_ITEMS: "items:edit",
            DELETE_ITEMS: "items:delete",
            IMPORT_ITEMS: "items:import",
            EXPORT_ITEMS: "items:export",
            MANAGE_CATEGORIES: "categories:manage"
        }
    },
    SUPPLIERS: {
        label: "Supplier Management",
        actions: {
            VIEW_SUPPLIERS: "suppliers:view",
            CREATE_SUPPLIERS: "suppliers:create",
            EDIT_SUPPLIERS: "suppliers:edit",
            DELETE_SUPPLIERS: "suppliers:delete",
            IMPORT_SUPPLIERS: "suppliers:import",
            EXPORT_SUPPLIERS: "suppliers:export"
        }
    },
    ORDERS: {
        label: "Order Management",
        actions: {
            VIEW_PO: "po:view",
            CREATE_PO: "po:create",
            APPROVE_PO: "po:approve",
            RECEIVE_PO: "po:receive",
            DELETE_PO: "po:delete",
            VIEW_JO: "jo:view",
            CREATE_JO: "jo:create",
            APPROVE_JO: "jo:approve", // Production Manager
            COMPLETE_JO: "jo:complete", // Production
            DELETE_JO: "jo:delete"
        }
    },
    // --- DISPATCH ORDERS ---
    DISPATCH: {
        label: "Dispatch Orders",
        actions: {
            VIEW_DO: "do:view",
            CREATE_DO: "do:create",
            DISPATCH_DO: "do:dispatch",
            DELETE_DO: "do:delete"
        }
    },
    POS: {
        label: "Point of Sale",
        actions: {
            VIEW_POS: "pos:view",
            TRANSACT_POS: "pos:transact",
            PRICE_OVERRIDE_POS: "pos:price_override",
            ADJUST_CASH_DRAWER: "pos:cash_drawer_adjust",
            CLOSE_DAY_POS: "pos:close_day",
            REPRINT_POS_RECEIPT: "pos:reprint"
        }
    },
    STOCK: {
        label: "Stock Control",
        actions: {
            VIEW_STOCK: "stock:view",
            ADJUST_STOCK: "stock:adjust",
            VIEW_BATCHES: "batches:view",
            EDIT_BATCHES: "batches:edit"
        }
    },
    REPORTS: {
        label: "Analytics & Reports",
        actions: {
            VIEW_REPORTS: "reports:view",
            EXPORT_REPORTS: "reports:export"
        }
    },
    AI: {
        label: "AI Assistant",
        actions: {
            AI_CHAT_VIEW: "ai:chat",     // Access AI Chat interface
            AI_CHAT_ACTION: "ai:action", // Confirm and execute AI-proposed actions
        }
    },
    SYSTEM: {
        label: "System Administration",
        actions: {
            MANAGE_USERS: "users:manage",
            VIEW_SETTINGS: "settings:view",
            EDIT_SETTINGS: "settings:edit",
            VIEW_USERS: "users:view",
            DELETE_USERS: "users:delete",
            VIEW_AUDIT: "audit:view"
        }
    }
};

// PERMISSION_GROUPS format for PermissionMatrix and PermissionPickerModal
// Uses "permissions" instead of "actions" for consistency with components
export const PERMISSION_GROUPS = {
    INVENTORY: {
        label: "Inventory Management",
        permissions: {
            VIEW_ITEMS: "items:view",
            CREATE_ITEMS: "items:create",
            EDIT_ITEMS: "items:edit",
            DELETE_ITEMS: "items:delete",
            IMPORT_ITEMS: "items:import",
            EXPORT_ITEMS: "items:export",
            MANAGE_CATEGORIES: "categories:manage"
        }
    },
    SUPPLIERS: {
        label: "Supplier Management",
        permissions: {
            VIEW_SUPPLIERS: "suppliers:view",
            CREATE_SUPPLIERS: "suppliers:create",
            EDIT_SUPPLIERS: "suppliers:edit",
            DELETE_SUPPLIERS: "suppliers:delete",
            IMPORT_SUPPLIERS: "suppliers:import",
            EXPORT_SUPPLIERS: "suppliers:export"
        }
    },
    ORDERS: {
        label: "Order Management",
        permissions: {
            VIEW_PO: "po:view",
            CREATE_PO: "po:create",
            APPROVE_PO: "po:approve",
            RECEIVE_PO: "po:receive",
            DELETE_PO: "po:delete",
            VIEW_JO: "jo:view",
            CREATE_JO: "jo:create",
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
            PRICE_OVERRIDE_POS: "pos:price_override",
            ADJUST_CASH_DRAWER: "pos:cash_drawer_adjust",
            CLOSE_DAY_POS: "pos:close_day",
            REPRINT_POS_RECEIPT: "pos:reprint"
        }
    },
    STOCK: {
        label: "Stock Control",
        permissions: {
            VIEW_STOCK: "stock:view",
            ADJUST_STOCK: "stock:adjust",
            VIEW_BATCHES: "batches:view",
            EDIT_BATCHES: "batches:edit"
        }
    },
    REPORTS: {
        label: "Analytics & Reports",
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
    SYSTEM: {
        label: "Administration",
        permissions: {
            MANAGE_USERS: "users:manage",
            VIEW_SETTINGS: "settings:view",
            EDIT_SETTINGS: "settings:edit",
            VIEW_USERS: "users:view",
            DELETE_USERS: "users:delete",
            VIEW_AUDIT: "audit:view"
        }
    }
};

/**
 * AI Tools Configuration for OpenAI Function Calling
 *
 * These tools map to existing backend services and define what
 * the AI assistant can do within the SKU Inventory Manager.
 */

// Tool categories for organization
export const TOOL_CATEGORIES = {
  READ: 'read',           // No confirmation needed
  WRITE: 'write',         // Requires confirmation
  ANALYSIS: 'analysis',   // No confirmation needed
  IMPORT_EXPORT: 'import_export', // Requires confirmation for imports
  FILE_MANAGEMENT: 'file_management', // Physical file system operations
  INVENTORY_GROUPING: 'inventory_grouping' // Logical item grouping (folders)
};

// Role requirements for each tool
export const TOOL_PERMISSIONS = {
  staff: ['read', 'analysis'],
  manager: ['read', 'write', 'analysis', 'import_export', 'file_management', 'inventory_grouping'],
  admin: ['read', 'write', 'analysis', 'import_export', 'file_management', 'inventory_grouping']
};

/**
 * OpenAI Function Calling Tool Definitions
 */
export const AI_TOOLS = [
  // ============== FILE MANAGEMENT ==============
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and folders in the physical 'uploads/' directory on the server. Use this for management of uploaded documents/images, NOT for organizing inventory items.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to list (default: root uploads folder)"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.FILE_MANAGEMENT,
    requiresConfirmation: false
  },
  {
    type: "function",
    function: {
      name: "create_folder",
      description: "Create a new physical folder in the server's 'uploads/' directory. Use this for file storage organization, NOT for inventory items.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Name or relative path of the new folder (e.g., 'Reports' or '2024/Invoices')"
          }
        },
        required: ["path"]
      }
    },
    category: TOOL_CATEGORIES.FILE_MANAGEMENT,
    requiresConfirmation: true,
    requiredRole: "manager"
  },
  {
    type: "function",
    function: {
      name: "move_file",
      description: "Move or rename a physical file/folder within the 'uploads/' directory.",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Current path of the file/folder"
          },
          destination: {
            type: "string",
            description: "New path or folder location"
          }
        },
        required: ["source", "destination"]
      }
    },
    category: TOOL_CATEGORIES.FILE_MANAGEMENT,
    requiresConfirmation: true,
    requiredRole: "manager"
  },

  // ============== INVENTORY GROUPING (LOGICAL FOLDERS) ==============
  {
    type: "function",
    function: {
      name: "get_inventory_folders",
      description: "List logical inventory folders (groups) used to organize SKU items. Returns folder names and item counts.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    category: TOOL_CATEGORIES.INVENTORY_GROUPING,
    requiresConfirmation: false
  },
  {
    type: "function",
    function: {
      name: "create_inventory_folder",
      description: "Create a new logical folder to group inventory items together (e.g., 'Packaging', 'Raw Materials').",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the logical folder"
          },
          description: {
            type: "string",
            description: "Description of what this folder contains"
          }
        },
        required: ["name"]
      }
    },
    category: TOOL_CATEGORIES.INVENTORY_GROUPING,
    requiresConfirmation: true,
    requiredRole: "manager"
  },
  {
    type: "function",
    function: {
      name: "move_items_to_inventory_folder",
      description: "Move items into a logical inventory folder. Both existing and new folders can be used.",
      parameters: {
        type: "object",
        properties: {
          folder_name: {
            type: "string",
            description: "Target folder name"
          },
          item_ids: {
            type: "array",
            items: { type: "integer" },
            description: "List of item IDs to move"
          }
        },
        required: ["folder_name", "item_ids"]
      }
    },
    category: TOOL_CATEGORIES.INVENTORY_GROUPING,
    requiresConfirmation: true,
    requiredRole: "manager"
  },
  {
    type: "function",
    function: {
      name: "get_items_in_inventory_folder",
      description: "List all inventory items assigned to a specific logical folder.",
      parameters: {
        type: "object",
        properties: {
          folder_name: {
            type: "string",
            description: "Folder name to filter by"
          }
        },
        required: ["folder_name"]
      }
    },
    category: TOOL_CATEGORIES.INVENTORY_GROUPING,
    requiresConfirmation: false
  },

  // ============== DASHBOARD & STATS ==============
  {
    type: "function",
    function: {
      name: "get_dashboard_stats",
      description: "Get overall inventory statistics including total items, low stock count, healthy stock count, overstock count, pending POs, active JOs, and total inventory value.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false
  },
  {
    type: "function",
    function: {
      name: "get_low_stock_items",
      description: "Get a list of items that are below their minimum stock threshold. Returns item details with current stock vs threshold.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Maximum number of items to return (default: 20)"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false
  },

  // ============== ITEMS ==============
  {
    type: "function",
    function: {
      name: "get_items",
      description: "Search and list inventory items with filtering options. Can filter by category, status, stock level, or search by name/SKU. USE THIS FIRST when a user mentions any item by name - search for it before asking for clarification.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Search term to filter items by name or SKU code"
          },
          category: {
            type: "string",
            enum: ["raw_material", "packaging", "product", "supplies"],
            description: "Filter by item category"
          },
          status: {
            type: "string",
            enum: ["active", "inactive", "draft"],
            description: "Filter by item status"
          },
          stock_status: {
            type: "string",
            enum: ["low", "healthy", "overstock"],
            description: "Filter by stock level status"
          },
          limit: {
            type: "integer",
            description: "Maximum number of items to return (default: 50)"
          },
          page: {
            type: "integer",
            description: "Page number for pagination (default: 1)"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false
  },
  {
    type: "function",
    function: {
      name: "get_item_details",
      description: "Get detailed information about a specific item including FIFO batches, stock history, suppliers who provide this item, and composition (for products). USE THIS to find which suppliers can fulfill orders for a specific item.",
      parameters: {
        type: "object",
        properties: {
          item_id: {
            type: "integer",
            description: "The ID of the item to retrieve"
          },
          sku_code: {
            type: "string",
            description: "The SKU code of the item (alternative to item_id)"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false
  },
  {
    type: "function",
    function: {
      name: "create_item",
      description: "Create a new inventory item. Requires manager or admin role. Auto-calculates min_threshold (40% of max_capacity) and purchase_allowance (20% of max_capacity).",
      parameters: {
        type: "object",
        properties: {
          sku_code: {
            type: "string",
            description: "Unique SKU code for the item"
          },
          name: {
            type: "string",
            description: "Name of the item"
          },
          category: {
            type: "string",
            enum: ["raw_material", "packaging", "product", "supplies"],
            description: "Item category"
          },
          product_type: {
            type: "string",
            enum: ["work_in_progress", "finished_goods"],
            description: "Required only if category is 'product'"
          },
          description: {
            type: "string",
            description: "Item description"
          },
          max_capacity: {
            type: "number",
            description: "Maximum storage capacity"
          },
          unit_of_measure: {
            type: "string",
            description: "Unit of measure (e.g., 'kg', 'pcs', 'ml')"
          },
          cost_per_unit: {
            type: "number",
            description: "Cost per unit"
          },
          fifo_enabled: {
            type: "boolean",
            description: "Enable FIFO batch tracking (default: true)"
          }
        },
        required: ["sku_code", "name", "category", "max_capacity", "unit_of_measure"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "manager"
  },
  {
    type: "function",
    function: {
      name: "update_item",
      description: "Update an existing inventory item. Requires manager or admin role.",
      parameters: {
        type: "object",
        properties: {
          item_id: {
            type: "integer",
            description: "The ID of the item to update"
          },
          name: {
            type: "string",
            description: "Updated name"
          },
          description: {
            type: "string",
            description: "Updated description"
          },
          max_capacity: {
            type: "number",
            description: "Updated maximum capacity (will recalculate thresholds)"
          },
          cost_per_unit: {
            type: "number",
            description: "Updated cost per unit"
          }
        },
        required: ["item_id"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "manager"
  },
  {
    type: "function",
    function: {
      name: "delete_item",
      description: "Soft-delete an inventory item. Sets status to 'inactive'. Requires admin role. Item can be restored later.",
      parameters: {
        type: "object",
        properties: {
          item_id: {
            type: "integer",
            description: "The ID of the item to delete"
          },
          reason: {
            type: "string",
            description: "Reason for deletion"
          }
        },
        required: ["item_id"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "admin"
  },

  // ============== SUPPLIERS ==============
  {
    type: "function",
    function: {
      name: "get_suppliers",
      description: "List all suppliers with optional filtering. USE THIS when user asks about suppliers or when you need to present supplier options for ordering.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Search by supplier name"
          },
          status: {
            type: "string",
            enum: ["active", "inactive", "draft"],
            description: "Filter by status"
          },
          limit: {
            type: "integer",
            description: "Maximum number to return"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false
  },
  {
    type: "function",
    function: {
      name: "get_supplier_details",
      description: "Get detailed information about a supplier including items they supply.",
      parameters: {
        type: "object",
        properties: {
          supplier_id: {
            type: "integer",
            description: "The ID of the supplier"
          }
        },
        required: ["supplier_id"]
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false
  },

  {
    type: "function",
    function: {
      name: "create_supplier",
      description: "Register a new supplier. Requires manager or admin role.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Supplier name"
          },
          contact_person: {
            type: "string",
            description: "Contact person name"
          },
          email: {
            type: "string",
            description: "Email address"
          },
          phone: {
            type: "string",
            description: "Phone number"
          },
          address: {
            type: "string",
            description: "Physical address"
          },
          lead_time: {
            type: "integer",
            description: "Average lead time in days"
          }
        },
        required: ["name"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "manager"
  },
  {
    type: "function",
    function: {
      name: "update_supplier",
      description: "Update supplier details. Requires manager or admin role.",
      parameters: {
        type: "object",
        properties: {
          supplier_id: {
            type: "integer",
            description: "Supplier ID"
          },
          name: {
            type: "string",
            description: "Updated name"
          },
          contact_person: {
            type: "string",
            description: "Updated contact person"
          },
          email: {
            type: "string",
            description: "Updated email"
          },
          phone: {
            type: "string",
            description: "Updated phone"
          },
          status: {
            type: "string",
            enum: ["active", "inactive"],
            description: "Update status"
          }
        },
        required: ["supplier_id"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "manager"
  },
  {
    type: "function",
    function: {
      name: "delete_supplier",
      description: "Soft-delete a supplier. Requires admin role. Will fail if supplier has active Purchase Orders.",
      parameters: {
        type: "object",
        properties: {
          supplier_id: {
            type: "integer",
            description: "Supplier ID to delete"
          },
          reason: {
            type: "string",
            description: "Reason for deletion"
          }
        },
        required: ["supplier_id"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "admin"
  },
  {
    type: "function",
    function: {
      name: "add_supplier_item",
      description: "Link an item to a supplier with price and MOQ. Essential for PO creation.",
      parameters: {
        type: "object",
        properties: {
          supplier_id: {
            type: "integer",
            description: "Supplier ID"
          },
          item_id: {
            type: "integer",
            description: "Item ID"
          },
          moq: {
            type: "integer",
            description: "Minimum Order Quantity"
          },
          price_per_unit: {
            type: "number",
            description: "Agreed price per unit"
          }
        },
        required: ["supplier_id", "item_id", "price_per_unit"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "manager"
  },

  // ============== PURCHASE ORDERS ==============
  {
    type: "function",
    function: {
      name: "get_purchase_orders",
      description: "List purchase orders with filtering options.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["draft", "pending", "partial", "received", "cancelled", "archived"],
            description: "Filter by PO status"
          },
          supplier_id: {
            type: "integer",
            description: "Filter by supplier"
          },
          date_from: {
            type: "string",
            format: "date",
            description: "Filter POs from this date"
          },
          date_to: {
            type: "string",
            format: "date",
            description: "Filter POs until this date"
          },
          limit: {
            type: "integer",
            description: "Maximum number to return"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false
  },
  {
    type: "function",
    function: {
      name: "create_purchase_order",
      description: "Create a new purchase order for a supplier. Requires manager or admin role. BEFORE calling this, you should have already looked up the item and its suppliers using get_item_details.",
      parameters: {
        type: "object",
        properties: {
          supplier_id: {
            type: "integer",
            description: "The ID of the supplier"
          },
          items: {
            type: "array",
            description: "Array of items to order",
            items: {
              type: "object",
              properties: {
                item_id: {
                  type: "integer",
                  description: "Item ID"
                },
                quantity: {
                  type: "number",
                  description: "Quantity to order"
                },
                unit_price: {
                  type: "number",
                  description: "Price per unit"
                }
              },
              required: ["item_id", "quantity"]
            }
          },
          expected_delivery_date: {
            type: "string",
            format: "date",
            description: "Expected delivery date"
          },
          notes: {
            type: "string",
            description: "Order notes"
          }
        },
        required: ["supplier_id", "items"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "manager"
  },
  {
    type: "function",
    function: {
      name: "receive_purchase_order",
      description: "Mark a purchase order as received. Creates FIFO batches and updates stock. Requires manager or admin role.",
      parameters: {
        type: "object",
        properties: {
          po_id: {
            type: "integer",
            description: "The ID of the purchase order"
          },
          received_items: {
            type: "array",
            description: "Items received with quantities",
            items: {
              type: "object",
              properties: {
                line_item_id: {
                  type: "integer",
                  description: "Line item ID"
                },
                received_quantity: {
                  type: "number",
                  description: "Quantity actually received"
                },
                expiry_date: {
                  type: "string",
                  format: "date",
                  description: "Expiry date for the batch (optional for non-perishables)"
                }
              },
              required: ["line_item_id", "received_quantity"]
            }
          }
        },
        required: ["po_id"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "manager"
  },

  // ============== SYSTEM SETTINGS ==============
  {
    type: "function",
    function: {
      name: "get_system_settings",
      description: "Get all system configuration settings (thresholds, alerts, preferences). Requires admin role.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false,
    requiredRole: "admin"
  },
  {
    type: "function",
    function: {
      name: "update_system_settings",
      description: "Update system configuration. Requires admin role. Can update multiple settings at once.",
      parameters: {
        type: "object",
        properties: {
          updates: {
            type: "object",
            description: "Key-value pairs of settings to update (e.g., { 'low_stock_threshold': '15', 'enable_email_alerts': 'true' })"
          }
        },
        required: ["updates"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "admin"
  },

  // ============== USER MANAGEMENT ==============
  {
    type: "function",
    function: {
      name: "get_users",
      description: "List all system users. Requires admin role.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false,
    requiredRole: "admin"
  },
  {
    type: "function",
    function: {
      name: "update_user_role",
      description: "Update a user's role. Requires admin role. Cannot change own role.",
      parameters: {
        type: "object",
        properties: {
          target_user_id: {
            type: "integer",
            description: "ID of the user to update"
          },
          new_role: {
            type: "string",
            enum: ["staff", "manager", "admin"],
            description: "New role to assign"
          }
        },
        required: ["target_user_id", "new_role"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "admin"
  },
  {
    type: "function",
    function: {
      name: "toggle_user_status",
      description: "Activate or deactivate a user account. Requires admin role. Cannot deactivate own account.",
      parameters: {
        type: "object",
        properties: {
          target_user_id: {
            type: "integer",
            description: "ID of the user to update"
          },
          is_active: {
            type: "boolean",
            description: "True to activate, False to deactivate"
          }
        },
        required: ["target_user_id", "is_active"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "admin"
  },
  {
    type: "function",
    function: {
      name: "remove_user_from_company",
      description: "Permanently remove a user from the company (soft delete). The user will no longer appear in user lists and cannot log in. They can be re-invited later if needed. Uses hierarchical access control: Admin can remove Manager/Staff, Manager can remove Staff only. Master Admin is always protected and cannot be removed. Cannot remove yourself.",
      parameters: {
        type: "object",
        properties: {
          target_user_id: {
            type: "integer",
            description: "ID of the user to remove from the company"
          }
        },
        required: ["target_user_id"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "manager"  // Manager can remove staff, Admin can remove manager/staff
  },

  // ============== ADVANCED USER MANAGEMENT ==============
  {
    type: "function",
    function: {
      name: "update_user_permissions",
      description: "Update granular permissions for a user. Requires users:manage permission. Cannot modify your own permissions. Only Master Admin can edit Admin users.",
      parameters: {
        type: "object",
        properties: {
          target_user_id: {
            type: "integer",
            description: "ID of the user whose permissions to update"
          },
          permissions: {
            type: "array",
            items: { type: "string" },
            description: "Array of permission strings to assign (e.g., ['items:view', 'items:create', 'po:view', 'po:create']). Use get_available_permissions to see all valid permissions."
          }
        },
        required: ["target_user_id", "permissions"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "admin",
    requiredPermission: "users:manage"
  },
  {
    type: "function",
    function: {
      name: "create_user_invitation",
      description: "Invite a new user by email. Sends an invitation email with a setup link. The invited user will receive an email to set up their account. Requires users:manage permission. Only Master Admin can invite Admin users.",
      parameters: {
        type: "object",
        properties: {
          email: {
            type: "string",
            description: "Email address of the user to invite"
          },
          role: {
            type: "string",
            enum: ["staff", "manager", "admin"],
            description: "Role to assign to the invited user. Staff=view only, Manager=full operational access, Admin=everything including user management"
          }
        },
        required: ["email", "role"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "admin",
    requiredPermission: "users:manage"
  },
  {
    type: "function",
    function: {
      name: "export_users_csv",
      description: "Export the user list to CSV format. Includes: username, email, role, active status, permission count, master admin flag, last login. Excludes pending invitations.",
      parameters: {
        type: "object",
        properties: {
          output_preference: {
            type: "string",
            enum: ["display", "download"],
            description: "How to return the data: 'display' shows first 10 rows in chat, 'download' provides a file download link"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false,
    requiredRole: "admin",
    requiredPermission: "users:manage"
  },
  {
    type: "function",
    function: {
      name: "import_users_csv",
      description: "Bulk import users from CSV. Creates invitations and sends emails for each valid entry. CSV format: email (required), role (optional, defaults to 'staff'). Skips existing emails. Requires users:manage permission.",
      parameters: {
        type: "object",
        properties: {
          csv_content: {
            type: "string",
            description: "CSV content with columns: email (required), role (optional). Example: 'email,role\\njohn@example.com,manager\\njane@example.com,staff'"
          }
        },
        required: ["csv_content"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "admin",
    requiredPermission: "users:manage"
  },
  {
    type: "function",
    function: {
      name: "get_available_permissions",
      description: "Get a list of all available permissions in the system, organized by category. Useful when setting up user permissions.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false,
    requiredRole: "admin",
    requiredPermission: "users:manage"
  },

  // ============== STRATEGIC REPORTING ==============
  {
    type: "function",
    function: {
      name: "generate_executive_summary",
      description: "Generate a high-level executive summary of the inventory status, including financial value, critical alerts, and operational bottlenecks. Good for daily briefings.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    category: TOOL_CATEGORIES.ANALYSIS,
    requiresConfirmation: false,
    requiredRole: "manager"
  },

  // ============== JOB ORDERS ==============
  {
    type: "function",
    function: {
      name: "get_job_orders",
      description: "List job orders (production orders) with filtering options.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["draft", "in_progress", "partial", "completed", "cancelled", "archived"],
            description: "Filter by JO status"
          },
          product_id: {
            type: "integer",
            description: "Filter by product"
          },
          limit: {
            type: "integer",
            description: "Maximum number to return"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false
  },
  {
    type: "function",
    function: {
      name: "create_job_order",
      description: "Create a new job order for production. Reserves ingredients. Requires manager or admin role.",
      parameters: {
        type: "object",
        properties: {
          product_id: {
            type: "integer",
            description: "The ID of the product to produce"
          },
          quantity_to_produce: {
            type: "number",
            description: "Quantity to produce"
          },
          notes: {
            type: "string",
            description: "Production notes"
          }
        },
        required: ["product_id", "quantity_to_produce"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "manager"
  },
  {
    type: "function",
    function: {
      name: "complete_job_order",
      description: "Complete a job order. Consumes ingredients via FIFO, creates finished goods batch. Requires manager or admin role.",
      parameters: {
        type: "object",
        properties: {
          jo_id: {
            type: "integer",
            description: "The ID of the job order"
          },
          quantity_produced: {
            type: "number",
            description: "Actual quantity produced"
          },
          expiry_date: {
            type: "string",
            format: "date",
            description: "Expiry date for the finished goods batch"
          }
        },
        required: ["jo_id", "quantity_produced"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "manager"
  },

  // ============== STOCK MOVEMENTS ==============
  {
    type: "function",
    function: {
      name: "get_stock_movements",
      description: "Get stock movement audit trail with filtering options.",
      parameters: {
        type: "object",
        properties: {
          item_id: {
            type: "integer",
            description: "Filter by item"
          },
          movement_type: {
            type: "string",
            enum: ["production_consumption", "purchase_receipt", "return", "transfer", "calculated_loss", "adjustment", "production_output"],
            description: "Filter by movement type"
          },
          date_from: {
            type: "string",
            format: "date",
            description: "Filter from this date"
          },
          date_to: {
            type: "string",
            format: "date",
            description: "Filter until this date"
          },
          limit: {
            type: "integer",
            description: "Maximum number to return"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false
  },
  {
    type: "function",
    function: {
      name: "create_stock_adjustment",
      description: "Create a manual stock adjustment. Requires manager or admin role.",
      parameters: {
        type: "object",
        properties: {
          item_id: {
            type: "integer",
            description: "The item to adjust"
          },
          quantity: {
            type: "number",
            description: "Quantity to add (positive) or remove (negative)"
          },
          movement_type: {
            type: "string",
            enum: ["adjustment", "return", "calculated_loss", "transfer"],
            description: "Type of adjustment"
          },
          reason: {
            type: "string",
            description: "Reason for the adjustment"
          },
          batch_id: {
            type: "integer",
            description: "Specific FIFO batch to adjust (optional, uses oldest if not specified)"
          }
        },
        required: ["item_id", "quantity", "movement_type", "reason"]
      }
    },
    category: TOOL_CATEGORIES.WRITE,
    requiresConfirmation: true,
    requiredRole: "manager"
  },

  // ============== ALERTS & FORECASTING ==============
  {
    type: "function",
    function: {
      name: "get_expiry_alerts",
      description: "Get alerts for items with batches expiring soon.",
      parameters: {
        type: "object",
        properties: {
          critical_days: {
            type: "integer",
            description: "Days threshold for critical alerts (default: 7)"
          },
          warning_days: {
            type: "integer",
            description: "Days threshold for warning alerts (default: 30)"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false
  },
  {
    type: "function",
    function: {
      name: "get_forecast",
      description: "Get stock level forecast for items based on consumption patterns.",
      parameters: {
        type: "object",
        properties: {
          item_id: {
            type: "integer",
            description: "Specific item to forecast (optional, forecasts all low stock items if not specified)"
          },
          days: {
            type: "integer",
            description: "Number of days to forecast (default: 30)"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.ANALYSIS,
    requiresConfirmation: false
  },

  // ============== DOCUMENTATION (RAG) ==============
  {
    type: "function",
    function: {
      name: "search_documentation",
      description: "Search project documentation to answer questions about how the system works, features, or troubleshooting.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The question or search query"
          }
        },
        required: ["query"]
      }
    },
    category: TOOL_CATEGORIES.READ,
    requiresConfirmation: false
  },

  // ============== PRODUCTION FEASIBILITY ==============
  {
    type: "function",
    function: {
      name: "analyze_production_feasibility",
      description: "Analyze what products can be made with current ingredient stock. Handles nested products (products that use other products as ingredients). Shows full production chains and raw material requirements.",
      parameters: {
        type: "object",
        properties: {
          product_id: {
            type: "integer",
            description: "Check feasibility for a specific product only (optional)"
          },
          include_partial: {
            type: "boolean",
            description: "Include products that can be partially produced (default: true)"
          },
          show_chain: {
            type: "boolean",
            description: "Show full production chain for nested products (default: true)"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.ANALYSIS,
    requiresConfirmation: false
  },
  {
    type: "function",
    function: {
      name: "analyze_reorder_needs",
      description: "Analyze stock consumption velocity (burn rate) and supplier lead times to recommend items that need reordering. Returns dynamic Reorder Points (ROP) based on actual usage rather than static thresholds.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["raw_material", "packaging", "product", "supplies"],
            description: "Optional: Filter recommendations by category"
          },
          item_id: {
            type: "integer",
            description: "Optional: Analyze a specific item ID only"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.ANALYSIS,
    requiresConfirmation: false
  },
  {
    type: "function",
    function: {
      name: "detect_anomalies",
      description: "Analyze stock history for suspicious activities (e.g., potential theft, large losses, unusual consumption spikes, or frequent manual adjustments).",
      parameters: {
        type: "object",
        properties: {
          confidence_threshold: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Sensitivity of detection (default: medium)"
          },
          category: {
            type: "string",
            description: "Optional: Filter by category"
          }
        },
        required: []
      }
    },
    category: TOOL_CATEGORIES.ANALYSIS,
    requiresConfirmation: false
  },
  {
    type: "function",
    function: {
      name: "get_advanced_analytics",
      description: "Get deep insights into Supplier Performance (on-time rate, quality) or Inventory Costs (COGS, waste value).",
      parameters: {
        type: "object",
        properties: {
          analysis_type: {
            type: "string",
            enum: ["supplier_performance", "cost_analysis"],
            description: "Type of analysis to perform"
          },
          target_id: {
            type: "integer",
            description: "Supplier ID (required for supplier_performance)"
          },
          date_range: {
            type: "object",
            description: "Optional date range filter for the analysis",
            properties: {
              start: { type: "string", format: "date", description: "Start date in YYYY-MM-DD format" },
              end: { type: "string", format: "date", description: "End date in YYYY-MM-DD format" }
            }
          }
        },
        required: ["analysis_type"]
      }
    },
    category: TOOL_CATEGORIES.ANALYSIS,
    requiresConfirmation: false
  },

  // ============== CSV IMPORT/EXPORT ==============
  {
    type: "function",
    function: {
      name: "import_csv_data",
      description: "Parse and validate CSV data for import. Supports items and suppliers. When the user attaches a CSV file, EXTRACT the CSV content from the message (it will appear between '--- FILE: ... ---' and '--- END FILE ---' markers) and pass it as csv_content. Returns preview for confirmation before actual import.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            enum: ["items", "suppliers"],
            description: "What type of data to import"
          },
          csv_content: {
            type: "string",
            description: "The raw CSV content (header row + data rows). Extract this from the file attachment in the user's message if they uploaded a file."
          },
          options: {
            type: "object",
            description: "Import options to control behavior",
            properties: {
              skip_duplicates: {
                type: "boolean",
                description: "Skip rows with duplicate SKU codes (default: true)"
              },
              update_existing: {
                type: "boolean",
                description: "Update existing items instead of skipping (default: false)"
              }
            }
          }
        },
        required: ["entity_type", "csv_content"]
      }
    },
    category: TOOL_CATEGORIES.IMPORT_EXPORT,
    requiresConfirmation: true,
    requiredRole: "manager"
  },
  {
    type: "function",
    function: {
      name: "export_to_csv",
      description: "Export data as CSV. Can display in chat or generate a download link. Always asks user for their preference before generating.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            enum: ["items", "suppliers", "purchase_orders", "job_orders", "stock_movements", "audit_logs"],
            description: "What type of data to export"
          },
          filters: {
            type: "object",
            description: "Optional filters to apply",
            properties: {
              status: { type: "string", description: "Filter by status value" },
              category: { type: "string", description: "Filter by category" },
              date_from: { type: "string", format: "date", description: "Start date filter in YYYY-MM-DD format" },
              date_to: { type: "string", format: "date", description: "End date filter in YYYY-MM-DD format" },
              stock_status: { type: "string", description: "Filter by stock status (low, healthy, overstock)" }
            }
          },
          output_preference: {
            type: "string",
            enum: ["ask_user", "display", "download"],
            description: "How to deliver the export. Use 'ask_user' to prompt for preference."
          }
        },
        required: ["entity_type"]
      }
    },
    category: TOOL_CATEGORIES.IMPORT_EXPORT,
    requiresConfirmation: false
  }
];

/**
 * Get tools available for a specific user role
 */
export const getToolsForRole = (role) => {
  const allowedCategories = TOOL_PERMISSIONS[role] || TOOL_PERMISSIONS.staff;

  return AI_TOOLS.filter(tool => {
    // Check if tool category is allowed
    if (!allowedCategories.includes(tool.category)) {
      return false;
    }

    // Check if tool has a specific role requirement
    if (tool.requiredRole) {
      const roleHierarchy = { staff: 1, manager: 2, admin: 3 };
      const userLevel = roleHierarchy[role] || 1;
      const requiredLevel = roleHierarchy[tool.requiredRole] || 1;
      return userLevel >= requiredLevel;
    }

    return true;
  });
};

/**
 * Get tool definition by name
 */
export const getToolByName = (name) => {
  return AI_TOOLS.find(tool => tool.function.name === name);
};

/**
 * Check if a tool requires confirmation
 */
export const toolRequiresConfirmation = (toolName) => {
  const tool = getToolByName(toolName);
  return tool ? tool.requiresConfirmation : true; // Default to requiring confirmation
};

/**
 * Get OpenAI-formatted tools (without metadata)
 */
export const getOpenAITools = (role = 'staff') => {
  const availableTools = getToolsForRole(role);
  return availableTools.map(tool => ({
    type: tool.type,
    function: tool.function
  }));
};

export default {
  AI_TOOLS,
  TOOL_CATEGORIES,
  TOOL_PERMISSIONS,
  getToolsForRole,
  getToolByName,
  toolRequiresConfirmation,
  getOpenAITools
};

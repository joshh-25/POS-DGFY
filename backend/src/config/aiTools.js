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
  IMPORT_EXPORT: 'import_export' // Requires confirmation for imports
};

// Role requirements for each tool
export const TOOL_PERMISSIONS = {
  staff: ['read', 'analysis'],
  manager: ['read', 'write', 'analysis', 'import_export'],
  admin: ['read', 'write', 'analysis', 'import_export']
};

/**
 * OpenAI Function Calling Tool Definitions
 */
export const AI_TOOLS = [
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
      description: "Search and list inventory items with filtering options. Can filter by category, status, stock level, or search by name/SKU.",
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
      description: "Get detailed information about a specific item including FIFO batches, stock history, and composition (for products).",
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
      description: "List all suppliers with optional filtering.",
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
      description: "Create a new purchase order for a supplier. Requires manager or admin role.",
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
            properties: {
              start: { type: "string", format: "date" },
              end: { type: "string", format: "date" }
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
      description: "Parse and validate CSV data for import. Supports items and suppliers. Returns preview for confirmation before actual import.",
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
            description: "The CSV content (header row + data rows)"
          },
          options: {
            type: "object",
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
              status: { type: "string" },
              category: { type: "string" },
              date_from: { type: "string", format: "date" },
              date_to: { type: "string", format: "date" },
              stock_status: { type: "string" }
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

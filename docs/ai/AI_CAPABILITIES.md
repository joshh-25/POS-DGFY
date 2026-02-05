# AI Capabilities Reference

> **Auto-generated** - Do not edit manually
>
> Generated: 2026-01-31T03:50:11.241Z
> Tool Count: 36

This document is automatically generated from `backend/src/config/aiTools.js`.
For the full AI Assistant documentation, see [AI_GUIDELINES.md](../AI_GUIDELINES.md).

---

## Summary

| Metric | Count |
|--------|-------|
| Total Tools | 36 |
| Read Operations | 20 |
| Write Operations | 16 |

### By Category

| Category | Count | Description |
|----------|-------|-------------|
| `analysis` | 6 | Analyze data, no confirmation needed |
| `import_export` | 2 | Import/Export data, imports require confirmation |
| `read` | 13 | Query data, no confirmation needed |
| `write` | 15 | Modify data, requires confirmation |

---

## Read Operations

These tools query data and do not require confirmation.

| Tool Name | Description | Required Role |
|-----------|-------------|---------------|
| `analyze_production_feasibility` | Analyze what products can be made with current ingredient stock. Handles nest... | Any |
| `analyze_reorder_needs` | Analyze stock consumption velocity (burn rate) and supplier lead times to rec... | Any |
| `detect_anomalies` | Analyze stock history for suspicious activities (e.g., potential theft, large... | Any |
| `export_to_csv` | Export data as CSV. Can display in chat or generate a download link. Always a... | Any |
| `generate_executive_summary` | Generate a high-level executive summary of the inventory status, including fi... | manager |
| `get_advanced_analytics` | Get deep insights into Supplier Performance (on-time rate, quality) or Invent... | Any |
| `get_dashboard_stats` | Get overall inventory statistics including total items, low stock count, heal... | Any |
| `get_expiry_alerts` | Get alerts for items with batches expiring soon. | Any |
| `get_forecast` | Get stock level forecast for items based on consumption patterns. | Any |
| `get_item_details` | Get detailed information about a specific item including FIFO batches, stock ... | Any |
| `get_items` | Search and list inventory items with filtering options. Can filter by categor... | Any |
| `get_job_orders` | List job orders (production orders) with filtering options. | Any |
| `get_low_stock_items` | Get a list of items that are below their minimum stock threshold. Returns ite... | Any |
| `get_purchase_orders` | List purchase orders with filtering options. | Any |
| `get_stock_movements` | Get stock movement audit trail with filtering options. | Any |
| `get_supplier_details` | Get detailed information about a supplier including items they supply. | Any |
| `get_suppliers` | List all suppliers with optional filtering. USE THIS when user asks about sup... | Any |
| `get_system_settings` | Get all system configuration settings (thresholds, alerts, preferences). Requ... | admin |
| `get_users` | List all system users. Requires admin role. | admin |
| `search_documentation` | Search project documentation to answer questions about how the system works, ... | Any |

---

## Write Operations

These tools modify data and **require user confirmation** before execution.

| Tool Name | Description | Required Role |
|-----------|-------------|---------------|
| `add_supplier_item` | Link an item to a supplier with price and MOQ. Essential for PO creation. | manager |
| `complete_job_order` | Complete a job order. Consumes ingredients via FIFO, creates finished goods b... | manager |
| `create_item` | Create a new inventory item. Requires manager or admin role. Auto-calculates ... | manager |
| `create_job_order` | Create a new job order for production. Reserves ingredients. Requires manager... | manager |
| `create_purchase_order` | Create a new purchase order for a supplier. Requires manager or admin role. B... | manager |
| `create_stock_adjustment` | Create a manual stock adjustment. Requires manager or admin role. | manager |
| `create_supplier` | Register a new supplier. Requires manager or admin role. | manager |
| `delete_item` | Soft-delete an inventory item. Sets status to 'inactive'. Requires admin role... | admin |
| `delete_supplier` | Soft-delete a supplier. Requires admin role. Will fail if supplier has active... | admin |
| `import_csv_data` | Parse and validate CSV data for import. Supports items and suppliers. When th... | manager |
| `receive_purchase_order` | Mark a purchase order as received. Creates FIFO batches and updates stock. Re... | manager |
| `toggle_user_status` | Activate or deactivate a user account. Requires admin role. Cannot deactivate... | admin |
| `update_item` | Update an existing inventory item. Requires manager or admin role. | manager |
| `update_supplier` | Update supplier details. Requires manager or admin role. | manager |
| `update_system_settings` | Update system configuration. Requires admin role. Can update multiple setting... | admin |
| `update_user_role` | Update a user's role. Requires admin role. Cannot change own role. | admin |

---

## Detailed Tool Reference

### Read Tools

#### `get_dashboard_stats`

Get overall inventory statistics including total items, low stock count, healthy stock count, overstock count, pending POs, active JOs, and total inventory value.

**Parameters:** None

---

#### `get_expiry_alerts`

Get alerts for items with batches expiring soon.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `critical_days` | integer | No | Days threshold for critical alerts (default: 7) |
| `warning_days` | integer | No | Days threshold for warning alerts (default: 30) |

---

#### `get_item_details`

Get detailed information about a specific item including FIFO batches, stock history, suppliers who provide this item, and composition (for products). USE THIS to find which suppliers can fulfill orders for a specific item.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `item_id` | integer | No | The ID of the item to retrieve |
| `sku_code` | string | No | The SKU code of the item (alternative to item_id) |

---

#### `get_items`

Search and list inventory items with filtering options. Can filter by category, status, stock level, or search by name/SKU. USE THIS FIRST when a user mentions any item by name - search for it before asking for clarification.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `search` | string | No | Search term to filter items by name or SKU code |
| `category` | string | No | Filter by item category |
| `status` | string | No | Filter by item status |
| `stock_status` | string | No | Filter by stock level status |
| `limit` | integer | No | Maximum number of items to return (default: 50) |
| `page` | integer | No | Page number for pagination (default: 1) |

---

#### `get_job_orders`

List job orders (production orders) with filtering options.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by JO status |
| `product_id` | integer | No | Filter by product |
| `limit` | integer | No | Maximum number to return |

---

#### `get_low_stock_items`

Get a list of items that are below their minimum stock threshold. Returns item details with current stock vs threshold.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | integer | No | Maximum number of items to return (default: 20) |

---

#### `get_purchase_orders`

List purchase orders with filtering options.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by PO status |
| `supplier_id` | integer | No | Filter by supplier |
| `date_from` | string | No | Filter POs from this date |
| `date_to` | string | No | Filter POs until this date |
| `limit` | integer | No | Maximum number to return |

---

#### `get_stock_movements`

Get stock movement audit trail with filtering options.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `item_id` | integer | No | Filter by item |
| `movement_type` | string | No | Filter by movement type |
| `date_from` | string | No | Filter from this date |
| `date_to` | string | No | Filter until this date |
| `limit` | integer | No | Maximum number to return |

---

#### `get_supplier_details`

Get detailed information about a supplier including items they supply.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `supplier_id` | integer | Yes | The ID of the supplier |

---

#### `get_suppliers`

List all suppliers with optional filtering. USE THIS when user asks about suppliers or when you need to present supplier options for ordering.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `search` | string | No | Search by supplier name |
| `status` | string | No | Filter by status |
| `limit` | integer | No | Maximum number to return |

---

#### `get_system_settings`

Get all system configuration settings (thresholds, alerts, preferences). Requires admin role.

> 🔐 **Required role:** admin

**Parameters:** None

---

#### `get_users`

List all system users. Requires admin role.

> 🔐 **Required role:** admin

**Parameters:** None

---

#### `search_documentation`

Search project documentation to answer questions about how the system works, features, or troubleshooting.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | The question or search query |

---

### Analysis Tools

#### `analyze_production_feasibility`

Analyze what products can be made with current ingredient stock. Handles nested products (products that use other products as ingredients). Shows full production chains and raw material requirements.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `product_id` | integer | No | Check feasibility for a specific product only (optional) |
| `include_partial` | boolean | No | Include products that can be partially produced (default:... |
| `show_chain` | boolean | No | Show full production chain for nested products (default: ... |

---

#### `analyze_reorder_needs`

Analyze stock consumption velocity (burn rate) and supplier lead times to recommend items that need reordering. Returns dynamic Reorder Points (ROP) based on actual usage rather than static thresholds.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | No | Optional: Filter recommendations by category |
| `item_id` | integer | No | Optional: Analyze a specific item ID only |

---

#### `detect_anomalies`

Analyze stock history for suspicious activities (e.g., potential theft, large losses, unusual consumption spikes, or frequent manual adjustments).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `confidence_threshold` | string | No | Sensitivity of detection (default: medium) |
| `category` | string | No | Optional: Filter by category |

---

#### `generate_executive_summary`

Generate a high-level executive summary of the inventory status, including financial value, critical alerts, and operational bottlenecks. Good for daily briefings.

> 🔐 **Required role:** manager

**Parameters:** None

---

#### `get_advanced_analytics`

Get deep insights into Supplier Performance (on-time rate, quality) or Inventory Costs (COGS, waste value).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `analysis_type` | string | Yes | Type of analysis to perform |
| `target_id` | integer | No | Supplier ID (required for supplier_performance) |
| `date_range` | object | No | Optional date range filter for the analysis |

---

#### `get_forecast`

Get stock level forecast for items based on consumption patterns.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `item_id` | integer | No | Specific item to forecast (optional, forecasts all low st... |
| `days` | integer | No | Number of days to forecast (default: 30) |

---

### Write Tools

#### `add_supplier_item`

Link an item to a supplier with price and MOQ. Essential for PO creation.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** manager

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `supplier_id` | integer | Yes | Supplier ID |
| `item_id` | integer | Yes | Item ID |
| `moq` | integer | No | Minimum Order Quantity |
| `price_per_unit` | number | Yes | Agreed price per unit |

---

#### `complete_job_order`

Complete a job order. Consumes ingredients via FIFO, creates finished goods batch. Requires manager or admin role.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** manager

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jo_id` | integer | Yes | The ID of the job order |
| `quantity_produced` | number | Yes | Actual quantity produced |
| `expiry_date` | string | No | Expiry date for the finished goods batch |

---

#### `create_item`

Create a new inventory item. Requires manager or admin role. Auto-calculates min_threshold (40% of max_capacity) and purchase_allowance (20% of max_capacity).

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** manager

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sku_code` | string | Yes | Unique SKU code for the item |
| `name` | string | Yes | Name of the item |
| `category` | string | Yes | Item category |
| `product_type` | string | No | Required only if category is 'product' |
| `description` | string | No | Item description |
| `max_capacity` | number | Yes | Maximum storage capacity |
| `unit_of_measure` | string | Yes | Unit of measure (e.g., 'kg', 'pcs', 'ml') |
| `cost_per_unit` | number | No | Cost per unit |
| `fifo_enabled` | boolean | No | Enable FIFO batch tracking (default: true) |

---

#### `create_job_order`

Create a new job order for production. Reserves ingredients. Requires manager or admin role.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** manager

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `product_id` | integer | Yes | The ID of the product to produce |
| `quantity_to_produce` | number | Yes | Quantity to produce |
| `notes` | string | No | Production notes |

---

#### `create_purchase_order`

Create a new purchase order for a supplier. Requires manager or admin role. BEFORE calling this, you should have already looked up the item and its suppliers using get_item_details.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** manager

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `supplier_id` | integer | Yes | The ID of the supplier |
| `items` | array | Yes | Array of items to order |
| `expected_delivery_date` | string | No | Expected delivery date |
| `notes` | string | No | Order notes |

---

#### `create_stock_adjustment`

Create a manual stock adjustment. Requires manager or admin role.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** manager

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `item_id` | integer | Yes | The item to adjust |
| `quantity` | number | Yes | Quantity to add (positive) or remove (negative) |
| `movement_type` | string | Yes | Type of adjustment |
| `reason` | string | Yes | Reason for the adjustment |
| `batch_id` | integer | No | Specific FIFO batch to adjust (optional, uses oldest if n... |

---

#### `create_supplier`

Register a new supplier. Requires manager or admin role.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** manager

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Supplier name |
| `contact_person` | string | No | Contact person name |
| `email` | string | No | Email address |
| `phone` | string | No | Phone number |
| `address` | string | No | Physical address |
| `lead_time` | integer | No | Average lead time in days |

---

#### `delete_item`

Soft-delete an inventory item. Sets status to 'inactive'. Requires admin role. Item can be restored later.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** admin

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `item_id` | integer | Yes | The ID of the item to delete |
| `reason` | string | No | Reason for deletion |

---

#### `delete_supplier`

Soft-delete a supplier. Requires admin role. Will fail if supplier has active Purchase Orders.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** admin

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `supplier_id` | integer | Yes | Supplier ID to delete |
| `reason` | string | No | Reason for deletion |

---

#### `receive_purchase_order`

Mark a purchase order as received. Creates FIFO batches and updates stock. Requires manager or admin role.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** manager

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `po_id` | integer | Yes | The ID of the purchase order |
| `received_items` | array | No | Items received with quantities |

---

#### `toggle_user_status`

Activate or deactivate a user account. Requires admin role. Cannot deactivate own account.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** admin

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target_user_id` | integer | Yes | ID of the user to update |
| `is_active` | boolean | Yes | True to activate, False to deactivate |

---

#### `update_item`

Update an existing inventory item. Requires manager or admin role.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** manager

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `item_id` | integer | Yes | The ID of the item to update |
| `name` | string | No | Updated name |
| `description` | string | No | Updated description |
| `max_capacity` | number | No | Updated maximum capacity (will recalculate thresholds) |
| `cost_per_unit` | number | No | Updated cost per unit |

---

#### `update_supplier`

Update supplier details. Requires manager or admin role.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** manager

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `supplier_id` | integer | Yes | Supplier ID |
| `name` | string | No | Updated name |
| `contact_person` | string | No | Updated contact person |
| `email` | string | No | Updated email |
| `phone` | string | No | Updated phone |
| `status` | string | No | Update status |

---

#### `update_system_settings`

Update system configuration. Requires admin role. Can update multiple settings at once.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** admin

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `updates` | object | Yes | Key-value pairs of settings to update (e.g., { 'low_stock... |

---

#### `update_user_role`

Update a user's role. Requires admin role. Cannot change own role.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** admin

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target_user_id` | integer | Yes | ID of the user to update |
| `new_role` | string | Yes | New role to assign |

---

### Import export Tools

#### `export_to_csv`

Export data as CSV. Can display in chat or generate a download link. Always asks user for their preference before generating.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `entity_type` | string | Yes | What type of data to export |
| `filters` | object | No | Optional filters to apply |
| `output_preference` | string | No | How to deliver the export. Use 'ask_user' to prompt for p... |

---

#### `import_csv_data`

Parse and validate CSV data for import. Supports items and suppliers. When the user attaches a CSV file, EXTRACT the CSV content from the message (it will appear between '--- FILE: ... ---' and '--- END FILE ---' markers) and pass it as csv_content. Returns preview for confirmation before actual import.

> ⚠️ **Requires confirmation**

> 🔐 **Required role:** manager

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `entity_type` | string | Yes | What type of data to import |
| `csv_content` | string | Yes | The raw CSV content (header row + data rows). Extract thi... |
| `options` | object | No | Import options to control behavior |

---


---

## Role Permissions

| Role | Read | Write | Analysis | Import/Export |
|------|------|-------|----------|---------------|
| Staff | ✅ | ❌ | ✅ | ❌ |
| Manager | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ |

---

## Changelog

This file is regenerated on each run of `npm run generate:ai-docs`.
Check git history for changes.

---

*Generated by `backend/scripts/generate-ai-docs.js`*

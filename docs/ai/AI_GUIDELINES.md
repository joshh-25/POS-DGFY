> **Version:** 2.1.2
> **Last Updated:** May 8, 2026
> **Tool Count:** 66

This document describes the capabilities, limitations, and workflows of the SKUpervisor AI Assistant integrated into the DGFY platform (SKUpervisor is the IMS app's own codename — see `apps/dgfy-ims` — not the platform name).

> **Note:** For the complete auto-generated tool reference, see [generated/AI_CAPABILITIES.md](../generated/AI_CAPABILITIES.md).

---

## Overview

The SKUpervisor AI Assistant is powered by OpenAI's GPT-4 model and provides natural language interaction with the inventory management system. It can query data, create records, and provide intelligent recommendations while maintaining strict security and confirmation requirements for write operations.

---

## Capabilities Matrix

### Data Queries (Read Operations)

| Capability | Description | Example Query |
|------------|-------------|---------------|
| **Dashboard Stats** | View overall inventory health | "Show me dashboard statistics" |
| **Low Stock Alerts** | Find items below threshold | "What items are low on stock?" |
| **Item Search** | Search and filter items | "Find all raw materials with 'flour' in the name" |
| **Item Details** | Get specific item info | "Show details for SKU ABC-123" |
| **Supplier List** | View suppliers | "List all active suppliers" |
| **Purchase Orders** | Query PO history | "Show pending purchase orders" |
| **Job Orders** | Query production orders | "What job orders are in progress?" |
| **Stock Movements** | View audit trail | "Show stock movements for item 5" |
| **Expiry Alerts** | Check expiring batches | "What items are expiring this week?" |
| **Forecasts** | Stock predictions | "Forecast stock levels for the next 30 days" |

### Write Operations (Require Confirmation)

| Capability | Required Role | Description |
|------------|---------------|-------------|
| **Create Item** | Manager+ | Add new inventory items |
| **Update Item** | Manager+ | Modify item details |
| **Delete Item** | Admin | Soft-delete items |
| **Create PO** | Manager+ | Generate purchase orders |
| **Receive PO** | Manager+ | Mark PO as received, update stock |
| **Create JO** | Manager+ | Create production job orders |
| **Complete JO** | Manager+ | Finish job, update inventory |
| **Create DO** | Manager+ | Create dispatch orders for finished goods |
| **Edit Draft DO** | Manager+ | Replace lines / update recipient on draft DOs |
| **Confirm DO** | Manager+ | Lock in DO details (draft → confirmed) |
| **Dispatch Items** | Manager+ | Execute stock deduction (confirmed/partial → completed) |
| **Cancel DO** | Manager+ | Cancel draft, confirmed, or partial DOs |
| **Archive DO** | Manager+ | Archive completed or cancelled DOs |
| **Update DO Sale Price** | Manager+ | Retroactively adjust sale price on a dispatched line |
| **Stock Adjustment** | Manager+ | Manual stock corrections |
| **Create Folder** | Manager+ | Create inventory folder |
| **Bulk Create Folders** | Manager+ | Create multiple folders in one operation |
| **Delete Folder** | Manager+ | Delete an inventory folder (auto-unassigns items) |
| **Bulk Delete Folders** | Manager+ | Delete multiple folders in one operation |

### User Management (Admin Only)

| Capability | Required Permission | Description |
|------------|---------------------|-------------|
| **List Users** | `users:manage` | View all users in the tenant | `get_users` |
| **Update User Role** | `users:manage` | Change a user's role (staff/manager/admin) | `update_user_role` |
| **Toggle User Status** | `users:manage` | Activate/deactivate user accounts | `toggle_user_status` |
| **Update Permissions** | `users:manage` | Modify granular permissions for a user | `update_user_permissions` |
| **Invite User** | `users:manage` | Send email invitation to new user | `create_user_invitation` |
| **Export Users CSV** | `users:manage` | Export user list to CSV | `export_users_csv` |
| **Import Users CSV** | `users:manage` | Bulk invite users from CSV | `import_users_csv` |
| **Remove User** | `users:manage` | Remove a user from the company | `remove_user_from_company` |
| **List Permissions** | `users:manage` | View all available permissions | `get_available_permissions` |

#### User Management Hierarchy Rules

1. **Master Admin**: Can manage any user including other admins
2. **Regular Admin**: Can only manage Staff and Managers, not other Admins
3. **Self-Modification**: No user can modify their own role, permissions, or status
4. **Soft-Delete Only**: Users are deactivated, not deleted

### Analysis Features

| Feature | Description | Tool |
|---------|-------------|------|
| **Production Feasibility** | Analyze what can be produced with current stock | `analyze_production_feasibility` |
| **Nested Product Chains** | Show full ingredient trees for complex products | `analyze_production_feasibility` |
| **Raw Material Requirements** | Calculate total raw materials for production | `analyze_production_feasibility` |
| **Bottleneck Detection** | Identify limiting ingredients | `analyze_production_feasibility` |
| **Reorder Recommendations** | Dynamic reorder points based on burn rate & lead times | `analyze_reorder_needs` |
| **Anomaly Detection** | Identify suspicious losses, unusual spikes, frequent adjustments | `detect_anomalies` |
| **Supplier Performance** | Supplier scorecards (on-time rate, quality) | `get_advanced_analytics` |
| **Cost Analysis** | COGS calculation and waste value tracking | `get_advanced_analytics` |
| **Executive Summary** | High-level business overview for daily briefings | `generate_executive_summary` |

### Documentation Search (RAG)

The assistant can search project documentation (`search_documentation`) to answer questions about:
- System features and usage
- API endpoints and integration
- Database schema and relationships
- Troubleshooting common issues
- Nested products and recipes
- CSV import/export formats

### CSV Import/Export

| Feature | Description | Tool |
|---------|-------------|------|
| **Import Items** | Bulk import items from CSV (requires confirmation) | `import_csv_data` |
| **Import Suppliers** | Bulk import suppliers from CSV (requires confirmation) | `import_csv_data` |
| **Export Items** | Export items to CSV (display or download) | `export_to_csv` |
| **Export Suppliers** | Export suppliers to CSV | `export_to_csv` |
| **Export POs** | Export purchase orders to CSV | `export_to_csv` |
| **Export JOs** | Export job orders to CSV | `export_to_csv` |
| **Export Movements** | Export stock movements to CSV | `export_to_csv` |
| **Export DOs** | Export dispatch orders + line items to CSV | `export_dispatch_orders` |

Item CSV exports use the same mode-aware template contract as item CSV imports for Food Manufacturing, MSME, Services, and Food & Beverage. The `export_to_csv` tool resolves the tenant's active workflow mode when `options.workflow_mode` is omitted, normalizes legacy `manufacturing` to `food_manufacturing`, and can return either a chat preview or a download using the mode template. Legacy `options.template_type=items|products|master` keeps the old category-split export behavior for compatibility.

---

## Dispatch Orders

Dispatch Orders (DOs) track the outbound shipment of **finished goods** to customers or internal branches. They are the primary mechanism for recording sales and goods issue movements.

### Eligibility Constraint

Only items with `category=product` **and** `product_type=finished_goods` can be added to a dispatch order. The AI will refuse to dispatch raw materials or packaging items and will explain why.

### DO Status Workflow

```
draft → confirmed → partial → completed
                ↑
           (dispatch runs)

cancelled ← (from draft / confirmed / partial only)
archived  ← (completed or cancelled only)
```

| Status | Meaning |
|--------|---------|
| `draft` | Created, not yet locked in. Lines can be edited. Stock NOT deducted. |
| `confirmed` | Locked in. Cannot edit lines. Stock NOT yet deducted. |
| `partial` | At least one line has been dispatched, but not all. Stock being deducted. |
| `completed` | All lines fully dispatched. |
| `cancelled` | Cancelled. Already-dispatched stock must be voided separately. |

### Tool Reference

| Tool | Permission | Description |
|------|-----------|-------------|
| `query_dispatch_orders` | `do:view` | List DOs with status/recipient/date filters; set `archived=true` for archived view |
| `get_dispatch_order_details` | `do:view` | Full DO details with line items, cost snapshots, and stock movement history |
| `get_dispatch_stats` | `do:view` | Summary count by status (draft, confirmed, partial, completed, cancelled) |
| `get_dispatch_earnings` | `do:view` | Revenue, COGS, gross profit by item / order / recipient / period |
| `export_dispatch_orders` | `do:view` | Export DOs to CSV (one row per line item) |
| `create_dispatch_order` | `do:create` | Create a draft DO with recipient, date, and line items |
| `update_dispatch_order` | `do:create` | Edit a draft DO (replaces all lines if `lines` is provided) |
| `confirm_dispatch_order` | `do:create` | Move draft → confirmed (locks in recipient & lines) |
| `dispatch_items` | `do:dispatch` | Execute dispatch — deducts stock via `goods_issue` movement |
| `cancel_dispatch_order` | `do:delete` | Cancel a DO (does NOT auto-void dispatched stock) |
| `archive_dispatch_order` | `do:delete` | Archive completed or cancelled DOs |
| `update_dispatch_line_sale_price` | `do:dispatch` | Retroactively update sale price on a dispatched line |

### Earnings & Revenue Tracking

- Lines with `sale_price_per_unit` set → contribute to **revenue** and **gross profit**
- Lines with `sale_price_per_unit = null` → **internal transfers**, excluded from earnings
- Effective dispatched quantity = `qty_dispatched - qty_voided` (voids are respected)
- `get_dispatch_earnings` returns breakdowns by: **item**, **order**, **recipient**, and **time period** (day/week/month)
- To get current month's earnings, call with no date parameters (defaults to current month)

### Important Caveats

1. **Cancel ≠ void**: Cancelling a partial DO does **not** auto-reverse the stock already deducted. Users must void those `goods_issue` movements separately via the stock movements section.
2. **FIFO/FEFO auto-selection**: The system picks the correct batch automatically. FEFO (earliest expiry first) is used for items with `shelf_life_days` set. Users can override with a specific `batch_id`.
3. **Sale price propagation**: After dispatching (or after `update_dispatch_line_sale_price`), the item's `default_sale_price` is updated to reflect the new price for future DOs.
4. **Draft-only edits**: `update_dispatch_order` only works on `draft` status. For `confirmed`+ DOs, cancel and recreate, or use `update_dispatch_line_sale_price` for price-only changes.
5. **Price/cost boundary**: `default_sale_price` is the customer price. `cost_per_unit` is internal COGS/valuation. Do not use cost as a fallback sale price for POS, Storefront, or Dispatch Orders; ask the operator to set a sale price instead.

### Example Prompts

| User Says | AI Action |
|-----------|-----------|
| "How many DOs are pending?" | `get_dispatch_stats` |
| "Show DOs for ABC Corp this week" | `query_dispatch_orders` with recipient + date filter |
| "Create a DO for 100 units of Syrup A for Jollibee" | `get_items` → `create_dispatch_order` |
| "Confirm DO-2026-001" | `get_dispatch_order_details` → `confirm_dispatch_order` |
| "Dispatch all items on DO-2026-001" | `get_dispatch_order_details` → `dispatch_items` (all lines) |
| "Show last month's earnings" | `get_dispatch_earnings` (period=month) |
| "Which items have the best profit margin?" | `get_dispatch_earnings` → formats `by_item` by margin % |
| "Export all completed DOs to CSV" | `export_dispatch_orders` (status=completed) |
| "Archive DO-2026-001" | `get_dispatch_order_details` → `archive_dispatch_order` |
| "Update sale price on line 5 to ₱250" | `update_dispatch_line_sale_price` |

---

## UOM (Unit of Measure) Conversion

The system automatically converts between compatible units of measure during job order calculations.

### Supported UOM Groups

| Group | Units | Base Unit |
|-------|-------|-----------|
| **Weight** | mg, g, kg, lb, oz | g (gram) |
| **Volume** | mL, L, gal, cup, tbsp, tsp | mL (milliliter) |
| **Count** | pcs, units, dozen | pcs (pieces) |

### Conversion Behavior

- **Same Group**: Automatic conversion (e.g., recipe requires 150000g, stock is in kg → converts to 150kg)
- **Different Groups**: Incompatible (e.g., kg ↔ L will not convert)
- **pcs ↔ units**: Treated as equivalent (1:1)
- **dozen**: Converts to 12 pcs/units

### How It Works

When creating or completing a job order:
1. Recipe specifies ingredient quantity in its UOM
2. System checks if recipe UOM differs from ingredient's stock UOM
3. If compatible, converts quantity for accurate comparison
4. Stock deductions happen in the ingredient's original UOM

---

## Confirmation Workflow

All write operations follow a strict confirmation workflow to prevent accidental changes:

```
┌─────────────────┐
│  User Request   │
│ "Create item X" │
└────────┬────────┘
         ▼
┌─────────────────┐
│  AI Prepares    │
│  Action Details │
└────────┬────────┘
         ▼
┌─────────────────┐
│  Confirmation   │  ◄── 5-minute timeout
│    Dialog       │
└────────┬────────┘
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│Confirm│ │Cancel │
└───┬───┘ └───┬───┘
    ▼         ▼
┌───────┐ ┌───────┐
│Execute│ │Abort  │
│Action │ │Action │
└───────┘ └───────┘
```

### Confirmation Dialog Features

1. **Action Summary**: Clear description of what will happen
2. **Details Preview**: Shows specific data (items, quantities, etc.)
3. **Countdown Timer**: 5-minute expiry for pending actions
4. **Confirm/Cancel**: Explicit user decision required

### Action Expiry

- Pending actions expire after **5 minutes**
- Expired actions cannot be confirmed
- User must re-request the action after expiry

---

## Limitations

### Technical Limitations

| Limitation | Description |
|------------|-------------|
| **Batch Selection** | Manual batch selection only supported for `dispatch_items` (via optional `batch_id` per line). FIFO/FEFO still auto-selected for JO completions. |
| **File Processing** | Can process text, CSV, PDF, DOCX, and Images (Vision API) |
| **Real-time Updates** | Data may be slightly stale during high-activity periods |
| **Complex Calculations** | May need multiple queries for complex analytics |
| **Historical Trends** | Limited to 90 days of movement history |
| **Archived Records** | Archived DOs are queryable via `archived=true` on `query_dispatch_orders`. Archived POs and JOs cannot be queried (archive filter not exposed). |
| **Soft-Delete Reversal** | Cannot restore soft-deleted items or suppliers |
| **Recipe Management** | Cannot add/remove product composition ingredients after item creation |
| **Stock Movement Void** | Cannot void/reverse existing stock movements |
| **Folder Rename** | Cannot rename or update an inventory folder after creation |

> **Gap Coverage Report**: Use the **AI Capability Checker** panel in the AI Chat sidebar to get a live, tenant-specific report of all current capability and knowledge gaps.

### Business Rule Limitations

| Rule | Description |
|------|-------------|
| **Soft Deletes** | Items are deactivated, not permanently deleted |
| **Threshold Auto-calc** | min_threshold and purchase_allowance are auto-calculated |
| **Product Validation** | product_type required for category='product' |
| **Nesting Limit** | Maximum 3 levels of nested products |
| **Circular Prevention** | Cannot create circular recipe dependencies |
| **UOM Compatibility** | Recipe ingredients must use UOMs compatible with stock UOM |

### Permission Limitations

| Role | Read | Write | Analysis | Admin |
|------|------|-------|----------|-------|
| Staff | ✅ | ❌ | ✅ | ❌ |
| Manager | ✅ | ✅ | ✅ | ❌ |
| Admin | ✅ | ✅ | ✅ | ✅ |

Staff users can query data and run analyses but cannot make changes.

---

## User Management & Permission System

### Role vs Permissions

The system uses a **two-tier access control** model:

| Concept | Description | Use Case |
|---------|-------------|----------|
| **Role** | Quick preset template (`admin`, `manager`, `staff`) | Fast onboarding, bulk assignment |
| **Permissions** | Granular per-action control (JSON array) | Fine-tuned access, custom configurations |
| **Master Admin** | Boolean flag that bypasses all permission checks | System owner, emergency access |

### Role Hierarchy

```
Staff (Level 1) < Manager (Level 2) < Admin (Level 3)
```

- **Staff**: Read-only access (7 view permissions)
- **Manager**: Full operational access (41 permissions including create/edit/approve/dispatch)
- **Admin**: Everything + user management + system settings

### Permission Categories

| Category | Example Permissions | Description |
|----------|---------------------|-------------|
| **Inventory** | `items:view`, `items:create`, `items:edit`, `items:delete` | SKU/item management |
| **Suppliers** | `suppliers:view`, `suppliers:create`, `suppliers:edit` | Supplier CRUD |
| **Orders** | `po:view`, `po:create`, `po:approve`, `jo:complete` | PO and JO workflows |
| **Dispatch** | `do:view`, `do:create`, `do:dispatch`, `do:delete` | Dispatch Order workflows |
| **Stock** | `stock:view`, `stock:adjust`, `batches:view`, `batches:edit` | Stock movements and FIFO batches |
| **Reports** | `reports:view`, `reports:export` | Analytics access |
| **AI** | `ai:chat`, `ai:action` | AI chat and action execution |
| **System** | `settings:view`, `users:manage`, `users:view`, `users:delete`, `audit:view` | Admin functions |

### Role Change Behavior

**IMPORTANT**: When a user's role is changed (e.g., Staff → Manager), the system automatically resets their `permissions` array to that role's default permission set.

**Workflow:**
1. Admin changes user role from "Staff" to "Manager"
2. Backend fetches `DEFAULT_ROLE_PERMISSIONS['manager']` (41 permissions)
3. User's `permissions` field is overwritten with the new default set
4. If role changed FROM admin, `is_master_admin` is reset to `false`
5. Custom permission edits made AFTER this point will persist until the next role change

**Example:**
```
User: John (Staff, 7 permissions)
    ↓ Role changed to Manager
User: John (Manager, 41 permissions)  ← Auto-applied defaults
    ↓ Admin removes "po:approve" permission
User: John (Manager, 40 permissions)  ← Custom edit persists
    ↓ Role changed to Staff
User: John (Staff, 7 permissions)     ← Reset to Staff defaults
```

### Default Role Permissions

| Role | Permission Count | Includes |
|------|------------------|----------|
| **Staff** | 7 | View-only: items, suppliers, POs, JOs, dispatch orders, movements, AI chat |
| **Manager** | 41 | All of Staff + create/edit/approve/dispatch for orders, DOs, stock, batches, settings, user management |
| **Admin** | All (42) | Everything including `users:manage`, `settings:edit`, `audit:view` |

### Master Admin

- **Flag**: `is_master_admin: true` on user record
- **Effect**: Bypasses ALL permission checks (`checkPermission` middleware)
- **Assignment**: Only another Master Admin can grant this flag
- **Safety**: Changing role FROM admin resets `is_master_admin` to `false`

### AI Assistant Access

The AI Assistant respects the user's permissions:
- **Staff with `ai:chat`**: Can query data, run analyses, search docs
- **Manager+ with `ai:action`**: Can execute confirmed write operations (create items, POs, JOs)
- **No AI permissions**: AI chat page is hidden/inaccessible

### Files Reference

| File | Purpose |
|------|---------|
| `backend/src/config/permissions.js` | Permission constants, `DEFAULT_ROLE_PERMISSIONS` |
| `backend/src/services/userService.js` | `updateUserRole()`, `updateUserPermissions()` |
| `backend/src/middleware/auth.js` | `checkPermission()`, `requireMasterAdmin()` |
| `packages/web-core/Components/users/PermissionMatrix.jsx` | UI for editing granular permissions |
| `packages/web-core/Components/users/UserManagementModal.jsx` | User CRUD, role dropdown, permission editor |

---

## Response Formatting

### Markdown Rendering

AI responses are rendered with full **Markdown support** in the chat interface. The system uses `react-markdown` with GitHub Flavored Markdown (GFM) for rich formatting.

#### Supported Markdown Features

| Feature | Syntax | Example |
|---------|--------|---------|
| **Bold** | `**text**` | **important value** |
| *Italic* | `*text*` | *emphasis* |
| `Inline code` | `` `code` `` | `SKU-001`, `150 kg` |
| Headers | `## Header` | Section titles |
| Bullet lists | `- item` | Unordered lists |
| Numbered lists | `1. item` | Ordered steps |
| Tables | `\| col \|` | Data grids |
| Links | `[text](url)` | Clickable links |
| Blockquotes | `> quote` | Highlighted notes |
| Code blocks | ` ``` ` | Multi-line code |
| Task lists | `- [ ] item` | Checklists |

#### Frontend Component

The `MarkdownRenderer` component (`packages/web-core/Components/ai/MarkdownRenderer.jsx`) handles all markdown rendering with custom Tailwind styling for:
- Proper heading hierarchy
- Styled tables with borders and hover effects
- Inline code with background highlighting
- Code blocks with dark theme
- Responsive table scrolling on mobile

### Data Responses

The AI formats data using markdown tables and styled lists:

```markdown
📊 **Dashboard Statistics**

| Metric | Value |
|--------|-------|
| Total Items | 156 |
| Low Stock | 12 ⚠️ |
| Healthy Stock | 134 ✅ |
| Overstock | 10 📦 |

**Order Status:**
- Pending POs: `5`
- Active JOs: `3`
- Total Value: **$45,230.00**
```

### Error Responses

Errors are clearly explained with markdown formatting:

```markdown
❌ **Cannot Create Item**

**Reason:** SKU code `ABC-123` already exists.

**Suggestions:**
- Use a different SKU code
- Update the existing item instead
- Check if the item was previously deleted
```

### Confirmation Responses

Write operations result in a structured **Visual Success Card** summarizing the business impact:

```markdown
✅ **Item "Test Widget" Created**

| Property | Value |
|----------|-------|
| Stock Tracking | Enabled (FIFO) |
| Initial Stock | `0 pcs` |
| Max Capacity | `100 pcs` |
| SKU | `TST-001` |
| Category | Parts |
```

---

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| **Permission Denied** | Role lacks required access | Contact admin for role upgrade |
| **Item Not Found** | Invalid ID or SKU | Verify the item exists |
| **Insufficient Stock** | Not enough inventory | Check stock levels first |
| **Expired Action** | Confirmation timeout | Re-request the action |
| **Validation Failed** | Missing required fields | Provide all required data |
| **UOM Incompatible** | Recipe UOM not convertible to stock UOM | Use compatible UOMs |

### Rate Limiting

- Maximum 60 requests per minute per user
- Exceeded limits result in temporary throttling
- System automatically retries after cooldown

---

## Best Practices

### Effective Queries

✅ **Good:**
- "Show me items with stock below 50 units"
- "Create a PO for supplier 15 with 100kg flour at $2.50"
- "What can I produce with current inventory?"

❌ **Less Effective:**
- "Get stuff" (too vague)
- "Make the thing" (unclear intent)
- "Do everything" (no specific action)

### Production Planning

1. First, query production feasibility
2. Check for ingredient shortages
3. Create job orders for sub-products first (if nested)
4. Complete production in order of dependency

### Inventory Management

1. Regularly check low stock alerts
2. Review expiry alerts weekly
3. Use forecasts for proactive ordering
4. Confirm stock adjustments match physical counts

---

## Conversation Retention

- Conversations are stored for **30 days**
- Older conversations are automatically deleted
- Users can manually delete conversations
- Conversation history helps with context continuity

---

## Security

### Data Protection

- All requests require valid JWT authentication
- User context is included in all tool calls
- Actions are logged in the audit trail
- Sensitive data is not exposed in logs

### Confirmation Security

- Actions are tied to specific users
- Cannot confirm another user's pending action
- Expired actions are automatically cleaned up
- All confirmations are logged

---

## Getting Help

### In-App Help

Ask the assistant:
- "What can you do?"
- "How do I create a purchase order?"
- "What are your limitations?"

### Documentation

- [Quick Start Guide](../setup/QUICK_START.md)
- [API Specification](api/specification.md)
- [Troubleshooting](../setup/TROUBLESHOOTING.md)
- [Nested Products Guide](NESTED_PRODUCTS.md)

### Support

For issues not resolved by the AI:
1. Check the troubleshooting guide
2. Review error logs in the backend
3. Contact system administrator

### Debugging Protocol (MANDATORY)

When asked to fix a bug, the AI Assistant **MUST** follow this strict protocol:

1. **Consult Documentation**: Read `TROUBLESHOOTING.md` and `DEVELOPMENT_HISTORY.md` *before* proposing fixes.
2. **Reproduce**: Attempt to replicate the issue with a script or verifiable steps.
3. **Verify**: Confirm environment context (Dev vs Prod, Multi-Tenant vs Single).

---

## Changelog

### v2.1.0 (March 7, 2026) - Dispatch Orders Full AI Integration & UI Consistency

**Tool Count**: 52 → **64 tools** (12 new DO tools)

#### Dispatch Orders — Full AI Coverage
- **6 new tools**: `get_dispatch_stats`, `get_dispatch_earnings`, `update_dispatch_order`, `archive_dispatch_order`, `update_dispatch_line_sale_price`, `export_dispatch_orders`
- **3 improved tools**: `query_dispatch_orders` (added `archived` filter), `create_dispatch_order` (added `reference_po`, `sale_price_per_unit` per line), `dispatch_items` (added optional `batch_id` per line)
- **System prompt**: Full DO capabilities listed; `## Dispatch Orders (IMPORTANT)` behavioral guidance block added (workflow, constraints, cancel≠void, earnings rules)
- **Context header**: Added `Active DOs:` count (draft+confirmed+partial, non-archived)
- **`aiContextService.js`**: Added `DispatchOrder.count()` parallel query for `activeDOCount`

#### UI Consistency — Confirmation Dialogs
- **`ConfirmActionDialog.jsx`**: Rewrote `renderDetails()` — replaced raw `JSON.stringify` fallback with typed per-action renderers for all major action types (PO, JO, items, suppliers, user management, folders, all 7 DO operations) plus a **smart generic fallback** that renders clean key-value rows for any action without a specific renderer
- **Helper sub-components added**: `Warning` (amber alert), `Note` (slate info), `Field` (labeled row), `ItemBox` (scrollable list)
- **DO-specific confirmation content**: Shows recipient, lines with ₱ pricing, workflow-appropriate warnings (e.g., "stock deducted immediately" for dispatch, "cancel ≠ void" for cancel)

#### UI Consistency — Result Cards
- **`executeConfirmedActionUseCase.js`**: Added 7 DO switch cases with structured `summary`, `impact`, `details`, and `related_entity`; fixed `₱` currency symbol (was corrupted in PO/supplier cases); added `related_entity` to `create_purchase_order` and `create_job_order`
- **`ActionResultCard.jsx`**: Added `dispatch_order` to `ENTITY_ICONS` and `ENTITY_PATHS`; PO, JO, and all DO write operations now show a "View …" navigation button on the result card

#### Bug Fixes
- **`reference_po` silently dropped**: `create_dispatch_order` handler was not passing `reference_po` to the service — fixed
- **Null rejection on `update_dispatch_line_sale_price`**: Tool schema used `type: "number"` which rejects null (internal transfers) — fixed to `type: ["number", "null"]`
- **Archived filter ignored**: `query_dispatch_orders` handler destructured args but excluded `archived` — fixed
- **Unused import removed**: `RefreshCw` was imported but unused in `ConfirmActionDialog.jsx` — removed

### v2.1.2 (May 8, 2026) - Mode-Aware Item CSV Export

- **CSV Export Contract**: `export_to_csv` item exports now use the same workflow-mode CSV templates as item import for Food Manufacturing, MSME, Services, and Food & Beverage.
- **Round-Trip Safety**: Item exports preserve template marker columns, `mode_item_preset`, `default_sale_price`, Services stock-exempt fields, and F&B preset keys so exported files can be preview-imported back into the same tenant mode without column drift.
- **AI Path Parity**: AI item CSV exports now route through the shared CSV export service instead of manually assembling item columns. Non-item CSV exports keep their existing behavior.

### v2.1.1 (March 7, 2026) - Confirmation Dialog `toolName` Fix

- **Bug Fix**: `ConfirmActionDialog.jsx` was checking `action.action_type` in all `renderDetails()` branches, but the backend passes the action type as `action.toolName`. This caused every pending action to bypass all per-action UI renderers and fall through to the generic smart fallback, rendering raw field values instead of the styled confirmation cards.
- **Fix**: Replaced all `action.action_type` references with `action.toolName` across `ConfirmActionDialog.jsx`. No layout or business logic was changed.
- **Impact**: All typed renderers (supplier, PO, JO, stock adjustment, user management, dispatch orders, folders) now render correctly — showing labeled fields, contextual warnings, scrollable item lists, and correct icons/colors.

### v2.0.0 (February 19, 2026) - AI Capability Gap Checker
- **New Feature**: `GET /api/v1/ai/diagnostics` — stateless, read-only diagnostic endpoint that returns a structured gap report for the current tenant
- **New Service**: `backend/src/services/aiDiagnosticsService.js`
  - `SYSTEM_FEATURE_MAP` — 71-entry static map of every system feature vs its covering AI tool (or `null` for gaps)
  - `runDiagnostics(user)` — computes coverage %, capability gaps (with severity + recommendation), and knowledge gaps
  - Live tenant DB counts via 12 parallel `dbStore.get()` `COUNT` queries (read-only, fully tenant-isolated)
  - Dynamic knowledge gaps built from real data (e.g. "6 archived POs are inaccessible")
- **New Component**: `packages/web-core/Components/ai/AiDiagnosticsPanel.jsx`
  - Three-tab panel: **Gaps** (grouped by category, severity-colored) / **Knowledge** / **Covered**
  - Per-category `Progress` bars + overall coverage percentage bar
  - Tenant data snapshot (items, suppliers, POs, JOs with archived counts)
  - Collapsible, one-time `localStorage` onboarding hint
- **AI Chat Integration**: "AI Capability Checker" toggle button added to AI Chat sidebar bottom section
- **Limitations Section Updated**: Added 5 new known gap entries to the Technical Limitations table
- **Route**: `GET /api/v1/ai/diagnostics` — protected by `authenticate` + `requirePremium` + `AI_CHAT_VIEW` permission

### v1.0.0 (January 29, 2026)
- Initial AI integration release
- 20 tools available
- Production feasibility analysis
- RAG documentation search
- Confirmation workflow
- 30-day conversation retention

### v1.2.0 (January 31, 2026) - Documentation Sync System
- **Tool Count**: Increased from 20 to **36 tools**
- **New Tools**:
- `analyze_reorder_needs` - Smart reorder recommendations based on burn rate
- `detect_anomalies` - Identify suspicious stock activities
- `get_advanced_analytics` - Supplier performance & cost analysis
- `import_csv_data` - Bulk import items/suppliers from CSV
- `export_to_csv` - Export data to CSV (display or download)
- **Documentation System**:
- Added auto-generated tool reference (`docs/generated/AI_CAPABILITIES.md`)
- Added validation script (`npm run validate:ai`)
- Added documentation generator (`npm run generate:ai-docs`)
- Pre-commit hooks to prevent documentation drift

### v1.0.1 (January 30, 2026)
- **Fix**: Critical bug in Purchase Order creation ("action does not belong to you")
- **Fix**: JSON parsing issues with `messages` and `action_payload` (defensive coding)
- **New**: AI Conversational Follow-up after action limits
- **UX**: Detailed error feedback in chat interface

### v1.1.0 (January 30, 2026) - The "System Manager" Update
- **Supplier Management**: AI can now Create, Update, Delete, and Link Items to Suppliers.
- **System Control**: AI can Read and Update global system settings (thresholds, alerts).
- **User Admin**: AI can List users, Change roles, and Toggle active status (Admin only).
- **Strategic Reporting**: New `generate_executive_summary` tool for high-level business insights.

### v1.1.1 (January 30, 2026) - Confirmation Dialog Fix
- **Fix**: AI now properly triggers confirmation dialogs for write operations instead of asking via text.
- **Refactor**: Split `alertService.generateAlerts` into modular functions (`getLowStockAlerts`, `getExpiryAlerts`, `getSupplierPerformanceAlerts`).
- **Fix**: Executive summary no longer fails on empty inventory data.
- **Improvement**: System prompt updated with explicit tool-calling instructions.

### v1.2.1 (February 2, 2026) - Multi-Tenancy & File Processing
- **Multi-Tenancy Fix**: Standardized all AI services to use `dbStore.get()` for model lookup, ensuring data isolation across different tenant databases.
- **Background Tasks**: Fixed `ReferenceError` in `cleanupExpiredData` background task.
- **Advanced File Processing**:
- **PDF & DOCX**: Automatic text extraction from uploaded PDF and Word documents.
- **Vision Integration**: AI can now "see" and analyze uploaded images using OpenAI's Vision API.
- **General Files**: Support for text-based attachments (JSON, XML, Code, etc.).

### v1.2.2 (February 2, 2026) - Visual Success Cards
- **New Feature**: "Success Cards" replace text confirmations for AI actions.
- **UX**: Cards display business impact (e.g., "Stock +50", "Cost $500") and removed "Next Steps" for a cleaner look.
- **Backend**: `aiService` now formats tool results into user-friendly summaries instead of raw JSON data.

### v1.4.0 (February 4, 2026) - UOM Conversion System
- **UOM Auto-Conversion**: Job orders now automatically convert between compatible units (e.g., g ↔ kg, mL ↔ L).
- **Standardized UOMs**: 14 predefined UOMs across Weight (5), Volume (6), and Count (3) groups.
- **Grouped Dropdown**: New `UomSelect` component with visually grouped options.
- **Backend Integration**: `jobOrderService` functions updated for accurate stock calculations with conversion.
- **Migration Script**: `backend/scripts/migrate-uom-data.js` normalizes legacy UOM values.
- **Verification**: 24 unit tests for the UOM converter utility.

### v1.4.1 (February 4, 2026) - Production Stability & Onboarding
- **AI Robustness**: Implemented **Lazy Initialization** for OpenAI services. The server now starts gracefully even without an `OPENAI_API_KEY`.
- **Deployment Fixes**: Improved `deploy.sh` for Linux servers and fixed `package.json` husky install loops.
- **Multi-Tenancy Onboarding**: Added `onboard-production-tenant.js` to migrate existing production users to the new tenant architecture.
- **Migration Fix**: Standardized `user_tenant_mappings` ID as auto-incrementing integer.

### v1.5.0 (February 5, 2026) - Role-Permission Auto-Apply
- **Role Change Auto-Apply**: Changing a user's role now automatically resets their permissions to the role's default set.
- **Permission System Documentation**: Added comprehensive documentation for the two-tier access control (Role vs Permissions).
- **Master Admin Safety**: `is_master_admin` flag is now reset to `false` when demoting from Admin role.
- **Frontend Fix**: PermissionMatrix now correctly updates after role change without requiring page refresh.

### v1.6.0 (February 5, 2026) - Robust AI User Resolution
- **Issue**: AI previously relied solely on ID for user targeting, leading to potential errors (e.g., updating User 2 instead of "User 10 named Mama").
- **Smart Resolution**: AI tools (`update_user_role`, `toggle_user_status`, `update_user_permissions`) now accept `email` and `username` as identifiers.
- **Conflict Prevention**: If multiple identifiers are provided (e.g. ID + Email), the system strictly cross-validates them. If they don't match the same user, the action is blocked with a descriptive error.
- **Safety**: Prevents "hallucinated ID" errors by allowing the AI to prefer semantic identifiers (Email/Name) which are less prone to model confusion than numeric IDs.

### v1.8.0 (February 11, 2026) - AI Accuracy Improvements
- **Batch Awareness**: AI now sees `batch_size`, `yield_percentage`, and `processing_loss` for all items.
- **Improved Conversions**: System prompt updated with explicit instructions to convert "batches" to base units using the `batch_size` field.
- **Tool Descriptions**: `create_job_order` and `complete_job_order` updated to clarify that quantities must be in base units (grams, ml), not batches.
- **Conversion Documentation**: Added `docs/ai/conversion_logic.md` for RAG reference.

---

### v1.8.1 (February 13, 2026) - CSV Import Fix & Documentation Refresh
- **Tool Count**: Updated from 49 to **52 tools**
- **Critical Bug Fix**: CSV imports via AI Chat returned "0 items imported" despite confirmation succeeding. Root cause: `parseCsv` in `tempFileService.js` only split on real `\n` characters — AI model JSON payloads and DB round-trips often produce literal escaped `\n`, causing the parser to see the entire CSV as one header line with 0 data rows. Fixed by adding newline normalization.
- **ActionResultCard Fix**: `formatResultForUI` in `aiService.js` was referencing non-existent fields (`result.details?.success_count`) instead of `result.stats.imported`. Fixed to use correct field paths.
- **Import Navigation**: `importCsvData` in `aiToolExecutor.js` now returns `related_entity` and `details` fields, enabling the "View Items" button and detail chips on the ActionResultCard.
- **Cleanup**: Removed debug `useEffect` block from `AiChat.jsx`, deleted temporary script `verify_invite_debug.js`.
- **Documentation**: Updated tool count, added exact tool names to all capability matrices, regenerated `AI_CAPABILITIES.md`.

---

### v1.7.1 (February 7, 2026) - PO NaN Fix & Chat File Display
- **Bug Fix**: Purchase Orders created via AI showed `$NaN` for total cost. Root cause: field name mismatch — `aiToolExecutor.js` sent `quantity` but `purchaseOrderService` expected `quantity_ordered`. Fixed in `aiToolExecutor.js` line 822.
- **NaN Guard**: Added `!isNaN()` check in `aiService.js` `formatResultForUI` to prevent NaN values from displaying in result cards.
- **PO Confirmation Improvement**: `generateConfirmation` for `create_purchase_order` now shows supplier name (not just ID) and pre-calculates total amount.
- **Chat File Display**: Uploaded images and files now display inline in user message bubbles in AI chat (`AiChat.jsx`). Images show as thumbnails, non-image files show as name badges with file icon.
- **Conversation History**: Images from loaded conversations (stored as base64 in the `content` array) are rendered correctly when reopening past conversations.

### v1.7.0 (February 7, 2026) - Bulk Folder Creation & Folder Deletion
- **Tool Count**: Increased from 48 to **51 tools**
- **New Tools**:
  - `bulk_create_inventory_folders` — Create multiple inventory folders in a single operation with one confirmation dialog
  - `delete_inventory_folder` — Delete a single inventory folder via AI chat (looks up by name, auto-unassigns items)
  - `bulk_delete_inventory_folders` — Delete multiple inventory folders in a single operation with one confirmation dialog
- **Folder Deletion**: New `DELETE /api/v1/items/folders/:folder_id` endpoint. Items in deleted folders are auto-unassigned (hard delete).
- **Confirmation Fix**: `create_inventory_folder` and `move_items_to_inventory_folder` now have proper confirmation dialogs instead of falling through to generic JSON display.
- **UI Result Cards**: Folder creation/deletion (single and bulk) now show formatted success cards with impact stats.
- **System Prompt**: Added "Bulk Write Operations" and "Bulk Delete Operations" guidance instructing the AI to use bulk tools for 2+ folders.
- **Frontend**: FolderCard now has a dropdown menu with "Delete Folder" option (permission-gated).
- **ConfirmActionDialog**: Delete folder confirmations show red-themed icons and warnings about item unassignment.
### v1.9.0 (February 14, 2026) - PayPal E2E & Premium Auto-Provisioning
- **PayPal E2E Verification**: Successfully verified the end-to-end Premium registration flow using a mocked environment.
- **Auto-Provisioning**: Verified that Premium registrations bypass "Pending" status and trigger immediate database creation.
- **Auto-Login**: Confirmed seamless redirection to Dashboard after successful payment.
- **Dev Mode Bypass**: Documented the `[DEV ONLY] Mock Premium Payment` button for future testing.
- **Cleanup**: Bulk removed 9 stale test tenants to maintain system performance.

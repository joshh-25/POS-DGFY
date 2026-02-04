> **Version:** 1.4.0
> **Last Updated:** February 4, 2026
> **Tool Count:** 36

This document describes the capabilities, limitations, and workflows of the SKUpervisor AI Assistant integrated into the SKU Inventory Manager.

> **Note:** For the complete auto-generated tool reference, see [generated/AI_CAPABILITIES.md](generated/AI_CAPABILITIES.md).

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
| **Stock Adjustment** | Manager+ | Manual stock corrections |

### Analysis Features

| Feature | Tool | Description |
|---------|------|-------------|
| **Production Feasibility** | `analyze_production_feasibility` | Analyze what can be produced with current stock |
| **Nested Product Chains** | `analyze_production_feasibility` | Show full ingredient trees for complex products |
| **Raw Material Requirements** | `analyze_production_feasibility` | Calculate total raw materials for production |
| **Bottleneck Detection** | `analyze_production_feasibility` | Identify limiting ingredients |
| **Reorder Recommendations** | `analyze_reorder_needs` | Dynamic reorder points based on burn rate & lead times |
| **Anomaly Detection** | `detect_anomalies` | Identify suspicious losses, unusual spikes, frequent adjustments |
| **Supplier Performance** | `get_advanced_analytics` | Supplier scorecards (on-time rate, quality) |
| **Cost Analysis** | `get_advanced_analytics` | COGS calculation and waste value tracking |
| **Executive Summary** | `generate_executive_summary` | High-level business overview for daily briefings |

### Documentation Search (RAG)

The assistant can search project documentation (`search_documentation`) to answer questions about:
- System features and usage
- API endpoints and integration
- Database schema and relationships
- Troubleshooting common issues
- Nested products and recipes
- CSV import/export formats

### CSV Import/Export

| Feature | Tool | Description |
|---------|------|-------------|
| **Import Items** | `import_csv_data` | Bulk import items from CSV (requires confirmation) |
| **Import Suppliers** | `import_csv_data` | Bulk import suppliers from CSV (requires confirmation) |
| **Export Items** | `export_to_csv` | Export items to CSV (display or download) |
| **Export Suppliers** | `export_to_csv` | Export suppliers to CSV |
| **Export POs** | `export_to_csv` | Export purchase orders to CSV |
| **Export JOs** | `export_to_csv` | Export job orders to CSV |
| **Export Movements** | `export_to_csv` | Export stock movements to CSV |

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
| **Batch Selection** | Cannot manually select specific FIFO batches (uses oldest first) |
| **File Processing** | Can process text, CSV, PDF, DOCX, and Images (Vision API) |
| **Real-time Updates** | Data may be slightly stale during high-activity periods |
| **Complex Calculations** | May need multiple queries for complex analytics |
| **Historical Trends** | Limited to 90 days of movement history |

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

The `MarkdownRenderer` component (`frontend/Components/ai/MarkdownRenderer.jsx`) handles all markdown rendering with custom Tailwind styling for:
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

- [Quick Start Guide](../QUICK_START.md)
- [API Specification](api/specification.md)
- [Troubleshooting](../TROUBLESHOOTING.md)
- [Nested Products Guide](NESTED_PRODUCTS.md)

### Support

For issues not resolved by the AI:
1. Check the troubleshooting guide
2. Review error logs in the backend
3. Contact system administrator

---

## Changelog

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
- **Migration Script**: `scripts/migrate-uom-data.js` normalizes legacy UOM values.
- **Verification**: 24 unit tests for the UOM converter utility.

### v1.4.1 (February 4, 2026) - Production Stability & Onboarding
- **AI Robustness**: Implemented **Lazy Initialization** for OpenAI services. The server now starts gracefully even without an `OPENAI_API_KEY`.
- **Deployment Fixes**: Improved `deploy.sh` for Linux servers and fixed `package.json` husky install loops.
- **Multi-Tenancy Onboarding**: Added `onboard-production-tenant.js` to migrate existing production users to the new tenant architecture.
- **Migration Fix**: Standardized `user_tenant_mappings` ID as auto-incrementing integer.

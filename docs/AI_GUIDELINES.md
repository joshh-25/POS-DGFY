# AI Assistant Guidelines

> **Version:** 1.0.0
> **Last Updated:** January 29, 2026

This document describes the capabilities, limitations, and workflows of the SKUpervisor AI Assistant integrated into the SKU Inventory Manager.

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

| Feature | Description |
|---------|-------------|
| **Production Feasibility** | Analyze what can be produced with current stock |
| **Nested Product Chains** | Show full ingredient trees for complex products |
| **Raw Material Requirements** | Calculate total raw materials for production |
| **Bottleneck Detection** | Identify limiting ingredients |
| **Production Recommendations** | Suggest what to produce next |

### Documentation Search (RAG)

The assistant can search project documentation to answer questions about:
- System features and usage
- API endpoints and integration
- Database schema and relationships
- Troubleshooting common issues
- Nested products and recipes
- CSV import/export formats

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
| **File Upload** | Cannot process uploaded files directly (use CSV paste) |
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

### Permission Limitations

| Role | Read | Write | Analysis | Admin |
|------|------|-------|----------|-------|
| Staff | ✅ | ❌ | ✅ | ❌ |
| Manager | ✅ | ✅ | ✅ | ❌ |
| Admin | ✅ | ✅ | ✅ | ✅ |

Staff users can query data and run analyses but cannot make changes.

---

## Response Formatting

### Data Responses

The AI formats data in readable tables and summaries:

```
📊 Dashboard Statistics
━━━━━━━━━━━━━━━━━━━━━━━
Total Items: 156
Low Stock: 12 ⚠️
Healthy Stock: 134 ✅
Overstock: 10 📦

Pending POs: 5
Active JOs: 3
Total Value: $45,230.00
```

### Error Responses

Errors are clearly explained with suggested actions:

```
❌ Cannot Create Item

Reason: SKU code "ABC-123" already exists.

Suggestions:
• Use a different SKU code
• Update the existing item instead
• Check if the item was previously deleted
```

### Confirmation Responses

Write operations show detailed previews:

```
📋 Create Purchase Order

Supplier: Acme Corp (#15)
Expected: 2026-02-15

Items:
┌─────────────┬──────────┬───────────┐
│ Item        │ Quantity │ Price     │
├─────────────┼──────────┼───────────┤
│ Flour (kg)  │ 100      │ $2.50/kg  │
│ Sugar (kg)  │ 50       │ $1.80/kg  │
└─────────────┴──────────┴───────────┘

Total: $340.00

⏱️ This action expires in 5:00
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

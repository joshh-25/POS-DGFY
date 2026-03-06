# Delete & Archive Functionality Guide

## Overview

The SKU Inventory Manager implements two distinct patterns for removing records:
1. **Soft Delete (Manual-Only)** - For Items, Suppliers, and Users
2. **Archive Pattern** - For Purchase Orders and Job Orders
3. **Permanent Database Deletion** - For Tenants (Admin only)

---

## Soft Delete Pattern

### Applies To: Items, Suppliers, Users (Remove from Company)

**Behavior:**
- Record remains in database (no hard delete)
- Audit trail fields are written: `deleted_by`, `deleted_at`
- Item and Supplier also set `status = inactive`
- User removal also sets `is_active = false`
- Default resource endpoints return `404 Not Found` when the target is soft-deleted
- `410 Gone` is reserved for future admin/audit use-cases (not default API behavior today)

**Visibility Contract:**
- Service-layer queries must enforce `deleted_at IS NULL`.
- For Item/Supplier business reads, services also exclude inactive status.
- Policy is centralized through `backend/src/utils/softDeletePolicy.js` (`buildVisibleWhere`, `notFoundError`).

### Pre-Delete Validation

**Items:**
- Cannot delete if used in active products (ProductComposition)
- Cannot delete if referenced in any Purchase Orders
- Cannot delete if referenced in any Job Orders
- Error dialog shows all blocking dependencies

**Suppliers:**
- Cannot delete if has active Purchase Orders (draft, pending, partial status)
- Error shows count of active POs

**Users (Remove from Company):**
- Cannot remove yourself
- Cannot remove Master Admin
- Enforces role hierarchy (Admin/Manager restrictions)

### Access Control
- **Items/Suppliers**: Admin only
- **Users (Remove from Company)**: Admin or Manager (hierarchy enforced)

### Implementation Files

**Backend:**
- Routes: `backend/src/routes/items.js`, `backend/src/routes/suppliers.js`
- Controllers: `backend/src/controllers/itemController.js`, `backend/src/controllers/supplierController.js`, `backend/src/controllers/userController.js`
- Services: `backend/src/services/itemService.js`, `backend/src/services/supplierService.js`, `backend/src/services/userService.js`
- Middleware: `backend/src/middleware/auth.js`
- Policy utility: `backend/src/utils/softDeletePolicy.js`
- Models: `backend/src/models/Item.js`, `backend/src/models/Supplier.js`, `backend/src/models/User.js`

**Frontend:**
- Services: `frontend/src/services/itemService.js`, `frontend/src/services/supplierService.js`
- Hooks: `frontend/src/hooks/useItems.js`, `frontend/src/hooks/useSuppliers.js`
- Components: `frontend/Components/items/ItemCard.jsx`, `frontend/Components/suppliers/SupplierCard.jsx`
- Pages: `frontend/Pages/Items.jsx`, `frontend/Pages/Suppliers.jsx`
- Dialog: `frontend/Components/ui/DeleteConfirmDialog.jsx`

---

## Archive Pattern

### Applies To: Purchase Orders, Job Orders

**Behavior:**
- Archive timestamp: `archived_at` field
- Archive user: `archived_by` field
- Record remains fully intact
- Workflow status unchanged (can still be draft, pending, etc.)
- Can be restored through UI

### Why Archive Instead of Delete?

Purchase Orders and Job Orders have business workflow status fields:
- PO: draft → pending → partial → received → cancelled
- JO: draft → in_progress → completed → cancelled

Archive is separate from workflow, allowing:
- Historical tracking of completed orders
- Restoration if needed
- Clean active order views without losing data

### Access Control
- **Admin + Manager** for POs and JOs

### UI Features

**Active/Archived Tabs:**
- Default view: Active orders only
- Archived tab: Shows all archived orders
- Toggle between tabs to switch views

**Archive/Restore Actions:**
- Archive button visible on active orders
- Restore button visible on archived orders
- Confirmation dialog for archive action
- No confirmation needed for restore

### Implementation Files

**Backend:**
- Routes: `backend/src/routes/purchaseOrders.js`, `backend/src/routes/jobOrders.js`
- Controllers: `backend/src/controllers/purchaseOrderController.js`, `backend/src/controllers/jobOrderController.js`
- Services: `backend/src/services/purchaseOrderService.js`, `backend/src/services/jobOrderService.js`
- Models: `backend/src/models/PurchaseOrder.js`, `backend/src/models/JobOrder.js`

**Frontend:**
- Services: `frontend/src/services/purchaseOrderService.js`, `frontend/src/services/jobOrderService.js`
- Hooks: `frontend/src/hooks/usePurchaseOrders.js`, `frontend/src/hooks/useJobOrders.js`
- Pages: `frontend/Pages/PurchaseOrders.jsx`, `frontend/Pages/JobOrders.jsx`
- Dialog: `frontend/Components/ui/DeleteConfirmDialog.jsx` (reused for archive confirmation)

---

## API Endpoints

### Items
- `DELETE /api/v1/items/:item_id` - Soft delete item (admin only)

### Suppliers
- `DELETE /api/v1/suppliers/:supplier_id` - Soft delete supplier (admin only)

### Users
- `DELETE /api/v1/users/:user_id` - Remove user from company (soft delete, admin/manager with hierarchy rules)

### Purchase Orders
- `POST /api/v1/purchase-orders/:po_id/archive` - Archive PO (admin/manager)
- `POST /api/v1/purchase-orders/:po_id/restore` - Restore PO (admin/manager)
- `GET /api/v1/purchase-orders?archived=true` - Get archived POs

### Job Orders
- `POST /api/v1/job-orders/:jo_id/archive` - Archive JO (admin/manager)
- `POST /api/v1/job-orders/:jo_id/restore` - Restore JO (admin/manager)
- `GET /api/v1/job-orders?archived=true` - Get archived JOs

---

## Database Schema Changes

### Items Table
```sql
ALTER TABLE items ADD COLUMN deleted_by INT NULL;
ALTER TABLE items ADD COLUMN deleted_at DATETIME NULL;
ALTER TABLE items ADD CONSTRAINT fk_items_deleted_by
  FOREIGN KEY (deleted_by) REFERENCES users(user_id);
```

### Suppliers Table
```sql
ALTER TABLE suppliers ADD COLUMN deleted_by INT NULL;
ALTER TABLE suppliers ADD COLUMN deleted_at DATETIME NULL;
ALTER TABLE suppliers ADD CONSTRAINT fk_suppliers_deleted_by
  FOREIGN KEY (deleted_by) REFERENCES users(user_id);
```

### Purchase Orders Table
```sql
ALTER TABLE purchase_orders ADD COLUMN archived_by INT NULL;
ALTER TABLE purchase_orders ADD COLUMN archived_at DATETIME NULL;
ALTER TABLE purchase_orders ADD CONSTRAINT fk_purchase_orders_archived_by
  FOREIGN KEY (archived_by) REFERENCES users(user_id);
```

### Job Orders Table
```sql
ALTER TABLE job_orders ADD COLUMN archived_by INT NULL;
ALTER TABLE job_orders ADD COLUMN archived_at DATETIME NULL;
ALTER TABLE job_orders ADD CONSTRAINT fk_job_orders_archived_by
  FOREIGN KEY (archived_by) REFERENCES users(user_id);
```

---

## Testing Checklist

### Items Delete
- [ ] Admin can see delete option
- [ ] Non-admin cannot see delete option
- [ ] Delete succeeds for items with no dependencies
- [ ] Delete fails for items in products (shows product names)
- [ ] Delete fails for items in POs (shows PO numbers)
- [ ] Delete fails for items in JOs (shows JO numbers)
- [ ] Error dialog displays all blocking reasons

### Suppliers Delete
- [ ] Admin can see delete option
- [ ] Delete succeeds for suppliers with no active POs
- [ ] Delete fails for suppliers with active POs (shows count)
- [ ] Error dialog displays blocking reason

### Users Remove
- [ ] Admin/Manager can remove users within hierarchy rules
- [ ] Cannot remove yourself
- [ ] Cannot remove master admin
- [ ] Removed users are excluded from default list/export endpoints
- [ ] Mutating removed users returns `404`

### Purchase Orders Archive
- [ ] Admin can archive POs
- [ ] Manager can archive POs
- [ ] Archive confirmation dialog appears
- [ ] Archived POs appear in Archived tab
- [ ] Restore button visible on archived POs
- [ ] Restore works without confirmation
- [ ] Active tab excludes archived POs

### Job Orders Archive
- [ ] Admin can archive JOs
- [ ] Manager can archive JOs
- [ ] Archive confirmation dialog appears
- [ ] Archived JOs appear in Archived tab
- [ ] Restore button visible on archived JOs
- [ ] Restore works without confirmation
- [ ] Active tab excludes archived JOs

---

## Troubleshooting

### "Cannot delete item" error
- Check if item is used in product recipes
- Check if item appears in any Purchase Orders
- Check if item appears in any Job Orders
- Error message lists all blocking dependencies

### "Cannot delete supplier" error
- Check if supplier has Purchase Orders with status: draft, pending, or partial
- Complete or cancel active POs before deleting supplier

### "User not found" during update/role change
- The target user may already be soft-deleted (`deleted_at` set)
- Default behavior is `404` for removed users on normal resource endpoints

### Archive button not visible
- Verify user role is Admin or Manager
- Check if order is already archived

### Archived orders not showing
- Click "Archived" tab to switch view
- Verify `archived=true` query parameter in API call

---

## Future Enhancements

Potential improvements:
1. Bulk archive/restore operations
2. Auto-archive completed orders after X days
3. Permanently delete archived orders after retention period
4. Audit log viewer for all delete/archive actions
5. Soft delete for Stock Movements (currently not deletable)

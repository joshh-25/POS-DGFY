# Phase 3 & 4 Implementation Plan - Purchase Orders & Job Orders Archive Pattern

## 📋 Overview

This document provides detailed implementation instructions for completing Phase 3 (Purchase Orders Archive) and Phase 4 (Job Orders Archive) of the delete functionality project, plus documentation updates.

**Status:** Phases 0, 1, 2 are COMPLETE. Phases 3 & 4 remain.

---

## ✅ What's Been Completed (Phases 0-2)

### Phase 0 & 1: Items Delete
- ✅ Database migration: Added `deleted_by`, `deleted_at` to items table
- ✅ Backend safety checks: Validates against ProductComposition, PurchaseOrders, JobOrders
- ✅ Backend service: Enhanced `deleteItem()` with comprehensive validation
- ✅ Backend controller: Returns detailed error arrays
- ✅ Backend model: Item.js includes audit fields
- ✅ Frontend component: DeleteConfirmDialog.jsx created (reusable)
- ✅ Frontend component: ItemCard.jsx shows delete option (admin only)
- ✅ Frontend page: Items.jsx uses DeleteConfirmDialog with error display
- ✅ Frontend service: authService.js has `getCurrentUser()`

### Phase 2: Suppliers Delete
- ✅ Database migration: Added `deleted_by`, `deleted_at` to suppliers table
- ✅ Backend route: DELETE `/api/v1/suppliers/:supplier_id` (admin only)
- ✅ Backend controller: `deleteSupplier()` function
- ✅ Backend service: `deleteSupplier()` checks active POs, soft deletes
- ✅ Backend model: Supplier.js includes audit fields
- ✅ Frontend service: `deleteSupplier()` API call
- ✅ Frontend hook: `useDeleteSupplier()` hook
- ✅ Frontend component: SupplierCard.jsx shows delete option (admin only)
- ✅ Frontend page: Suppliers.jsx with DeleteConfirmDialog

**Key Pattern Established:**
- Soft delete using `status='inactive'`
- Audit trail with `deleted_by` and `deleted_at`
- Pre-delete validation returning detailed error arrays
- DeleteConfirmDialog displays errors inline
- Admin-only access via role checking

---

## 🎯 Phase 3: Purchase Orders Archive Pattern

### Overview
**Different from Items/Suppliers:** Purchase Orders use ARCHIVE pattern instead of soft delete.
- Reason: POs have business workflow status (draft → pending → partial → received → cancelled)
- Archive is separate from workflow status
- Archived POs can be restored
- Archive/restore available to both Admin and Manager roles

### Database Migration

**File to Create:** `backend/migrations/20250103000001-add-archive-fields-to-purchase-orders.js`

```javascript
export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn('purchase_orders', 'archived_at', {
    type: Sequelize.DATE,
    allowNull: true
  });

  await queryInterface.addColumn('purchase_orders', 'archived_by', {
    type: Sequelize.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  });
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn('purchase_orders', 'archived_by');
  await queryInterface.removeColumn('purchase_orders', 'archived_at');
}
```

**Run Migration:**
```bash
cd backend
node migrations/20250103000001-add-archive-fields-to-purchase-orders.js
```

### Backend Implementation

#### 1. Update Model: `backend/src/models/PurchaseOrder.js`

**Location:** After `status` field, before closing brace

**Add:**
```javascript
  archived_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  archived_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
```

#### 2. Update Service: `backend/src/services/purchaseOrderService.js`

**Add to end of file:**

```javascript
export const archivePurchaseOrder = async (poId, userId) => {
  const po = await PurchaseOrder.findByPk(poId);

  if (!po) {
    const error = new Error('Purchase Order not found');
    error.statusCode = 404;
    throw error;
  }

  if (po.archived_at) {
    const error = new Error('Purchase Order is already archived');
    error.statusCode = 400;
    throw error;
  }

  await po.update({
    archived_at: new Date(),
    archived_by: userId
  });

  return po;
};

export const restorePurchaseOrder = async (poId) => {
  const po = await PurchaseOrder.findByPk(poId);

  if (!po) {
    const error = new Error('Purchase Order not found');
    error.statusCode = 404;
    throw error;
  }

  if (!po.archived_at) {
    const error = new Error('Purchase Order is not archived');
    error.statusCode = 400;
    throw error;
  }

  await po.update({
    archived_at: null,
    archived_by: null
  });

  return po;
};
```

**Modify existing `getPurchaseOrders` function:**

Find the function and add filtering for archived status:

```javascript
export const getPurchaseOrders = async (queryParams) => {
  const {
    page = 1,
    limit = 20,
    search,
    sortBy = 'created_at',
    sortOrder = 'desc',
    status,
    supplier_id,
    archived = 'false'  // Add this parameter
  } = queryParams;

  const offset = (page - 1) * limit;
  const where = {};

  // Filter archived POs
  if (archived === 'true') {
    where.archived_at = { [Op.not]: null };
  } else {
    where.archived_at = null;
  }

  // ... rest of existing code
```

#### 3. Add Controller Functions: `backend/src/controllers/purchaseOrderController.js`

**Add to end of file:**

```javascript
export const archivePurchaseOrder = async (req, res, next) => {
  try {
    const { po_id } = req.params;
    const userId = req.user.user_id;

    const po = await purchaseOrderService.archivePurchaseOrder(po_id, userId);

    res.status(200).json({
      success: true,
      data: po,
      message: 'Purchase Order archived successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const restorePurchaseOrder = async (req, res, next) => {
  try {
    const { po_id } = req.params;

    const po = await purchaseOrderService.restorePurchaseOrder(po_id);

    res.status(200).json({
      success: true,
      data: po,
      message: 'Purchase Order restored successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};
```

#### 4. Add Routes: `backend/src/routes/purchaseOrders.js`

**Add before `export default router;`:**

```javascript
// Archive/restore - managers and admins only
router.post('/:po_id/archive', authorize('admin', 'manager'), purchaseOrderController.archivePurchaseOrder);
router.post('/:po_id/restore', authorize('admin', 'manager'), purchaseOrderController.restorePurchaseOrder);
```

### Frontend Implementation

#### 1. Update Service: `frontend/src/services/purchaseOrderService.js`

**Add to end of file:**

```javascript
export const archivePurchaseOrder = async (poId) => {
  const response = await api.post(`/purchase-orders/${poId}/archive`);
  return response.data;
};

export const restorePurchaseOrder = async (poId) => {
  const response = await api.post(`/purchase-orders/${poId}/restore`);
  return response.data;
};
```

#### 2. Add Hooks: `frontend/src/hooks/usePurchaseOrders.js`

**Update `usePurchaseOrders` hook to accept archived parameter:**

```javascript
export const usePurchaseOrders = (params = {}) => {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);

  const fetchPurchaseOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await purchaseOrderService.getPurchaseOrders(params);
      setPurchaseOrders(data.purchase_orders || data || []);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message || 'Failed to fetch purchase orders');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => {
    fetchPurchaseOrders();
  }, [fetchPurchaseOrders]);

  return { purchaseOrders, loading, error, pagination, refetch: fetchPurchaseOrders };
};
```

**Add new hooks to end of file:**

```javascript
export const useArchivePurchaseOrder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const archivePurchaseOrder = useCallback(async (poId) => {
    setLoading(true);
    setError(null);
    try {
      await purchaseOrderService.archivePurchaseOrder(poId);
      return true;
    } catch (err) {
      setError(err.message || 'Failed to archive purchase order');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { archivePurchaseOrder, loading, error };
};

export const useRestorePurchaseOrder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const restorePurchaseOrder = useCallback(async (poId) => {
    setLoading(true);
    setError(null);
    try {
      await purchaseOrderService.restorePurchaseOrder(poId);
      return true;
    } catch (err) {
      setError(err.message || 'Failed to restore purchase order');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { restorePurchaseOrder, loading, error };
};
```

#### 3. Update Page: `frontend/Pages/PurchaseOrders.jsx`

**Add imports:**
```javascript
import { Archive, ArchiveRestore } from 'lucide-react';
import { useArchivePurchaseOrder, useRestorePurchaseOrder } from '@/hooks/usePurchaseOrders.js';
import { getCurrentUser } from '@/services/authService.js';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';
```

**Add state variables:**
```javascript
const [showArchivedTab, setShowArchivedTab] = useState(false);
const [showArchiveDialog, setShowArchiveDialog] = useState(false);
const [poToArchive, setPoToArchive] = useState(null);
const [currentUser, setCurrentUser] = useState(null);
const { archivePurchaseOrder, loading: archiving } = useArchivePurchaseOrder();
const { restorePurchaseOrder, loading: restoring } = useRestorePurchaseOrder();
```

**Add useEffect to fetch current user:**
```javascript
useEffect(() => {
  const fetchUser = async () => {
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
    } catch (error) {
      console.error('Failed to fetch current user:', error);
    }
  };
  fetchUser();
}, []);
```

**Update usePurchaseOrders to pass archived parameter:**
```javascript
const { purchaseOrders, loading, error, refetch } = usePurchaseOrders({
  archived: showArchivedTab ? 'true' : 'false'
});
```

**Add handler functions:**
```javascript
const handleArchiveClick = (po) => {
  setPoToArchive(po);
  setShowArchiveDialog(true);
};

const handleConfirmArchive = async () => {
  if (!poToArchive) return;

  try {
    await archivePurchaseOrder(poToArchive.po_id || poToArchive.id);
    toast.success('Purchase Order archived successfully');
    setShowArchiveDialog(false);
    setPoToArchive(null);
    refetch();
  } catch (error) {
    toast.error(error.response?.data?.message || error.message);
    setShowArchiveDialog(false);
    setPoToArchive(null);
  }
};

const handleRestore = async (po) => {
  try {
    await restorePurchaseOrder(po.po_id || po.id);
    toast.success('Purchase Order restored successfully');
    refetch();
  } catch (error) {
    toast.error(error.response?.data?.message || error.message);
  }
};
```

**Add tab toggle UI (after header, before filters):**
```javascript
{/* Archive Toggle */}
<div className="flex gap-2">
  <Button
    variant={!showArchivedTab ? 'default' : 'outline'}
    onClick={() => setShowArchivedTab(false)}
  >
    Active Purchase Orders
  </Button>
  <Button
    variant={showArchivedTab ? 'default' : 'outline'}
    onClick={() => setShowArchivedTab(true)}
  >
    <Archive className="w-4 h-4 mr-2" />
    Archived
  </Button>
</div>
```

**Add archive/restore buttons to PO cards/table:**

If using PODetailsModal, add archive/restore button:
```javascript
{!po.archived_at && (currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
  <Button variant="outline" onClick={() => handleArchiveClick(po)}>
    <Archive className="w-4 h-4 mr-2" />
    Archive
  </Button>
)}

{po.archived_at && (currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
  <Button variant="outline" onClick={() => handleRestore(po)}>
    <ArchiveRestore className="w-4 h-4 mr-2" />
    Restore
  </Button>
)}
```

**Add DeleteConfirmDialog (reusing for archive confirmation):**
```javascript
<DeleteConfirmDialog
  open={showArchiveDialog}
  onClose={() => {
    setShowArchiveDialog(false);
    setPoToArchive(null);
  }}
  onConfirm={handleConfirmArchive}
  title="Archive Purchase Order"
  description={
    poToArchive
      ? `Are you sure you want to archive Purchase Order ${poToArchive.po_number}? You can restore it later from the Archived tab.`
      : ''
  }
  confirmText="Archive Purchase Order"
  variant="destructive"
  loading={archiving}
/>
```

---

## 🎯 Phase 4: Job Orders Archive Pattern

### Overview
Same pattern as Purchase Orders. Job Orders also have business workflow status and need archive pattern.

### Database Migration

**File to Create:** `backend/migrations/20250103000002-add-archive-fields-to-job-orders.js`

```javascript
export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn('job_orders', 'archived_at', {
    type: Sequelize.DATE,
    allowNull: true
  });

  await queryInterface.addColumn('job_orders', 'archived_by', {
    type: Sequelize.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  });
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.removeColumn('job_orders', 'archived_by');
  await queryInterface.removeColumn('job_orders', 'archived_at');
}
```

**Run Migration:**
```bash
cd backend
node migrations/20250103000002-add-archive-fields-to-job-orders.js
```

### Backend Implementation

#### 1. Update Model: `backend/src/models/JobOrder.js`

**Add after status field:**
```javascript
  archived_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  archived_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
```

#### 2. Update Service: `backend/src/services/jobOrderService.js`

**Add to end of file:**

```javascript
export const archiveJobOrder = async (joId, userId) => {
  const jo = await JobOrder.findByPk(joId);

  if (!jo) {
    const error = new Error('Job Order not found');
    error.statusCode = 404;
    throw error;
  }

  if (jo.archived_at) {
    const error = new Error('Job Order is already archived');
    error.statusCode = 400;
    throw error;
  }

  await jo.update({
    archived_at: new Date(),
    archived_by: userId
  });

  return jo;
};

export const restoreJobOrder = async (joId) => {
  const jo = await JobOrder.findByPk(joId);

  if (!jo) {
    const error = new Error('Job Order not found');
    error.statusCode = 404;
    throw error;
  }

  if (!jo.archived_at) {
    const error = new Error('Job Order is not archived');
    error.statusCode = 400;
    throw error;
  }

  await jo.update({
    archived_at: null,
    archived_by: null
  });

  return jo;
};
```

**Modify `getJobOrders` to filter archived:**
```javascript
export const getJobOrders = async (queryParams) => {
  const {
    page = 1,
    limit = 20,
    search,
    sortBy = 'created_at',
    sortOrder = 'desc',
    status,
    archived = 'false'  // Add this
  } = queryParams;

  const offset = (page - 1) * limit;
  const where = {};

  // Filter archived JOs
  if (archived === 'true') {
    where.archived_at = { [Op.not]: null };
  } else {
    where.archived_at = null;
  }

  // ... rest of code
```

#### 3. Add Controller Functions: `backend/src/controllers/jobOrderController.js`

**Add to end of file:**

```javascript
export const archiveJobOrder = async (req, res, next) => {
  try {
    const { jo_id } = req.params;
    const userId = req.user.user_id;

    const jo = await jobOrderService.archiveJobOrder(jo_id, userId);

    res.status(200).json({
      success: true,
      data: jo,
      message: 'Job Order archived successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const restoreJobOrder = async (req, res, next) => {
  try {
    const { jo_id } = req.params;

    const jo = await jobOrderService.restoreJobOrder(jo_id);

    res.status(200).json({
      success: true,
      data: jo,
      message: 'Job Order restored successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};
```

#### 4. Add Routes: `backend/src/routes/jobOrders.js`

**Add before `export default router;`:**

```javascript
// Archive/restore - managers and admins only
router.post('/:jo_id/archive', authorize('admin', 'manager'), jobOrderController.archiveJobOrder);
router.post('/:jo_id/restore', authorize('admin', 'manager'), jobOrderController.restoreJobOrder);
```

### Frontend Implementation

#### 1. Update Service: `frontend/src/services/jobOrderService.js`

**Add to end of file:**

```javascript
export const archiveJobOrder = async (joId) => {
  const response = await api.post(`/job-orders/${joId}/archive`);
  return response.data;
};

export const restoreJobOrder = async (joId) => {
  const response = await api.post(`/job-orders/${joId}/restore`);
  return response.data;
};
```

#### 2. Add Hooks: `frontend/src/hooks/useJobOrders.js`

**Update `useJobOrders` to accept archived parameter:**
```javascript
export const useJobOrders = (params = {}) => {
  // ... existing code, ensure params includes archived
};
```

**Add new hooks:**

```javascript
export const useArchiveJobOrder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const archiveJobOrder = useCallback(async (joId) => {
    setLoading(true);
    setError(null);
    try {
      await jobOrderService.archiveJobOrder(joId);
      return true;
    } catch (err) {
      setError(err.message || 'Failed to archive job order');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { archiveJobOrder, loading, error };
};

export const useRestoreJobOrder = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const restoreJobOrder = useCallback(async (joId) => {
    setLoading(true);
    setError(null);
    try {
      await jobOrderService.restoreJobOrder(joId);
      return true;
    } catch (err) {
      setError(err.message || 'Failed to restore job order');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { restoreJobOrder, loading, error };
};
```

#### 3. Update Page: `frontend/Pages/JobOrders.jsx`

**Follow same pattern as PurchaseOrders.jsx:**
- Import Archive, ArchiveRestore icons
- Import hooks and DeleteConfirmDialog
- Add state for showArchivedTab, showArchiveDialog, joToArchive, currentUser
- Add useEffect to fetch current user
- Add archive/restore handler functions
- Add tab toggle UI
- Add archive/restore buttons to JO cards/modal
- Add DeleteConfirmDialog for archive confirmation

---

## 📝 Documentation Updates

After completing all phases, update the following documentation files:

### 1. Update `CLAUDE.md`

**Add to "Key Features" section:**
```markdown
- Delete functionality with confirmation dialogs:
  - Items: Soft delete with comprehensive pre-delete validation
  - Suppliers: Soft delete with active PO checking
  - Purchase Orders: Archive/restore pattern (separate from workflow status)
  - Job Orders: Archive/restore pattern (separate from workflow status)
  - Audit trail: All deletes/archives tracked with deleted_by/archived_by and timestamps
  - Role-based access: Admin-only for Items/Suppliers, Admin+Manager for POs/JOs
```

**Add new section after "Core Data Entities":**

```markdown
## 🗑️ Delete & Archive Patterns

### Soft Delete Pattern (Items, Suppliers)
- Status set to `inactive`
- Audit fields: `deleted_by`, `deleted_at`
- Pre-delete validation prevents deletion of items in use
- Admin-only access
- UI: DeleteConfirmDialog with detailed error messages

### Archive Pattern (Purchase Orders, Job Orders)
- Separate from business workflow status
- Fields: `archived_at`, `archived_by`
- Can be restored from Archived tab
- Admin + Manager access
- UI: Active/Archived tab toggle

### DeleteConfirmDialog Component
**Location:** `frontend/Components/ui/DeleteConfirmDialog.jsx`

Reusable confirmation dialog with:
- Two-step confirmation
- Destructive variant styling
- Inline error display for validation failures
- Loading states

**Usage:**
```javascript
<DeleteConfirmDialog
  open={showDialog}
  onClose={handleClose}
  onConfirm={handleConfirm}
  title="Delete Item"
  description="Are you sure?"
  confirmText="Delete"
  variant="destructive"
  loading={deleting}
  errors={errorArray}
/>
```
```

### 2. Update `README.md`

**Add to Features section:**
```markdown
- **Delete & Archive Management**
  - Items and Suppliers: Soft delete with comprehensive safety checks
  - Purchase Orders and Job Orders: Archive/restore functionality
  - Audit trail for all deletions and archives
  - Role-based access control
```

### 3. Update `QUICK_START.md`

**Add to "Common Operations" section:**

```markdown
## Delete & Archive Operations

### Deleting Items (Admin Only)
1. Navigate to Items page
2. Click on item card menu (three dots)
3. Select "Delete Item"
4. Confirm in dialog
5. If validation fails, error messages show which dependencies block deletion

### Deleting Suppliers (Admin Only)
1. Navigate to Suppliers page
2. Click on supplier card menu
3. Select "Delete Supplier"
4. Confirm in dialog
5. Cannot delete if supplier has active purchase orders

### Archiving Purchase Orders (Admin/Manager)
1. Navigate to Purchase Orders page
2. Click "Active Purchase Orders" tab
3. Open PO details modal
4. Click "Archive" button
5. Confirm in dialog
6. View archived POs in "Archived" tab
7. Restore with "Restore" button

### Archiving Job Orders (Admin/Manager)
1. Navigate to Job Orders page
2. Click "Active Job Orders" tab
3. Open JO details modal
4. Click "Archive" button
5. Confirm in dialog
6. View archived JOs in "Archived" tab
7. Restore with "Restore" button
```

### 4. Create New Document: `DELETE_ARCHIVE_GUIDE.md`

**Create file:** `c:\xampp\htdocs\SKU-Inventory-Manager\DELETE_ARCHIVE_GUIDE.md`

```markdown
# Delete & Archive Functionality Guide

## Overview

The SKU Inventory Manager implements two distinct patterns for removing records:
1. **Soft Delete** - For Items and Suppliers
2. **Archive Pattern** - For Purchase Orders and Job Orders

---

## Soft Delete Pattern

### Applies To: Items, Suppliers

**Behavior:**
- Record status set to `inactive`
- Record remains in database
- Audit trail: `deleted_by`, `deleted_at` fields
- Cannot be restored through UI (requires database update)

### Pre-Delete Validation

**Items:**
- Cannot delete if used in active products (ProductComposition)
- Cannot delete if referenced in any Purchase Orders
- Cannot delete if referenced in any Job Orders
- Error dialog shows all blocking dependencies

**Suppliers:**
- Cannot delete if has active Purchase Orders (draft, pending, partial status)
- Error shows count of active POs

### Access Control
- **Admin only** for Items and Suppliers

### Implementation Files

**Backend:**
- Routes: `backend/src/routes/items.js`, `backend/src/routes/suppliers.js`
- Controllers: `backend/src/controllers/itemController.js`, `backend/src/controllers/supplierController.js`
- Services: `backend/src/services/itemService.js`, `backend/src/services/supplierService.js`
- Models: `backend/src/models/Item.js`, `backend/src/models/Supplier.js`

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
```

---

## 🧪 Testing Plan

### Phase 3 Testing: Purchase Orders Archive

**Test Cases:**
1. **Archive Active PO (Admin)**
   - Login as admin
   - Navigate to Purchase Orders
   - Open PO details modal
   - Click "Archive" button
   - Verify confirmation dialog appears
   - Confirm archive
   - Verify PO disappears from Active tab
   - Switch to Archived tab
   - Verify PO appears with "Restore" button

2. **Archive Active PO (Manager)**
   - Login as manager
   - Repeat steps above

3. **Archive Active PO (Viewer)**
   - Login as viewer
   - Verify archive button does NOT appear

4. **Restore Archived PO**
   - Switch to Archived tab
   - Find archived PO
   - Click "Restore" button
   - Verify no confirmation needed
   - Verify PO returns to Active tab
   - Verify archived_at and archived_by cleared

5. **Filter by Archived**
   - Verify API call includes `?archived=false` for Active tab
   - Verify API call includes `?archived=true` for Archived tab

### Phase 4 Testing: Job Orders Archive

**Repeat all tests from Phase 3 for Job Orders**

---

## 📊 Summary of Changes

### Database Changes
- Items: +2 columns (deleted_by, deleted_at)
- Suppliers: +2 columns (deleted_by, deleted_at)
- Purchase Orders: +2 columns (archived_by, archived_at)
- Job Orders: +2 columns (archived_by, archived_at)

### Backend Files Created/Modified
- 4 migration files
- 4 model files (Item, Supplier, PurchaseOrder, JobOrder)
- 4 service files
- 4 controller files
- 4 route files

### Frontend Files Created/Modified
- 1 new component (DeleteConfirmDialog.jsx)
- 4 service files
- 4 hook files
- 4 page components
- 2 card components (ItemCard, SupplierCard)
- 1 auth service file (getCurrentUser)

### Documentation Files to Update
- CLAUDE.md
- README.md
- QUICK_START.md
- DELETE_ARCHIVE_GUIDE.md (new)

---

## 🚀 Implementation Order

1. **Phase 3: Purchase Orders Archive**
   - Database migration
   - Backend: Model → Service → Controller → Routes
   - Frontend: Service → Hooks → Page UI
   - Test thoroughly

2. **Phase 4: Job Orders Archive**
   - Database migration
   - Backend: Model → Service → Controller → Routes
   - Frontend: Service → Hooks → Page UI
   - Test thoroughly

3. **Documentation Updates**
   - Update CLAUDE.md
   - Update README.md
   - Update QUICK_START.md
   - Create DELETE_ARCHIVE_GUIDE.md

4. **Final Testing**
   - Run complete test suite
   - Test all four entities (Items, Suppliers, POs, JOs)
   - Verify role-based access control
   - Verify error handling and validation

---

## ✅ Completion Checklist

### Phase 3: Purchase Orders Archive
- [ ] Database migration executed
- [ ] PurchaseOrder model updated
- [ ] purchaseOrderService.js: archivePurchaseOrder() added
- [ ] purchaseOrderService.js: restorePurchaseOrder() added
- [ ] purchaseOrderService.js: getPurchaseOrders() filters archived
- [ ] purchaseOrderController.js: archive endpoint added
- [ ] purchaseOrderController.js: restore endpoint added
- [ ] purchaseOrders.js routes: archive/restore routes added
- [ ] purchaseOrderService.js: archivePurchaseOrder() added
- [ ] purchaseOrderService.js: restorePurchaseOrder() added
- [ ] usePurchaseOrders.js: useArchivePurchaseOrder() added
- [ ] usePurchaseOrders.js: useRestorePurchaseOrder() added
- [ ] usePurchaseOrders.js: archived parameter supported
- [ ] PurchaseOrders.jsx: Active/Archived tabs added
- [ ] PurchaseOrders.jsx: Archive dialog added
- [ ] PurchaseOrders.jsx: Archive/Restore handlers added
- [ ] Testing completed

### Phase 4: Job Orders Archive
- [ ] Database migration executed
- [ ] JobOrder model updated
- [ ] jobOrderService.js: archiveJobOrder() added
- [ ] jobOrderService.js: restoreJobOrder() added
- [ ] jobOrderService.js: getJobOrders() filters archived
- [ ] jobOrderController.js: archive endpoint added
- [ ] jobOrderController.js: restore endpoint added
- [ ] jobOrders.js routes: archive/restore routes added
- [ ] jobOrderService.js: archiveJobOrder() added
- [ ] jobOrderService.js: restoreJobOrder() added
- [ ] useJobOrders.js: useArchiveJobOrder() added
- [ ] useJobOrders.js: useRestoreJobOrder() added
- [ ] useJobOrders.js: archived parameter supported
- [ ] JobOrders.jsx: Active/Archived tabs added
- [ ] JobOrders.jsx: Archive dialog added
- [ ] JobOrders.jsx: Archive/Restore handlers added
- [ ] Testing completed

### Documentation
- [ ] CLAUDE.md updated
- [ ] README.md updated
- [ ] QUICK_START.md updated
- [ ] DELETE_ARCHIVE_GUIDE.md created
- [ ] All inline code comments added
- [ ] API documentation updated (if separate file exists)

### Final Verification
- [ ] All migrations executed successfully
- [ ] All backend endpoints tested via Postman/curl
- [ ] All frontend UI tested in browser
- [ ] Role-based access verified
- [ ] Error handling tested
- [ ] Audit trail verified (deleted_by/archived_by populated)
- [ ] No console errors
- [ ] No backend errors
- [ ] Git committed with proper commit message

---

## 📞 Support & Questions

If you encounter issues:
1. Check error logs in browser console
2. Check backend server logs
3. Verify database migrations ran successfully
4. Verify all imports are correct
5. Check role-based access control settings
6. Review this document for missed steps

**Common Issues:**
- "getCurrentUser is not defined" → Import from authService.js
- "useArchivePurchaseOrder is not defined" → Add hook to usePurchaseOrders.js
- Archive button not visible → Check user role
- Archived items showing in Active tab → Check query parameter filtering

---

**END OF PHASE 3 & 4 IMPLEMENTATION PLAN**

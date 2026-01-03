# Development Tasks

## ✅ Completed Phases

### 🐛 Bug Fixes
- [x] Fix generic 422 error display in Supplier creation/update (Suppliers.jsx)
- [x] Fix generic 422 error display in Product creation/update (Items.jsx)

### Phase 0 & 1: Items Delete
- [x] Database migration: Added `deleted_by`, `deleted_at` to items table
- [x] Backend safety checks (ProductComposition, PurchaseOrders, JobOrders)
- [x] Backend service & controller for item deletion
- [x] Frontend `DeleteConfirmDialog` component
- [x] Frontend Items page integration

### Phase 2: Suppliers Delete
- [x] Database migration: Added `deleted_by`, `deleted_at` to suppliers table
- [x] Backend route & service for supplier deletion
- [x] Frontend Suppliers page integration

## 🚧 Current Phase: Phase 3 (Purchase Orders Archive)

### Database Implementation
- [ ] Create migration for `archived_at` and `archived_by` on `purchase_orders`
- [ ] Run migration

### Backend Implementation
- [ ] Update `PurchaseOrder` model
- [ ] Update `purchaseOrderService` (archive/restore functions)
- [ ] Update `purchaseOrderController`
- [ ] Add archive/restore routes

### Frontend Implementation
- [ ] Update `purchaseOrderService` (API calls)
- [ ] Add `useArchivePurchaseOrder` / `useRestorePurchaseOrder` hooks
- [ ] Update `PurchaseOrders.jsx` (Tabs, Dialogs, Handlers)

## 📋 Next Phase: Phase 4 (Job Orders Archive)

### Database Implementation
- [ ] Create migration for `archived_at` and `archived_by` on `job_orders`
- [ ] Run migration

### Backend Implementation
- [ ] Update `JobOrder` model
- [ ] Update `jobOrderService`
- [ ] Update `jobOrderController`
- [ ] Add routes

### Frontend Implementation
- [ ] Update `jobOrderService`
- [ ] Add hooks
- [ ] Update `JobOrders.jsx`

## 📝 Documentation
- [ ] Update `CLAUDE.md` with delete/archive patterns

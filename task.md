# Development Tasks

## ✅ Completed Phases (Jan 6 - Jan 7, 2026)

### Phase 18: SKU Code Reuse & Fixes
- [x] Fix SKU uniqueness constraints (allow reuse of deleted SKUs)
- [x] Fix ingredient deletion blocked by soft-deleted products

### Phase 19: Unit of Measure Expansion
- [x] Add 'ml' (Milliliters) to ItemFormModal and Validation logic

### Phase 20: Production Bug Fixes & Search
- [x] Fix Production 401/500 errors (Alerts service)
- [x] Fix PO list "0 items" display bug
- [x] Add Search Bars to POCreateWizard and JOCreateModal

### Phase 21: Smart Restock Logic
- [x] Auto-calculate thresholds (Min Threshold, Purchase Allowance) based on system settings
- [x] Implement Smart Quantity Suggestions (MOQ + Threshold awareness)
- [x] Suggestions in PO Wizard and JO Wizard

### Phase 22: Dashboard Fixes
- [x] Fix zero-values in Dashboard stats (camelCase vs snake_case mismatch)
- [x] Add Healthy/Overstock calculations

### Phase 23: JO Notes System
- [x] Add `notes` field to Job Orders
- [x] Synced notes to FIFO Batches
- [x] Display notes in Product View (FIFO Batch list)

### Phase 24: Validations & JO Refinements
- [x] Fix Category `product_type` validation (null for non-products)
- [x] Verify JO FIFO consumption logic
- [x] Implement Finished Product Expiry Date setting

### Phase 25: Documentation Synchronization
- [x] Audit and align CLAUDE.md with codebase (v1.4.1)
- [x] Update README.md with new features (Smart Restock, Nested Products)
- [x] Update QUICK_REFERENCE.md with new entity fields (Soft Delete, JO Notes)
- [x] Update API Specification with Archive/Restore endpoints

## 🚧 Upcoming / Maintenance
- [ ] Monitor Production Stability
- [ ] Weekly Database Backups
- [ ] Possible: Advanced Reporting features (as logged in Future Enhancements)

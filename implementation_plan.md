# Documentation Alignment Plan

## Goal
To synchronize all project documentation (`CLAUDE.md`, `README.md`, `docs/*`) with the current state of the codebase, ensuring recent features like Smart Restock, Job Order Notes, and Soft Delete/Archive architectures are accurately reflected.

## User Review Required
> [!NOTE]
> This plan focuses purely on documentation updates. No code changes are involved.

## Proposed Changes

### 1. Root Documentation Refinement

#### [MODIFY] [CLAUDE.md](file:///c:/xampp/htdocs/SKU-Inventory-Manager/CLAUDE.md)
- **Update Metadata**: Change "Last Updated" to Jan 2026.
- **Update Core Data Entities** (Verified in `backend/src/models/`): 
  - Add `deleted_by`, `deleted_at`, `nesting_level` to Item entity (Verified: `Item.js` lines 141-152, 75).
  - Add `notes` to FIFO Batch entity (Verified: `FIFOBatch.js` line 34).
  - Add `archived_at` to PO/JO entities.
- **Update Key Features**: Add "Smart Restock Logic", "Unit of Measure Expansion", "Nested Products".

#### [MODIFY] [README.md](file:///c:/xampp/htdocs/SKU-Inventory-Manager/README.md)
- **Update Key Features**: Include "Smart Restock" and "Nested Products".
- **Refine Project Structure**: Ensure specific "Components" list is up to date (e.g. `products` wizard).

### 2. Quick Reference & API Specs

#### [MODIFY] [docs/QUICK_REFERENCE.md](file:///c:/xampp/htdocs/SKU-Inventory-Manager/docs/QUICK_REFERENCE.md)
- **Update Data Entity Quick Reference**: Add missing fields (soft delete, archive, batch notes).
- **Update Common Issues**: Add circular dependency tip for Nested Products.

#### [MODIFY] [docs/api/specification.md](file:///c:/xampp/htdocs/SKU-Inventory-Manager/docs/api/specification.md)
- **Add Archive/Restore Endpoints** (Verified in Routes):
  - `POST /purchase-orders/:id/archive` & `restore` (Verified: `purchaseOrders.js` lines 28-29).
  - `POST /job-orders/:id/archive` & `restore` (Verified: `jobOrders.js` lines 28-29).
- **Update Schemas**:
  - Update `completeJobOrder` request body to include `expiryDateOverride` and `notes` (Verified: `jobOrderService.js` line 251).
  - Update Item schema with `deleted_by` and `deleted_at`.

### 3. Cross-Document Correlation Matrix (Guaranteed Consistency)

| Feature | CLAUDE.md | README.md | docs/QUICK_REFERENCE.md | docs/api/specification.md |
| :--- | :--- | :--- | :--- | :--- |
| **Smart Restock** | List as "Key Feature" (Auto-calc logic) | List as "Key Feature" | Mention in "Critical Rules" | N/A (Logic handled in Service) |
| **Soft Delete** | Add `deleted_by/at` to `Item` entity | N/A | Add to "Data Entities" | Update `Item` Schema |
| **Archive** | Add `archived_at` to `PO/JO` entities | N/A | Add to "Data Entities" | Add `/archive` & `/restore` endpoints |
| **Nested Products** | List as "Key Feature" | List as "Key Feature" | Link to `docs/NESTED_PRODUCTS.md` | N/A (Covered in dedicated doc) |
| **Unit of Measure** | Mention 'ml' support in "Tech Stack/Features" | N/A | Update "Data Entities" example | Define as `String` (Flexible) |

## Verification Plan

### Manual Verification
- **Markdown Rendering**: Open each updated file to ensure correct formatting.
- **Fact Checking**: Compare the updated entity definitions against `DEVELOPMENT_HISTORY.md` and codebase models (e.g. `Item.js`, `FIFOBatch.js`) to guarantee specific field names are correct.
- **Correlation Check**: Verify that every row in the matrix above is implemented exactly as described across all columns.

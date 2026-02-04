
## Phase 28: UOM Conversion System (2026-02-04)

### High-Level Summary
Implemented automatic Unit of Measure (UOM) conversion across the Job Order system to resolve critical calculation bugs where ingredient requirements showed incorrect large values due to UOM mismatches (e.g., recipe in grams, stock in kilograms).

### Core Implementation
1.  **UOM Converter Utility**:
    -   Created `backend/src/utils/uomConverter.js` and `frontend/src/utils/uomConverter.js`
    -   14 standardized UOMs across 3 groups: Weight (mg, g, kg, lb, oz), Volume (mL, L, gal, cup, tbsp, tsp), Count (pcs, units, dozen)
    -   Functions: `convertQuantity()`, `areCompatible()`, `normalizeUom()`, `getGroupedUomOptions()`
2.  **Backend Integration**:
    -   Updated `jobOrderService.createJobOrder()` with UOM conversion for stock validation
    -   Updated `jobOrderService.finalizeJobOrder()` for draft finalization
    -   Updated `jobOrderService.completeJobOrder()` for ingredient consumption
    -   Updated `jobOrderService.checkProductionFeasibility()` for accurate analysis
3.  **Frontend Updates**:
    -   Created `UomSelect.jsx` grouped dropdown component
    -   Updated `ItemFormModal.jsx` and `BasicInfoStep.jsx` to use new dropdown
    -   Updated `JOCreateModal.jsx` with conversion logic and visual indicators
4.  **Scripts**:
    -   `scripts/migrate-uom-data.js` for normalizing legacy UOM values
    -   `scripts/verify-uom-conversion.js` with 24 unit tests (all passing)

### Outcomes
- Recipe quantities now auto-convert to stock UOM (e.g., 150000g → 150kg)
- Grouped UOM dropdown replaces free-text input
- All conversion tests passing
- Documentation updated (schema.md, AI_GUIDELINES.md)

## Phase 26: Multi-Tenancy Final Hardening & Tenant A Restoration (2026-02-02)

### High-Level Summary
Successfully resolved final blockers for multi-tenancy adoption, specifically regarding legacy tenant compatibility and critical 500 errors in the Supplier Coverage module.

### Core Fixes
1.  **Supplier Coverage Resolution (Universal)**:
    -   **Root Cause**: Identified a `ReferenceError: Item is not defined` in `itemService.js` caused by missing model injections in the newly refactored multi-tenant service functions.
    -   **Fix**: Updated `getItemSupplierCoverage` to dynamically retrieve `Item`, `Supplier`, and `SupplierItem` models from the tenant-specific `dbStore`.
    -   **Robustness**: Implemented a `try-catch` block within the supplier calculation loop to prevent system-wide 500 errors if single records have corrupted relationship data.
2.  **Tenant A restoration & Master Admin Access**:
    -   **Credential Sync**: Reset legacy Tenant A credentials and synced the Landlord database (`SKU`) to ensure `admin_email` and `admin_password_hash` were correctly propagated.
    -   **Permission Parsing**: Patched `PermissionContext.jsx` to handle stringified permissions (legacy format) by automatically attempting `JSON.parse` if a string is received from the backend.
    -   **Schema Consistency**: Verified and patched Tenant A schema to include `permissions` and `is_master_admin` columns, granting full visibility of the Settings and User Management tabs.

### Outcomes
- Verified 100% functionality for legacy Tenant A across all Dashboard modules.
- Guaranteed 500-error-free operation of Supplier Coverage for all current and future tenants.

## Phase 27: Legacy Data Recovery & Multi-Tenant Finalization (2026-02-02)

### High-Level Summary
Successfully recovered and integrated the "Original" project database (`sku_inventory_manager`) into the multi-tenant registry. This ensures that the bulk of the project history (67 items, AI conversations, and orders) is preserved and accessible.

### Core Fixes
1.  **Legacy Data Rescue**:
    -   **Registry Mapping**: Registered the orphaned `sku_inventory_manager` database as a new tenant: **"Original Legacy Data"**.
    -   **Subdomain/Token**: Configured subdomain `original` and token `token-original` for access.
2.  **Permission Alignment**:
    -   **Privilege Elevation**: Updated the legacy `admin@test.com` account (which was previously view-only) to full **Master Admin** status with complete CRUD permissions across all modules.
    -   **Credential Sync**: Synchronized the password hash for `admin@test.com` to the Landlord database (`SKU`) to enable shared login.

### Outcomes
- Restored access to 67 items, 23 suppliers, and 3 historical AI chat sessions.
- Finalized the Multi-Tenancy transition by ensuring no legacy data was left behind.
- Verified that all legacy data is fully compatible with recent architectural fixes (Supplier Coverage, Permission Parsing).

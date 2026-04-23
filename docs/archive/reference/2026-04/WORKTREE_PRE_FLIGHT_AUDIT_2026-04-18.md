---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-04-18
applies_to: inventory_multi_location_and_adjacent_changes
topic: worktree_preflight_delta_audit
---

# Worktree Pre-Flight Audit - 2026-04-18

## Purpose
Capture the full in-progress change surface (including files outside the original location-selector scope) so implementation and documentation decisions are evidence-based.

## Evidence Source
1. `git status --short`
2. Path-scoped `git diff -- <files>`
3. Runtime contract checks from model/service/controller sources under:
   - `backend/src/models`
   - `backend/src/modules`
   - `backend/src/services`
   - `frontend/Components`
   - `frontend/src`

## Changed Surface (Grouped)

### Backend Runtime
1. `backend/src/models/Item.js`
2. `backend/src/modules/inventory/controllers/itemHandlers.js`
3. `backend/src/modules/inventory/repositories/itemRepository.js`
4. `backend/src/modules/inventory/usecases/getItemBatchesUseCase.js`
5. `backend/src/modules/inventory/usecases/itemQueryUseCases.js`
6. `backend/src/modules/reports/controllers/reportHandlers.js`
7. `backend/src/services/csvImportService.js`
8. `backend/src/services/itemService.js`
9. `backend/src/services/reportService.js`
10. `backend/src/services/stockMovementService.js`
11. `backend/src/validators/itemValidator.js`

### Backend Tests and Migrations
1. `backend/tests/csvImportService.workflowMode.test.js`
2. `backend/tests/inventoryItemRepository.test.js`
3. `backend/migrations/20260418000001-set-fifo-enabled-default-true.cjs`
4. `backend/migrations/20260418000002-add-active-sku-unique-constraint.cjs`

### Frontend Runtime and Tests
1. `frontend/Components/items/ItemFormModal.jsx`
2. `frontend/Components/movements/MovementCreateModal.jsx`
3. `frontend/Components/movements/MovementDetailsModal.jsx`
4. `frontend/Components/products/ProductCreateWizard.jsx`
5. `frontend/Components/products/wizard/BasicInfoStep.jsx`
6. `frontend/Pages/Reports.jsx`
7. `frontend/src/features/inventory/pages/ItemsPage.jsx`
8. `frontend/src/features/stockMovements/pages/StockMovementsPage.jsx`
9. `frontend/src/hooks/useLocations.js`
10. `frontend/src/hooks/useReports.js`
11. `frontend/src/index.css`
12. `frontend/src/services/itemService.js`
13. `frontend/src/features/inventory/utils/skuSuggestion.js`
14. `frontend/src/features/inventory/__tests__/itemProductWizard.contract.test.js`
15. `frontend/src/features/inventory/__tests__/skuSuggestion.test.js`

## Confirmed Runtime Contract Deltas
1. FIFO defaults are now enabled by default (`fifo_enabled=true`) in model + validator + migration.
2. Active SKU uniqueness is normalized via generated `active_sku_code` and unique index (`uq_items_active_sku_code`).
3. Item detail reads now include `item_location_stocks` and location-enriched FIFO rows.
4. Item stock updates with `location_id` use location baseline stock for delta computation.
5. Item batch endpoint supports optional `location_id` filtering.
6. Expiry and enhanced stock-aging reports now accept `location_id` and return `location_name`.
7. Expiry and aging CSV exports now include `Location`.
8. Stock movement CSV export now includes location/source/destination location dimensions.
9. CSV import now normalizes SKU lookup and blocks duplicate normalized SKU rows.
10. Item/product wizards now default FIFO on, support SKU suggestion/manual override, and enforce location-aware stock edits.
11. Movement UX now starts from direction (`stock_in`/`stock_out`/`transfer`) and requires explicit location contract per movement type.

## Affected Areas (Beyond Original Scope)
1. SKU lifecycle hardening (create/update/finalize/import paths).
2. Report payload and export shape changes (location columns and filters).
3. Stock movement export schema and frontend movement detail/list rendering.
4. Wizard typography contract classes and SKU suggestion utility/tests.
5. Location source-of-truth retrieval moved to tenant location service hook path.

## Documentation Sync Targets
1. `docs/database/schema.md`
2. `docs/api/specification.md`
3. `docs/guides/csv_import_guide.md`
4. `docs/features/multi-location-inventory/OPERATION_CONTRACT_MATRIX.md`
5. `docs/features/multi-location-inventory/DECISION_LEDGER.md`

## Known Residual Risks To Monitor
1. Legacy consumers that parse old stock movement CSV headers may require compatibility handling.
2. Clients relying on old report table assumptions (without location columns) need UI verification.
3. Migration order matters for SKU uniqueness (`active_sku_code` column/index) in tenant rollout waves.

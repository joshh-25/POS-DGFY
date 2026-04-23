---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-04-18
applies_to: workspace_cleanup
topic: docs_reconciliation_and_generated_artifact_cleanup
---

# Cleanup Log - 2026-04-18

## Summary
Documentation was reconciled against the current working tree (including pre-flight deltas outside the original location-selector request).  
After documentation updates, only verified generated/transient artifacts were removed.

## Documentation Updated
1. `docs/database/schema.md`
   - Updated FIFO default, normalized active SKU uniqueness, and location-ledger schema contracts.
2. `docs/api/specification.md`
   - Added/updated location-aware contracts for item batches, stock movements, reports, and CSV exports.
3. `docs/guides/csv_import_guide.md`
   - Documented normalized SKU lookup and duplicate-row rejection behavior.
4. `docs/features/multi-location-inventory/OPERATION_CONTRACT_MATRIX.md`
   - Added operation rows for item-batch location filtering, report parity, movement export location dimensions, and SKU conflict hardening.
5. `docs/features/multi-location-inventory/DECISION_LEDGER.md`
   - Added 2026-04-18 change-control entries for reporting/batch parity and SKU hardening.
6. `docs/archive/reference/2026-04/WORKTREE_PRE_FLIGHT_AUDIT_2026-04-18.md`
   - Added full pre-flight audit of current changed files and root contract deltas.

## Cleanup Performed
Removed generated build outputs:
1. `frontend/dist/`
2. `dist-apps/`

Removed stale temporary backend run logs:
1. `backend/tmp-5000.err.log`
2. `backend/tmp-5000.out.log`
3. `backend/tmp-5001.err.log`
4. `backend/tmp-5001.out.log`
5. `backend/tmp-bulk.err.log`
6. `backend/tmp-bulk.out.log`
7. `backend/tmp-server.err.log`
8. `backend/tmp-server.out.log`
9. `backend/tmp-smoke.err.log`
10. `backend/tmp-smoke.out.log`

## Safety Checks
1. Deletion scope was restricted to repository-local paths only.
2. Targets were verified as untracked/ignored artifacts before deletion.
3. Active non-generated worktree changes were preserved.

## Validation
1. `npm run lint:docs`

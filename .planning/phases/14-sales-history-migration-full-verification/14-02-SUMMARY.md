---
phase: 14-sales-history-migration-full-verification
plan: 02
subsystem: database
tags: [migration-runner, sequelize, sales-history, availments, mapper, pure-function]

# Dependency graph
requires:
  - phase: 13-product-inventory-migration
    provides: "legacy_id_map product/folder entity types that availment_item's resolvedProductId context depends on"
  - phase: 14-sales-history-migration-full-verification (plan 01, parallel wave)
    provides: "availments.source_system/legacy_snapshot/additional_fees and availment_items.source_system/source_reference/legacy_snapshot additive schema columns that this plan's mapper output targets (not required for this plan's own pure-function unit tests, which never touch a database)"
provides:
  - "mapPosTransactionToAvailment(): pure pos_transactions -> availments header mapper (finalized/voided status mapping, location/terminal/cashier attribution resolution, fixed-scale monetary totals, additional_fees, legacy_snapshot)"
  - "mapPosTransactionLineToAvailmentItem(): pure pos_transaction_lines -> availment_items line mapper (blocking parent/product dependency resolution, tax/stock-effect direct mapping, legacy_snapshot)"
  - "buildLegacyPosSnapshot()/buildLegacyPosLineSnapshot(): explicit field-allowlist snapshot builders"
  - "UNSUPPORTED_SALE_STATUS, SALE_LOCATION_NOT_MAPPED, SALE_TERMINAL_NOT_MAPPED, SALE_CASHIER_NOT_MAPPED, AVAILMENT_PARENT_NOT_MAPPED, SALE_PRODUCT_NOT_MAPPED reason codes"
  - "pos_transaction_lines removed from OUT_OF_SCOPE_LEGACY_TABLES (SHM-02 scope unblock)"
affects: ["14-03 (legacy sales source reader)", "14-04/14-05 (dry-run/apply orchestration)", "14-06 (verification/reconciliation)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure mapper functions (zero DB/SQL/import access) returning { operation, entity_type, target_table, target_database, target_payload, legacy_id_map_key, related_targets, findings }, consistent with the existing 12 Phase 3/13 mappers in the same file"
    - "Explicit field-allowlist snapshot builders (buildLegacyPosSnapshot/buildLegacyPosLineSnapshot) instead of spreading the raw source row, proven by a field-classification coverage test derived from a canonical field-name list"
    - "Dual-purpose fields (location_id/terminal_id/cashier_id/shift_id/status) both drive a resolved first-class target column AND survive under a legacy_-prefixed key in the snapshot for audit continuity"

key-files:
  created:
    - apps/dgfy-migration-runner/tests/fixtures/phase14/legacySalesRecords.js
    - apps/dgfy-migration-runner/tests/dataSalesMappings.test.js
  modified:
    - apps/dgfy-migration-runner/src/data/mappings.js
    - apps/dgfy-migration-runner/tests/dataMappings.test.js

key-decisions:
  - "Applied D-14-01 through D-14-09 exactly as locked in 14-CONTEXT.md: legacy shift_id is never mapped to target shift_id (unrelated domains); location/terminal/cashier attribution gaps are non-blocking inserts with an 'orphan'-severity finding; line parent/product gaps are blocking skips (both target FKs are non-null); voids reuse status='voided' with void metadata only in legacy_snapshot; service_fee_amount/delivery_fee get a dedicated additional_fees column, never duplicated in legacy_snapshot."
  - "Money totals (subtotal/discount/vat/vat_exempt/total/additional_fees) are normalized through a new toFixedScaleMoneyString() helper (4-decimal Number.toFixed, mirroring the file's existing toDecimalString() convention) rather than passed through as raw strings, guaranteeing a canonical fixed-scale output regardless of input formatting."
  - "Field-classification coverage is proven structurally: fixtures export canonical POS_TRANSACTION_FIELD_NAMES/POS_TRANSACTION_LINE_FIELD_NAMES arrays (1:1 with the legacy Sequelize models), and the test computes SNAPSHOT_ONLY fields by filtering out only the explicitly-declared DIRECT_ONLY and DUAL_PURPOSE field lists — any newly added legacy model field that isn't classified will fail the coverage test rather than silently passing."

requirements-completed: [SHM-01, SHM-02, SHM-03, SHM-04]

coverage:
  - id: D1
    description: "Pure header mapper (pos_transactions -> availments) maps finalized/voided status, resolves location/terminal/cashier attribution with non-blocking findings, computes fixed-scale monetary totals and additional_fees, and preserves historical timestamps"
    requirement: "SHM-01"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesMappings.test.js#mapPosTransactionToAvailment"
        status: pass
    human_judgment: false
  - id: D2
    description: "pos_transaction_lines brought into scope (removed from OUT_OF_SCOPE_LEGACY_TABLES) and pure line mapper (pos_transaction_lines -> availment_items) blocks on missing parent availment or product resolution"
    requirement: "SHM-02"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesMappings.test.js#mapPosTransactionLineToAvailmentItem"
        status: pass
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesMappings.test.js#Phase 14 scope unblock (SHM-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Legacy void status (voided) reuses availments.status='voided' with void metadata preserved only in legacy_snapshot, distinguishable from refund-originated voids via source_system='legacy_migration'"
    requirement: "SHM-03"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesMappings.test.js#mapPosTransactionToAvailment > maps a voided header to status \"voided\" with void metadata only in the snapshot (D-14-04/D-14-05)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Line-item provenance (source_system, namespaced source_reference) is present on every mapped availment_item, matching the header's source_reference precedent"
    requirement: "SHM-04"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesMappings.test.js#mapPosTransactionLineToAvailmentItem > maps a normal line with a complete, exact target payload"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every current PosTransaction/PosTransactionLine model field is classified into a first-class target column, additional_fees, or an explicit legacy_snapshot allowlist entry; arbitrary source properties never spread into snapshots"
    verification:
      - kind: unit
        ref: "apps/dgfy-migration-runner/tests/dataSalesMappings.test.js#Phase 14 field classification completeness"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 02: Sales-History Pure Mapper Contract Summary

**Pure `pos_transactions`/`pos_transaction_lines` -> `availments`/`availment_items` header/line mappers with a fully-audited field-classification contract (68 header + 13 line snapshot keys), fixed-scale monetary normalization, and stable finding taxonomy — zero DB/SQL access.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-15T00:37:10Z
- **Completed:** 2026-07-15T00:48:36Z
- **Tasks:** 1
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `mapPosTransactionToAvailment()` maps `completed`->`finalized`/`voided`->`voided`, writes `source_system='legacy_migration'`, a namespaced `source_reference` (`legacy_pos:<invoice_number>`), preserves historical `created_at`/`updated_at`/`finalized_at`, computes fixed-scale monetary totals (subtotal/discount/vat/vat_exempt/total) plus a dedicated `additional_fees` JSON column from the real `service_fee_amount`/`delivery_fee` source fields, and resolves nullable location/terminal/cashier attribution with non-blocking findings.
- `mapPosTransactionLineToAvailmentItem()` requires resolved parent-availment and product IDs (blocking skip with a distinct reason code for each missing dependency), maps quantity/unit_price/stock_effect_type/tax_treatment/tax_rate directly, and writes line-level `source_system`/`source_reference`/`legacy_snapshot` provenance.
- `buildLegacyPosSnapshot()`/`buildLegacyPosLineSnapshot()` are explicit field allowlists (never a `{ ...legacy }` spread) covering every current field of `PosTransaction`/`PosTransactionLine` that lacks a first-class target column, proven by a coverage test derived from a canonical field-name list rather than hand-verified duplication.
- Added `UNSUPPORTED_SALE_STATUS`, `SALE_LOCATION_NOT_MAPPED`, `SALE_TERMINAL_NOT_MAPPED`, `SALE_CASHIER_NOT_MAPPED`, `AVAILMENT_PARENT_NOT_MAPPED`, `SALE_PRODUCT_NOT_MAPPED` to `MAPPING_REASON_CODES`.
- Removed `pos_transaction_lines` from `OUT_OF_SCOPE_LEGACY_TABLES`, completing the SHM-02 scope unblock (its parent `pos_transactions` was already unblocked in Phase 12).

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement complete pure header and line mappings** - `1387de52` (feat)

**Plan metadata:** committed separately as part of this SUMMARY.

## Files Created/Modified
- `apps/dgfy-migration-runner/src/data/mappings.js` - Added the two Phase 14 mappers, two snapshot builders, `SALE_STATUS_MAP`/`SALE_DOCUMENT_CONTEXT_MAP`/`toFixedScaleMoneyString`, six reason codes, and removed `pos_transaction_lines` from `OUT_OF_SCOPE_LEGACY_TABLES`
- `apps/dgfy-migration-runner/tests/fixtures/phase14/legacySalesRecords.js` - Canonical field-name lists plus finalized/voided/unsupported-status/unmapped-attribution/training-test header fixtures and normal/missing-parent/missing-product line fixtures
- `apps/dgfy-migration-runner/tests/dataSalesMappings.test.js` - 21 tests: field-classification completeness, complete-payload assertions for finalized/voided headers and a normal line, all attribution/dependency-gap findings, reason-code and scope-unblock assertions
- `apps/dgfy-migration-runner/tests/dataMappings.test.js` - Updated a stale Phase 3 purity-scan test that asserted no `PosTransactionLine`-named mapper exists (see Deviations)

## Decisions Made
- Money totals are normalized through a new `toFixedScaleMoneyString()` helper rather than passed through raw, guaranteeing exact 4-decimal fixed-scale strings regardless of input format, consistent with the file's existing `toDecimalString()` (12-decimal) convention.
- `customer_account_id`, `cashier_dgfy_account_id`, and `sc_pwd_*` availment columns are intentionally omitted from the mapper's `target_payload` (never set to any value) — they're live-checkout-only concepts with no legacy analog in scope for this migration.
- Field-classification coverage is derived structurally (canonical field-name arrays minus explicitly-declared direct/dual-purpose lists) rather than hand-typed per-field, so a future legacy model field addition fails the coverage test loudly instead of silently passing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Purity-contract comment leaked the literal `backend/src` substring**
- **Found during:** Task 1 (first test run)
- **Issue:** JSDoc comments in the new mapper functions referenced `backend/src/models/PosTransaction.js`/`PosTransactionLine.js` by path, which broke the existing `mappings.js purity contract` test (`tests/dataMappings.test.js`) that scans the file's raw source for the substring `'backend/src'` and asserts it's never present.
- **Fix:** Reworded the comments to describe the source models without embedding the literal path substring.
- **Files modified:** `apps/dgfy-migration-runner/src/data/mappings.js`
- **Verification:** `tests/dataMappings.test.js`'s purity-contract test passes.
- **Committed in:** `1387de52` (Task 1 commit)

**2. [Rule 1 - Bug] Stale Phase 3 out-of-scope guard test broke on the plan's own intentional scope change**
- **Found during:** Task 1 (running the full `dataMappings.test.js` suite after adding the new mapper)
- **Issue:** `tests/dataMappings.test.js` had a Phase 3-era regex guard asserting `mappings.js` exports no function matching `/PosTransactionLine|FiscalReceipt|Discount|Checkout/i`. The plan's own action item ("Remove `pos_transaction_lines` from `OUT_OF_SCOPE_LEGACY_TABLES`") intentionally adds `mapPosTransactionLineToAvailmentItem`, which the stale regex correctly (but now incorrectly) flagged.
- **Fix:** Narrowed the regex to `/FiscalReceipt|Discount|Checkout/i` (still-excluded domains) and added a comment explaining the Phase 14 SHM-02 scope unblock; the still-excluded fiscal/discount/checkout domains remain guarded.
- **Files modified:** `apps/dgfy-migration-runner/tests/dataMappings.test.js`
- **Verification:** Full `dataMappings.test.js` suite passes; the guard still fails if a fiscal/discount/checkout mapper is ever added.
- **Committed in:** `1387de52` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — pre-existing test assertions invalidated by this plan's own intentional, plan-mandated changes)
**Impact on plan:** No scope creep; both fixes were required to keep the pre-existing test suite green after implementing exactly what the plan specified.

## Issues Encountered
- The worktree had no `node_modules` installed for `apps/dgfy-migration-runner` (fresh git worktree checkout, `node_modules/` is gitignored and not shared across worktrees). Ran `npm install --no-audit --no-fund --prefer-offline` inside `apps/dgfy-migration-runner` before the first test run; no `package.json`/lockfile changes resulted (nothing to commit — install artifacts are gitignored).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The pure mapper contract (`mapPosTransactionToAvailment`/`mapPosTransactionLineToAvailmentItem`) is ready for Plan 03 (legacy sales source reader) and Plans 04/05 (dry-run/apply orchestration) to call directly — no orchestration code was written in this plan, per its file scope.
- This plan's mapper output targets `availments.source_system`/`legacy_snapshot`/`additional_fees` and `availment_items.source_system`/`source_reference`/`legacy_snapshot`, which are added by the parallel Plan 01 (schema migration + persistence models). Plan 01 was not a dependency for this plan's own pure-function unit tests (mappers never touch a database), but downstream orchestration/integration work in later plans requires both plans' work to be merged.
- No blockers. All 21 new tests and the full existing `mappings.js`-related suite (88 tests across `dataMappings.test.js`, `dataProductMappings.test.js`, `dataSalesMappings.test.js`) pass; the full migration-runner Jest suite (412 tests, 5 ENV-gated integration suites correctly skipped) and `check:architecture` both pass with zero regressions.

---
*Phase: 14-sales-history-migration-full-verification*
*Completed: 2026-07-15*

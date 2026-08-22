---
status: reference
owner: engineering
last_reviewed: 2026-08-21
declaration_id: 2026-08-21-item-location-stock-overlay-hoist
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.21
verification_evidence: posRepository.locationStockFallback.test.js,posRepository.catalogImages.test.js,itemLocationStockOverlay.test.js
rollback_note: Revert this commit. It is a pure move/rename refactor with no behavior change to any POS code path -- reverting restores the three private functions to posRepository.js verbatim. No data migration, no schema change, no new tenant-visible behavior.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-21T00:00:00+08:00
preflight_request_ref: ISSUE-682
---

# Item-Location Stock Overlay Hoist

## Compliance Impact Classification

Major because this commit touches `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`,
matching `scripts/check-compliance-impact.js`'s `surfaces: pos,terminal`, `minimumClassification:
major` rule for `^apps/dgfy-api/src/modules/pos/`. The change itself is narrowly a **move/rename
refactor**: the three private helpers `isMissingItemLocationStockSchemaError`,
`loadLocationStockMap`, and `applyLocationStockMap` are relocated verbatim (renamed
`loadItemLocationStockMap`/`applyItemLocationStockMap` for their new shared home) into a new module,
`apps/dgfy-api/src/modules/shared/repositories/itemLocationStockOverlay.js`, and `posRepository.js`
now imports them from there instead of defining them privately. This is done as part of #682 (align
branch-scoped stock between POS Items and the admin Items page) so the new Items-page backend logic
can reuse the exact same query/fallback implementation POS already uses, rather than duplicating it
a third time (a duplicate already exists independently in `storefrontDiscoveryIndexService.js`).

## Affected Surfaces

1. `apps/dgfy-api/src/modules/pos/repositories/posRepository.js` -- deletes the three private
   function bodies, adds an import from the new shared module, and renames the ~6 call sites
   (`listCatalog`, `findSellableItemsByIds`, and others) to the renamed exports. No call site's
   arguments, return shape, or control flow changes.
2. New `apps/dgfy-api/src/modules/shared/repositories/itemLocationStockOverlay.js` -- the
   relocated logic, unchanged in behavior, plus one additive change: the schema-missing fallback
   branch now also emits a `logger.warn` observability event (`event_type:
   'item_location_stock_fallback'` by default, overridable via an options param), mirroring the
   existing pattern in `storefrontDiscoveryIndexService.js`. `loadLocationStockMap`'s prior
   behavior on that branch did not log; this is a pure addition (a log line), not a behavior
   change to the returned value or any caller's control flow.
3. No POS transaction, checkout, discount, payment, or fiscal-record code path is touched. No
   route, controller, or use-case in `modules/pos/` changes in this commit -- only the repository's
   internal helper location.

## Compliance Preconditions

1. Confirmed by re-running the existing POS regression suite unmodified after the move:
   `posRepository.locationStockFallback.test.js` (4 tests, covering `listCatalog` and
   `findSellableItemsByIds`'s location-stock-scoped and schema-fallback behavior) and
   `posRepository.catalogImages.test.js` (3 tests) both pass with zero changes to the test files
   themselves -- the strongest available evidence this is behavior-preserving.
2. No new POS-facing capability, discount type, payment method, or fiscal field is introduced.
   Nothing in `pos_transaction_discounts`, `pos_transaction_payments`, or any other fiscal/audit
   table is touched.
3. The one behavioral addition (fallback logging) is observability-only -- it does not change what
   is returned to any caller, persisted, or charged, and cannot alter checkout, discount, or
   payment outcomes.

## Verification Evidence

1. `apps/dgfy-api/tests/posRepository.locationStockFallback.test.js` -- 4/4 pass, unmodified.
2. `apps/dgfy-api/tests/posRepository.catalogImages.test.js` -- 3/3 pass, unmodified.
3. `apps/dgfy-api/tests/itemLocationStockOverlay.test.js` -- new, 12/12 pass, unit-testing the
   hoisted module's three exports in isolation (schema-error detection, stock-map loading
   including the empty/unresolved/fallback/rethrow branches, and the overlay's service-item and
   missing-row zeroing behavior).
4. `node --check` passes on both modified/new files.

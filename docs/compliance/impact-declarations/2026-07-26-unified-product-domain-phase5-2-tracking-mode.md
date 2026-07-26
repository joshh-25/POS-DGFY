---
status: reference
owner: engineering
last_reviewed: 2026-07-26
related_adr: docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md
declaration_id: 2026-07-26-unified-product-domain-phase5-2-tracking-mode
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.26
verification_evidence: backend jest --runInBand targeted sweep across every touched module and its existing test suites (19 files, 230 tests: 214 passed, 16 pre-existing failures confirmed unchanged via git-stash A/B comparison against the pre-PR baseline) plus 26 new/extended tests covering the descriptor resolver, POS checkout recipe-vs-exemption ordering, storefront checkout stock-effect persistence, and browse-availability fallback,frontend vitest run across the 6 test files touching the two changed frontend components (57 passed),npm run check:architecture,npm run lint:docs,npm run check:tenant-schema-coverage (--staged),build:pos and build:skupervisor (both succeed)
rollback_note: Revert this PR's diff, including the migration (backend/migrations/20260726000001-add-tracking-mode-to-items.cjs down() drops both new columns and the index, guarded by describeTable/showIndex checks so it's a no-op if already absent). items.tracking_mode and items.tracking_toggle_available are both nullable with no default write requirement - every code path that reads them falls back to the pre-existing fifo_enabled/pos_always_available/category derivation whenever tracking_mode is NULL, so reverting the reads restores byte-identical prior behavior. The one write-path side effect - upsertCatalogOverride now also setting items.tracking_mode when pos_always_available changes - only ever writes 'untracked' or NULL to a column this PR introduces; reverting the read side makes those writes inert.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-26T09:20:20Z
preflight_request_ref: PR-104
---

# Unified Product Domain — Phase 5.2: Persisted Tracking-Mode Column

## Compliance Impact Classification

Major, per the `pos`/`terminal` surface floor triggered by `backend/src/modules/pos/repositories/posRepository.js`,
`backend/src/modules/pos/usecases/posUseCases.js`, and `frontend/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx`
being compliance-sensitive files this PR touches. This PR persists Axis 4 of ADR 0037 (the
availability/tracking mode) as a real column, routes checkout and browse-availability reads through
the `resolveStockBearingDescriptor` resolver landed in Phase 1, and fixes three real checkout bugs
along the way (see Known Issues below). None of this touches fiscal document classification, tax
computation, receipt numbering, payment-provider settlement, or terminal identity/authorization -
every changed file is touched narrowly and additively, and no VAT/discount/fiscal snapshot field is
read or written differently by this change.

## Affected Surfaces

- `backend/src/modules/pos/repositories/posRepository.js` (`pos`, `terminal`): adds `tracking_mode`
  and `tracking_toggle_available` to `BASE_POS_ITEM_ATTRIBUTES` (read-only SELECT addition, same
  pattern as the Phase 1 `mode_item_preset`/`min_threshold`/`fifo_enabled` fix). `upsertCatalogOverride`
  additionally mirrors the "Always Available" toggle onto `items.tracking_mode` ('untracked' when
  turned on; cleared back to NULL when turned off, and only when it's still exactly 'untracked' -
  never clobbers a value some other path may have set) so the existing POS-only toggle is now also
  honoured on the Storefront, without changing what the toggle itself does in POS.
- `backend/src/modules/pos/usecases/posUseCases.js` (`pos`, `terminal`): the checkout stock-effect
  block now derives `stock_exempt`/`stock_exempt_reason`/`cost_snapshot` from the descriptor instead
  of ad-hoc `pos_always_available`/`isServiceItem` checks (behaviorally identical for every item that
  has no `tracking_mode` set - the descriptor's fallback path is the same derivation, unchanged);
  adds a new rejection when a `toggle`-mode line has been marked unavailable (new 400
  `VALIDATION_FAILED`, no existing decision path altered); and reorders the recipe-consumption /
  finished-item-movement loop (both the in-person and `buildOnlineOrderStockMovements` cases) so
  ingredient movements always fire when a recipe exists, regardless of the finished item's own
  movement exemption - previously the exemption `continue` ran first and silently skipped ingredient
  deduction for every always-available recipe-backed item. This only affects which internal
  `stock_movements` rows get created; it does not change `sale_price`, VAT, or any customer-facing
  total.
- `backend/src/modules/store/usecases/storeUseCases.js` / `backend/src/modules/store/repositories/storeRepository.js`
  (not compliance-sensitive per the current pattern list, included here since they're part of the
  same checkout/browse-availability fix): storefront checkout now actually sets
  `stock_effect_type`/`stock_exempt_reason` on persisted online lines (previously always defaulted to
  `inventory_issue` regardless of real behavior) and honours `untracked`/`toggle` items the same way
  POS does; browse-availability reads (`applyLocationStock` and its two fallback paths) no longer
  collapse a missing per-location stock row to "out of stock" for untracked/toggle/capacity items.
- `frontend/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx` (`pos`, `terminal`): the
  local `isServiceCatalogItem` helper now also checks `mode_item_preset === 'service'`, matching the
  same check everywhere else in the codebase (a pure widening of an existing, narrower drift bug - see
  the equivalent Phase 1 fix for `BASE_POS_ITEM_ATTRIBUTES`).
- `backend/migrations/20260726000001-add-tracking-mode-to-items.cjs`: additive, guarded schema
  migration. Adds two nullable columns and one index to `items`; the one data-touching statement is a
  narrowly-scoped, idempotent backfill (`UPDATE items i INNER JOIN pos_catalog_overrides o ... WHERE
  o.pos_always_available = 1 AND i.tracking_mode IS NULL`) that only ever writes `'untracked'` to
  items already flagged always-available - it changes no other row and no other column.

## Compliance Preconditions

1. `resolveStockBearingDescriptor`'s legacy-fallback branch (active whenever `tracking_mode` is NULL)
   must remain byte-identical to the pre-PR derivation - verified by the extended
   `stockBearingPolicy.test.js` suite's "legacy fallback" describe block, which pins the exact
   descriptor shape for every pre-existing input combination.
2. The recipe-movement reordering must never skip a finished item's own stock movement when it is
   genuinely stock-bearing (only exempt lines - service/untracked/toggle - skip their own movement);
   verified by the existing recipe-consumption tests plus the new "bug 2" regression tests in
   `posCheckoutFnbContracts.usecase.test.js`.
3. `upsertCatalogOverride`'s new `items.tracking_mode` write is scoped to exactly the item being
   toggled and only ever writes `'untracked'` or `NULL` - it must never be extended to write any other
   tracking mode value without a fresh review, since that would change checkout stock-blocking
   behavior for items an operator did not directly toggle.
4. `sale_price`, `vat_type_snapshot`, `vat_rate_snapshot`, and all fiscal/discount fields on
   `pos_transaction_lines` remain untouched by this PR - confirmed by inspection of every diff hunk in
   `posUseCases.js` and `storeUseCases.js`, and by the unchanged assertions on those fields in the
   existing checkout test suites.

## Verification Evidence

1. Backend: `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand`
   across every test file for a service/use case touched by this PR -
   `tests/stockBearingPolicy.test.js`, `tests/posCheckoutFnbContracts.usecase.test.js`,
   `tests/storeFnbModifiers.usecases.test.js`, `tests/storeRepository.locationStockFallback.test.js`,
   `tests/fnbOperationalReadiness.qa.test.js`, `tests/inventoryItemRepository.test.js`,
   `tests/posCashierLoginUseCase.test.js`, `tests/posReadings.usecase.test.js`,
   `tests/posReports.usecase.test.js`, `tests/posRepository.catalogImages.test.js`,
   `tests/posSetupCashierUseCase.test.js`, `tests/posTerminalPairingUseCase.test.js`,
   `tests/posTerminalReadiness.usecase.test.js`, `tests/posUsecases.applicationResult.test.js`,
   `tests/storeGuestCheckoutOtp.unit.test.js`, `tests/storePaymentTruth.unit.test.js`,
   `tests/storeUsecases.applicationResult.test.js`, `tests/itemBarcodeLabelContract.test.js`,
   `tests/modeFinancialTracking.contract.test.js`: 214 passed, 16 failed. All 16 failures were
   confirmed pre-existing and unrelated to this PR via `git stash` A/B comparison (identical failures
   reproduce on the pre-PR baseline with this PR's `backend/src` and `backend/migrations` changes
   stashed out).
2. Frontend: `npx vitest run` across the 6 test files exercising the two changed components
   (`FIFOBatchViewer.locationContract.test.js`, `FIFOBatchViewer.behavior.test.jsx`,
   `terminalViewModeContracts.test.js`, `posAlwaysAvailable.contract.test.js`,
   `iminNotificationPolicy.contract.test.js`, `posPageShell.contract.test.js`) - 57/57 passed.
3. `npm run check:architecture` - `[ArchitectureGuardrails] OK. Checked 37 modules and 361 code files.`
   / `[ControllerBoundary] OK. Checked 75 controller files with no unauthorized model imports.`
4. `npm run lint:docs` - `[docs-lint] OK. Validated 21 governed docs.`
5. `node scripts/check-tenant-schema-registry-coverage.js --staged` (with the new migration staged) -
   `[check:tenant-schema-coverage] PASS. Checked 1 changed migration file(s).`
6. `npm run build:pos` and `npm run build:skupervisor` - both complete successfully.

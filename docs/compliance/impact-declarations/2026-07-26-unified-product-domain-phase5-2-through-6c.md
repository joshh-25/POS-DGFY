---
status: reference
owner: engineering
last_reviewed: 2026-07-26
related_adr: docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md
declaration_id: 2026-07-26-unified-product-domain-phase5-2-through-6c
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.07.26
verification_evidence: backend jest --runInBand targeted sweeps across every module touched by any of the three consolidated phases (stockBearingPolicy/posCheckoutFnbContracts/storeFnbModifiers/storeRepository.locationStockFallback/settings use cases+validator+repository/workflowCapabilitySettingsCache/item create+update+finalize use cases/modeItemTaxonomy+workflowModes cross-layer contracts/fnbModifierDeGating - 297-315 tests per sweep depending on scope, consistently ~95% pass rate with 100% of failures confirmed pre-existing via git-stash A/B comparison against each phase's pre-PR baseline),frontend vitest full-suite runs at each phase (973-976 of ~990-993 tests passing, the same 17 pre-existing storefront-discovery/follow/service-worker-manifest failures confirmed unchanged at every phase via git-stash A/B comparison) plus 21 new/extended tests added across the three phases (descriptor resolver + POS/storefront checkout exemption-vs-recipe ordering + availability fallback for 5.2; composed capability resolver + master-admin gate + item-taxonomy union + tenant-scoped cache isolation + mixed-basket order_method fix for 6a+6b; allowsDecimalQuantity cross-layer classification + POS weight-entry wiring in both terminals for 6c),npm run check:architecture (both ArchitectureGuardrails and ControllerBoundary) passing at every phase,npm run check:tenant-schema-coverage passing for the one migration in this range (backend/migrations/20260726000001-add-tracking-mode-to-items.cjs),npm run lint:docs passing at every phase,build:pos and build:skupervisor succeeding at every phase
rollback_note: Revert this PR's diff in full, or any suffix of its three constituent phases independently - each was built to be byte-identical-when-unused. Phase 5.2's migration (backend/migrations/20260726000001-add-tracking-mode-to-items.cjs) down() drops both new nullable items columns and their index, guarded by describeTable/showIndex checks so it is a no-op if already absent; every read path falls back to the pre-existing fifo_enabled/pos_always_available/category derivation whenever tracking_mode is NULL. Phase 6a+6b introduced no schema migration - ops_enabled_capabilities is a system_settings EAV row mirroring ops_workflow_mode's own storage, so there is no tenant-schema-registry entry to roll back; every read path that consults the overlay (modeHasCapability's third argument, resolveEffectiveCapabilities, resolveEffectiveItemTaxonomy, requireWorkflowCapability's cache) is additive and optional, and every pre-Phase-6 call site that omits the overlay argument is byte-identical to before. Phase 6c's only new export (allowsDecimalQuantity in packages/shared-constants/src/uomConverter.js) is pure and additive with zero existing callers changed; every item outside the weight/volume UOM groups continues through the exact pre-PR integer-only entry path in both POS terminals.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-26T11:15:00Z
preflight_request_ref: PR-106
---

# Unified Product Domain — Phases 5.2 through 6c (Consolidated)

This declaration consolidates three previously-separate compliance impact declarations
(`2026-07-26-unified-product-domain-phase5-2-tracking-mode.md`,
`2026-07-26-unified-product-domain-phase6-composed-capabilities.md`, and
`2026-07-26-unified-product-domain-phase6c-pos-weight-entry.md`) into the single PR that now
carries all three phases' commits (`b521aed8`, `a27589d0`, `6438c06c`) against `develop`. The three
phases were originally opened as separate stacked PRs (#104, #105, #106); they are merged as one
change so `check:compliance`'s per-declaration surface-coverage validation evaluates a single,
complete picture of the combined diff instead of three declarations each written to justify only
its own phase's slice.

## Compliance Impact Classification

Major, per the `pos`/`terminal`/`settings` surface floor. All three phases touch
`backend/src/modules/pos/` and/or `frontend/src/features/pos/` (surfaces `pos`, `terminal`); Phase
6a+6b additionally touches `backend/src/modules/settings/` (surface `settings`). None of the three
phases touches fiscal document classification, tax computation, receipt numbering, payment-provider
settlement, or terminal identity/authorization — every changed file across all three phases is
touched narrowly and additively, and no VAT/discount/fiscal snapshot field is read or written
differently by any of them.

## Affected Surfaces

### Phase 5.2 — Persisted Tracking-Mode Column
- `backend/src/modules/pos/repositories/posRepository.js` (`pos`, `terminal`): adds
  `tracking_mode`/`tracking_toggle_available` to `BASE_POS_ITEM_ATTRIBUTES` (read-only SELECT
  addition); `upsertCatalogOverride` mirrors the "Always Available" toggle onto
  `items.tracking_mode`, only ever writing `'untracked'` or clearing back to `NULL`.
- `backend/src/modules/pos/usecases/posUseCases.js` (`pos`, `terminal`): checkout stock-effect
  block now derives `stock_exempt`/`stock_exempt_reason`/`cost_snapshot` from
  `resolveStockBearingDescriptor` (behaviorally identical for any item with no `tracking_mode`
  set); adds a 400 rejection for unavailable `toggle`-mode lines; reorders the recipe-consumption
  loop so ingredient movements fire regardless of the finished item's own movement exemption.
- `backend/src/modules/store/usecases/storeUseCases.js` / `storeRepository.js`: storefront checkout
  now persists real `stock_effect_type`/`stock_exempt_reason` on online lines and honors
  `untracked`/`toggle` items; browse-availability reads no longer collapse a missing per-location
  stock row to "out of stock" for untracked/toggle/capacity items.
- `frontend/Components/items/FIFOBatchViewer.jsx`, `frontend/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx`
  (`pos`, `terminal`): the local stock-exempt checks now also honor `mode_item_preset === 'service'`,
  matching the check everywhere else (drift-bug fix).
- `backend/migrations/20260726000001-add-tracking-mode-to-items.cjs`: additive, guarded migration —
  two nullable columns and one index on `items`; the only data-touching statement is a narrowly
  scoped, idempotent backfill limited to items already flagged `pos_always_available`.

### Phase 6a+6b — Composed Capabilities + Capability-Driven POS
- `backend/src/modules/settings/usecases/updateSettingsUseCase.js` /
  `updateSettingByKeyUseCase.js` (`settings`): new `ops_enabled_capabilities` write path, gated
  identically to `ops_workflow_mode` (master-admin only; unknown capability values rejected before
  the authorization check).
- `backend/src/modules/settings/repositories/settingsRepository.js` (`settings`): adds a
  `normalizeValueForSettingKey` branch for `ops_enabled_capabilities`, mirroring the existing
  `ops_workflow_mode` branch.
- `backend/src/validators/settingsValidator.js` (`settings`): adds a closed-vocabulary Joi array
  schema entry to both the bulk and single-setting validators.
- `backend/src/middleware/workflowModeCapability.js` (`pos`, `terminal`, and every other
  capability-gated route): `requireWorkflowCapability` now resolves `{ mode, enabledCapabilities }`
  through a new short-TTL (15s) tenant-scoped cache and evaluates the tenant's effective (base +
  overlay) capability set; unchanged for every tenant with no overlay set (the default).
- `backend/src/modules/inventory/usecases/createItemUseCase.js` / `updateItemUseCase.js` /
  `finalizeItemUseCase.js`, `backend/src/modules/shared/constants/modeItemTaxonomy.js`: item-taxonomy
  validation resolves the union of the tenant's base-mode presets and any overlay-unlocked taxonomy
  mode's presets; byte-identical with no overlay.
- `frontend/src/features/settings/WorkflowModeContext.jsx` / `workflowMode.js`, `frontend/Layout.jsx`,
  `frontend/src/features/settings/components/WorkflowModeRouteGate.jsx` (`settings`): nav/route
  gating for the six capability-gated entries becomes capability-driven rather than base-mode-only.
- `frontend/src/features/pos/pages/PosPageShell.jsx` (`pos`, `terminal`): the three vertical POS
  panels render on effective capability instead of a mutually-exclusive base-mode check.
- `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` /
  `SkupervisorPOSCheckoutTerminal.jsx` (`pos`, `terminal`): fixes the mixed-basket `order_method`
  bug — the auto-default to `'appointment'` now only fires when a service is the first line added
  to an otherwise-empty cart.

### Phase 6c — POS Weight Entry (Decimal Quantity)
- `packages/shared-constants/src/uomConverter.js`: adds `allowsDecimalQuantity(uom)`, a pure,
  additive predicate (`['weight','volume'].includes(getUomGroup(uom))`).
- `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` (`pos`, `terminal`): the typed
  manual-quantity input now accepts a decimal point when `allowsDecimalQuantity` is true, committing
  with `round4` precision for decimal-eligible items only; every other item is byte-identical to
  before.
- `frontend/src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx` (`pos`, `terminal`): the
  cart-line `Qty` field now gates decimal entry on the same predicate, closing a gap that
  previously let a per-piece line be saved with a fractional quantity.

## Compliance Preconditions

1. `resolveStockBearingDescriptor`'s legacy-fallback branch (active whenever `tracking_mode` is
   NULL) remains byte-identical to the pre-Phase-5.2 derivation — verified by
   `stockBearingPolicy.test.js`'s pinned "legacy fallback" assertions.
2. The Phase 5.2 recipe-movement reordering never skips a finished item's own stock movement when it
   is genuinely stock-bearing — verified by `posCheckoutFnbContracts.usecase.test.js`'s regression
   tests.
3. Every pre-Phase-6a/6b `modeHasCapability(mode, capability)` two-argument call site keeps
   evaluating only the base mode's fixed capability list — verified by
   `workflowModes.crossLayer.contract.test.js`.
4. `ops_enabled_capabilities` remains writable only by a master admin, restricted to the closed
   `ALL_WORKFLOW_CAPABILITIES` vocabulary — verified by `settingsUsecases.applicationResult.test.js`.
5. The capability-settings cache never leaks one tenant's mode/capabilities into another tenant's
   request — verified by a dedicated per-tenant isolation test.
6. `allowsDecimalQuantity` classifies only the `weight` and `volume` UOM groups as decimal-eligible,
   identically in both the backend and frontend copies of `uomConverter.js` — verified by
   `modeItemTaxonomy.contract.test.js`.
7. The DGFY terminal's cart-line `-1`/`+1` steppers remain locked at step-by-1 across all three
   phases — verified by `numericStepperPolicy.contract.test.js`, untouched by any of them.
8. `sale_price`, `vat_type_snapshot`, `vat_rate_snapshot`, and every other fiscal/discount field on
   `pos_transaction_lines` remain untouched across all three phases — confirmed by inspection of
   every diff hunk in the touched POS/storefront checkout files.

## Verification Evidence

1. Backend: `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs
   --runInBand` targeted sweeps across every module touched by each phase, run independently at each
   phase's own commit: Phase 5.2 (19 files, 230 tests: 214 passed, 16 pre-existing failures), Phase
   6a+6b (44 files, 315 tests: 297 passed, 18 pre-existing failures), Phase 6c
   (`modeItemTaxonomy.contract.test.js`: 13/13 passed). Every failure across all three sweeps was
   confirmed pre-existing and unrelated via `git stash` A/B comparison against each phase's own
   pre-PR baseline.
2. Frontend: `npx vitest run` full suite, run independently at each phase: Phase 5.2 (targeted, 6
   files: 57/57 passed), Phase 6a+6b (990 tests: 973 passed, 17 pre-existing failures), Phase 6c (993
   tests: 976 passed, 17 pre-existing failures). The 17 failing tests are identical across Phase 6a+6b
   and 6c (storefront discovery-map/follow integration suites, one service-worker build-manifest
   contract test) and were confirmed pre-existing via `git stash` A/B comparison at each phase.
3. `npm run check:architecture` — `[ArchitectureGuardrails] OK. Checked 37 modules and 362 code
   files.` / `[ControllerBoundary] OK. Checked 75 controller files with no unauthorized model
   imports.` (passed at every phase).
4. `npm run check:tenant-schema-coverage` — `PASS. Checked 1 changed migration file(s).`
   (Phase 5.2's migration; no further migrations in Phases 6a+6b/6c).
5. `npm run lint:docs` — `[docs-lint] OK. Validated 21 governed docs.` (passed at every phase).
6. `npm run build:pos` and `npm run build:skupervisor` — both succeed at every phase.

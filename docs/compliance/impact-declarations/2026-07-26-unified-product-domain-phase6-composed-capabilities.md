---
status: reference
owner: engineering
last_reviewed: 2026-07-26
related_adr: docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md
declaration_id: 2026-07-26-unified-product-domain-phase6-composed-capabilities
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.07.26
verification_evidence: backend jest --runInBand targeted sweep across every touched module and its existing test suites (44 files, 315 tests: 297 passed, 18 pre-existing failures confirmed unchanged via git-stash A/B comparison against the pre-PR baseline) plus 16 new/extended tests covering the composed capability resolver, the master-admin gate on ops_enabled_capabilities, the item-taxonomy union, and the tenant-scoped settings cache,frontend vitest full suite (990 tests: 973 passed, 17 pre-existing failures confirmed unchanged via git-stash A/B comparison - all in unrelated storefront-discovery/follow/service-worker-manifest suites) plus 3 new render-behavior and contract tests covering capability-composed POS panels and the mixed-basket order_method fix,npm run check:architecture,npm run lint:docs,build:pos and build:skupervisor (both succeed)
rollback_note: Revert this PR's diff. No schema migration is included - ops_enabled_capabilities is a system_settings EAV row (mirroring ops_workflow_mode's own storage), not a new column, so there is no tenant-schema-registry entry to roll back and no `check:tenant-schema-coverage` dependency. Every read path that consults the overlay (modeHasCapability's third argument, resolveEffectiveCapabilities, resolveEffectiveItemTaxonomy, requireWorkflowCapability's cache) is additive and optional - every pre-Phase-6 call site that does not pass enabledCapabilities keeps evaluating only the base workflow mode's fixed capability list, byte-identical to pre-PR behavior. Reverting the read side alone (even leaving a tenant's ops_enabled_capabilities setting value in place) restores prior behavior exactly, since nothing reads that key without this PR's code.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-26T10:05:00Z
preflight_request_ref: PHASE6-6A-6B
---

# Unified Product Domain — Phase 6a+6b: Composed Capabilities + Capability-Driven POS

## Compliance Impact Classification

Major, per the `pos`/`terminal`/`settings` surface floor triggered by files this PR touches under
`backend/src/modules/settings/`, `backend/src/modules/pos/` (via the shared `requireWorkflowCapability`
middleware consumed by `backend/src/routes/pos.js`), and `frontend/src/features/pos/`. This PR makes
ADR 0037's Axis 2 "composed store capabilities" real: a new master-admin-gated `ops_enabled_capabilities`
tenant setting lets a tenant additively opt into capabilities beyond its base `ops_workflow_mode`
(e.g. a retail-mode repair shop enabling `services` so it can sell parts and labor on one receipt),
and the shared POS shell now renders every vertical panel the tenant's *effective* (base + overlay)
capability set warrants instead of exactly one mode's panel. None of this touches fiscal document
classification, tax computation, receipt numbering, payment-provider settlement, or terminal
identity/authorization - every changed file is touched narrowly and additively, and no VAT/discount/
fiscal snapshot field is read or written differently by this change.

## Affected Surfaces

- `backend/src/modules/settings/usecases/updateSettingsUseCase.js` /
  `updateSettingByKeyUseCase.js` (`settings`): add a new `ops_enabled_capabilities` write path,
  gated identically to the existing `ops_workflow_mode` gate - master-admin only
  (`actorUser.is_master_admin !== true` -> 403 `AUTHORIZATION_FAILED`), value validated against the
  closed `ALL_WORKFLOW_CAPABILITIES` vocabulary (unknown capability strings -> 422
  `VALIDATION_FAILED`, checked *before* the authorization check so an invalid payload from any actor
  never reaches the write). No existing setting key's validation or authorization path is altered.
- `backend/src/modules/settings/repositories/settingsRepository.js` (`settings`): adds a
  `normalizeValueForSettingKey` branch for `ops_enabled_capabilities` (read-time self-healing,
  mirroring the existing `ops_workflow_mode` branch) - read-only defense in depth, no write-path
  change to any other key.
- `backend/src/validators/settingsValidator.js` (`settings`): adds a Joi schema entry
  (`Joi.array().items(Joi.string().valid(...ALL_WORKFLOW_CAPABILITIES))`) to both the bulk and
  single-setting validators, additive alongside the existing `ops_workflow_mode` entries.
- `backend/src/middleware/workflowModeCapability.js` (`pos`, `terminal`, and every other capability-
  gated route module): `requireWorkflowCapability` now resolves `{ mode, enabledCapabilities }`
  through a new short-TTL (15s), tenant-scoped cache
  (`backend/src/modules/shared/utils/workflowCapabilitySettingsCache.js`) instead of an uncached
  `SystemSetting.findOne` on every single guarded request, and evaluates the tenant's *effective*
  capability set (base mode capabilities unioned with the overlay) instead of the base mode alone.
  For every tenant with no `ops_enabled_capabilities` value set (the default, and every tenant prior
  to this PR), the effective set is identical to the base mode's fixed list - the authorization
  decision is unchanged. The 15s cache window is a narrower staleness bound than the 5-minute cache
  already in production use for the same setting family
  (`backend/src/modules/inventory/repositories/itemRepository.js`'s `resolveCachedWorkflowMode`).
- `backend/src/modules/inventory/usecases/createItemUseCase.js` / `updateItemUseCase.js` /
  `finalizeItemUseCase.js` and `backend/src/modules/shared/constants/modeItemTaxonomy.js`
  (not itself compliance-sensitive per the current pattern list, included here since it's the other
  half of the same composed-capability feature): item-taxonomy validation now resolves the union of
  the tenant's base-mode presets and any overlay-unlocked taxonomy mode's presets
  (`CAPABILITY_TAXONOMY_OVERLAY_MODES`: `services`/`fnbDining`/`hospitalityReservations`/
  `foodManufacturing`), so e.g. a `services`-mode tenant that also enables `fnbDining` can create both
  service and menu-item category items. With no overlay, validation is byte-identical to before
  (confirmed by a dedicated test asserting the pre-Phase-6 rejection still occurs with an empty
  overlay). On a preset-key collision between the base mode and an overlay mode, the base mode's own
  preset definition always wins (never silently overridden by the overlay).
- `frontend/src/features/settings/WorkflowModeContext.jsx` / `workflowMode.js` (`settings`): the
  context now also fetches and exposes `enabled_capabilities` (extracted from the same
  `getAllSettings()` payload already fetched for `ops_workflow_mode` - no new API call) and a
  `hasCapability(capability)` helper. `isWorkflowPageVisible`/`isWorkflowPathBlocked` gained an
  optional third `enabledCapabilities` parameter that every existing 2-argument call site continues
  to omit, so nav/route gating for tenants with no overlay is unchanged.
- `frontend/Layout.jsx` / `frontend/src/features/settings/components/WorkflowModeRouteGate.jsx`
  (`settings`): now pass the resolved `enabledCapabilities` into `modeHasCapability`, so nav items and
  routes gated by `requiredCapability` (Job Orders, Dispatch Orders, Services, Fnb, Hospitality, Stock
  Movements - the same six wired in Phase 5a) become capability-driven rather than base-mode-only.
- `frontend/src/features/pos/pages/PosPageShell.jsx` (`pos`, `terminal`): the three vertical POS
  panels (Services Queue, Hospitality front desk, F&B dining) now render on
  `hasCapability('services'|'hospitalityReservations'|'fnbDining')` instead of the previous mutually-
  exclusive `isXWorkflowMode` checks. Since each of those three capabilities is declared by exactly
  one base workflow mode today, this is behaviorally identical for every tenant with no overlay
  configured (verified by a new render-behavior test); a tenant with a composed overlay now sees every
  panel its effective capabilities warrant instead of at most one.
- `frontend/src/features/pos/components/POSCheckoutTerminal.jsx` /
  `SkupervisorPOSCheckoutTerminal.jsx` (`pos`, `terminal`): fixes the mixed-basket `order_method`
  bug - adding a service line used to unconditionally force `order_method` to `'appointment'` on
  every add, silently reclassifying an in-progress mixed basket (e.g. 9 retail SKUs + 1 haircut). The
  auto-default now only fires when the service is the first line added to an otherwise-empty cart;
  once other lines exist, the cashier's explicit `order_method` selection is left alone. This only
  changes which value the `order_method` `<select>` is pre-populated with - the control remains a
  normal editable field either way, and no checkout total, VAT, or stock-effect field is touched.

## Compliance Preconditions

1. Every pre-Phase-6 `modeHasCapability(mode, capability)` two-argument call site (there are ~20
   across the codebase) must keep evaluating only the base mode's fixed capability list - verified by
   `workflowModes.crossLayer.contract.test.js`'s new "leaves modeHasCapability byte-identical for
   callers that pass no overlay" test and by the unchanged pre-existing assertions in the same file.
2. `ops_enabled_capabilities` must remain writable only by a master admin, and only with values drawn
   from the closed `ALL_WORKFLOW_CAPABILITIES` vocabulary - verified by six new tests in
   `settingsUsecases.applicationResult.test.js` covering both the bulk and single-key update paths,
   non-master-admin rejection, and unknown-capability rejection.
3. The new capability-settings cache (`workflowCapabilitySettingsCache.js`) must never leak one
   tenant's mode/capabilities into another tenant's request - verified by a dedicated
   "isolates the cache per tenant" test.
4. `sale_price`, `vat_type_snapshot`, `vat_rate_snapshot`, and all fiscal/discount fields on
   `pos_transaction_lines` remain untouched by this PR - confirmed by inspection of every diff hunk
   in the touched POS terminal files; the `order_method` fix only changes a UI pre-fill default.

## Verification Evidence

1. Backend: `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs
   --runInBand` across every test file for a module touched by this PR (settings use cases/validator/
   repository, the new capability-settings cache, item create/update/finalize use cases, item-mode-
   taxonomy contract, workflow-mode cross-layer contract, the fnb modifier de-gating middleware test,
   plus the wider inventory/settings/hospitality/jobOrder/dispatchOrder/stockMovement/tenantCapability
   suites that exercise the shared middleware and item-repository settings cache): 297 passed, 18
   failed. All 18 failures were confirmed pre-existing and unrelated to this PR via `git stash` A/B
   comparison (identical failures reproduce on the pre-PR baseline with this PR's `backend/src` and
   `backend/tests` changes stashed out) - two bcrypt terminal-password-hash assertions, one SKU-
   duplicate-conflict assertion, one legacy-edit-arity assertion, seven ESM circular-import test-
   harness failures in `itemHandlers.transport.test.js`, four unrelated customer-access-mode Joi
   assertions, and three unrelated storefront-image-asset assertions (variant metadata / size-limit
   drift) - none touching `ops_enabled_capabilities`, `modeHasCapability`, or any file this PR changes.
2. Frontend: `npx vitest run` full suite - 973 passed, 17 failed. All 17 failures were confirmed
   pre-existing via the same git-stash A/B technique - all in `apps/store` discovery-map/storefront-
   follow integration suites and one POS service-worker build-manifest contract test, none touching
   any file this PR changes.
3. `npm run check:architecture` - `[ArchitectureGuardrails] OK. Checked 37 modules and 362 code
   files.` / `[ControllerBoundary] OK. Checked 75 controller files with no unauthorized model
   imports.`
4. `npm run lint:docs` - `[docs-lint] OK. Validated 21 governed docs.`
5. `npm run build:pos` and `npm run build:skupervisor` - both complete successfully.

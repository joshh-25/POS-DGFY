---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-pos-delivery-pricing-settings-screen
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.09.01
verification_evidence: packages/web-core/src/features/settings/__tests__/deliveryFeeConfig.test.js -- actually executed (Vitest via apps/dgfy-ims), 7 passing,packages/web-core/src/features/pos/__tests__/PosDeliveryPricingSettingsCard.behavior.test.jsx -- actually executed (Vitest via apps/dgfy-ims), 6 passing,packages/web-core/src/features/pos/__tests__/posSettingsStrictBinding.contract.test.js -- actually executed (Vitest), unchanged, regression-clean,packages/web-core/src/features/pos/__tests__/posSettingsCashier.contract.test.js -- actually executed (Vitest), unchanged, regression-clean,packages/web-core/src/features/pos/__tests__/terminalViewModeContracts.test.js -- actually executed (Vitest), unchanged, regression-clean,packages/web-core/src/features/pos/__tests__/TerminalPageLayout.attendanceVisibility.test.jsx -- actually executed (Vitest), unchanged, regression-clean,packages/web-core/src/features/pos/__tests__/deliveryPersonnelSettingsPane.behavior.test.jsx -- actually executed (Vitest), unchanged, regression-clean,packages/web-core/src/features/pos/__tests__/terminalDownpaymentVisibility.behavior.test.jsx -- actually executed (Vitest), unchanged, regression-clean,npm run build:pos (apps/dgfy-pos) -- succeeded,npm run check:compliance -- confirmed to fail first (listing the sensitive files below), then pass once this declaration was added
rollback_note: No backend change, no new endpoint, no schema/migration change -- reads and writes the exact same store_delivery_fee/store_delivery_fee_mode/store_delivery_fee_calc EAV settings keys Phase 233 (#1324) already validates and Phase 234 (#1327) already audits. Adds one new POS tab (frontend-only, hidden behind settings:edit) and one new standalone card component plus one new shared pure helper module; both are additive and unreferenced by any other surface. Reverting this commit set removes the new POS tab/card/shared-helper files and the small SETTINGS_TABS/render-switch edit in TerminalOperationsWorkspace.jsx; IMS's own Settings.jsx (the pre-existing entry point) is completely untouched, so delivery pricing stays configurable from IMS regardless.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1341-POS-DELIVERY-PRICING-SETTINGS-SCREEN
---

# POS-side Delivery Pricing settings screen (Phase 233b, #1341)

## Compliance Impact Classification

Major. `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx` and the new
`PosDeliveryPricingSettingsCard.jsx` both sit under `check-compliance-impact.js`'s
`^packages/web-core/src/features/pos/` prefix rule, which floors at `major`/`pos,terminal`.
`settings` is added to `surfaces` here because the change reads/writes settings keys via the
generic settings API, even though no settings-surface file itself (`settingsValidator.js`,
`settingsController.js`, `settingsRepository.js`) is touched. No new reason code is introduced --
a validation failure on the existing `store_delivery_fee*` keys surfaces as the same generic
`VALIDATION_FAILED`/422 shape as every other settings key, matching #1324's own declaration
(`2026-09-01-delivery-fee-mode-config-schema.md`) -- `reason_codes_impacted: ALLOWED` reflects that.

## What this phase does and does not do

Closes the proposal-parity gap #1341 found post-merge on #1324/#1337: the original epic #1321
proposal doc specified "Configure in POS -- An authorized user opens Delivery Pricing and sets the
minimum fee, included distance, per-km rate, and maximum distance," but #1324 shipped an IMS-only
UI. Confirmed by Pat 2026-09-01: add a POS surface, keep IMS as-is (both, not a replacement).

- New standalone card `packages/web-core/src/features/pos/components/PosDeliveryPricingSettingsCard.jsx`,
  modelled on the existing `DownpaymentSettingsPanel.jsx`/`PosCashierAttendanceSettingsCard.jsx`
  precedent: self-contained fetch (`getAllSettings`) and save (`updateSettings`) against the
  **same generic settings API** IMS's Settings.jsx already uses -- no new backend endpoint, no
  schema change, no new validator, no new Joi schema.
- New shared pure-helper module `packages/web-core/src/features/settings/deliveryFeeConfig.js`:
  extracts the normalize/serialize logic IMS's Settings.jsx already hand-rolls locally for the
  `store_delivery_fee_calc` blob, so the new POS screen's validation can't silently drift from
  IMS's copy of the same rule (mirrors this same folder's existing `fulfillmentLeadTime.js`
  extraction precedent). IMS's own `Settings.jsx` is not modified -- it keeps its own local copy of
  this logic unchanged, so this extraction is purely additive.
- `TerminalOperationsWorkspace.jsx`'s `SettingsWorkspace` gains one new tab, `delivery_pricing`,
  added to `SETTINGS_TABS` **only when `canEditSettings` is true** (reuses the existing
  `settings:edit` gate this same file already computes and uses for other POS settings, e.g. the
  cashier-attendance card and other POS-setup switches) -- the tab is hidden entirely, not merely
  disabled, for a POS role without that permission, per #1341's own acceptance evidence ("a POS
  role without the required permission cannot see or use the screen").
- Zero change to any backend file, any Joi schema, any checkout/pricing use case, or the audit-log
  mechanism (#1327) -- the audit trail already fires generically on every settings write
  (`updateSettingsUseCase.js`/`updateSettingByKeyUseCase.js`) regardless of which UI wrote it, so
  a change from this new POS screen is audited identically to an IMS-originated change with no
  additional code.

## Affected Surfaces

- `pos`, `terminal` -- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`:
  one new conditional `SETTINGS_TABS` entry and one new conditional render branch (both gated on
  the pre-existing `canEditSettings`); `packages/web-core/src/features/pos/components/PosDeliveryPricingSettingsCard.jsx`
  (new): a self-contained settings card, no shared state with the rest of the workspace.
- `settings` -- reads/writes `store_delivery_fee`, `store_delivery_fee_mode`, `store_delivery_fee_calc`
  via the existing `PUT /api/v1/settings` (`getAllSettings`/`updateSettings` in
  `packages/web-core/src/services/settingsService.js`, both pre-existing, unmodified). No backend
  file under this surface is touched.

## Compliance Preconditions

- No new database column, no migration, no new backend endpoint, no new Joi schema -- this phase
  is 100% frontend, reusing #1324's already-validated/already-audited settings keys and the
  already-existing generic settings PUT routes (`checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS)`
  on the backend, unchanged).
- The new POS card's save payload is scoped to exactly the three delivery-pricing keys
  (`store_delivery_fee`, `store_delivery_fee_mode`, and `store_delivery_fee_calc` only when the
  five-field formula is fully valid) -- it never sends any other settings key, so it cannot
  clobber a value owned by another settings tab/screen; `settingsRepository.updateSettings` only
  touches keys present in the request body (same behavior IMS's own scoped save already relies on).
- Permission gate is the same `settings:edit` (`PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS`) the
  settings write routes already require server-side -- no narrower client-only permission was
  invented, so there is no gap between what the UI shows and what the backend would actually
  accept from that user.
- The new shared helper (`deliveryFeeConfig.js`) mirrors the backend's canonical domain normalizer
  (`apps/dgfy-api/src/modules/deliveryPricing/domain/deliveryFeeConfig.js`) and Joi schema
  (`storeDeliveryFeeCalcSchema`) for its own client-side validation, but the backend remains the
  sole source of truth and re-validates every write regardless of what the client sent.

## Verification Evidence

- `packages/web-core/src/features/settings/__tests__/deliveryFeeConfig.test.js` (new, 7 tests): the
  shared normalize/serialize helpers -- mode fallback, field-by-field hydration, full/partial calc
  serialization, the `max_distance_km >= included_km` invariant, and non-object input. All passing.
- `packages/web-core/src/features/pos/__tests__/PosDeliveryPricingSettingsCard.behavior.test.jsx`
  (new, 6 tests): permission-gated visibility (a `settings:edit`-less user sees no fetch and a
  "don't have access" message), hydration from the shared settings keys, a fixed-mode save omitting
  the calc key, a calculated-mode save including a fully-populated formula, an incomplete formula
  warning that does not block save, and the `locked` short-circuit. All passing.
- Regression check on the surrounding `SettingsWorkspace`/tab-strip code the edit touches --
  `posSettingsStrictBinding.contract.test.js`, `posSettingsCashier.contract.test.js`,
  `terminalViewModeContracts.test.js`, `TerminalPageLayout.attendanceVisibility.test.jsx`,
  `deliveryPersonnelSettingsPane.behavior.test.jsx`, `terminalDownpaymentVisibility.behavior.test.jsx`
  (86 tests total across these six files) -- all unchanged and green, run via
  `npx vitest run` from `apps/dgfy-ims` (the runner packages/web-core's own suite uses per
  `docs/architecture/frontend-split-sync.md`).
- `npm run build:pos` (real Vite production build of `apps/dgfy-pos`, which now consumes the new
  card via `TerminalOperationsWorkspace.jsx`) -- succeeded, no errors. `apps/dgfy-ims` and
  `apps/dgfy-storefront` are unaffected (neither imports any file this change touches or adds), so
  their own builds were not additionally run.
- `npm run check:compliance` -- confirmed to fail first, listing exactly the three sensitive files
  under `packages/web-core/src/features/pos/` below, then passed once this file was added.

## Changed Files

- `packages/web-core/src/features/pos/components/PosDeliveryPricingSettingsCard.jsx` (new)
- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `packages/web-core/src/features/pos/__tests__/PosDeliveryPricingSettingsCard.behavior.test.jsx` (new)
- `packages/web-core/src/features/settings/deliveryFeeConfig.js` (new)
- `packages/web-core/src/features/settings/__tests__/deliveryFeeConfig.test.js` (new)

## Preflight Reconciliation

`NOT-EXECUTED-1341-POS-DELIVERY-PRICING-SETTINGS-SCREEN` is expected on a PR targeting `develop`,
not a finding -- per `docs/compliance/request-time-preflight-protocol.md`, "Where live preflight
actually runs," the continuous sweep (`.github/workflows/compliance-preflight-sweep.yml`) triggers
automatically once this declaration lands on `develop` and reconciles this front matter within
minutes, well before any promotion is cut. No live `POST /api/v1/compliance/preflight` call was
made from this session -- no authenticated `SYSTEM.EDIT_SETTINGS` session against a running backend
was available, matching #1324's own declaration and every other `develop`-targeting PR under this
protocol.

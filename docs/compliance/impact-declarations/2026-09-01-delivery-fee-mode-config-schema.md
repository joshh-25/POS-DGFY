---
status: reference
owner: engineering
last_reviewed: 2026-09-01
declaration_id: 2026-09-01-delivery-fee-mode-config-schema
classification: major
surfaces: payments,settings
reason_codes_impacted: ALLOWED
policy_version: 2026.09.01
verification_evidence: apps/dgfy-api/tests/deliveryFeeConfig.unit.test.js -- actually executed (Jest), 24 passing,apps/dgfy-api/tests/deliveryFeeModeConfig.checkoutFallback.unit.test.js -- actually executed (Jest), 5 passing,apps/dgfy-api/tests/settingsValidator.deliveryFeeMode.test.js -- actually executed (Jest), 13 passing,apps/dgfy-api/tests/storeUsecases.applicationResult.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutDownpaymentResolution.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutVoucherPromoStacking.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutInventoryReservation.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCheckoutAffiliatePricing.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCartQuotePreviewNoContactRequired.unit.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/storeCashPaymentDisabledEnforcement.usecase.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/guestCheckoutDisabledEnforcement.usecase.test.js -- actually executed (Jest), unchanged, regression-clean,apps/dgfy-api/tests/settingsValidator.*.test.js (8 existing suites) -- actually executed (Jest), unchanged, regression-clean,node --check on every changed/new apps/dgfy-api .js file,npm run build:skupervisor (apps/dgfy-ims) -- succeeded,npm run check:compliance -- confirmed to fail first (listing the two sensitive files below), then pass once this declaration was added
rollback_note: No schema, migration, or persisted-behavior change. This phase adds two EAV settings keys (store_delivery_fee_mode, store_delivery_fee_calc; no new DB columns -- settings are key/value rows in the existing tenant settings table) and a new pure, zero-I/O normalization module (modules/deliveryPricing/domain/deliveryFeeConfig.js). resolveStoreDeliveryFee (storeUseCases.js) calls the normalizer but discards its result -- every order still resolves the exact same flat store_delivery_fee value as before this PR, for every order method, every tenant, every input. Reverting this commit set removes the two settings keys' validation/read-allowlist/IMS UI and the new module; no data migration, no backfill, nothing to undo server-side.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-01T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1324-DELIVERY-FEE-MODE-CONFIG-SCHEMA
---

# Delivery-fee mode config schema, fixed-only behavior (Phase 233, #1324)

## Compliance Impact Classification

Major. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` is
`check-compliance-impact.js`'s exact-prefix floor at `major`/`payments` (the checkout use-case
module); `apps/dgfy-ims/Pages/Settings.jsx` is its exact-path floor at `major`/`settings`. No
capture, refund, settlement, or fiscal-document logic is touched, and no new reason code is
introduced (Joi validation failures on the two new keys surface as the existing generic
`VALIDATION_FAILED`/422 shape, same as every other settings key) -- `reason_codes_impacted: ALLOWED`
reflects that.

## What this phase does and does not do

Foundation ticket for epic #1321 (Customer delivery pricing), Wave 1, zero production behavior
change by design:

- New settings keys `store_delivery_fee_mode` (enum `fixed|calculated|free`, default `fixed`) and
  `store_delivery_fee_calc` (one JSON blob for the calculated-mode formula, per Wave 0a decision
  #1 -- replaced wholesale, not merged field-by-field), validated in
  `apps/dgfy-api/src/validators/settingsValidator.js` (bulk PUT and single-key PUT) and added to
  the checkout read allowlist `CHECKOUT_SETTING_KEYS`.
- New pure module `apps/dgfy-api/src/modules/deliveryPricing/domain/deliveryFeeConfig.js`:
  normalizes the two keys into a frozen `{ mode, calc }` object. Absent or garbage input resolves
  to `mode: 'fixed'`, never throws -- this is the phase's central regression guarantee, covered by
  40 new unit tests (24 on the normalizer directly, 5 exercising it end-to-end through
  `buildStoreCartQuoteUseCase`, 13 on the Joi schema).
- `resolveStoreDeliveryFee` (`storeUseCases.js`) now calls the normalizer but **discards its
  result** -- it still returns today's flat `store_delivery_fee` number for every order,
  regardless of what mode a tenant has configured. Calculated/free fee computation is explicitly
  out of scope (#237, a later phase).
- IMS Settings UI (`apps/dgfy-ims/Pages/Settings.jsx`) gains a Delivery Fee Mode dropdown and a
  conditional Calculated Delivery Fee Formula form so the two keys round-trip through the existing
  settings save flow, using the same permission gate every other storefront setting on that page
  already uses. The UI text is explicit that Calculated/Free are not yet applied at checkout.

## Affected Surfaces

- `payments` — `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`: `CHECKOUT_SETTING_KEYS`
  gains two read keys; `resolveStoreDeliveryFee` gains a discarded normalizer call. No change to
  its return value, its signature, or any caller's handling of that return value.
- `settings` — `apps/dgfy-api/src/validators/settingsValidator.js`: two new optional Joi keys in
  both the bulk (`updateSettingsSchema`) and single-key (`singleSettingSchemaByKey`) validators.
  `apps/dgfy-ims/Pages/Settings.jsx`: label/read/write for the two new keys, gated by the same
  `canEditSettings` check already governing every other field on this Storefront settings card.

## Compliance Preconditions

- No new database column, no migration -- both keys are EAV settings rows on the existing tenant
  settings table, same storage mechanism `store_delivery_fee` already uses.
- No change to any existing settings key's validation, default, or allowlist membership.
- `resolveStoreDeliveryFee`'s return value is provably unchanged: the new normalizer call
  (`resolveDeliveryFeeConfig`) is invoked for its side-effect-free normalization only and its
  result is never read by any subsequent line in that function -- the flat-fee computation
  immediately below it is byte-identical to the pre-PR code.
- The new `deliveryFeeConfig.js` module has zero I/O (no database, no clock, no request) and fails
  toward the safe default (`fixed`) on any malformed input, matching the fail-safe pattern already
  used by sibling pure-policy modules (`modules/shared/utils/downpaymentPolicy.js`,
  `modules/vouchers/domain/voucherBenefitPolicy.js`).
- Governance note: the epic's own ADR for delivery-fee modes (#1323, Wave 0b of #1321) had not
  landed as of this PR. This phase's `[default]`-tier choices (module placement, settings-key
  naming) anticipate that ADR rather than cite a landed one -- flagged in
  `modules/deliveryPricing/README.md` rather than silently assumed settled.

## Verification Evidence

- `apps/dgfy-api/tests/deliveryFeeConfig.unit.test.js` (new, 24 tests): the normalizer's fail-safe
  contract directly -- absent config, every documented garbage-mode shape, a garbage/partial calc
  blob, the `max_distance_km < included_km` nonsense-formula case, and the `locationOverride`
  wholesale-replacement seam. All passing.
- `apps/dgfy-api/tests/deliveryFeeModeConfig.checkoutFallback.unit.test.js` (new, 5 tests): the same
  guarantee end-to-end through `buildStoreCartQuoteUseCase` -- absent config, garbage mode, garbage
  calc blob, and (critically) a **fully well-formed** calculated-mode config all resolve the
  identical flat `store_delivery_fee` value; a non-delivery order method still resolves 0. All
  passing.
- `apps/dgfy-api/tests/settingsValidator.deliveryFeeMode.test.js` (new, 13 tests): Joi contract for
  both new keys on both the bulk and single-key routes, including the reserved-not-built
  `provider_quoted` value being rejected and a partial calc blob being rejected. All passing.
- Regression gate (the phase's own acceptance evidence): every existing store-checkout suite run
  unmodified and green --
  `storeUsecases.applicationResult.test.js` (112 tests across the full file incl. this suite),
  `storeCheckoutDownpaymentResolution.unit.test.js`, `storeCheckoutVoucherPromoStacking.unit.test.js`,
  `storeCheckoutInventoryReservation.unit.test.js`, `storeCheckoutAffiliatePricing.unit.test.js`,
  `storeCartQuotePreviewNoContactRequired.unit.test.js`, `storeCashPaymentDisabledEnforcement.usecase.test.js`,
  `guestCheckoutDisabledEnforcement.usecase.test.js` (112 tests total across this group), and all 8
  existing `settingsValidator.*.test.js` suites (44 tests) -- none of these fixtures set the two new
  keys at all, so they exercise the "absent config" path for real, not just by construction.
- `node --check` on every changed/new `apps/dgfy-api` `.js` file -- no syntax errors (dgfy-api has
  no build step; this is its Tier 0 equivalent per `.agents/skills/implement/SKILL.md`).
- `npm run build:skupervisor` (real Vite production build of `apps/dgfy-ims`, which consumes
  `Settings.jsx`) -- succeeded, no errors.
- `npm run check:compliance` -- confirmed to fail first, listing exactly
  `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` and `apps/dgfy-ims/Pages/Settings.jsx`
  as sensitive files with no declaration, then passed once this file was added.

## Changed Files

- `apps/dgfy-api/src/modules/deliveryPricing/domain/deliveryFeeConfig.js` (new)
- `apps/dgfy-api/src/modules/deliveryPricing/index.js` (new)
- `apps/dgfy-api/src/modules/deliveryPricing/README.md` (new)
- `apps/dgfy-api/src/validators/settingsValidator.js`
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`
- `apps/dgfy-ims/Pages/Settings.jsx`
- `apps/dgfy-api/tests/deliveryFeeConfig.unit.test.js` (new)
- `apps/dgfy-api/tests/deliveryFeeModeConfig.checkoutFallback.unit.test.js` (new)
- `apps/dgfy-api/tests/settingsValidator.deliveryFeeMode.test.js` (new)

## Preflight Reconciliation

`NOT-EXECUTED-1324-DELIVERY-FEE-MODE-CONFIG-SCHEMA` is expected on a PR targeting `develop`, not a
finding -- per `docs/compliance/request-time-preflight-protocol.md`, "Where live preflight actually
runs," the continuous sweep (`.github/workflows/compliance-preflight-sweep.yml`) triggers
automatically once this declaration lands on `develop` and reconciles this front matter within
minutes, well before any promotion is cut. No live `POST /api/v1/compliance/preflight` call was
made from this session -- no authenticated `SYSTEM.EDIT_SETTINGS` session against a running backend
was available, matching every other `develop`-targeting PR under this protocol.

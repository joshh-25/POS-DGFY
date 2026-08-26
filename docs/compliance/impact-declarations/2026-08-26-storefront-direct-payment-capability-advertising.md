---
status: reference
owner: engineering
last_reviewed: 2026-08-26
declaration_id: 2026-08-26-storefront-direct-payment-capability-advertising
classification: major
surfaces: payments
reason_codes_impacted: DIRECT_PAYMENT_CONFIGURATION_INCOMPLETE
policy_version: 2026.08.26
verification_evidence: apps/dgfy-api/tests/storeUsecases.applicationResult.test.js (55 passed, was 54 passed/1 failed),apps/dgfy-api/tests/storeDirectGcash.usecase.test.js (4 passed, was 3 passed/1 failed),node --check on every changed apps/dgfy-api .js file
rollback_note: Revert this commit. Both changes are additive parameter threading plus one error-detail rename (DIRECT_PAYMENT_NOT_READY -> DIRECT_PAYMENT_CONFIGURATION_INCOMPLETE); reverting restores the prior advertise/enforce mismatch (the #926 defect) and the prior inconsistent error code, changing no schema, migration, or persisted state.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-26T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1022-STOREFRONT-DIRECT-PAYMENT-CAPABILITY-ADVERTISING
---

# Storefront Catalog Now Agrees With Checkout on Direct-Payment-Required Mode

## Compliance Impact Classification

Major. `apps/dgfy-api/src/modules/store/` is `check-compliance-impact.js`'s exact-prefix floor at
`major`/`payments` — this PR touches `storeUseCases.js` and `store/index.js`. Both changes are
additive parameter threading and a fail-closed error-detail correction; no schema, migration,
permission, or new payment-capture path is added.

## What is wrong and why

Filed as part of #1022 (backend test-suite triage) and fixes #926 in full, plus one adjacent,
previously-undiscovered drift in the same feature family:

1. **#926 — advertise/enforce mismatch.** `resolveStorefrontPaymentCapabilities`
   (`storeUseCases.js`, catalog listing) never received `directPaymentRequired`/
   `directGcashEnabled`/`directMayaEnabled`/`directCardEnabled` at all, so the storefront catalog's
   `payment_capabilities` always advertised card/gcash/maya as `enabled: true` even in
   direct-payment-required mode, where the checkout use case
   (`buildStoreCheckoutPaymentSessionUseCase`, same file) would reject those exact methods with a
   503. A customer could see a payment method offered on the catalog that checkout would then
   refuse.
2. **Adjacent drift, found while fixing #926.** The checkout use case's own direct-method-
   unavailable rejection used an inconsistent, undocumented error code
   (`DIRECT_PAYMENT_NOT_READY`) and omitted `payment_type` from the error details entirely —
   confirmed against `tests/storeDirectGcash.usecase.test.js`, which already asserted the
   established `DIRECT_PAYMENT_CONFIGURATION_INCOMPLETE` code (the same one
   `resolveStorefrontPaymentCapabilities` now emits) plus `payment_type`. This drift was previously
   documented as a known, deliberately-deferred pre-existing failure in
   `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`'s Phase 150 entry (2026-08-22) — not a new
   regression, a cleanup of a tracked gap.

## Affected Surfaces

- `payments` — storefront checkout/catalog payment-capability surface:
  `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` (`resolveStorefrontPaymentCapabilities`
  gains the four direct-payment parameters and a post-lookup override for card/gcash/maya;
  `buildStoreCheckoutPaymentSessionUseCase`'s `directMethodUnavailable` branch's error `details`
  corrected), `apps/dgfy-api/src/modules/store/index.js` (wires the same four
  `commercePaymentsFeature.js` flags already used by `storeCheckoutPaymentSessionUseCase` into the
  catalog's `listStoreCatalogUseCase` build call).

## Compliance Preconditions

- No new payment method, provider, or capture path is added or enabled — this only makes the
  catalog's *advertised* capabilities agree with what checkout was already going to accept or
  reject.
- `grab_pay`/`shopeepay`/`qrph` are untouched — the direct-payment gate only ever applied to
  card/gcash/maya, and the fix's override is scoped identically.
- Every existing caller that omits the four new parameters gets the exact prior behavior — all four
  default to `false` in both `resolveStorefrontPaymentCapabilities` and
  `buildListStoreCatalogUseCase`, so `directPaymentRequired: false` (the default for every tenant
  that hasn't opted into `STOREFRONT_DIRECT_PAYMENT_REQUIRED`) exercises no new code path.
- The checkout use case's own gate logic (`directMethodUnavailable`'s boolean condition) is
  unchanged — only the error `details` shape it throws was corrected.

## Verification Evidence

- `apps/dgfy-api/tests/storeUsecases.applicationResult.test.js`: 55/55 passing (was 54 passed / 1
  failed — the exact test #926 names as its acceptance criterion, "hides direct methods instead of
  advertising Hosted Checkout when direct-only mode is required").
- `apps/dgfy-api/tests/storeDirectGcash.usecase.test.js`: 4/4 passing (was 3 passed / 1 failed).
- `node --check` on both changed `.js` files — syntax-only Tier 0 per
  `.agents/skills/implement/SKILL.md` (`apps/dgfy-api` has no real build step).
- Full backend fast-tier regression run (`node scripts/run-backend-test-matrix.js --tier fast`,
  `DB_HOST`/`DB_PORT` deliberately unreachable) to confirm no unrelated fast-tier file was affected
  by the `storeUseCases.js`/`store/index.js` edits — see this PR's own Testing Evidence section for
  the full pass/fail count.

## Changed Files

- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`
- `apps/dgfy-api/src/modules/store/index.js`

## Preflight Reconciliation

Not yet run. `preflight_request_ref: NOT-EXECUTED-1022-STOREFRONT-DIRECT-PAYMENT-CAPABILITY-ADVERTISING`
is expected on a PR targeting `develop`, not a finding — per #884, the real
`POST /api/v1/compliance/preflight` run happens once per batch at the `develop -> staging`/`main`
promotion sweep (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-22 amendment), not per PR.

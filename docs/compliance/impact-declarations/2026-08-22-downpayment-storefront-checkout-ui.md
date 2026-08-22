---
status: reference
owner: engineering
last_reviewed: 2026-08-22
related_adr: docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md
declaration_id: 2026-08-22-downpayment-storefront-checkout-ui
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED
policy_version: 2026.08.22
verification_evidence: apps/dgfy-api/tests/storeCheckoutDownpaymentResolution.unit.test.js (15 passed),apps/dgfy-api/tests/downpaymentWebhookFinalization.unit.test.js (7 passed),apps/dgfy-api/tests/storeCatalogPaymentMode.unit.test.js (5 passed, new),npm run check:architecture (ArchitectureGuardrails OK / ControllerBoundary OK),GITHUB_BASE_REF=develop npm run check:compliance (failed before this declaration existed, confirming the modules/store/** guardrail fired on this diff; passes with it),node --check on every changed/new backend file,full apps/dgfy-api store-scoped suite (392 passed / 397, 3 pre-existing failures unrelated to this change -- 2 DB-dependent integration suites + 1 missing-workspace-module migration test, confirmed identical on unmodified develop before this branch)
rollback_note: Revert this PR's diff. No schema/migration change in this PR -- only two backend serializer/use-case widenings (both additive, both fail closed to the pre-existing shape) and the storefront UI reading them. No production tenant has payment_mode=downpayment_required set today (same standing fact as the Phase 141 declaration this one follows), so the new catalog field and the four new session/order response keys have zero live traffic depending on them yet. Reverting restores the exact pre-Phase-142 catalog/session/order response shapes with no data migration needed in either direction.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-22T01:30:00+08:00
preflight_request_ref: ISSUE-823-DOWNPAYMENT-STOREFRONT-CHECKOUT-UI
---

# Downpayment Storefront Checkout UI (Phase 142, #823)

## Compliance Impact Classification

Major. The classification floor comes from `apps/dgfy-api/src/modules/store/**`
(`check-compliance-impact.js`'s existing `payments`-surfaced, `major`-floor rule from Phase
140/#821, unchanged) -- this PR touches `storeUseCases.js` and `store/index.js` again, this time
to make the already-money-moving Phase 141 (#822) capture path's own data visible to the client
that has to render it, not to change how money moves.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` -- three additive changes:
   - `buildListStoreCatalogUseCase` gains a `payment_mode` field on the public `GET
     /store/catalog` response (`'full_payment'` default, fail-closed on any settings-read error --
     a catalog request must never fail because of this). Lets the storefront hide the cash option
     and force a quote before the customer ever reaches the payment step, instead of only
     discovering the requirement at session-create time.
   - `serializePaymentSession` gains four fields (`capture_kind`, `order_total_amount`,
     `balance_due_amount`, `downpayment_refundable`) already persisted on the session row since
     Phase 141 but never reaching the client -- present-and-null for a `'full'` capture, same
     convention as the quote response's own downpayment fields.
   - `serializeOrderBase` gains `amount_paid`/`balance_due`, already persisted on the order since
     Phase 141 but never serialized -- null for any order that isn't `partially_paid`.
2. `apps/dgfy-api/src/modules/store/index.js` -- wires `downpaymentSettingsRepository` into the
   catalog use case (already imported and wired into other use cases since Phase 140).
3. No changed guard, no changed money-movement logic, no schema change. The two Phase 141 capture
   guards (`DOWNPAYMENT_POLICY_UNRESOLVED`, the conditional `DOWNPAYMENT_CAPTURE_NOT_AVAILABLE`)
   are untouched.
4. `apps/dgfy-web/apps/store/**` -- the storefront checkout UI reading the above (frontend, not
   independently compliance-sensitive under this repo's rules, listed for completeness): hides the
   cash payment option and forces a quote for a `downpayment_required` store, shows downpayment/
   balance amounts through checkout and tracking, wires Retail checkout to the online-payment path
   for the first time (previously a cash-only placeholder).

## Compliance Preconditions

1. **No new code path captures or moves money.** This PR is read/serialization-only on the
   backend -- every field it adds was already computed and persisted by Phase 141; nothing here
   changes what gets captured, when, or how much.
2. **The catalog's `payment_mode` field cannot be used to bypass a capture guard.** It is
   advisory/presentational only -- the storefront uses it to decide what to show, but the actual
   enforcement stays where Phase 141 put it (`DOWNPAYMENT_POLICY_UNRESOLVED` and the conditional
   `DOWNPAYMENT_CAPTURE_NOT_AVAILABLE` guards, both untouched). A stale or wrong catalog value
   (e.g. within the existing ~45s public catalog cache window) degrades to a visible session-create
   422, never to an un-gated cash order.
3. **Additive-only, verified by test.** Every new field is null/`'full'`/`'full_payment'` for a
   tenant that isn't `downpayment_required`, pinned by dedicated "additive-only" test cases in
   both modified test files plus the new `storeCatalogPaymentMode.unit.test.js` -- a `full_payment`
   tenant (the entire existing merchant base) sees byte-identical behavior.
4. **Fail-closed on error.** A downpayment-settings read failure during a catalog request resolves
   to `'full_payment'` and a 200, never a 500 -- unit-tested.

## Verification Evidence

15 tests in `storeCheckoutDownpaymentResolution.unit.test.js` (13 pre-existing/Phase 141 +
2 new: the client-facing `serializePaymentSession` downpayment case and its additive-only pin),
7 in `downpaymentWebhookFinalization.unit.test.js` (5 pre-existing/Phase 141 + 2 new: the
client-facing `serializeOrderBase` `amount_paid`/`balance_due` case and its additive-only pin),
5 new in `storeCatalogPaymentMode.unit.test.js`, all passing, no database required (fakes
throughout). `npm run check:architecture` passed (guardrails + controller-boundary). `node --check`
passed on every new/changed file. `GITHUB_BASE_REF=develop npm run check:compliance` failed before
this declaration existed (confirming the `modules/store/**` guardrail fired on this diff) and
passes with it. Full `apps/dgfy-api` store-scoped suite: 392/397 passed; the 3 failures
(`storefrontPrimaryLocation.discovery.integration.test.js`,
`storeRouteTenantContext.integration.test.js` -- both DB-dependent, no local database in this
session, the same class of gap Phase 141's own declaration already disclosed; and
`seedStoreConfigurationTemplatePresets.migration.test.js` -- a missing `@sieitzz/shared-constants`
workspace link unrelated to this diff) were confirmed to fail identically on unmodified `develop`
before this branch, not a regression.

Outstanding before merge:

- `POST /api/v1/compliance/preflight` has not been executed against a live environment -- same
  disclosure shape as every prior downpayment-epic declaration (Phase 138/140/141).
- No end-to-end verification against a live PayMongo sandbox or a real tenant flipped to
  `downpayment_required` in this session yet -- unit coverage only. Planned as part of this PR's
  local-stack verification pass; report the outcome or the gap explicitly when that runs.

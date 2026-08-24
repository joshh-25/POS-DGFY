---
status: reference
owner: engineering
last_reviewed: 2026-08-21
related_adr: docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md
declaration_id: 2026-08-21-downpayment-quote-checkout-resolution
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED
policy_version: 2026.08.21
verification_evidence: apps/dgfy-api/tests/downpaymentPolicy.unit.test.js (14 passed),apps/dgfy-api/tests/storeCheckoutDownpaymentResolution.unit.test.js (8 passed),npm run check:architecture (ArchitectureGuardrails OK / ControllerBoundary OK),full apps/dgfy-api store test suite (419 passed, 2 pre-existing DB-dependent integration failures unrelated to this change),node --check on every new/changed file
rollback_note: Revert this PR's diff. The four exposed response fields (payment_mode/downpayment_amount/balance_due_amount/downpayment_refundable) are additive on both /cart/quote and /store/checkout -- no existing response field changes shape or value. The two 422 DOWNPAYMENT_CAPTURE_NOT_AVAILABLE guards only fire for a payment_mode=downpayment_required tenant, and no production tenant has that setting today (the admin surface shipped in Phase 138/#820, unread by anything until this phase). Reverting restores the prior full_payment-only behavior with no other effect.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-21T22:00:00+08:00
preflight_request_ref: ISSUE-821-DOWNPAYMENT-QUOTE-CHECKOUT-RESOLUTION
---

# Downpayment Quote/Checkout Resolution (Phase 140, #821)

## Compliance Impact Classification

Major. The classification floor comes from `apps/dgfy-api/src/modules/store/**`, already a
`payments`-surfaced, `major`-floor path in `scripts/check-compliance-impact.js`'s
`COMPLIANCE_SENSITIVE_RULES` (unchanged by this PR; this PR is simply the first change that trips it
under the downpayment feature specifically). This is the first phase that reads
`tenant_downpayment_settings` (landlord table, Phase 138/#820) from any checkout code path — per
`docs/database/schema.md`, nothing read it before this phase.

Two binding ADR clauses bind this phase directly:

- **ADR 0069 clause 1b `[binding]`** (carried forward by ADR 0070): the captured amount must be the
  downpayment amount only, never the order total.
- **ADR 0070 clause 7 `[binding]`**: the backend must never present or honor a downpayment
  configuration on a checkout flow not wired to compute and capture it.

Both are satisfied by a fail-closed design (below), not by deferring the read.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/shared/utils/downpaymentPolicy.js` (new) -- pure math, no I/O. Resolves
   a tenant's downpayment settings + an order's (already promo/voucher-discounted) total into a
   `{payment_mode, downpayment_amount, balance_due_amount, downpayment_refundable}` split. Fails
   closed to `full_payment` (all four fields' `full_payment` shape) on a `null`/malformed settings
   row, a zero/negative total, or a missing/incomplete type+amount pairing -- never guesses a figure.
   Clamps the computed amount to the order total so `balance_due_amount` is never negative.
2. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` -- `resolveCheckoutContext` (the
   shared resolver behind `/cart/quote`, `/store/checkout`, and the QRPh payment-session path) gains
   an optional, **injected, non-defaulted** `downpaymentSettingsRepository` dependency and computes
   the split after the promo/voucher fold, immediately following `totalAmount`. Deliberately **not**
   a hard module-level import (unlike the existing `dgfyAffiliateRepository` precedent in the same
   file) -- every order needs this lookup, unlike the affiliate lookup which is gated behind an
   optional `attribution_enrollment_id`, so a hard import would make this an unconditional, unmockable
   live landlord-DB call on every existing store unit test. `undefined` (every caller that omits it,
   which is every pre-Phase-140 test) resolves via `?.` guards to "no settings, full_payment" -- no
   behavior change for any tenant without the dependency wired.
   - `buildStoreCartQuoteUseCase` (`/cart/quote`): exposes the split unconditionally. Read-only
     preview; no guard needed.
   - `buildStoreCheckoutUseCase` (`/store/checkout`): **new fail-closed guard** -- `422
     DOWNPAYMENT_CAPTURE_NOT_AVAILABLE` when the resolved `payment_mode` is `downpayment_required`,
     thrown inside the existing transaction (rolled back by the existing generic catch block) before
     any order row is written. ADR 0070 clause 7: this path has no `amount_paid`/`balance_due` schema
     yet (that's ADR 0069 clause 4, built in Phase 141/#822) -- an order claiming "downpayment
     required" that this path let through would record nothing about what was or wasn't collected,
     the exact bogus-order case the feature exists to prevent.
   - `buildStoreCheckoutPaymentSessionUseCase` (`/store/checkout/payment-sessions`): **new
     fail-closed guard**, same reason code, checked before `toCentavos(resolved.totalAmount)`
     authorizes the full order total. ADR 0069 clause 1b: letting this through would authorize the
     **full total** online for an order that must only take a downpayment -- real money, not a
     hypothetical, the moment a tenant switches the setting on.
   - Both guards are temporary by design -- removed by Phase 141 (#822) when capture is wired to the
     downpayment amount specifically.
3. `apps/dgfy-api/src/modules/store/index.js` -- wires the real
   `downpaymentSettingsRepository` (imported from `../downpayment/repositories/...`, the existing
   Phase 138 module) into the three use-case builders above. No new module, no new route.
4. `apps/dgfy-api/tests/downpaymentPolicy.unit.test.js` (new, 14 tests),
   `apps/dgfy-api/tests/storeCheckoutDownpaymentResolution.unit.test.js` (new, 8 tests) -- unit
   coverage, no database.
5. `docs/api/specification.md`, `docs/database/schema.md`,
   `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` -- documentation only.

## Compliance Preconditions

1. No money is captured, refunded, or moved by this PR. `PosTransaction`/`PosOrderPayment` gain no
   new column; no PayMongo authorization amount changes for any `full_payment` tenant (the only kind
   that can complete an order or open a payment session under this phase's guards).
2. A `downpayment_required` tenant cannot place an order or open an online payment session through
   any path this PR touches -- both are rejected `422 DOWNPAYMENT_CAPTURE_NOT_AVAILABLE`,
   unit-tested (`storeCheckoutDownpaymentResolution.unit.test.js`, "no order created" /
   "before authorizing the full total online").
3. `storeValidator.js`'s request-body schemas (`storeQuoteSchema`/`storeCheckoutSchema`) are
   deliberately **not** modified -- the four downpayment fields are response-only, computed
   server-side from the landlord settings row, never accepted from the client. A client-submitted
   `downpayment_amount` in the request body is stripped by the validator's existing
   `stripUnknown: true`, unchanged by this PR.
4. `resolveDownpaymentForTotal` never returns `0`/the-total for the "no downpayment" case -- it
   returns `null` for all three money-shaped fields, so a frontend cannot mistake "no downpayment
   configured" for "downpayment of zero pesos." Unit-tested.
5. No production tenant has `payment_mode = downpayment_required` set today (Phase 138/#820's admin
   surface shipped 2026-08-21, unread by anything until this PR) -- the guards in item 2 above have
   zero live blast radius at merge time.

## Verification Evidence

22 new unit tests (14 policy, 8 resolution/guard), all passing, no database required. Full
`apps/dgfy-api` store-prefixed test suite re-run: 419 passed, 2 pre-existing failures
(`storefrontPrimaryLocation.discovery.integration.test.js`,
`storeRouteTenantContext.integration.test.js`) confirmed via `git stash` to fail identically on
unmodified `develop` (both require a live database connection, unrelated to this change).
`npm run check:architecture` passed for both guardrails and controller-boundary checks.
`node --check` passed on every new/changed file.

Outstanding before merge, neither reachable from this session (no live backend, tenant database, or
landlord database available):

- `POST /api/v1/compliance/preflight` has **not** been executed against a live environment. The
  front-matter preflight fields record this change's classification decision -- an additive,
  response-only field set plus two fail-closed guards with zero live blast radius, therefore
  `no_breach`/`ALLOWED` -- and a reviewer with a live environment must run the endpoint and reconcile
  `preflight_run_at`/`preflight_request_ref` before merge (same gap and disclosure shape as
  `2026-07-29-pos-batch-menu-import.md` and `2026-08-21-downpayment-config-surface.md`).
- The landlord read path (`downpaymentSettingsRepository.getSettings`) has not been exercised against
  a live/scratch MySQL database -- same open gap carried forward from Phases 137-139.
- `npm run check:compliance` and `npm run lint:docs` should be re-run in CI to confirm before merge.

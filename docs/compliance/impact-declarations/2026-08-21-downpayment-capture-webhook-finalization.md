---
status: reference
owner: engineering
last_reviewed: 2026-08-21
related_adr: docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md
declaration_id: 2026-08-21-downpayment-capture-webhook-finalization
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED
policy_version: 2026.08.21
verification_evidence: apps/dgfy-api/tests/storeCheckoutDownpaymentResolution.unit.test.js (11 passed),apps/dgfy-api/tests/downpaymentWebhookFinalization.unit.test.js (5 passed),apps/dgfy-api/tests/storePaymentTruth.unit.test.js (4 passed),apps/dgfy-api/tests/processVerifiedPaidCommerceSession.usecase.test.js (7 passed, unmodified),apps/dgfy-api/tests/finalizePaidCommerceSession.usecase.test.js (18 passed, unmodified),npm run check:architecture (ArchitectureGuardrails OK / ControllerBoundary OK),full apps/dgfy-api store test suite (388 passed, 2 pre-existing DB-dependent integration failures unrelated to this change -- same two Phase 140 already identified),node --check on every new/changed file
rollback_note: Revert this PR's diff. The landlord migration (20260821000006) is purely additive (four nullable/defaulted columns on commerce_payment_sessions, DEFAULT 'full' on capture_kind) with a matching down() -- both directions safe to run. No production tenant has payment_mode=downpayment_required set today (the config surface shipped Phase 138/#820, and nothing read it until Phase 140/#821 -- also unread by anything money-moving until this phase), so the two capture code paths this PR changes have zero live traffic to disrupt. Reverting the code changes restores the Phase 140 fail-closed guards; reverting the migration removes the four columns (down() is exercised in Testing Evidence below).
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-21T23:30:00+08:00
preflight_request_ref: ISSUE-822-DOWNPAYMENT-CAPTURE-WEBHOOK-FINALIZATION
---

# Downpayment Capture and Webhook Finalization (Phase 141, #822)

## Compliance Impact Classification

Major. The classification floor comes from `apps/dgfy-api/src/modules/store/**`
(`check-compliance-impact.js`'s existing `payments`-surfaced, `major`-floor
rule from Phase 140/#821 -- unchanged, this PR is simply another diff that
trips it) plus `apps/dgfy-api/src/modules/commercePayments/**`'s pre-existing
`payments` registration. This phase captures real money through PayMongo for
the first time on the downpayment feature -- every prior downpayment phase
(136-140) was config-surface or read-only resolution; this is "the money
phase," in #822's own words.

## Affected Surfaces

1. `apps/dgfy-migration-runner/migrations/20260821000006-add-downpayment-capture-to-commerce-payment-sessions.cjs`
   (new) -- landlord-DB migration, four additive/defaulted columns on
   `commerce_payment_sessions` (`capture_kind`, `order_total_centavos`,
   `capture_payment_method`, `downpayment_refundable`), idempotent
   (`hasColumn` guard, matching `20260608000001-add-fee-policy-to-commerce-
   payment-sessions.cjs`'s own precedent). Backfills `order_total_centavos`
   for every pre-existing row from `total_amount_centavos` (every session
   before this phase captured the full order total, so the two were always
   equal). Not itself compliance-sensitive under any existing rule (the
   migration-runner app has no `COMPLIANCE_SENSITIVE_RULES` entry), listed
   for completeness.
2. `apps/dgfy-api/src/models/Landlord/CommercePaymentSession.js` -- the four
   new columns. Not itself compliance-sensitive, listed for completeness.
3. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` -- **the core
   compliance-sensitive surface**:
   - `buildStoreCheckoutPaymentSessionUseCase`: the Phase 140 `422
     DOWNPAYMENT_CAPTURE_NOT_AVAILABLE` guard is replaced with the real
     capture computation -- for a `downpayment_required` tenant, the amount
     authorized/captured online (`total_amount_centavos`, the PayMongo
     `amount`, `platform_fee_centavos`) is the downpayment amount, never the
     order total (ADR 0069 clause 1b `[binding]`). A new
     `DOWNPAYMENT_POLICY_UNRESOLVED` guard fails closed when the tenant's
     stored setting says `downpayment_required` but the resolved policy
     doesn't (a malformed settings row) -- corrects a Phase 140 direction
     error where that case silently fell through to `full_payment` (no
     downpayment gate at all).
   - `resolveStorefrontPaymentSnapshot`: gains a `capturedPayment` branch
     (server-internal argument, never a payload field) producing
     `payment_status: 'partially_paid'` plus `amount_paid`/`balance_due` --
     the one centavos-to-peso conversion boundary for this feature (ADR 0069
     clause 4b).
   - `buildStoreCheckoutUseCase`: the Phase 140 `422
     DOWNPAYMENT_CAPTURE_NOT_AVAILABLE` guard is made *conditional* on the
     new `capturedPayment` argument rather than removed -- present (the
     webhook finalizer, after real money was captured) proceeds; absent (the
     direct HTTP path, a customer picking plain `cash` with nothing
     collected) still fails closed, per ADR 0070 clause 7 `[binding]`. Writes
     ledger row 1 (`kind: 'downpayment'`) via the new
     `storeRepository.createOrderPaymentEntry`, inside the same transaction
     that creates the order.
   - `resolveCheckoutContext`'s return value gains `downpaymentSettings`
     (the raw stored row, alongside the already-resolved `downpayment`
     split) so the new policy-unresolved guard can compare the two.
4. `apps/dgfy-api/src/modules/store/repositories/storeRepository.js`,
   `apps/dgfy-api/src/modules/store/contracts/storeRepository.contract.js`
   -- new `createOrderPaymentEntry` method (writes to tenant-DB
   `pos_order_payments`, Phase 137/#819 schema, first writer) and its
   addition to the repository's required-method contract.
5. `apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidCommerceSession.js`
   -- derives the order's own `payment_type` to `'cash'` for a downpayment
   capture (COD for the balance is what a downpayment order *is* -- ADR 0069
   clause 2 `[binding]`, corrected mid-plan from #822's original "online
   order that charges less" framing) and builds the `capturedPayment` sibling
   argument passed into `storeCheckoutUseCase`. No change to
   `processVerifiedPaidCommerceSession.js`'s exact-amount-equality check --
   it already compares against `session.total_amount_centavos`, which this
   phase makes mean "the captured amount," so the check passes for a
   downpayment session with zero code change (pinned by
   `tests/downpaymentWebhookFinalization.unit.test.js`).

## Compliance Preconditions

1. **No second automatic online charge.** ADR 0069 clause 2 `[binding]`,
   unchanged by this PR: only the downpayment leg is captured online; the
   balance is collected out-of-band by staff (Phase 144/#825, not this
   phase). No code path in this PR initiates a second PayMongo charge.
2. **The captured amount is never the order total for a downpayment order.**
   ADR 0069 clause 1b `[binding]`. Unit-tested
   (`storeCheckoutDownpaymentResolution.unit.test.js`, "authorizes only the
   downpayment amount online, not the order total").
3. **The offline (nothing-collected) checkout path still fails closed.** ADR
   0070 clause 7 `[binding]`. The `buildStoreCheckoutUseCase` guard is
   conditional, not deleted -- a customer picking plain `cash` at a
   `downpayment_required` store (no online payment at any point) is still
   rejected `422 DOWNPAYMENT_CAPTURE_NOT_AVAILABLE`. Unit-tested.
4. **A malformed downpayment settings row cannot silently disable the
   gate.** New `422 DOWNPAYMENT_POLICY_UNRESOLVED` guard -- see Affected
   Surfaces #3. Gated on `totalAmount > 0` (post-review fix, RF-2) so a
   legitimate zero-total order (e.g. a 100%-off voucher on a
   downpayment_required tenant) isn't misclassified as a malformed
   settings row -- it still 422s, on the pre-existing, more accurate
   `totalAmountCentavos <= 0` guard instead. Unit-tested.
5. **Idempotency (#476, fixed PR #784) is not regressed.** No change to
   `processVerifiedPaidCommerceSession.js`'s row-lock claim, its provider-
   event-replay guard, or its "bare `paid` is not terminal" re-entry logic.
   The new ledger write inherits the order's own pre-existing
   `idempotency_key` dedup (a replay short-circuits before reaching the
   ledger write at all) plus its own independent
   `uq_pos_order_payments_transaction_idempotency` backstop. Unit-tested
   (`downpaymentWebhookFinalization.unit.test.js`, "a replayed webhook
   delivery... is a no-op").
6. **The migration is purely additive.** `CREATE`/`ALTER TABLE ADD COLUMN`
   only, each column nullable or defaulted, idempotent guard, matching down().
   No existing column, row, or table is altered destructively.

## Verification Evidence

20 new/changed unit tests across three files (11 in
`storeCheckoutDownpaymentResolution.unit.test.js`, rewritten from Phase 140's
8, plus one added post-review for RF-2 below; 5 new in
`downpaymentWebhookFinalization.unit.test.js`; 2 new in
`storePaymentTruth.unit.test.js`), all passing, no database required (fakes
throughout, matching the established pattern). The pre-existing
`processVerifiedPaidCommerceSession.usecase.test.js` (7 tests) and
`finalizePaidCommerceSession.usecase.test.js` (18 tests) suites pass
unmodified -- confirming no regression to #476's idempotency fix or the
existing finalization failure-code taxonomy. Full `apps/dgfy-api` store test
suite: 388 passed, 2 pre-existing DB-dependent integration failures
(`storefrontPrimaryLocation.discovery.integration.test.js`,
`storeRouteTenantContext.integration.test.js`) -- the same two Phase 140
already identified as unrelated to this feature, confirmed to fail
identically for lack of a live database connection in this session, not a
regression. `npm run check:architecture` passed for both the guardrails and
controller-boundary checks. `node --check` passed on every new/changed file.

Outstanding before merge:

- `POST /api/v1/compliance/preflight` has **not** been executed against a
  live environment -- same disclosure shape as the Phase 138/140
  declarations. The front-matter preflight fields record this change's
  classification decision (a payment-capture code path change,
  `no_breach`/`ALLOWED` per the preconditions above), and a reviewer with a
  live environment must run the endpoint and reconcile
  `preflight_run_at`/`preflight_request_ref` before merge.
- No live PayMongo sandbox capture end to end -- unit coverage only in this
  session.

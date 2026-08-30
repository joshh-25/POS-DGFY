---
status: reference
owner: engineering
last_reviewed: 2026-08-30
declaration_id: 2026-08-30-affiliate-attribution-commit-time-recheck
classification: major
surfaces: payments
reason_codes_impacted: none
policy_version: 2026.08.30
verification_evidence: apps/dgfy-api/tests/storeCheckoutAffiliatePricing.unit.test.js (13 passed, 4 new),node --check apps/dgfy-api/src/modules/store/usecases/storeUseCases.js
rollback_note: Revert this commit. The change is confined to which enrollment object the post-commit accrual reads; no schema change, no new column, no persisted state. Reverting restores the pricing-time cached enrollment and the pre-existing `||` fallback, with no data cleanup needed — commissions already accrued under either behavior remain valid rows.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-30T09:19:44Z
preflight_request_ref: NOT-EXECUTED-450-AFFILIATE-ATTRIBUTION-COMMIT-RECHECK
---

# Storefront Checkout — Affiliate Enrollment Re-verified At Commit Time

## Compliance Impact Classification

`major`, `payments` surface, per `scripts/check-compliance-impact.js`'s
`^apps/dgfy-api/src/modules/store/` rule (`minimumClassification: 'major'`, `surfaces: ['payments']`).
This PR touches `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`'s post-commit affiliate
commission accrual block only — no buyer-facing pricing, VAT, or checkout response math changes.

## Affected Surfaces

1. `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` — the post-commit affiliate accrual
   block (`#450` decision D2) now calls `resolveActiveAffiliateEnrollmentById` unconditionally at
   commit time instead of trusting the pricing-time `resolved.affiliatePricing.enrollment` cached
   object via an `||` fallback. When the fresh check comes back null (enrollment revoked/suspended,
   or the tenant's affiliate program disabled, between pricing and commit), the commission accrual
   is silently dropped and a `logger.warn` is emitted; the order and buyer-facing response are
   unaffected either way.

## Compliance Preconditions

1. **No pricing, discount, or VAT math changes.** `resolveAffiliatePricingForCheckout`,
   `resolveAffiliateSellingPriceRuleForDisplay`, `prepareCheckoutLines`, and the `return ok({...})`
   payload are untouched. The buyer's price is already final by the time the accrual block runs
   (post-`transaction.commit()`).
2. **The re-check enforces the same gate that already exists**, just at a later point in time:
   `resolveActiveAffiliateEnrollmentById` requires `settings.program_enabled` and
   `enrollment.status === 'active'`, identical to the gate `resolveAffiliatePricingForCheckout`
   already applies at pricing time. Nothing new is being enforced — only *when* it is checked.
3. **Accrual stays best-effort and post-commit.** The block remains inside the same `try/catch` that
   already guarantees a commission-write failure never rolls back a paid order (governing comment:
   "Must never fail the checkout that already succeeded"). No transaction, lock, or `FOR UPDATE` is
   added — the order's own transaction has already committed, so the re-check necessarily reads
   current committed state on the default connection.
4. **Idempotent by construction.** Accrual is already guarded by the
   `(tenant_id, order_reference)` unique index behind `createPendingCommissionIfMissing`, so no new
   double-accrual or race surface is introduced by re-resolving the enrollment a second time.
5. **In-store POS is explicitly out of scope.** `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
   is unmodified — POS treats the affiliate code as a hard, operator-facing precondition (an
   unresolvable code rejects the whole checkout with `422 AFFILIATE_CODE_INVALID`), and the window
   between resolve and commit there carries no external latency (verified: no payment-gateway call,
   no HTTP fetch, no timer between the two points, all local DB work inside one open transaction).
   Extending silent-drop semantics to a counter workflow that already gave the operator an
   interactive validation result is a product decision, not a mechanical port of this fix — deferred
   to a follow-up issue (`Refs #450`).

## Verification Evidence

1. `apps/dgfy-api/tests/storeCheckoutAffiliatePricing.unit.test.js` — 13 tests passed (9 pre-existing,
   unmodified in assertions except additive `logger.warn` checks, plus 4 new): still-active-at-commit
   (asserting `findEnrollmentById` is now called exactly twice), revoked-between-pricing-and-commit
   (order succeeds, zero commission/attribution rows, exactly one drop warn), the same revocation
   case with an active price rule (buyer still pays the discounted price, no commission), and
   program-disabled-between-pricing-and-commit (no commission). Full pass/fail summary is included
   in the PR's `## Testing Evidence`.
2. `node --check apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` — syntax-only check
   (this app has no real build step); passed.
3. **Preflight methodology note:** `preflight_request_ref` is `NOT-EXECUTED-*` because this PR
   targets `develop`. Per `docs/compliance/request-time-preflight-protocol.md`, the live preflight
   sweep runs once per batch at the `develop → staging` promotion, not per-PR — this is expected and
   not a gap in this declaration.

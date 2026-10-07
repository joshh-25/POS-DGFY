---
status: reference
owner: engineering
last_reviewed: 2026-10-06
related_adr: docs/architecture/adr/0052-tenant-revenue-collection-ledger-and-settlement.md
declaration_id: 2026-10-06-commerce-payment-session-cancellation
classification: regulatory
surfaces: payments,storefront,commerce
reason_codes_impacted: PAYMENT_SESSION_CANCELLATION_UNRESOLVED,SESSION_TERMINAL
policy_version: 2026.10.06
verification_evidence: apps/dgfy-api/tests/storeCancelPaymentSession.usecase.test.js and tests/paymongoHostedCheckout.test.js (17 passed; 30 passed across four focused suites); node --check on changed JavaScript and migration files; npm run check:compliance; npm run check:architecture; npm run check:adr; npm run lint:docs; node scripts/check-app-version-bump.js; npm run check:tenant-schema (attempted, exited before report output)
rollback_note: Revert the API route/use case/provider methods, model field and additive landlord migration together. The backfilled checkout-session ID is recoverable from provider_payload, and dropping the nullable indexed column does not alter payment, order, refund, or ledger state.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-06T15:00:32.030Z
preflight_request_ref: PREFLIGHT-37483118154-2026-10-06-COMMERCE-PAYMENT-SESSION-CANCELLATION
---

# Server-authoritative commerce payment session cancellation (#2267)

## Compliance Impact Classification

Regulatory, matching the existing commerce payment declarations. This change adds a
customer-callable provider mutation and a durable cancellation state to the Storefront
payment-session lifecycle. It preserves provider webhook authority for paid sessions and
does not change payment acceptance, refund, fee, settlement, or payout policy.

## Affected Surfaces

- `apps/dgfy-api/src/modules/store/` — tenant-scoped cancellation outcome handling and the
  customer-facing Storefront route.
- `apps/dgfy-api/src/services/paymongoService.js` — PayMongo Payment Intent cancellation and
  Hosted Checkout expiry requests.
- `apps/dgfy-api/src/models/Landlord/CommercePaymentSession.js` and the migration runner — an
  additive nullable Hosted Checkout ID column on the landlord-owned session table.
- `docs/features/TENANT_REVENUE_SETTLEMENT.md` and ADR 0052 — the endpoint contract and lifecycle
  invariant.

## Compliance Preconditions

1. Cancellation is available only for unpaid `created`/`awaiting_payment` sessions. Paid,
   finalized, or order-associated sessions never trigger cancellation, a refund, or another
   charge from this endpoint.
2. PayMongo HTTP requests run outside database transactions. A second locked read protects a
   concurrent paid webhook from being overwritten; provider uncertainty leaves the session
   non-terminal and records its failure reason.
3. The schema change is additive and landlord-only. The backfill copies only literal `cs_`
   Checkout Session IDs; it does not register or version a tenant schema.
4. Before this migration deploys to an environment, run the required tenant-schema report
   against that target environment and resolve any reported drift. This applies regardless of
   the landlord-only table scope.
5. `preflight_request_ref` is an expected `NOT-EXECUTED-*` placeholder for this develop PR. No
   live request-time preflight was executed in this implementation session; the normal
   compliance sweep reconciles the declaration after it lands on `develop`.
6. This declaration authorizes no deployment or production mutation.

## Verification Evidence

Evidence and command results are recorded in the linked pull request. The Hosted Checkout
cross-namespace behavior (creating a session under `/v2` and expiring it under `/v1`) still
requires an authenticated PayMongo sandbox probe; API documentation specifies the `/v1` expiry
endpoint but does not establish cross-namespace addressability.

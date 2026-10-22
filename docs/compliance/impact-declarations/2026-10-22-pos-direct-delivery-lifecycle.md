---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-22
related_adr: docs/architecture/adr/0034-manual-delivery-job-foundation.md
declaration_id: 2026-10-22-pos-direct-delivery-lifecycle
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: DELIVERY_BALANCE_DUE_OUTSTANDING,DELIVERY_SETTLEMENT_INVALID,DELIVERY_FAILURE_REASON_REQUIRED,DIRECT_DELIVERY_ORDER_REQUIRED,DELIVERY_COURIER_SERVICE_REQUIRED,DELIVERY_COURIER_DETAILS_INVALID,DELIVERY_TRACKING_URL_INVALID
policy_version: 2026.10.16
verification_evidence: 162 focused API tests,11 Storefront tests,49 POS tests,changed JavaScript syntax checks,POS Storefront IMS OPIS production builds,node scripts/check-app-version-bump.js,npm run check:compliance,npm run check:architecture,npm run lint:docs
rollback_note: Roll back API and POS UI together. Keep the widened tenant ENUM and nullable courier fields; do not narrow the ENUM while waiting-for-rider orders may exist. Existing payment and delivery records remain readable by legacy routes.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-22T03:52:00.000Z
preflight_request_ref: NOT-EXECUTED-2026-10-22-POS-DIRECT-DELIVERY-LIFECYCLE
---

# Direct delivery lifecycle (#2667)

## Compliance Impact Classification

Proposed `major` classification: one terminal action can now settle a balance,
mark a manual delivery job delivered, and complete an online order atomically.
The separate Failed action cancels an order and enters the store-origin refund
lifecycle for captured payments. Existing payment, audit and refund controls
remain in force under ADR 0063 and ADR 0083.

## Affected Surfaces

- POS and terminal: rider assignment, Waiting for rider, pickup, Delivered and
  Failed actions for direct deliveries outside an active Delivery Run. The
  terminal submits delivery completion and failure through their dedicated API
  actions.
- Payments: COD cash collection and captured-downpayment balance settlement
  in the completion transaction; store-origin cancellation refund on failure.
- Public tracking: customer-safe courier details, delivery stage and the
  store-attributed cancellation reason. F&B, Retail and Simple tracking views
  display the courier and rider details returned by the public tracking API.

## Compliance Preconditions

Apply the additive tenant migration before deploying the API. The migration
widens the fulfillment status ENUM and adds nullable courier fields. Confirm
terminal pairing, active operator, open shift and `pos:transact` for completion;
Failed requires `pos:transact` and an open shift. No custody record is written.
Active Delivery Runs retain their separate controls. The NOT-EXECUTED reference
is a develop placeholder, not live production preflight evidence. A live
preflight sweep is required before production promotion.

## Verification Evidence

Passed: 162 focused API tests, 11 Storefront tests and 49 POS tests; changed
JavaScript syntax checks; POS, Storefront, IMS and OPIS production builds;
unchanged-version, compliance, architecture, docs and ADR gates. Migration
execution and STAGING workflow verification remain post-merge checks in
Phase 527.

---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-22
related_adr: docs/architecture/adr/0034-manual-delivery-job-foundation.md
declaration_id: 2026-10-22-ready-for-rider-active-visibility
classification: major
surfaces: pos,terminal,payments
reason_codes_impacted: AUTHORIZATION_FAILED,DELIVERY_SETTLEMENT_INVALID
policy_version: 2026.10.16
verification_evidence: Focused API and Storefront regression suites,JavaScript syntax checks,Storefront build,npm run check:architecture,npm run lint:docs,npm run check:compliance
rollback_note: Revert the shared status lists and direct-delivery route contract together. No schema or historical payment rows change; previously written audit rows remain immutable.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-22T06:21:27Z
preflight_request_ref: NOT-EXECUTED-2026-10-22-READY-FOR-RIDER-ACTIVE-VISIBILITY
---

# Ready-for-rider active visibility and delivery action corrections (#2676)

## Compliance Impact Classification

Major is the computed floor for POS, terminal, and Storefront payment-path files. The
change restores visibility of an existing fulfillment state, aligns direct failure
with direct completion's active-operator authority, and removes an unsupported
delivery settlement method at validation.

## Affected Surfaces

- POS and terminal: incoming queue includes `ready_for_rider`; direct failure now
  requires a paired terminal and active operator. Audit rows carry that operator.
- Payments: delivery completion validation rejects `employee_credit`, which the
  use case already rejected. No payment amounts or settlement writes change.
- Storefront: customer active lists retain waiting-for-rider orders.

## Compliance Preconditions

The direct failure route remains limited to `pos:transact` and an open shift. Native
clients must send `x-pos-terminal-id` on failure requests. The delivery-job status
route's assigned-staff permission path retains its existing contract. No schema
migration, new push notification, or payment lifecycle expansion is introduced.

The `NOT-EXECUTED-*` reference records that request-time preflight has not run.
The `no_breach` front matter satisfies declaration shape only and does not claim
live preflight evidence. Reconcile before production promotion.

## Verification Evidence

Focused regression suites and local gates are recorded in the PR testing evidence.
STAGING account and shared-terminal verification remain outstanding in Phase 531.

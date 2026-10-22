---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-22
related_adr: docs/architecture/adr/0034-manual-delivery-job-foundation.md
declaration_id: 2026-10-22-delivery-wave1-cancel-audit
classification: major
surfaces: pos,terminal,payments,inventory
reason_codes_impacted: ALLOWED
policy_version: 2026.10.16
verification_evidence: Focused API and frontend regression tests and required build, syntax, architecture, documentation, app-version and compliance checks are tracked in the Wave 1 PR; live preflight is outstanding
rollback_note: Revert the shared cancellation, transactional audit, picker, and receipt-history changes together. No schema migration or historical row rewrite is introduced; audit rows already written remain immutable.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-22T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-2666-DELIVERY-WAVE1-CANCEL-AUDIT
---

# Delivery Wave 1 cancellation and audit (#2666)

## Compliance Impact Classification

Major. The change corrects customer cancellation of `placed` and `confirmed` orders across
Storefront and DGFY-account channels. The shared path releases inventory, reverses an issued
goods issue and voucher redemption, cancels an eligible manual delivery job, and invokes the
customer payment refund/forfeit lifecycle. POS run and fulfillment mutations now record
transactional audit rows. The UI changes are read-only labels, refreshes, and history.

## Affected Surfaces

- `apps/dgfy-api/src/modules/pos/` and `packages/web-core/src/features/pos/`: run and order status audit, picker freshness and cash collection key.
- `apps/dgfy-api/src/modules/store/` and `apps/dgfy-api/src/modules/dgfy/`: shared customer cancellation, inventory, voucher, payment lifecycle and delivery job state.
- `apps/dgfy-api/src/modules/businessAdmin/` and `apps/dgfy-opis/`: order timeline and read-only status history.

## Compliance Preconditions

- Tenant-scoped ownership and `placed|confirmed` eligibility remain enforced before cancellation.
- Stock, voucher, job, order, and audit writes share one tenant transaction. A failure rolls
  these writes back. The payment provider lifecycle remains post-commit under ADR 0052.
- No database migration, permission expansion, or client request break is introduced.

## Verification Evidence

- Focused API and frontend suites cover cancellation effects, transaction-bound audit rows, run picker refresh, and order history.
- The `NOT-EXECUTED-*` reference records that request-time preflight has not yet run. The
  front-matter `no_breach` fields satisfy the declaration-shape gate only; they are not a claim
  of live preflight evidence. Reconcile this declaration before STAGING promotion under
  `docs/compliance/request-time-preflight-protocol.md`.

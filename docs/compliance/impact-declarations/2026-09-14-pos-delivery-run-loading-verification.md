---
status: reference
owner: engineering
last_reviewed: 2026-09-14
declaration_id: 2026-09-14-pos-delivery-run-loading-verification
classification: regulatory
surfaces: pos,terminal,inventory,payments,settings,compliance
reason_codes_impacted: DELIVERY_RUN_LOADING_REASON_REQUIRED
policy_version: 2026.09.03
verification_evidence: apps/dgfy-api/tests/deliveryRunLoading.usecase.test.js,apps/dgfy-api/tests/addDeliveryRunLoadingVerification.migration.test.js,apps/dgfy-api/tests/posValidator.deliveryRun.test.js,apps/dgfy-api/tests/deliveryRunRoutes.transport.test.js,packages/web-core/src/features/pos/__tests__/deliveryRunLoading.behavior.test.jsx,node --check on changed JavaScript and migration files
rollback_note: The change is additive. Revert the loading API/UI/model wiring after confirming no clients depend on the fields, then run the migration down() across landlord and active tenant databases. Existing delivery jobs and runs retain their prior behavior; rollback removes only the loading-state and attestation columns/indexes/foreign keys.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-14T00:00:00+08:00
preflight_request_ref: PREFLIGHT-1461-2026-09-14
---

# Delivery-run loading verification and dispatcher attestation (#1461)

## Compliance Impact Classification

Major. The change updates POS delivery-run models, repositories, use cases, routes, and the shared
terminal UI, so it meets the repository's major POS/terminal classification floor. It records
operational loading facts and actor/timestamp attestations, but does not change payment capture,
fiscal records, tenant authorization boundaries, provider-owned delivery behavior, or order
completion authority.

## Affected Surfaces

1. Tenant-local `delivery_jobs` loading state, exception reason, marking actor/timestamp, and the
   supporting run/loading index and actor foreign key.
2. Tenant-local `delivery_runs` confirmation actor/timestamp and its actor foreign key.
3. Authenticated POS loading-mark and run-confirmation routes, with operation replay and audit rows.
4. POS delivery-run detail and ordinary incoming-order delivery-job serialization, plus the
   operator controls and warn-only dispatch result presentation.

## Compliance Preconditions

1. Loading state is an explicit enum. `pending` means no decision has been recorded and remains
   distinct from `not_loaded`; `exception` requires a non-empty reason, and a later non-exception
   state clears that reason.
2. Both mutations require the existing `pos:transact` authority, remain tenant/location scoped,
   and record the authenticated actor and timestamp. No narrower capability or provider access is
   introduced.
3. Same-key retries replay without duplicate writes or audit events. New keys may record a later
   attestation, while completed/cancelled runs remain protected from loading changes.
4. Dispatch is warn-only. It may dispatch unverified or exception members and returns the affected
   order IDs; loading confirmation is not a fulfillment, payment, or completion gate.

## Verification Evidence

- Focused backend tests cover default/pending versus explicit not-loaded, exception validation and
  clearing, confirmation replay, audit behavior, empty/locked/missing/cross-location cases, and
  member removal cleanup.
- The migration contract covers landlord/active-tenant fanout, idempotency, dependency-safe down,
  foreign keys, and the loading index.
- Focused POS behavior tests cover reason gating, per-member submission, confirmation-key retry,
  locked-run control disabling, and the non-blocking dispatch warning.
- Static syntax, architecture, documentation, compliance, and frontend build gates are required
  before the implementation PR is opened; deployed tenant-schema and UI QA remain post-merge work.

## Residual Risks

The local test harness does not execute the migration against live tenant MySQL instances. Deployed
QA must confirm tenant-schema report/repair parity, cross-tenant isolation, and the two new POS
routes before production promotion. The attestation is an operator-entered operational fact and is
not an independent proof that a parcel was physically loaded.

## Preflight Reconciliation

This develop-targeting implementation records the local no-breach classification. The live
request-time compliance sweep remains a promotion-stage gate under the repository preflight
protocol.

---
status: reference
owner: engineering
last_reviewed: 2026-09-14
declaration_id: 2026-09-14-courier-cash-custody-remittance-variance
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: DELIVERY_RUN_REMITTANCE_ALREADY_EXISTS,DELIVERY_RUN_REMITTANCE_MEMBER_NOT_DELIVERED,DELIVERY_RUN_REMITTANCE_NOTHING_TO_COLLECT,DELIVERY_RUN_VARIANCE_REASON_REQUIRED,DELIVERY_RUN_VARIANCE_RESOLUTION_PERMISSION_REQUIRED
policy_version: 2026.09.03
verification_evidence: apps/dgfy-api/tests/deliveryRunRemittance.usecase.test.js,apps/dgfy-api/tests/createDeliveryRunRemittances.migration.test.js,apps/dgfy-api/tests/deliveryRunRemittance.transport.test.js,node --check on changed JavaScript and migration files
rollback_note: The change is additive. Revert the remittance API/model wiring after confirming no clients depend on the routes, then run the migration down() across landlord and active tenant databases. Existing delivery runs, orders, payment rows, drawer events, and fiscal records retain their prior behavior; rollback removes only the new custody/remittance/variance tables and API surface.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-14T00:00:00.000Z
preflight_request_ref: PREFLIGHT-1887-LOCAL-NOT-RUN
---

# Courier cash custody, remittance, and variance ledger (#1887)

## Compliance Impact Classification

Major. The change adds tenant-local POS delivery-run schema, repository/use-case
behavior, authenticated routes, permission handling, and audit events, so it
meets the repository's `pos`/`terminal` major classification floor. It records
operational custody and remittance evidence, but does not change payment
recognition, accounting settlement, or fiscal receipt behavior.

The new ledger is deliberately parallel to the existing payment ledger. It reads
`cash_received` and `change_amount` to derive expected physical cash, but never
writes `pos_order_payments`, `payment_status`, `balance_due`, cash-drawer
reconciliation, revenue settlement, or fiscal receipts, per ADR 0083 clause 7.

## Affected Surfaces

1. Tenant-local `delivery_run_remittances`, allocation, and append-only variance
   tables, with foreign keys and unique/index constraints.
2. POS remittance and variance-resolution routes, including operation replay,
   location scoping, permission checks, and audit rows.
3. Delivery-run models, repository reads/writes, serializers, and validators.
4. Tenant-schema fresh-provisioning registry entries for all three new tables.

## Compliance Preconditions

1. Remittance creation is atomic and idempotent. A run has at most one remittance,
   and a retry with the same operation key replays without duplicate ledger or
   audit rows.
2. Expected cash is server-derived only from handover cash evidence. Delivered
   manual-provider members with `cash_received IS NULL` are rejected; provider-
   owned, prepaid, and non-cash cases are not silently treated as custody.
3. Variances require a reason and are immutable. Resolution requires the dedicated
   supervisor/manager capability and inserts a reversal row rather than updating
   the original entry.
4. All reads and writes remain tenant/location scoped. The API introduces no UI,
   collection endpoint, payment mutation, drawer mutation, or fiscal mutation.

## Verification Evidence

- Focused backend tests cover normal remittance, payment-field immutability,
  shortage/overage reasons, duplicate rejection and replay, provider/non-cash/
  non-delivered/non-member boundaries, location isolation, and variance
  resolution authority.
- The migration contract covers landlord/active-tenant fanout, idempotent rerun,
  dependency-safe down, foreign keys, indexes, and fresh-tenant registry parity.
- Transport tests cover validator contracts, handler forwarding, and route
  permission/source registration.
- Static syntax, architecture, documentation, compliance, and API version-bump
  gates are required before the implementation PR is opened; deployed tenant
  schema and endpoint QA remain post-merge work.

## Residual Risks

The local test harness does not execute the migration against live tenant MySQL
instances. Deployed QA must confirm tenant-schema report/repair parity,
cross-tenant isolation, and the four routes before production promotion. This
ledger is operational evidence only and does not reconcile the cash drawer or
claim fiscal settlement.

## Preflight Reconciliation

This develop-targeting implementation records the local no-breach classification.
The request-time compliance sweep remains a promotion-stage gate under the
repository preflight protocol.

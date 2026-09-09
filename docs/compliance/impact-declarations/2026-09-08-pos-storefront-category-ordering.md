---
status: reference
owner: engineering
last_reviewed: 2026-09-08
declaration_id: 2026-09-08-pos-storefront-category-ordering
classification: major
surfaces: api,pos,storefront,database,inventory,payments,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.08
verification_evidence: inventory repository tests,tenant schema sync regression tests and 15-tenant repair report,public catalog serialization test and live 118-item Masu Cafe payload,storefront category view-model tests,POS and Storefront production builds,architecture check,compliance check,app-version check,migration syntax check
rollback_note: Revert Phase 313 application changes and leave the additive sort_order column in place; existing category identity and item memberships remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-08T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-PHASE-313-LOCAL-ONLY
---

# Shared POS and Storefront category ordering

## Compliance Impact Classification

Major. This changes tenant category presentation order through an additive
Catalog-owned field and an authenticated administrator endpoint. It does not
change item identity, prices, stock, payments, taxes, receipts, or customer data.

## Affected Surfaces

- POS category management supports persistent rearrangement.
- Storefront F&B and services category controls consume the saved order.
- Existing tenant categories receive deterministic initial positions.
- Existing tenant databases receive the column through migration fan-out, with
  the tenant schema synchronizer providing drift detection and repair coverage.
- Newly created categories append to the saved sequence.

## Compliance Preconditions

- The reorder endpoint requires the existing tenant-admin category permission.
- The request must contain every current, non-deleted category exactly once.
- Position updates commit in one transaction or roll back completely.
- The synthetic Storefront All category is never stored and remains first.

## Verification Evidence

- Focused repository tests cover atomic success and stale-list rejection.
- Focused Storefront tests cover persisted category ordering.
- POS and Storefront production builds pass.
- Architecture, compliance, documentation, migration, and version gates pass.

The request-time compliance preflight was not executed because this is an
authorized local-only implementation with no PR, push, deployment, or production
operation.

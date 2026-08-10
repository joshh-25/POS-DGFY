---
status: reference
owner: engineering
last_reviewed: 2026-08-10
declaration_id: 2026-08-10-pos-services-delivery-and-fnb-operations
classification: regulatory
surfaces: pos,terminal,payments
reason_codes_impacted: ALLOWED
policy_version: 2026.08.07
verification_evidence: architecture guardrails,tenant schema registry coverage,focused POS and storefront tests,production frontend builds
rollback_note: Revert the delivery assignment, F&B modifier, Services catalog and booking-flow commits with this declaration; roll back their migrations only through the deployment rollback procedure after confirming no dependent tenant data remains.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-10T00:00:00+08:00
preflight_request_ref: LOCAL-INTEGRATION-20260810-POS-OPERATIONS
---

# POS, Services, Delivery, and F&B Operations

## Compliance Impact Classification

Regulatory. The change set expands POS operational controls, service-booking
settlement paths, delivery assignment, and F&B modifier management. It does not
relax existing authorization, payment, fiscal receipt, tenant, or location
boundaries.

## Affected Surfaces

1. POS adds delivery-personnel assignment and operational workspaces for
   Services and F&B configuration.
2. F&B modifiers gain location availability, group kinds, conditions, and
   quantity-aware storefront/POS selection.
3. Services gain catalog-management operations and stricter storefront booking
   gates for customer identity, OTP, schedule, and delivery location.
4. Backend settlement, validation, repository, and route contracts are extended
   to support the same operational workflows without bypassing existing access
   checks.

## Compliance Preconditions

1. Existing tenant and location scoping remains mandatory for all reads and
   writes.
2. Delivery assignment does not mark an order paid, issue a fiscal document, or
   bypass completion and cash-collection guards.
3. Modifier configuration cannot alter finalized transaction totals or replayed
   payment records.
4. Guest Services checkout remains fail-closed until email OTP verification and
   all required fulfillment information are complete.
5. Database migrations remain reversible through the repository migration
   tooling and must run before dependent application code is deployed.

## Verification Evidence

1. Architecture and controller-boundary guardrails pass.
2. Tenant-schema registry coverage passes for all five new migrations, with
   dynamic table-name warnings reviewed against the updated schema registry.
3. Focused POS, F&B, Services, migration, and storefront tests are included in
   the change set.
4. Storefront production build and Services booking validation tests pass.
5. Full post-merge validation and migration status checks are required before
   handoff.

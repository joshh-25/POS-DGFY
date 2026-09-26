---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-12
declaration_id: 2026-09-12-dgfy-customer-order-history-phase-334
classification: major
surfaces: payments
reason_codes_impacted: ALLOWED
policy_version: 2026.09.12
verification_evidence: focused DGFY/store history tests, Storefront branch-scope tests, Storefront/API lint and build, architecture/documentation/ADR/API contract checks, git diff check
rollback_note: Revert the Phase 334 history filters, location snapshot column/migration, Storefront scope labeling, tests, documentation, and declaration together; no historical ownership or order rows are rewritten.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-12T22:20:00+08:00
preflight_request_ref: NOT-EXECUTED-DGFY-CUSTOMER-ORDER-HISTORY-PHASE-334-LOCAL-ONLY
---

# DGFY customer order-history branch scoping

## Compliance Impact Classification

Major by the repository path classification floor. This change affects Storefront customer-history
reads and adds a branch identifier snapshot to the landlord activity index, but it does not alter
order totals, payment capture, fiscal records, permissions, or historical ownership.

## Affected Surfaces

- Storefront global and tenant-local customer order-history reads.
- Landlord DGFY activity indexing and tenant POS order-history filtering.
- Customer-facing order-history scope labeling and stale-response/live-update handling.

## Compliance Preconditions

- Authenticated DGFY account or tenant customer ownership remains the mandatory base predicate.
- `store_slug` and positive `location_id` are validated and applied server-side before pagination
  and counts; client query parameters never grant access to another account or tenant.
- New order activity records save `location_id` when present. Legacy null locations are not assigned
  to a branch by name or current selection.
- The migration is additive and nullable; no historical order or activity ownership is rewritten.
- Storefront requests use no-store semantics and discard late responses/live events outside the
  active scope.

## Verification Evidence

- API use-case and validator tests cover store/branch forwarding, positive-id validation, and
  account-owned activity filtering inputs.
- Storefront tests cover scoped query construction, explicit All stores/store/branch labels, and
  stale branch-response rejection.
- Storefront/API lint and build plus architecture, documentation, ADR, API contract, and diff
  checks are run before delivery.

This declaration is for the authorized local implementation only. No PR, push, deployment, or
production data mutation was requested or performed.

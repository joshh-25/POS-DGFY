---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-21
declaration_id: 2026-09-21-fnb-check-settlement-integrity-phase-444
classification: major
surfaces: pos,terminal,fnb,inventory,stock_movements
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT,AUTHORIZATION_FAILED,RESOURCE_NOT_FOUND
policy_version: 2026.09.21
verification_evidence: F&B checkout integrity contracts; F&B operational readiness contracts; API source lint; architecture guardrails; POS, IMS, and Storefront production builds; migration syntax and local tenant-schema verification; documentation and git diff checks
rollback_note: Revert the F&B checkout guard, location binding, check-line persistence, integrity migration, focused contracts, documentation, and ledger entry together. No historical sales, stock, payment, fiscal, or production-row rollback is required.
preflight_result: no_breach
preflight_reason_code: FNB_CHECK_SETTLEMENT_INTEGRITY
preflight_run_at: 2026-09-21T20:00:00+08:00
preflight_request_ref: NOT-EXECUTED-PHASE-444-LOCAL-ONLY
---

# F&B check settlement integrity — Phase 444

## Compliance Impact Classification

Major because the change hardens the POS F&B checkout boundary that creates the
canonical sale and inventory effects. It does not introduce a second financial
owner: the existing POS checkout transaction remains the one atomic owner for
the sale, stock issue, check settlement, and kitchen-ticket linkage.

## Affected Surfaces

- F&B check location scope, active check-line integrity, and settlement state.
- POS transaction creation, kitchen-ticket/check linkage, recipe and modifier
  stock issues, and post-checkout catalog invalidation.
- Tenant-local `fnb_checks` schema indexes used for location filtering and
  duplicate transaction protection.

## Compliance Preconditions

- Existing tenant, branch, terminal, permission, payment, fiscal, and stock
  controls remain authoritative.
- A paid, partially paid, stale, cross-branch, or unavailable check fails
  closed before a new POS transaction or stock movement is created.
- Active check lines are compared with the submitted POS cart; voided lines do
  not create sales, kitchen lines, or stock deductions.
- Recipe ingredients, direct stock-bearing items, and linked modifier SKUs
  continue to use the canonical inventory command inside the checkout
  transaction. Services and other stock-exempt rows retain their existing
  policy.
- The migration is additive, nullable for legacy checks, and applies the same
  schema guard to the landlord database and active tenant databases.

## Verification Evidence

- The focused F&B backend suites passed: 3 suites and 76 tests, including
  duplicate settlement, changed-line, empty-open-check, voided-line,
  cross-branch, partial-payment, operational-readiness, and existing F&B
  workflow coverage.
- API source lint, architecture guardrails, controller boundaries, migration
  syntax, documentation/ADR validation, and `git diff --check` passed.
- POS, IMS, and Storefront production builds passed.
- Local schema verification confirmed `location_id`, the location/status/opened
  index, and the unique POS-transaction link across the current database and
  active tenant schemas.

**Live request-time compliance preflight was not executed.** This local
declaration uses the documented `NOT-EXECUTED-*` placeholder and must be
reconciled by the governed preflight process before promotion. The migration
was applied only to the local database schemas; no production deployment,
production transaction, or production data mutation was performed.

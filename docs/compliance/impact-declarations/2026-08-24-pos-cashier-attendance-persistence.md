---
status: reference
owner: engineering
last_reviewed: 2026-08-24
declaration_id: 2026-08-24-pos-cashier-attendance-persistence
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.24
verification_evidence: pos-cashier-attendance-migration-tests,pos-cashier-attendance-repository-tests,architecture-checks,docs-checks
rollback_note: Roll back the additive migration and remove the dormant persistence adapter; historical cashier, shift, and transaction data is not rewritten.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-24T14:50:00+08:00
preflight_request_ref: PHASE-155
---

# POS Cashier Attendance Persistence

## Compliance Impact Classification

Major because the change adds tenant-local POS attendance, operator-session, drawer-handoff, and
transaction-attribution persistence. It does not change checkout, payment, fiscal, authorization,
or report behavior; the new repository is not exposed by a route in this phase.

## Affected Surfaces

- POS terminal persistence and schema readiness.
- Cashier attendance and register handoff records for later phases.

## Compliance Preconditions

- No payment credentials, fiscal configuration, or historical transaction ownership is changed.
- `cashier_id`, register shifts, and existing transaction rows remain compatible; the new transaction
  reference is nullable and historical rows are not backfilled.
- Database uniqueness and foreign-key constraints are enforced before any later workflow activation.

## Verification Evidence

- Focused migration, rollback, idempotency, repository, and schema-contract tests pass.
- Existing shift, checkout, and operator-invariant tests pass without behavior changes.
- Architecture, tenant-schema coverage, documentation, and compliance checks pass.

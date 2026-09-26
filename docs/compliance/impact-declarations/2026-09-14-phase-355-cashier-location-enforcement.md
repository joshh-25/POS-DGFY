---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-14
declaration_id: 2026-09-14-phase-355-cashier-location-enforcement
classification: major
surfaces: pos,terminal,inventory,settings,payments
reason_codes_impacted: POS_OPERATOR_ACTIVE_ELSEWHERE,POS_OPERATOR_LOCATION_GRANT_REQUIRED,POS_OPERATOR_CONCURRENT_CHANGE,PERMISSION_DENIED
policy_version: 2026.09.14
verification_evidence: scoped API and permission regressions; migrated MySQL concurrent authority and rollback tests; read-only local grant/index audit; architecture, docs, lint and compliance declaration checks
rollback_note: Revert only Phase 355 authorization/composition/default-permission hunks and tests together after security review. No schema or saved permission changes to reverse. Preserve unrelated worktree changes, shifts, sales, tenders, stock and handoff history.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-26T08:42:50.556Z
preflight_request_ref: PREFLIGHT-36230356710-2026-09-14-PHASE-355-CASHIER-LOCATION-ENFORCEMENT
---

# Phase 355 cashier location enforcement

## Compliance Impact Classification

Major: authorization of POS operational/financial commands and default cashier
catalog editing. No tax, invoice sequence, fiscal classification, rounding, tender
amount or stock valuation policy is changed.

## Affected Surfaces

POS/terminal account-scoped acquisition and mutation authorization; native financial
sync eligibility; inventory edit permission defaults; fresh user authorization and
branch grant enforcement. See the exact implementation/path inventory in
[Phase 355](../../features/POS_CASHIER_LOCATION_ACCESS_PHASE_355.md).

## Compliance Preconditions

Device-proof, tenant isolation, dedicated PIN, attendance, in-flight-operation,
drawer custody and fiscal controls remain. Reject conflicts without partial
financial effects. No automatic grant rewrite, authority fabrication, queue deletion,
schema migration or production write. Unknown stored edit provenance requires review.

## Verification Evidence

Behavioral permission tests, real Express permission-boundary tests, migrated MySQL
concurrency/rollback and index checks, scoped lint, architecture/docs/ADR checks and
the read-only local tenant audit are tracked in the phase report and ledger.

**Live request-time preflight was not executed.** Frontmatter is the documented
NOT-EXECUTED placeholder shape, not a recorded `no_breach` runtime response. This
local-only change has no commit, PR, push or deployment. The accepted placeholder
must be reconciled by the governed preflight process before promotion; a passing
declaration check alone does not certify compliance or production readiness.

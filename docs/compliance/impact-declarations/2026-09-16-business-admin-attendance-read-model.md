---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-16
declaration_id: 2026-09-16-business-admin-attendance-read-model
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: BUSINESS_ADMIN_READ_MODEL,ATTENDANCE_READ_MODEL,ALLOWED
policy_version: 2026.09.16
verification_evidence: Business Admin attendance use-case and POS lifecycle repository tests; POS attendance workspace contract; authenticated local Playwright route acceptance; API/POS lint and POS production build; architecture, documentation, compliance and whitespace checks
rollback_note: Revert the Phase 371 attendance adapter, POS workspace, tests, documentation, and declaration together; no schema or historical attendance/operator-session data rollback is required.
preflight_result: no_breach
preflight_reason_code: BUSINESS_ADMIN_READ_MODEL
preflight_run_at: 2026-09-16T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-PHASE-371-LOCAL-ONLY
---

# Business Admin attendance read model

## Compliance Impact Classification

Major because the change exposes tenant-scoped employee attendance and POS
operator-session records through the POS/Business Admin read surface. It adds
no biometric capture, payroll calculation, schedule management, mutation, or
new storage owner.

## Affected Surfaces

- POS Business Admin attendance workspace and its date/branch filters.
- Canonical POS attendance, operator-session, and branch-scoped read queries.
- Business Admin API authorization and tenant/branch projection boundaries.

## Compliance Preconditions

- Business Admin access, tenant membership, and assigned branch grants remain
  server-authoritative; the client cannot widen `location_ids`.
- The adapter reuses the existing POS cashier lifecycle repository and does
  not duplicate attendance/operator-session storage or calculations.
- Biometric attendance, payroll export, overtime, scheduling, and attendance
  writes remain explicitly out of scope under ADR 0073 and the Back Office
  feature contract.
- No production deployment, merge, push, or live data mutation is performed
  by this local implementation session.

## Verification Evidence

- Focused Business Admin attendance use-case and POS lifecycle repository tests
  pass, including assigned-branch filtering, selected-branch denial, date
  validation, and multi-branch query predicates.
- POS source contract and authenticated local Playwright acceptance cover the
  rendered Attendance route, date/branch controls, both read-only tables, no
  blank page, and runtime diagnostics.
- API targeted lint, architecture/controller-boundary checks, POS lint and
  production build, documentation/ADR checks, compliance validation, and
  `git diff --check` passed for this local change.

**Live request-time compliance preflight was not executed.** This declaration
uses the documented `NOT-EXECUTED-*` placeholder for local work; it must be
reconciled by the governed preflight process before promotion. No production
deployment, merge, push, or production data mutation was performed.

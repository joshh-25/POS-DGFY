---
status: draft_pr
owner: engineering
last_reviewed: 2026-10-16
declaration_id: 2026-10-16-pos-audit-frontend-refactor
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.10.16
verification_evidence: audit_contract_tests,pos_regression_suite,targeted_eslint,dgfy_pos_build,dgfy_ims_build,git_diff_check
rollback_note: Revert the scoped POS Audit workspace modules, responsive presentation changes, and this declaration together. No backend, database, migration, service, or API contract change is included.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-19T13:55:04.039Z
preflight_request_ref: PREFLIGHT-39263518035-2026-10-16-POS-AUDIT-FRONTEND-REFACTOR
---

# POS Audit Frontend Refactor Compliance Impact

## Compliance Impact Classification

Major by the repository's POS and terminal path classification floor. This change refactors the
POS Audit presentation into focused frontend modules and preserves the existing service-backed
audit flow. It does not change audit retention, tenant authorization, API parameters, database
records, migrations, or backend behavior.

## Affected Surfaces

1. POS Audit workspace state and data presentation in `packages/web-core/src/features/pos/`.
2. Shared POS filter, shell, pagination, table, and responsive styles used by the Audit workspace.
3. Audit contract coverage for event labels, readable fields, payload presentation, date filtering,
   responsive detail-card layout, and pagination behavior.

## Compliance Preconditions

1. The existing `fetchAuditLogs` service boundary and query parameters remain unchanged.
2. Tenant-admin gating, tenant scoping, audit search, date filtering, pagination, expansion, and
   payload copy behavior remain frontend integrations with the existing backend contract.
3. Event labels and readable detail values are presentation formatting only; no actor, terminal,
   order, or audit record values are fabricated by the UI.
4. No backend, migration, database, authentication, authorization, or API contract file is included.

## Verification Evidence

- Audit contract tests and the focused POS regression suite passed.
- Targeted frontend lint passed without Audit-file errors.
- The `dgfy-pos` and `dgfy-ims` production builds passed.
- Architecture checks and `git diff --check` passed.

## Residual Risk

- Authenticated browser E2E requires the repository's local E2E credentials and remains a follow-up
  environment check; no live mutation or backend behavior is introduced by this refactor.

---
status: draft_pr
owner: DGFY POS/reports
last_reviewed: 2026-09-23
related_adr: docs/architecture/adr/0071-frontend-split-into-three-apps.md
declaration_id: 2026-09-23-pos-reports-frontend
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.09.23
verification_evidence: npm run check:architecture,focused POS Reports Vitest behavior and contract suites,POS Reports API repository/use-case/validator suites,npm run build:pos,workspace integration contract tests,git diff --check
rollback_note: Revert the POS Reports implementation commits and this declaration; existing POS transaction, shift, and authorization contracts remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-23T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-POS-REPORTS-FRONTEND-20260923
---

# POS Reports frontend and report-query presentation

## Compliance Impact Classification

Major. The change updates the shared POS Reports workspace, its report tables, filters,
responsive presentation, and the existing report-query/export data contracts. It preserves
server-authoritative report values and does not add transaction mutation, credential authority,
tenant access, or payment authorization behavior.

## Affected Surfaces

- `pos` — merchant-facing Reports navigation, KPIs, filters, tables, comparison views, and
  responsive layouts.
- `terminal` — report data is scoped through the existing POS/terminal reporting contracts;
  no terminal login or shift authorization rule is changed.

## Compliance Preconditions

1. Existing tenant, location, role, and permission checks remain the source of truth for report
   queries and exports.
2. Financial and operational values rendered by the UI remain the values returned by the existing
   server-side report queries; formatting and alignment changes do not recalculate transactions.
3. The Reports UI does not introduce a new write path for sales, adjustments, shifts, attendance,
   employee credit, or terminal records.
4. Employee credit and operational report data remain behind the existing authenticated POS
   request path and are not exposed through a new public endpoint.
5. No production deployment or live tenant qualification is claimed by this declaration. The
   request-time preflight reference is a PR-stage placeholder for the continuous compliance sweep.

## Verification Evidence

- `npm run check:architecture` passed for the repository architecture and controller boundaries.
- Focused POS Reports UI and API test suites passed for report tables, filters, responsive behavior,
  workspace contracts, report repositories, use cases, and query validation.
- Reports behavior coverage includes filter/date popovers, KPI states, all report table variants,
  horizontal table scrolling, dropdowns, toolbar actions, and the employee-credit report panel.
- Reports API repository, use-case, and query-validation tests passed; the API changes remain
  read-only reporting/aggregate/export behavior and preserve existing authorization boundaries.
- `npm run build:pos` passed for the shared POS frontend.
- Workspace integration wiring preserves the existing report data sources, subtab state, shared
  pagination, and employee-credit report boundary.
- `git diff --check` passed.

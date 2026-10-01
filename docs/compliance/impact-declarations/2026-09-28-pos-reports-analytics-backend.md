---
status: draft_pr
owner: DGFY POS/reports
last_reviewed: 2026-09-28
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-09-28-pos-reports-analytics-backend
classification: regulatory
surfaces: pos,terminal,inventory
reason_codes_impacted: ALLOWED
policy_version: 2026.09.28
verification_evidence: focused POS report breakdown repository/use-case/validator/route/handler tests,existing POS report overview/export regression tests,npm run check:architecture,npm run check:adr,npm run lint:docs,npm run check:compliance,git diff --check
rollback_note: Revert the backend report-breakdown implementation and this declaration; the change is read-only and introduces no migration, backfill, or down-migration requirement.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-28T19:06:00+08:00
preflight_request_ref: PHASE-RPT-02-2026-09-28
---

# POS Reports Analytics Backend Breakdowns

## Compliance Impact Classification

Regulatory. This phase adds read-only POS report breakdown and export contracts
for hourly sales, item sales, and category sales. It aggregates existing
tenant-scoped transaction and line data; it does not change checkout,
payments, tax calculation, fiscal numbering, inventory mutation, or compliance
policy evaluation.

## Affected Surfaces

- `pos` — additive `/pos/reports/breakdowns` query support and three CSV export sections.
- `terminal` — existing POS report permission and location-scope enforcement is reused.

## Compliance Preconditions

1. The new endpoint is gated by the existing `pos:view` or `pos:branch_view`
   permission and resolves location access through `resolvePosReadLocationScope`.
2. Cashiers remain constrained to their own `cashier_id`; invalid breakdown,
   date, pagination, sort, and filter values fail closed at validation/use-case
   boundaries.
3. The server reuses `normalizeReportLineRows` and existing financial fields;
   no client-provided totals or payment authority are accepted.
4. Item names and SKUs remain sale-time snapshots, while category resolution is
   live and null/empty categories are represented as `Uncategorized`.
5. No database migration or index change is included. Query-plan evidence for
   a future additive index, if needed, belongs to a separate change.

## Verification Evidence

- Focused backend suites passed: 5 suites, 87 tests, including existing
  overview/export regressions, breakdown aggregation, scope, validation,
  export, route, and transport coverage.
- `npm run check:architecture` passed; `npm run check:adr`, `npm run lint:docs`,
  `npm run check:compliance`, and `git diff --check` passed.
- Backend syntax checks passed for every changed JavaScript source file.
- Backend build command completed; this repository reports that no backend build
  is required.
- No live tenant data was mutated and no migration was executed.

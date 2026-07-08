---
status: reference
owner: engineering
last_reviewed: 2026-07-06
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-07-06-pos-reports-overview-endpoint
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: POS_REPORTS_OVERVIEW_ENDPOINT_ADDED,POS_REPORT_NAVIGATION_ALLOWED
policy_version: 2026.07.06
verification_evidence: npm --prefix backend test -- --testPathPattern tests/posReports.repository.test.js tests/posReports.usecase.test.js tests/posValidator.reportsOverviewQuery.test.js tests/posHandlers.transport.test.js,npm --prefix backend test -- --testPathPattern tests/rbacRouteCoverage.contract.test.js
rollback_note: Revert this commit to remove the /pos/reports/overview and /pos/reports/export routes, handlers, use cases, and repository methods; no schema migration is introduced, so no data backfill or down-migration is required.
preflight_result: no_breach
preflight_reason_code: POS_REPORTS_OVERVIEW_ENDPOINT_ADDED
preflight_run_at: 2026-07-06T11:10:00+08:00
preflight_request_ref: DGFY-102
---

# POS Reports Overview/Export Endpoint

## Compliance Impact Classification

Regulatory (surface-driven minimum). This change adds two new read-only POS endpoints (`GET /api/v1/pos/reports/overview`, `GET /api/v1/pos/reports/export`) and their supporting repository/use-case/handler code inside `backend/src/modules/pos/` and `backend/src/routes/pos.js`. It does not change payment processing, fiscal computation formulas, tax calculation rules, or compliance policy evaluation; the changed files fall under the `pos`/`terminal` surfaces guarded by the repository compliance rules. Classification is escalated to `regulatory` to satisfy the repository-wide compliance surface floor for compliance-sensitive files changed in this same branch/PR, not because this slice touches fiscal/receipt/VAT computation logic.

## Affected Surfaces

1. `backend/src/modules/pos/repositories/posRepository.js` gains report-aggregation helpers and three repository methods (`listReportTransactions`, `getReportsOverview`, `exportReports`) that read `PosTransaction`/`PosTransactionLine` rows within an arbitrary date range and filter set; no writes are introduced.
2. `backend/src/modules/pos/usecases/posUseCases.js` and `backend/src/modules/pos/index.js` add `getPosReportsOverviewUseCase`/`exportPosReportsUseCase`, following the existing `resolvePosReadLocationScope` read-scoping pattern used by every other POS read endpoint (e.g. `getTerminalTodayDashboardUseCase`).
3. `backend/src/modules/pos/controllers/posHandlers.js`, `backend/src/controllers/posController.js`, and `backend/src/routes/pos.js` add the `getReportsOverview`/`exportReports` handlers and routes, gated by the existing `checkPermission(PERMISSIONS.POS.actions.VIEW_POS)` middleware and validated by new Joi schemas in `backend/src/validators/posValidator.js`.
4. This closes a gap where the already-shipped frontend Reports & Analytics workspace (`frontend/src/features/pos/components/PosReportsAnalyticsWorkspace.jsx`) called these endpoints and received a 404, since the backend routes had never been implemented on this branch.
5. `settings, compliance` — added to satisfy the repository-wide compliance surface floor for compliance-sensitive files changed in this same branch/PR; this slice does not itself modify settings or compliance policy evaluation logic.

## Compliance Preconditions

1. No payment gateway, charge authorization, refund, or settlement flow is modified.
2. No VAT, service charge, DGFY fee, receipt numbering, or fiscal receipt calculation logic is modified by this slice; the reports feature only aggregates already-persisted transaction/line totals for display.
3. Both new routes are read-only (`GET`) and gated by the same `VIEW_POS` permission and tenant/location scoping already enforced on every other POS read endpoint; no new permission or role is introduced.
4. Voided POS transactions are now included in the `refunds_voids` and `gross_sales` figures reported back to the user (previously they would have been silently excluded), matching the intent of the reason code `POS_REPORTS_OVERVIEW_ENDPOINT_ADDED`; this does not affect the underlying `PosTransaction` records or any fiscal ledger, only the read-side reporting aggregation.
5. Location scoping continues to flow through the existing `resolvePosReadLocationScope` helper, so a user cannot read report data outside their permitted location(s).

## Verification Evidence

- `npm --prefix backend test -- --testPathPattern tests/posReports.repository.test.js tests/posReports.usecase.test.js tests/posValidator.reportsOverviewQuery.test.js tests/posHandlers.transport.test.js`
- `npm --prefix backend test -- --testPathPattern tests/rbacRouteCoverage.contract.test.js`

# Reports Module

Reporting transport handlers and service-backed use-cases. Report ownership is
described by the canonical metadata registry in
`domain/reportRegistry.js`; the registry is not a second calculation engine.

## Structure
- `controllers/reportHandlers.js`: route handlers for reports, snapshots, and CSV export.
- `usecases/reportUseCases.js`: use-case builders wrapping `reportService`.
- `index.js`: wiring for report use-cases.
- `domain/reportRegistry.js`: one report definition contract for filters,
  aggregation owner, permissions, pagination, export, formatting, and
  compatibility endpoints.

## Reporting ownership

The registry has three explicit surfaces:

- `business_admin`: canonical Back Office dataset definitions. The Business
  Admin catalog and its financial/inventory sort validation consume these
  definitions.
- `legacy_reports`: compatibility definitions for `/api/v1/reports/*` and
  saved snapshots. These routes remain in place until each consumer is
  migrated and its result is compared with the canonical definition.
- `terminal`: POS-owned active-shift, register, attendance, handoff, and
  operational report sections. Their calculations remain in the POS report
  repository and their `offline_supported` metadata preserves the existing
  local snapshot path.

Business Admin and terminal reports intentionally retain different scope
filters (`branch_id` versus terminal `location_id`) because they have
different owners and operating contexts. Date ranges, permissions, exports,
and compatibility paths are explicit in both definitions; no report endpoint
is retired by the registry alone.

## Current CSV Export Types
1. `expiry`
2. `stock_aging`
3. `production`
4. `po_analysis`
5. `executive_summary`

## Weighted Cost Notes
1. PO analysis exports include weighted variance summary and top variance slices
   by supplier and item.
2. Executive summary exports include weighted inventory value/quantity/avg cost
   plus procurement weighted-variance fields.

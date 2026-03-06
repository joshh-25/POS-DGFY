# Reports Module

Reporting transport handlers and service-backed use-cases.

## Structure
- `controllers/reportHandlers.js`: route handlers for reports, snapshots, and CSV export.
- `usecases/reportUseCases.js`: use-case builders wrapping `reportService`.
- `index.js`: wiring for report use-cases.

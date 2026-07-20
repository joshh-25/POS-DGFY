# Reports Module

Reporting transport handlers and service-backed use-cases.

## Structure
- `controllers/reportHandlers.js`: route handlers for reports, snapshots, and CSV export.
- `usecases/reportUseCases.js`: use-case builders wrapping `reportService`.
- `index.js`: wiring for report use-cases.

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

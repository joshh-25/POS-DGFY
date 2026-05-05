---
status: accepted
date: 2026-05-05
last_reviewed: 2026-05-05
classification: authoritative
---

# ADR 0019: Food & Beverage Mode Full-Service Restaurant Workflow

## Context

Food & Beverage Mode must be a restaurant workflow, not a relabeled retail or food-manufacturing mode. The change is cross-boundary because it touches workflow-mode semantics, IMS navigation, tenant-local data tables, POS checkout metadata, Storefront ordering entry points, receipts, reports, and API contracts.

This decision follows `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, ADR 0008, ADR 0014, ADR 0016, ADR 0017, and `docs/development/MODE_DEVELOPMENT_PLAYBOOK.md`.

## Decision

- Keep the stable internal workflow code `fnb`; expose it to users as `Food & Beverage`.
- Add explicit F&B capabilities: `fnbDining`, `menuModifiers`, `tableService`, `kitchenQueue`, `restaurantServiceCharge`, `catalog`, `inventory`, `pos`, and `storefront`.
- Add authenticated F&B APIs under `/api/v1/fnb/*`, guarded by `requireWorkflowCapability('fnbDining')`.
- Hide manufacturing job-order and dispatch-order surfaces in F&B. Inventory stock movements remain available because restaurants still need ingredient and menu inventory control.
- Reuse shared primitives where correct: `items`, `item_allergens`, `item_nutrition`, `product_composition`, POS transactions, and existing order methods.
- Add side tables for F&B-only concepts: modifier groups/options, dining areas/tables, kitchen stations/routes, open checks, check lines, kitchen tickets, reservation/waitlist requests, reservation table assignments, and restaurant service-charge snapshots.
- Extend POS checkout through additive metadata only: table/check/server/guest snapshots, line course/modifier/kitchen snapshots, and an optional restaurant service charge.
- Keep restaurant service charge separate from `service_fee_amount`. `service_fee_amount` remains the DGFY convenience fee contract from ADR 0012.
- Store immutable F&B snapshots at transaction time so historical receipts and reports do not drift after menu, table, server, or service-charge settings change.
- Storefront online ordering remains governed by Customer Access Mode and Inventory Display from ADR 0017.
- Model reservation table windows with explicit duration and reset-buffer minutes. Requested and waitlisted rows are intake leads and do not block capacity; confirmed and seated rows block overlapping confirmed/seated bookings for any assigned table. `table_id` remains the primary table shortcut for compatibility, while `fnb_reservation_tables` stores all assigned tables for combined-table parties and capacity checks.

## API Contract

The F&B API namespace owns:

- `GET /api/v1/fnb/dashboard`
- `GET|POST /api/v1/fnb/modifier-groups`
- `GET|POST /api/v1/fnb/dining-areas`
- `PATCH /api/v1/fnb/tables/:table_id/status`
- `GET|POST /api/v1/fnb/kitchen-stations`
- `GET|POST /api/v1/fnb/checks`
- `PATCH /api/v1/fnb/checks/:check_id/status`
- `POST /api/v1/fnb/checks/:check_id/lines`
- `POST /api/v1/fnb/checks/:check_id/kitchen-tickets`
- `PATCH /api/v1/fnb/kitchen-tickets/:ticket_id/status`
- `GET|POST /api/v1/fnb/reservations`
- `PATCH /api/v1/fnb/reservations/:reservation_id/status`
- `GET|PUT /api/v1/fnb/service-charge-settings`

## Consequences

- F&B data is additive and non-destructive. Switching modes hides unrelated operations but does not delete existing data.
- F&B inventory remains governed by the shared location-scoped FIFO contract. Recipe ingredients and stock-bearing menu items must deplete batches at the operating location; reservations, table state, kitchen tickets, modifiers, fees, and service-charge snapshots do not touch stock unless tied to a stock-bearing line.
- POS idempotency hashing must include F&B metadata so offline replay and duplicate suppression preserve table/check/service-charge context.
- Receipt, sales, Z-reading, and export surfaces may include F&B snapshots without changing fiscal vs non-fiscal document selection.
- No architecture allowlist exception is introduced.

## Validation

- Run `npm run check:architecture`.
- Run `npm run lint:docs`.
- Add backend tests for F&B workflow capabilities, guarded use-case transitions, service-charge settings, modifier validation, and POS F&B metadata snapshotting.
- Add frontend tests for F&B mode registry parity, route visibility, navigation visibility, POS context payloads, and Storefront pin labels.
- Keep regression coverage for `food_manufacturing`, `services`, `msme`, POS/Storefront source separation, Customer Access Mode, Inventory Display, and DGFY convenience fee behavior.

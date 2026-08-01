---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-05-05
last_reviewed: 2026-06-26
review_by: 2026-11-05
applies_to: architecture_decision
topic: food_and_beverage_mode_full_service_restaurant
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

## Recipe-Driven Kitchen Orders Addendum (2026-05-15)

F&B checkout uses restaurant-native kitchen/check records, not Food Manufacturing `job_orders`. POS checkout and Storefront checkout may create or link `fnb_checks`, `fnb_check_lines`, and `fnb_kitchen_tickets` in the same transaction that accepts the sale/order. Manufacturing job-order and dispatch-order navigation remains hidden in F&B; mode-sensitive frontend navigation and guarded routes must fail closed until the tenant's active `ops_workflow_mode` is resolved so stale settings or the Food Manufacturing default cannot briefly expose Job Orders or Dispatch Orders in an F&B tenant. Any future make-ahead prep or batch workflow must be introduced as a separate F&B prep decision instead of automatically creating manufacturing production orders for every menu sale.

F&B menu recipes continue to use `product_composition`. POS and Storefront quote/checkout must run the same recipe preflight for stock-bearing menu lines: expand recipe components, scale by ordered quantity, convert only compatible UOM groups, check the selected/operating location's ingredient availability, and fail before order creation when any ingredient is short. Failure details must identify the menu item, ingredient, available quantity, required quantity, UOM, location, and blocker reason so cashier and customer-facing flows can explain why checkout cannot proceed.

Inventory movement remains location-scoped FIFO. Recipe-backed menu sales consume ingredient stock as `goods_issue` movements; stock-bearing lines without recipes continue to consume the sold item. Offline POS terminal checkout deducts central inventory only after replay reaches the backend and the shared POS checkout use case commits successfully. Online Storefront checkout may validate and snapshot recipe/kitchen context when the order is accepted; recipe-aware stock deduction happens on online order completion/fulfillment through the POS online-order completion path, not merely because a customer submitted an order. Online Storefront order completion must use the same recipe-aware consumption path rather than deducting only the sold menu item. Idempotency hashes and offline/online replay inputs must include recipe-relevant customer line data and modifier snapshots, but must not depend on current recipe stock balances so a valid retry can replay after stock is depleted or the recipe is edited. Kitchen ticket snapshots preserve the recipe movements used for operational audit. Existing F&B checks must not receive duplicate check-line rows or duplicate active kitchen tickets during payment checkout; Storefront kitchen-order creation must also reuse any existing non-cancelled ticket for the accepted `pos_transaction_id` if the helper is called again outside the normal checkout replay path. The kitchen ticket lifecycle remains separate from payment and inventory movement, but ticket progress must keep operational check-line statuses in sync (`sent`, `preparing`, `ready`, `served`) so the kitchen queue and check view do not drift.

The F&B kitchen queue UI must expose enough operational context for staff to act on checkout-owned tickets: source (`POS`, `Online`, or restaurant check), station, check number, ticket status, line quantity/name previews, and whether recipe ingredient movements are attached to the ticket snapshot. This is display/audit context only; it must not recompute inventory or mutate payment state from the queue.

## Validation

- Run `npm run qa:fnb-readiness` before final F&B readiness ratings; ratings are preliminary when this gate is not run.
- Run `npm run check:architecture`.
- Run `npm run lint:docs`.
- Run tenant provisioning/model-factory coverage for all tenant-local F&B tables and shared tables that now reference F&B. Fresh tenant approval must create the complete schema, including POS transaction references to F&B checks/tables, and failed provisioning must restore a retryable landlord status.
- Add backend tests for F&B workflow capabilities, guarded use-case transitions, service-charge settings, modifier validation, and POS F&B metadata snapshotting.
- Add frontend tests for F&B mode registry parity, route visibility, navigation visibility, POS context payloads, and Storefront pin labels.
- Keep regression coverage for `food_manufacturing`, `services`, `msme`, POS/Storefront source separation, Customer Access Mode, Inventory Display, and DGFY convenience fee behavior.

## Item Taxonomy And UOM Addendum (2026-05-06)

F&B item creation uses restaurant-native presets while preserving shared item primitives:

- `Menu Item` maps to `items.category = product`, `product_type = finished_goods`, defaults to `serving`, and is recipe/menu oriented. It is not automatically converted to ingredient weight or volume.
- `Ingredient` maps to `category = raw_material`, defaults to `kg`, and uses convertible weight/volume/count UOMs for recipe and FIFO deduction.
- `Packaged Beverage / Retail Item` maps to `category = product`, `product_type = finished_goods`, defaults to `bottle`, and uses packaging/count/volume UOMs.
- `Packaging / To-go Supply` maps to `category = packaging`, defaults to `pcs`, and uses count/packaging UOMs.
- New F&B item rows persist `items.mode_item_preset` (`menu_item`, `ingredient`, `packaged_beverage`, or `packaging_supply`) so menu-vs-packaged-product subtype semantics do not depend on UOM inference alone. Existing rows without this value remain editable through inferred display until the operator selects a corrected preset.
- New non-draft rows and draft finalization must match one of the F&B presets. Legacy rows remain editable without destructive recategorization until the operator changes category, product type, or UOM.

## Price And Cost Addendum (2026-05-07)

F&B item financial behavior follows restaurant-native presets:

- `Menu Item` rows show both recipe/menu cost and `default_sale_price` in IMS create, edit, summary, and detail views. Menu POS and Storefront sale flows require a positive `default_sale_price`.
- `Packaged Beverage / Retail Item` rows show cost and selling price because they are direct sellable stock-bearing items.
- `Ingredient` and `Packaging / To-go Supply` rows show cost for inventory valuation. They show and require selling price only if explicitly enabled for POS or Storefront.
- Modifier deltas may add to the menu item sale price, but the base menu item must still have an explicit `default_sale_price`; Storefront and POS must not use item cost as the base customer price.

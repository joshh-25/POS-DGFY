---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-05-06
applies_to: fnb_mode
topic: food_and_beverage
---

# Food & Beverage Mode

Food & Beverage Mode (`fnb`) is the restaurant workflow mode. It is labeled `Food & Beverage` and targets full-service dine-in restaurants first, with takeout, pickup, delivery, and order-ahead supported through shared POS/Storefront order methods.

## Operator Workflow

- IMS exposes a mode-native F&B console for menu modifiers, selectable menu-item modifier assignments, item-to-kitchen routing, dining areas and tables, kitchen stations, open checks, visual line split, check merge/transfer, multi-table reservation schedules, restaurant service-charge settings, and reports.
- POS supports restaurant context through table, open-check, guest-count, server, course, modifier, kitchen-station, and restaurant-service-charge snapshots. POS modifier selections are validated against the item modifier assignments and active modifier options; caller-provided modifier price deltas are not trusted. POS can override a line kitchen station from active F&B stations before checkout.
- Storefront exposes restaurant menu browsing through the shared catalog endpoint with additive `fnb_modifier_groups`, `allergens`, and `nutrition` fields. Storefront quote/checkout accepts additive `line_modifiers`; the backend validates selected options against the published menu item and computes modifier deltas from database state. Storefront reservation and map components are lazy-loaded so public catalog first load is not coupled to the restaurant reservation panel or MapLibre runtime.
- Storefront exposes a public F&B reservation request endpoint at `/api/v1/store/fnb/reservations`, guarded to F&B tenants and stored with `source=storefront`. Admin/POS reservation handling validates assigned table IDs and can filter schedules by status, table, and date range.
- Reservation scheduling uses an explicit seating duration and reset buffer. Defaults are `90` duration minutes plus `15` buffer minutes, matching common full-service turn-time practice; requested/waitlisted reservations do not block capacity, while confirmed/seated reservations cannot overlap another confirmed/seated booking on any assigned table. Combined-table reservations store every table assignment and reject party sizes that exceed the selected seats.
- Customer Access Mode and Inventory Display remain separate storefront controls.

## Shared And F&B-Specific Data

F&B reuses shared item and POS primitives where they fit:

- `items`
- `item_allergens`
- `item_nutrition`
- `product_composition`
- `pos_transactions`
- `pos_transaction_lines`

F&B-specific side tables own restaurant-only concepts:

- `fnb_modifier_groups`, `fnb_modifier_options`, `fnb_item_modifier_groups`
- `fnb_dining_areas`, `fnb_dining_tables`
- `fnb_kitchen_stations`, `fnb_item_kitchen_routes`
- `fnb_checks`, `fnb_check_lines`, `fnb_kitchen_tickets`
- `fnb_reservation_requests` with requested time, duration, reset buffer, primary table shortcut, source, and guarded status
- `fnb_reservation_tables` for combined-table assignments and overlap/capacity checks
- `fnb_restaurant_service_charge_snapshots`

## Charge Boundary

Restaurant service charge is optional and separate from the DGFY convenience fee. Use F&B service-charge fields and snapshots for restaurant service charge. Do not reuse `service_fee_amount`, which remains the DGFY convenience fee contract. When the F&B service-charge setting is marked taxable, POS includes the restaurant service charge in the VATable gross calculation while leaving DGFY convenience fee VAT behavior unchanged.

## Menu Inventory

F&B menu items may keep recipe/ingredient definitions in `product_composition`. During F&B POS checkout, items with ingredient compositions deduct ingredient stock as `goods_issue` movements for POS reference instead of deducting only the sold menu item. Those deductions must use the operating location's FIFO batches and update the same location's stock ledger. Non-F&B POS checkout and F&B menu items without a recipe continue to deduct the sold item through the same location-scoped FIFO path when the sold item is stock-bearing.

Recipe availability preflight is location-scoped. The composition lookup receives the enforced POS checkout location, checks ingredient quantity against that location's `item_location_stocks` balance when the location-stock schema is available, and then commits deductions through the central stock movement service so location stock and FIFO consumption stay paired.

Recipe composition validation applies only to stock-bearing sold items. Pure service rows are stock-exempt and do not validate or deduct accidental recipe-composition rows; physical add-ons, retail products, consumables, kits, or supplies sold alongside a service must be represented as separate stock-bearing lines so they still use location-scoped FIFO.

Restaurant-only workflow records do not affect FIFO by themselves. Reservations, table status, open checks, kitchen tickets, modifiers, discounts, fees, and restaurant service-charge snapshots are stock-neutral unless a checked-out line maps to stock-bearing ingredients or items.

## Mode Guards

F&B-only APIs are guarded by `fnbDining`. Manufacturing production routes remain denied in F&B through `productionWorkflows` capability absence, and the frontend hides job-order and dispatch-order navigation while keeping inventory stock movements available.

## Role And Permission Contract

F&B uses the additive mode-aware RBAC contract governed by ADR 0020. Restaurant operator roles are exposed through `GET /api/v1/users/role-catalog` and stored on users with `role_preset_key` while preserving the existing compatibility `role` and granular `permissions` fields.

The current F&B presets are `fnb_admin`, `fnb_restaurant_manager`, `fnb_server`, `fnb_cashier`, `fnb_kitchen_staff`, `fnb_host_reservations`, `fnb_inventory_controller`, and `fnb_viewer`. F&B APIs use mode-native permissions such as `fnb:dashboard:view`, `fnb:menu:view/manage`, `fnb:dining:view/manage`, `fnb:kitchen:view/manage`, `fnb:checks:view/manage`, `fnb:reservations:view/manage`, and `fnb:service_charge:view/manage`.

Assigned-scope operational presets require at least one active location when the tenant has multiple active locations. Services/F&B generic permission fallback is temporary and controlled by `MODE_RBAC_GENERIC_FALLBACK_ENABLED`; new F&B work must add native permissions and tests instead of depending on generic `items:*`, `pos:*`, or manufacturing role labels.

## Validation

Use `npm run check:architecture`, `npm run lint:docs`, backend F&B use-case tests, frontend F&B route/registry tests, and POS checkout metadata tests for changes in this mode.

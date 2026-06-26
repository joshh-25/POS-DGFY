---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-06-26
applies_to: fnb_mode
topic: food_and_beverage
---

# Food & Beverage Mode

Food & Beverage Mode (`fnb`) is the restaurant workflow mode. It is labeled `Food & Beverage` and targets full-service dine-in restaurants first, with takeout, pickup, delivery, and order-ahead supported through shared POS/Storefront order methods.

## Operator Workflow

- IMS exposes a mode-native F&B console for menu modifiers, selectable menu-item modifier assignments, item-to-kitchen routing, dining areas and tables, kitchen stations, open checks, visual line split, check merge/transfer, multi-table reservation schedules, restaurant service-charge settings, and reports.
- POS supports restaurant context through table, open-check, guest-count, server, course, modifier, kitchen-station, and restaurant-service-charge snapshots. POS modifier selections are validated against the item modifier assignments and active modifier options; caller-provided modifier price deltas are not trusted. POS can override a line kitchen station from active F&B stations before checkout. F&B checkout creates or links restaurant-native kitchen/check records when F&B context is present.
- Storefront exposes restaurant menu browsing through the shared catalog endpoint with additive `fnb_modifier_groups`, `allergens`, and `nutrition` fields. Storefront quote/checkout accepts additive `line_modifiers`; the backend validates selected options against the published menu item and computes modifier deltas from database state. Accepted F&B Storefront checkout creates a restaurant-native kitchen/check record in the checkout transaction when recipe or F&B line context is present. Storefront reservation and map components are lazy-loaded so public catalog first load is not coupled to the restaurant reservation panel or MapLibre runtime.
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

F&B menu items may keep recipe/ingredient definitions in `product_composition`. During F&B POS checkout and Storefront accepted order completion, items with ingredient compositions deduct ingredient stock as `goods_issue` movements instead of deducting only the sold menu item. Those deductions must use the operating location's FIFO batches and update the same location's stock ledger. Non-F&B POS checkout and F&B menu items without a recipe continue to deduct the sold item through the same location-scoped FIFO path when the sold item is stock-bearing.

Offline POS terminal checkout uses the same backend checkout path after replay. While the terminal is offline, queued checkout payloads do not decrement central inventory; stock changes occur only when replay reaches the backend successfully and the shared recipe-aware POS checkout use case commits the transaction. Online Storefront checkout validates and snapshots F&B recipe/kitchen context when the order is accepted, then recipe-aware inventory deduction occurs when the online order is completed/fulfilled through the POS online-order completion path.

Recipe availability preflight is location-scoped. The composition lookup receives the enforced POS checkout location or selected Storefront fulfillment location, checks ingredient quantity against that location's `item_location_stocks` balance when the location-stock schema is available, and then commits deductions through the central stock movement service so location stock and FIFO consumption stay paired. Storefront quote and checkout reject recipe ingredient shortfalls before the online order is created; POS checkout rejects the sale before commit. Shortfall responses include a structured reason code, menu item, ingredient, available quantity, requested quantity, UOM, and location.

Recipe composition validation applies only to stock-bearing sold items. Pure service rows are stock-exempt and do not validate or deduct accidental recipe-composition rows; physical add-ons, retail products, consumables, kits, or supplies sold alongside a service must be represented as separate stock-bearing lines so they still use location-scoped FIFO.

Restaurant-only workflow records do not affect FIFO by themselves. Reservations, table status, open checks, kitchen tickets, modifiers, discounts, fees, and restaurant service-charge snapshots are stock-neutral unless a checked-out line maps to stock-bearing ingredients or items.

F&B kitchen orders are restaurant-native. Checkout may create or link `fnb_checks`, `fnb_check_lines`, and `fnb_kitchen_tickets`; it must not expose Food Manufacturing `job_orders` for made-to-order menu sales. New checkout-owned checks can create check lines and a queued ticket. Existing checks are treated as table-service records and checkout must not duplicate their check lines or duplicate an active kitchen ticket during payment. Storefront kitchen-order persistence also guards the accepted `pos_transaction_id` so a retry or helper-level duplicate call reuses the existing non-cancelled ticket instead of opening another kitchen ticket. Make-ahead prep or batch production for sauces, dough, commissary items, or pre-portioned food requires a separate F&B prep workflow decision.

Storefront idempotent replay compares stable customer request inputs, including selected line modifiers, not current recipe stock balances. The accepted kitchen ticket snapshot keeps the recipe movement details used for kitchen and audit visibility.

Kitchen ticket progress updates operational check-line status without changing payment or inventory state. Firing a ticket marks related non-voided lines as `sent`; progressing a ticket to `preparing`, `ready`, or `served` updates the related check-line statuses to match. Cancelling a ticket does not void the check lines by itself.

The F&B kitchen queue shows station, source (`POS`, `Online`, or F&B check), check number, status, line quantity/name previews, and recipe-movement counts from the immutable ticket snapshot. The queue is an operational view over accepted tickets; it does not recompute recipe availability or issue additional stock movements.

## Item Creation Taxonomy

F&B create-item UI and backend validation use restaurant-native presets:

- `Menu Item`: `category=product`, `product_type=finished_goods`, default UOM `serving`, stock-exempt by default unless represented as a stock-bearing sold item. Recipe depletion uses `product_composition` ingredient rows.
- `Ingredient`: `category=raw_material`, default UOM `kg`, stock-bearing, FIFO/location-scoped.
- `Packaged Beverage / Retail Item`: `category=product`, `product_type=finished_goods`, default UOM `bottle`, stock-bearing when sold directly.
- `Packaging / To-go Supply`: `category=packaging`, default UOM `pcs`, stock-bearing.

New F&B rows persist `items.mode_item_preset` with the selected preset key. This is required because `Menu Item` and `Packaged Beverage / Retail Item` can both be `category=product` and `product_type=finished_goods`; the persisted preset preserves restaurant-native intent instead of relying on UOM inference during later edits.

During tenant onboarding, the starter item selector intentionally presents only `Menu Item` for F&B merchants. The submitted and persisted preset remains `menu_item`; the created starter row remains a product item internally and appears as a customer-facing menu item on Storefront/POS surfaces. Ingredients, packaging, and retail beverage/product setup remain available after onboarding in full item management.

F&B accepts valid presentation and packaging UOMs such as `serving`, `portion`, `bottle`, `can`, `pack`, and `case`, but automatic conversion remains limited to weight, volume, and count units. Legacy rows outside the F&B presets remain editable until the operator changes category, product type, mode preset, UOM, or finalizes a draft.

## CSV Import And Export

F&B item CSV import and export share the same restaurant-mode template contract. The F&B template includes `template_workflow_mode=fnb`, template schema/signature marker columns, `mode_item_preset`, and `default_sale_price`. Exports resolve the tenant's active `ops_workflow_mode` when `workflow_mode` is omitted, and exported F&B CSVs are expected to preview-import back into an F&B tenant without header drift.

Exports must preserve the persisted preset key for each restaurant item. In particular, `menu_item`, `ingredient`, `packaged_beverage`, and `packaging_supply` must stay in the `mode_item_preset` column so product rows that share `category=product` and `product_type=finished_goods` do not collapse into the wrong subtype on import.

## Price And Cost Behavior

- Menu Item and Packaged Beverage / Retail Item rows show both Cost and Selling Price in IMS create, edit, wizard summary, item cards, and detail views.
- Ingredients and Packaging / To-go Supply rows show inventory cost. Selling price is shown and required only when the item is explicitly enabled for POS or Storefront.
- Storefront and POS use `default_sale_price` as the base customer price. F&B modifier deltas can add to that base, but missing or zero base price blocks sale readiness.
- F&B recipe, FIFO, weighted-average, and stock-movement costs remain internal valuation/COGS data and are never exposed in public Storefront payloads.

## Product Wizard Contract

F&B product setup uses the shared product wizard but removes Food Manufacturing-only complexity from the restaurant flow. In F&B mode:

- POS Setup / Storefront Catalog setup is step 2 so menu visibility, branch availability, and item images are configured early.
- Physical & Chemical Properties and Quality Control are not shown in the F&B product wizard.
- Saving, saving drafts, finalizing drafts, and updating F&B products clear manufacturing-oriented `physical_properties` and `quality_control` data before persistence. This cleanup applies only to F&B; Food Manufacturing and other non-F&B product modes keep those fields and their existing behavior.
- The wizard keeps F&B restaurant-native fields such as recipes, nutrition, allergens, shelf life, packaging, costing, compliance, and review.
- The shared numbered step navigator is visible for multi-step product setup. Each step is a circular numbered control with active/completed/inactive states, direct navigation, and hover/focus tooltip copy that names the step contents.

## Mode Guards

F&B-only APIs are guarded by `fnbDining`. Manufacturing production routes remain denied in F&B through `productionWorkflows` capability absence, and the frontend hides job-order and dispatch-order navigation while keeping inventory stock movements available.

Frontend mode-sensitive navigation must fail closed until the tenant's active `ops_workflow_mode` is resolved. Job Orders, Dispatch Orders, Services-only, F&B-only, and Hospitality-only sidebar entries must not be rendered from the Food Manufacturing default while settings are loading, stale, or unresolved. Guarded routes such as `/job-orders` and `/dispatch-orders` must also wait for resolved workflow mode before mounting their page components, so a hidden F&B module does not briefly call its backend API and show a generic `403` page. If a stale client still reaches a denied route, the UI should surface the backend workflow-capability denial message instead of replacing it with a generic Axios status string.

## Role And Permission Contract

F&B uses the additive mode-aware RBAC contract governed by ADR 0020. Restaurant operator roles are exposed through `GET /api/v1/users/role-catalog` and stored on users with `role_preset_key` while preserving the existing compatibility `role` and granular `permissions` fields.

The current F&B presets are `fnb_admin`, `fnb_restaurant_manager`, `fnb_server`, `fnb_cashier`, `fnb_kitchen_staff`, `fnb_host_reservations`, `fnb_inventory_controller`, and `fnb_viewer`. F&B APIs use mode-native permissions such as `fnb:dashboard:view`, `fnb:menu:view/manage`, `fnb:dining:view/manage`, `fnb:kitchen:view/manage`, `fnb:checks:view/manage`, `fnb:reservations:view/manage`, and `fnb:service_charge:view/manage`.

Assigned-scope operational presets require at least one active location when the tenant has multiple active locations. Services/F&B generic permission fallback is temporary and controlled by `MODE_RBAC_GENERIC_FALLBACK_ENABLED`; new F&B work must add native permissions and tests instead of depending on generic `items:*`, `pos:*`, or manufacturing role labels.

## Validation

Use `npm run qa:fnb-readiness` before final F&B readiness ratings. The gate runs backend operational QA, POS/Storefront recipe checkout contracts, frontend kitchen/error contracts, production builds, architecture checks, docs lint, and diff hygiene. If the gate is not run, ratings are preliminary; if it fails, production readiness cannot be claimed above controlled-pilot confidence.

For broader release work, also use `npm run check:architecture`, `npm run lint:docs`, backend F&B use-case tests, Storefront recipe quote/checkout tests, online order completion inventory tests, frontend F&B route/registry tests, and POS checkout metadata tests for changes in this mode.

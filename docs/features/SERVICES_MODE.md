---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-05-07
applies_to: services_mode
topic: services_mode
---

# Services Mode

Services Mode (`services`) is the appointment, booking, provider/resource, waitlist, ticket, and client-history workflow mode. It is governed by ADR 0016 and must not inherit manufacturing job-order or dispatch-order language.

## Item Creation Taxonomy

Services create-item UI and backend validation use service-business presets:

- `Service`: `category=service`, default UOM `service`, stock-exempt. Valid UOMs include `service`, `session`, `booking`, and `hour`.
- `Physical Add-on / Product`: `category=product`, `product_type=finished_goods`, default UOM `pcs`, stock-bearing.
- `Supplies`: `category=supplies`, default UOM `pcs`, stock-bearing.

Service-only rows are sellable/bookable through Services POS and Storefront metadata without inventory deduction. Physical add-ons, retail products, consumables, kits, and supplies must be separate stock-bearing rows so location-scoped FIFO remains intact.

New Services rows persist `items.mode_item_preset` with the selected preset key. This keeps service rows distinct from physical add-ons and supplies across edits, CSV imports, POS eligibility, and Storefront catalog behavior.

## Price And Cost Behavior

- Service rows show Selling Price (`default_sale_price`) by default on create, edit, and view because Services POS/Storefront use it as the customer price.
- Service rows hide Cost (`cost_per_unit`) unless the operator enables internal service-cost tracking or the row already has a stored service cost.
- Service rows do not show stock, FIFO, average-cost, location-cost, on-hand value, or stock-movement controls.
- Physical add-ons/products and supplies show inventory cost. Selling price is required only when the row is enabled for POS or Storefront.
- POS and Storefront never use service cost as a fallback sale price.

## Tracking And Reports

Pure service rows are revenue/bookable catalog rows, not inventory rows. They can appear in sales, booking, POS, Storefront, and service-performance reporting, but they must not appear in stock aging, low-stock, surplus/shortage, inventory valuation, weighted-average cost, FIFO batch, or stock-movement reports.

The stock-exempt rule is durable for both `category=service` and `mode_item_preset=service` so corrected-mode and legacy/imported rows are treated consistently. Manual stock movements and transfers must reject pure service rows even if stale stock fields exist. Physical add-ons/products and supplies in Services Mode remain stock-bearing and continue using location-scoped stock, FIFO, cost valuation, and reporting.

## UOM Boundary

Presentation/time units such as `service`, `session`, `booking`, and `hour` are valid Services UOMs but are not automatically convertible into inventory units. Automatic conversion remains limited to weight, volume, and count groups. Packaging units such as `pack` and `case` are valid for physical supplies/add-ons but require explicit item/vendor conversion before stock math can convert them.

## Legacy Behavior

Legacy rows remain editable without destructive recategorization. New non-draft Services rows and draft finalization must match one of the Services presets. If an operator changes category, product type, mode preset, or UOM on a legacy row, the update must satisfy the Services taxonomy.

## Validation

Use `npm run check:architecture`, `npm run lint:docs`, backend Services/use-case and price-policy tests, mode item-taxonomy tests, and frontend item-form/detail contract tests when changing Services item behavior.

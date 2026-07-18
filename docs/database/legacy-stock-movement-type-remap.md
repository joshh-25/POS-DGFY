---
status: authoritative
authority_level: authoritative
owner: database
last_reviewed: 2026-07-14
applies_to: product_inventory_migration
topic: legacy_stock_movement_type_remap
---

# Legacy Stock Movement Type Remap

This document is the reviewed PIM-03 decision record for Phase 13's
`stock_movements` to `inventory_movements` mapper.

`MOVEMENT_TYPE_MAP` in `apps/dgfy-migration-runner/src/data/mappings.js` mirrors
this table and is the executable source of truth for dry-run and apply.

| Decision | Legacy `stock_movements.movement_type` | Target `inventory_movements.movement_type` | Rationale |
|---|---|---|---|
| D-01 | `purchase_receipt` | `restock` | Purchase receipts add physical stock. |
| D-02 | `calculated_loss` | `loss` | Calculated loss is inventory shrinkage. |
| D-03 | `adjustment` | `adjustment` | Direct semantic match. |
| D-04 | `goods_issue` | `sale` | Goods issue is the legacy stock-out sale-like effect. |
| D-05 | `return` | `restock` | Returned goods physically come back into stock. |
| D-06 | `production_consumption` | `adjustment` | Productive material use, not shrinkage; manufacturing-specific semantics are deferred. |
| D-07 | `production_output` | `adjustment` | Productive manufacturing output; manufacturing-specific semantics are deferred. |
| D-08 | `transfer` | no row + `LOSSY_CATEGORY_COLLAPSE` finding | The target schema has no location dimension, so a transfer has no honest target representation. |

## Transfer Collapse Rule

`transfer` rows are not inserted into `inventory_movements`. The mapper returns a
skip-style result with reason code `lossy_category_collapse` so reports can show
the reviewed data loss explicitly.

The target schema has one scalar product balance and append-only movement rows,
but no `location_id`, source location, destination location, or transfer
movement type. Inserting a net-zero or fake `adjustment` row would add an audit
record that does not mean anything in the new model.

## Production Movement Rule

`production_consumption` and `production_output` map to `adjustment` rather than
`loss`.

Consumption and output are productive manufacturing effects, not shrinkage.
Phase 13 intentionally defers the raw-material versus finished-good
manufacturing distinction instead of inventing target semantics that the current
DGFY product and inventory schema does not model.

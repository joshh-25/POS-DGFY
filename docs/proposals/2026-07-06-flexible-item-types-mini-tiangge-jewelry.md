---
status: proposal
authority_level: reference
owner: engineering
last_reviewed: 2026-07-06
applies_to: inventory,item_taxonomy,pos,onboarding
topic: flexible_item_types_mini_tiangge_jewelry
---

# Flexible Item Types: Mini Tiangge (pack-to-unit) and Jewelry (serialized identity)

**Status: not implemented.** This is a design write-up capturing groundwork already gathered while
investigating the Service-mode Starter Item bug (see `docs/proposals/` neighboring dated entries /
the fix that shipped alongside this doc). It exists so the investigation isn't lost before someone
picks this up.

## Context

DGFY's IMS models business flexibility through a `workflow_mode` tenant setting (`retail`, `services`,
`fnb`, `msme`, etc. — `backend/src/modules/shared/constants/workflowModes.js`) paired with a per-mode
item taxonomy (`backend/src/modules/shared/constants/modeItemTaxonomy.js`, mirrored in
`frontend/src/features/settings/modeItemTaxonomy.js`). Each mode declares a list of item "presets"
(category, product_type, allowed units, stock_behavior, financial visibility) via a `preset()` /
`taxonomy()` builder pattern. This already covers "Finished Goods" (food/manufacturing) and "Services"
(stock-exempt `category: 'service'`) well.

Two additional item shapes were requested and do not fit the current model:

1. **"Mini Tiangge" items** — e.g. a pack of 10 Chippy/Nutri-Star/Jelly Ace, received/purchased as one
   pack but sold one piece at a time via POS. Wanted: real pack-to-unit stock conversion — receive
   stock in pack units, track it internally as N individual sellable base units, decrement 1 at a time
   per sale.
2. **Jewelry items** — one-of-a-kind or small-quantity physical goods (one necklace, or two of the same
   design) needing **per-piece identity** (a serial/identifier per individual physical unit), not just
   an aggregate quantity count.

## Mini Tiangge: pack-to-unit stock conversion

**What exists today:**
- `current_stock` on `Item` (`backend/src/models/Item.js`) is an aggregate DECIMAL count in the item's
  base `unit_of_measure`.
- The `packaging` UOM group in `backend/src/utils/uomConverter.js` (pack/case/carton/box/...) is
  explicitly `convertible: false` — there is no generic "1 case = N pcs" conversion at the item level.
- The closest existing prior art is `ItemBarcode.packaging_level` + `ItemBarcode.quantity_multiplier`
  (`backend/src/models/ItemBarcode.js`), already used at **POS-sale-scan time**
  (`backend/src/modules/pos/usecases/posUseCases.js:3478`): scanning a barcode whose
  `packaging_level: 'case'` and `quantity_multiplier: 10` sells 10 base units in one line. This proves
  the multiplier concept works but only on the *selling* side.
- Nothing wires this into the *receiving* side — Purchase Order receiving, manual stock
  adjustments/`StockMovement` creation, CSV import, and the onboarding Starter Item flow all write
  `current_stock` / quantities directly in base units today.

**Recommended direction:**
- Reuse `ItemBarcode.packaging_level` + `quantity_multiplier` as the single authoritative conversion
  factor for "how many base units are in a pack," rather than adding a second, competing conversion
  field on `Item` itself.
- Extend the receiving/adjustment entry points (Purchase Order goods receipt, manual stock adjustment
  UI, CSV import) to let the user enter a quantity in pack units against a specific packaging-level
  barcode, converting to base units before writing to `current_stock` / `ItemLocationStock.quantity_on_hand`
  / `StockMovement.quantity`. The stock ledger should keep recording in base units so FIFO/audit-trail
  semantics don't change.
- Add a corresponding preset (or presets) under `msme`/`retail` in `modeItemTaxonomy.js` using the
  existing `preset()`/`taxonomy()` builders, so a Mini Tiangge item's default unit/category surfaces
  correctly in `ItemFormModal.jsx` and onboarding.

**Open questions for whoever picks this up:**
- Should the pack-size conversion factor live per-barcode (as today) or should there also be a
  simpler "default pack size" directly on the item for tenants that don't want to manage barcodes at
  all?
- Does Purchase Order receiving need a UI concept of "receive N cases" distinct from "receive N units,"
  or is scanning the case barcode at receiving time sufficient?

## Jewelry: per-piece serialized identity

**What exists today:**
- No per-physical-unit tracking exists anywhere. `current_stock` is an aggregate count.
  `ItemBarcode` maps a barcode to an item *type* generically (with a quantity multiplier for pack
  sizes), not to one specific physical unit.

**Recommended direction:**
- Add a new `ItemUnit` (or `ItemSerial`) table: `unit_id`, `item_id`, `serial_or_identifier`,
  `status` (`in_stock` / `sold` / `reserved` / `returned`), `location_id`, timestamps — coexisting
  with `current_stock` rather than replacing it. `current_stock` stays the fast aggregate count,
  kept in sync as a derived value from the count of `in_stock` units whenever an item is serialized.
- Decide whether each serialized unit gets its own `ItemBarcode` row (`packaging_level: 'unit'`,
  `quantity_multiplier: 1`) so existing barcode-scan infrastructure can resolve a specific unit, or
  whether a lighter-weight identifier scheme (not full barcode records) is more appropriate given the
  volume is expected to be low (one-of-a-kind pieces, not bulk SKUs).
- POS sale needs to decrement a *specific* serialized unit (mark it `sold`) rather than a generic
  quantity decrement — this changes the POS line-item resolution path, not just the inventory model.
- Add corresponding preset(s) to `modeItemTaxonomy.js` (likely under `msme` or a new mode), scoped to
  data model + minimal wiring — not a full UI redesign.

**This is the larger and riskier of the two changes** (new table, new POS sale-path branching, UI for
assigning/viewing serials) and should be scoped as its own follow-up plan rather than bundled with
Mini Tiangge.

## Explicitly out of scope for this doc

- No code changes are included here. This is a design reference only.
- Whether "Jewelry" and "Mini Tiangge" become dedicated `workflow_mode` values or stay presets within
  `msme`/`retail` is an open product decision, not resolved by this doc.

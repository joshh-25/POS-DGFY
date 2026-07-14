# Legacy Product Attributes Folding Design

**Phase:** 12 — Scope Unblock + Schema Extension (Plan 12-02, LDM-02 deliverable)
**Status:** Committed design contract — written BEFORE any Phase 13 mapper code.
**Reader:** Phase 13's `items` → `products` mapper (PIM-02) reads this doc as its written contract for populating `products.attributes`.

## Purpose

This phase (Phase 12) only **reserves** the `products.attributes` JSON column (added by
`apps/dgfy-migration-runner/src/migrations/schema/20260716100000-extend-schema-for-legacy-migration.cjs`).
It contains **no mapper/resolution logic**. This document records the shape that
column's data will take once Phase 13 populates it, so the container's design is
locked and reviewed before any mapper code is written (LDM-02's explicit
design-doc requirement).

## Source: legacy satellite tables

Legacy `backend/src/models/index.js` (lines 242-260) enumerates the `Item`
associations that fold into `attributes`:

```js
Item.hasOne(ItemNutrition, { foreignKey: 'item_id', as: 'nutrition' });
Item.hasMany(ItemAllergen, { foreignKey: 'item_id', as: 'allergens' });
Item.hasOne(ItemPhysicalProperties, { foreignKey: 'item_id', as: 'physicalProperties' });
Item.hasOne(ItemShelfLife, { foreignKey: 'item_id', as: 'shelfLife' });
Item.hasOne(ItemPackaging, { foreignKey: 'item_id', as: 'packaging' });
Item.hasOne(ItemQualityControl, { foreignKey: 'item_id', as: 'qualityControl' });
Item.hasOne(ItemRegulatoryCompliance, { foreignKey: 'item_id', as: 'regulatoryCompliance' });
Item.hasOne(ItemCostBreakdown, { foreignKey: 'item_id', as: 'costBreakdown' });
Item.hasMany(ProductComposition, { foreignKey: 'product_id', as: 'productCompositions' });
Item.hasMany(ProductComposition, { foreignKey: 'ingredient_id', as: 'ingredientCompositions' });
Item.hasMany(ItemBarcode, { foreignKey: 'item_id', as: 'barcodes' });
```

(`item_embeddings` and `item_location_stocks` are NOT part of this fold — embeddings
migrate to the new `product_embeddings` table, per LDM-03; `item_location_stocks`
mapping target is a separate, still-open Phase 13 planning decision.)

## D-01: BOM/composition IS in scope

`ProductComposition` (legacy Bill-of-Materials data — nested-recipe ingredient
lines) **IS in scope for migration**. This was already locked by PIM-02's
requirement text; the only question this phase resolved was representation
shape (see D-02 below), not whether BOM migrates at all.

## D-03: Namespace → cardinality table

The satellite tables fold into `products.attributes` JSON **namespaced by
domain** — one key per legacy satellite table. A flat merged object was
rejected (field-name collision risk across satellites, harder to trace
provenance back to the source table).

| `attributes` key | Cardinality | Legacy source | Shape |
|---|---|---|---|
| `nutrition` | 1:1 | `ItemNutrition` | object |
| `physicalProperties` | 1:1 | `ItemPhysicalProperties` | object |
| `shelfLife` | 1:1 | `ItemShelfLife` | object |
| `packaging` | 1:1 | `ItemPackaging` | object |
| `qualityControl` | 1:1 | `ItemQualityControl` | object |
| `compliance` | 1:1 | `ItemRegulatoryCompliance` | object |
| `costBreakdown` | 1:1 | `ItemCostBreakdown` | object |
| `allergens` | 1:many | `ItemAllergen` | array |
| `barcodes` | 1:many | `ItemBarcode` | array — always an array, even for a single-barcode item (matches the Phase 13 criterion for multi-`ItemBarcode` items) |
| `composition` | 1:many | `ProductComposition` (as `productCompositions` — this item as the finished product/parent; BOM lines) | array |

Note: `attributes.compliance` sources from legacy's `regulatoryCompliance`
association alias — the JSON key is renamed for the new schema's naming
convention, but the source table is unchanged.

## D-04: Omit-key-when-absent rule

When a legacy item has **no row** in a given satellite table, the mapper
**OMITS that key entirely** from `attributes` — it does NOT write `null` or
`{}` for that key. This means "key present" unambiguously signals "legacy had
this satellite row" for that item; a consumer checking
`Object.hasOwn(product.attributes, 'nutrition')` (or equivalent) can
distinguish "no nutrition data" from "nutrition data present but empty."

This applies uniformly to both 1:1 object keys (e.g. no `ItemQualityControl`
row → no `qualityControl` key) and 1:many array keys (e.g. an item is
allowed to have zero `barcodes`, but if it never had any, the mapper still
follows the general omission rule for consistency — see Phase 13 mapper spec
for the exact zero-vs-absent handling nuance per key, which is a mapper
implementation detail, not a schema design decision this doc needs to
pre-resolve).

## D-02: Composition ingredient resolution — Phase 13 concern, NOT this phase

`attributes.composition` entries resolve their ingredient to the ingredient's
**migrated `products.id`** via `legacy_id_map` — not a self-contained
name/quantity snapshot. Each composition entry references the *migrated*
target row, not a frozen copy of legacy ingredient data. A composition entry
whose ingredient hasn't migrated yet (e.g. migration ordering issue, or the
ingredient was filtered/rejected) causes the mapper to log a `finding` rather
than fail the whole item's migration.

**This phase (Phase 12) contains NO resolution logic whatsoever.** It only
reserves the `attributes` JSON container on `products`. The `legacy_id_map`
lookup, the `finding`-logging behavior, and any dependency-ordering concerns
for composition entries are entirely Phase 13's mapper/PIM-02 responsibility.

## Design contract summary for Phase 13's mapper

1. Read the 10 namespace keys above (7 objects + 3 arrays) from the legacy
   `Item`'s eager-loaded satellite associations.
2. For each key: if the corresponding legacy association exists (non-null for
   1:1, non-empty for 1:many where applicable — see D-04), include it under
   that key in `attributes`; otherwise, omit the key.
3. For `composition` entries specifically: resolve `ingredient_id` through
   `legacy_id_map` to the migrated `products.id`; log a `finding` for any
   unresolved ingredient reference. This step (and only this step) is out of
   this phase's scope — recorded here as the written contract Phase 13 reads
   before writing its resolution logic.
4. `barcodes` is always an array in the output shape, regardless of how many
   `ItemBarcode` rows the legacy item has.

## Related schema artifacts (this phase)

- `apps/dgfy-migration-runner/src/migrations/schema/20260716100000-extend-schema-for-legacy-migration.cjs` — adds the `attributes` JSON column (nullable) to `products`.
- `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` — declares `attributes` in the `products.columns` contract entry so `verify` can confirm the column exists.

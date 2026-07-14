---
status: accepted
date: 2026-06-26
last_reviewed: 2026-07-14
classification: authoritative
---

# ADR 0029: Catalog, Inventory, POS, and Storefront Ownership Boundaries

## Context

The system already operates as a modular monolith with separate IMS, POS, and
Storefront surfaces, but product identity, stock effects, sales execution, and
public commerce presentation historically shared tables and compatibility
services. Future work needs one explicit ownership rule so new features do not
let POS or Storefront own stock truth or product identity.

This is a cross-boundary contract across Catalog, Inventory, POS, Storefront,
sales reporting, checkout, purchase receiving, dispatch, job orders, and public
catalog behavior. It follows `docs/START_HERE.md`,
`docs/architecture/ARCHITECTURE_BOUNDARIES.md`,
`docs/architecture/ARCHITECTURE_GOVERNANCE.md`, ADR 0009, ADR 0010, and ADR
0017.

## Decision

Adopt these ownership boundaries:

1. Inventory owns stock truth: `stock_movements`, `item_location_stocks`,
   location-scoped FIFO batches, transfers, receiving, adjustments, losses, and
   valuation.
2. Catalog owns item identity: products/items, SKUs, barcode identity, variants,
   units of measure, categories, and base sale price data.
3. POS owns sales execution: POS transaction headers/lines, payments, receipts,
   cashier or terminal sessions, discounts, and void/return lifecycle.
4. Storefront owns public commerce presentation: public business page,
   customer-facing item visibility, quote/order flow, customer availability
   presentation, and map/discovery behavior.

The core rule is:

```text
POS and Storefront may request stock effects.
Only Inventory records stock effects and updates stock balances.
```

## Current Compatibility Decisions

1. The physical `items` table remains unchanged in this phase. Catalog ownership
   is introduced through module boundaries and repository facades before any
   schema split is considered. ("This phase" refers to the phase this ADR was
   written for; superseded by the v2.1 milestone amendment below, which reads
   `items` data into new `dgfy_business_*.products` rows without mutating the
   legacy table.)
2. `items.current_stock` remains a derived compatibility aggregate. Stock truth
   is `item_location_stocks` plus `stock_movements`, with FIFO batches carrying
   batch age, cost, and expiry evidence.
3. Online Storefront orders remain stored in `pos_transactions` for v1
   compatibility and unified sales reporting. This table is treated as the
   unified sales transaction ledger for current behavior, not proof that POS
   owns Storefront. (Superseded for migration purposes by the v2.1 milestone
   amendment below: `pos_transactions` sales history is additionally migrated
   into `availments` starting Phase 14; the legacy table itself is untouched.)
4. Stock reservations are intentionally out of scope for this phase. If online
   order placement must reserve stock before fulfillment, a separate ADR must
   define reservation state, expiry, commit, release, and available-to-sell
   semantics.

## Boundary Rules

1. POS must not directly update `item_location_stocks`, `fifo_batches`, or
   `items.current_stock`. POS sale, void, and online fulfillment flows must call
   Inventory stock commands.
2. Storefront must not directly update stock balances. Storefront checkout may
   validate availability, but deduction remains an Inventory-owned stock effect
   through the existing fulfillment/completion flow.
3. `pos_catalog_overrides.pos_visible` is POS-only.
4. `storefront_catalog_overrides.storefront_visible` is Storefront-only.
5. `default_sale_price` is Catalog/base sale data used by POS, Storefront,
   Dispatch, and future sale surfaces. Customer-facing sale flows must not fall
   back to `cost_per_unit`.
6. `cost_per_unit`, FIFO batch cost, weighted average cost, and valuation remain
   internal Inventory/accounting data and must not be exposed by public
   Storefront responses.
7. Barcode resolution identifies scan context only. Stock eligibility, POS
   eligibility, Storefront visibility, location grants, and compliance rules
   continue to run in their owning use cases.
8. `pos_catalog_overrides.pos_always_available` is a POS sales-execution
   exemption, independent from `pos_visible` and every Storefront visibility
   setting. Checkout snapshots `stock_effect_type='stock_exempt'` and
   `stock_exempt_reason='pos_always_available'` for these lines and must not ask
   Inventory to create a stock movement. All other product lines continue to
   use Inventory-owned stock validation and movement commands.

## Rollout Policy

1. Keep external API paths and response shapes stable during this alignment
   phase.
2. Use additive module facades and command adapters before removing legacy
   service paths.
3. Do not introduce destructive migrations, table renames, or schema splits in
   this phase. (Remains literally true under the v2.1 milestone amendment
   below: that work is purely additive — new columns and a new table in
   `dgfy_business_*` schemas — with no destructive migration, rename, or split
   of any legacy or existing `dgfy_*` table.)
4. Architecture allowlist entries should shrink when use cases stop importing
   legacy services directly.
5. Reporting and advisory analytics cleanup happens after boundary tests protect
   the operational stock and sales flows.

## Validation

Required proof for boundary changes:

1. `npm run check:architecture`
2. `npm run check:controller-boundaries`
3. `npm run check:architecture-guardrails`
4. `npm run lint:docs`
5. Targeted backend tests proving POS/Storefront visibility separation,
   Inventory command usage for stock effects, and public cost/stock redaction.

Frontend proof is required only when a slice changes rendered IMS, POS, or
Storefront behavior.

## Amendment (v2.1 Legacy Data Migration, 2026-07)

The v2.1 Legacy Data Migration milestone begins migrating legacy Catalog,
Inventory, and POS sales-history data that this ADR's original Compatibility
Decisions treated as untouched for the duration of the (now-superseded)
alignment phase:

1. Legacy `items` data is migrated into `dgfy_business_*.products` starting
   Phase 13 (LDM-01, LDM-02) via a new mapper following the existing
   `mappings.js` pattern. The legacy `items` table itself is not mutated —
   the migration reads it and writes new rows into the new schema.
2. Legacy `stock_movements` data is migrated into
   `dgfy_business_*.inventory_movements` starting Phase 13, following the same
   additive, read-only-of-legacy pattern.
3. Legacy `pos_transactions` sales history is migrated into
   `dgfy_business_*.availments`, with a new `source_system` provenance field,
   starting Phase 14. `pos_transaction_lines` remains out of scope until that
   same phase.

This amendment does not change the ownership boundaries or Boundary Rules
above — Inventory still owns stock truth, Catalog still owns item identity,
and POS still owns sales execution in the *live, operational* sense. It only
records that the *historical* data underlying those domains now has an
approved, additive migration path into the new `dgfy_*` schema, so the
Compatibility Decisions' "in this phase" framing (written for a different,
now-completed phase) no longer describes these three tables as permanently
excluded from migration. See `docs/database/dgfy-data-migration-map.md` §10
for the mirrored exclusion-list update.

`status: accepted` is preserved; this is an amendment, not a revision of the
original decision history.

---
status: proposed
date: 2026-07-25
last_reviewed: 2026-07-25
classification: authoritative
---

# ADR 0037: Unified Product Domain and Capability-Driven Store Types

## Context

The platform began food/restaurant-centric and now must sell across three
product domains from one system: **food** (orderable menu items with add-ons),
**services** (bookable labor such as computer/TV/motorcycle repair), and
**retail** (packaged goods, per-kilogram raw goods, water refill, packs sold by
the piece). A single store can be a *mix*: a repair shop that, in one
transaction, charges labor **and** sells the replaced CPU / oil / chain.

Much of this is already true in the live legacy backend, and this ADR ratifies
that direction rather than replacing it:

1. There is already **one universal product table** — `backend/src/models/Item.js`
   (`items`) — discriminated by `category` (`raw_material`, `packaging`,
   `product`, `supplies`, `service`), `product_type`, and `mode_item_preset`,
   resolved through the per-mode `MODE_ITEM_TAXONOMY`
   (`backend/src/modules/shared/constants/modeItemTaxonomy.js`). There is no
   per-domain product table, and this ADR forbids adding one.
2. **Mixed baskets already work mechanically.** Each POS line
   (`backend/src/models/PosTransactionLine.js`) carries `stock_effect_type`
   (`inventory_issue` vs `stock_exempt`); `backend/src/modules/pos/usecases/posUseCases.js`
   issues inventory for stock-bearing lines and skips it for stock-exempt
   service lines within one `pos_transactions` row. A labor line and a parts
   line already coexist in a single sale.
3. A **mature Services Mode** (ADR 0016) already does advance booking end to end:
   availability engine, holds, waitlists, resources/technicians, reminders, and
   a storefront booking flow (`backend/src/modules/services/`,
   `frontend/apps/store/src/modes/services/`).

The gaps that make this an architecture decision rather than a code change:

- **Store type is a single, exclusive `ops_workflow_mode`** per tenant (11 modes,
  `DEFAULT_WORKFLOW_MODE='food_manufacturing'`,
  `backend/src/modules/shared/constants/workflowModes.js`). There is no
  composed/mixed store, even though the basket mechanics allow one.
- **The POS is food-hardcoded**: `order_method` defaults to `dine_in` and the
  order-method control in `frontend/src/features/pos/components/POSCheckoutTerminal.jsx`
  is a static Dine-In/Takeout/Pickup/Delivery/Appointment `<select>` not derived
  from the tenant's actual capabilities.
- **`retail` is a placeholder taxonomy** — it is absent from `MODE_ITEM_TAXONOMY`,
  so `validateItemAgainstModeTaxonomy` returns `skipped: 'placeholder_mode'`
  and retail items are unvalidated. There are no presets for per-kilogram
  weighed goods, refill stations, or pack-to-unit.
- **Add-ons are F&B-only** (`fnb_modifier_groups` / `fnb_modifier_options` /
  `fnb_item_modifier_groups`), gated by `fnb` mode and not attachable to service
  or retail items.
- **Booking is siloed** in Services Mode and not wired to add consumed parts to
  the same sale at fulfillment time.

This ADR governs the **`backend/` + `frontend/`** product system. `backend/` is
being mechanically relocated (and rewritten) into `apps/*` on a separate branch;
that relocation is not a competing product model, and this ADR governs the
backend wherever it lands — it does not read or reference the in-progress
relocation while it is mid-rewrite. Detailed design and the phased roadmap live
in `docs/features/UNIFIED_PRODUCT_DOMAIN.md`.

## Decision

1. **One universal product entity across all domains.** `items` remains the
   single product table. Domain is expressed by `category` + `mode_item_preset`
   resolved through `MODE_ITEM_TAXONOMY`. No per-domain product table
   (`menu_items`, `service_products`, `retail_products`, etc.) may be introduced.
   All selling flows through `pos_transactions` / `pos_transaction_lines`, and
   per-line `stock_effect_type` is the mechanism that makes a basket dynamic
   (labor + parts + food together).

2. **Store type evolves from one exclusive mode to composed sell-domain
   capabilities.** A tenant declares a set of sell-domains — `sell_food`,
   `sell_services`, `sell_retail` — layered on the existing
   `WORKFLOW_MODE_CAPABILITIES` shape (`workflowModes.js`). The primary surface
   is a composite/`mixed` configuration whose effective item taxonomy is the
   **union** of the enabled domains' presets; an additive `enabled_capabilities`
   setting is the extensible mechanism. Existing single-mode tenants are
   unchanged (their mode maps to exactly one sell-domain). Changing the store's
   capabilities stays **master-admin gated**, exactly like today's
   `ops_workflow_mode` setting.

3. **The POS is capability-driven, not food-hardcoded.** The `order_method`
   options and the mode panels selected in
   `frontend/src/features/pos/pages/PosPageShell.jsx` derive from the tenant's
   enabled capabilities. A store without `sell_food` never defaults to or shows
   `Dine In`. The default `order_method` is derived from enabled capabilities,
   not the literal `dine_in` constant.

4. **Labor is a catalog service line.** A labor charge is a `category='service'`,
   stock-exempt `items` row sold as a normal line (already supported and
   preserved for tax/reporting correctness). A lightweight ad-hoc/custom
   one-off line with no catalog item is **deferred** and out of scope here; if
   later adopted it must still carry a `stock_effect_type` and tax treatment.

5. **Add-ons/modifiers are promoted to a domain-neutral model.** The existing
   `fnb_modifier_*` tables are de-gated from `fnb`-only so a modifier group can
   attach to any `items` row regardless of `category`. The per-line modifier
   snapshot (`fnb_modifiers_snapshot`) is treated as a generic
   `modifiers_snapshot`. `FnbModifierOption.sku_item_id` (modifier → real stock
   item) is the reuse path for an add-on that depletes inventory (extra rice /
   egg / water for food; an add-on replacement part for a service); its stock
   effect flows through the same per-line `stock_effect_type` path. A physical
   table rename is optional and deferred behind a facade to avoid a destructive
   migration.

6. **Retail becomes a first-class corrected taxonomy.** `retail` (and the shared
   `msme`) gain real presets in `MODE_ITEM_TAXONOMY`: `retail_good`
   (stock-bearing), `weighed_good` (per-kilogram), `refill_good`/`refill_service`
   (water station), and a pack-to-unit ("mini tiangge") shape. Per-kilogram
   reuses the `weight` UOM group in `backend/src/utils/uomConverter.js` with
   `DECIMAL(24,12)` fractional quantities (price = unit price × fractional kg);
   no pricing table is added. Pack-to-unit reuses
   `ItemBarcode.packaging_level` + `quantity_multiplier` as the single
   conversion factor and extends the **receiving** side (PO receipt, manual
   adjustment, CSV import) to convert pack→base units, keeping the stock ledger
   in base units. Correcting the `retail` taxonomy must preserve existing retail
   tenants' items via the taxonomy's existing legacy-edit escape hatch.

7. **Advance booking reuses Services Mode and links to the sale.** A completed
   booking becomes a POS sale via the reserved
   `service_bookings.pos_transaction_id`; parts consumed during the service are
   added as `inventory_issue` lines on that same `pos_transactions` row. This is
   where the mixed store and booking meet. Service-family presentation is
   generalized beyond the current `laundry`/`aircon_cleaning` tuning so repair
   services render on the storefront.

8. **Ownership, additivity, and statutory boundaries are preserved.** Module
   ownership follows ADR 0029 (catalog/inventory/POS/storefront). All schema
   changes are additive; any new column also updates the tenant-schema registry
   (`backend/scripts/sync-tenant-schemas.js`) and passes
   `npm run check:tenant-schema-coverage`. Commercial-promo and statutory
   Senior/PWD discount behavior (ADR 0033) and fiscalization are unchanged by
   this ADR.

## Alternatives Considered

1. **Split product domains into separate tables** (`menu_items`,
   `service_products`, `retail_products`). Rejected — it is the exact
   fragmentation this initiative removes, breaks the single mixed-basket
   line model, and duplicates pricing/inventory/tax logic per table.
2. **Add a single new exclusive `repair`/`mixed` workflow mode only.** Rejected
   as the sole solution: a new exclusive mode does not compose (a store is still
   one mode) and would multiply combinatorially as domains mix. The
   capability-composition model (Decision 2) subsumes it and stays extensible.
3. **Build new domain-neutral modifier tables from scratch.** Rejected for cost
   and duplication — the `fnb_modifier_*` tables already model groups, options,
   `price_delta`, required/min/max selection, and an inventory-depleting
   `sku_item_id` link. De-gating (Decision 5) reuses all of it.
4. **Store per-kilogram/pack pricing in a new price-list table.** Rejected —
   fractional `DECIMAL(24,12)` quantity plus the existing weight UOM group and
   barcode multiplier already express weighed and pack-to-unit selling without a
   new pricing surface.

## Boundary Consequences

- **Settings/Onboarding** owns the store-capability configuration and its
  master-admin gate, mirroring how `ops_workflow_mode` is owned today.
- **Catalog/Inventory** owns the corrected `retail` presets, the domain-neutral
  modifier attachment, and the pack-to-unit receiving conversion; the stock
  ledger stays in base units (ADR 0029, ADR 0009).
- **POS** owns capability-driven order-method/panel selection and the
  mixed-basket checkout; per-line `stock_effect_type` and VAT snapshots remain
  server-authoritative.
- **Services** owns booking→sale linkage and generalized service presentation;
  the availability/holds/capacity contracts (ADR 0016) are unchanged.
- No architecture allowlist or exception is introduced.

## Threat Model / Hardening Considerations

- **Elevation of privilege:** capability/mode changes stay master-admin gated;
  no client-supplied capability set is trusted at checkout.
- **Tampering (money/stock correctness):** mixed baskets keep per-line
  `stock_effect_type`, VAT, and price snapshots server-authoritative; retail
  weighed/pack conversions must never write non-base units into the ledger.
- **Replay/duplication:** booking→sale linkage reuses the existing service
  idempotency key and hold-consumption transaction so a completed booking cannot
  double-post or double-charge.
- **Regression on existing tenants:** correcting the `retail` placeholder
  taxonomy must not invalidate existing retail items; rely on the taxonomy's
  legacy-edit-without-taxonomy-change escape hatch and prove non-regression with
  tests.

## Migration and Rollback

- All migrations are additive and defensively guarded
  (`tableExists`/`columnExists`/`addIndexSafe` per repo convention); no
  destructive rename of `fnb_modifier_*` in this rollout (de-gate behind a
  facade). Any new column registers in the tenant-schema registry and passes
  `check:tenant-schema-coverage`.
- Store-capability configuration is stored in tenant `system_settings` (like
  `ops_workflow_mode`), so early phases need no new table.
- Rollback disables the composite capability set (tenants fall back to a single
  sell-domain) and hides new retail presets without rewriting completed
  transactions.

## Phased Rollout

- **Phase 0 (this ADR + `docs/features/UNIFIED_PRODUCT_DOMAIN.md`):** ratify the
  model and decisions.
- **Phase 1 — Catalog foundations:** corrected `retail` taxonomy (weighed,
  refill, pack-to-unit) and domain-neutral modifier de-gating.
- **Phase 2 — Mixed store + capability-driven POS:** composite capability
  configuration, capability-driven order-method/panels, mixed-basket and
  weight-entry UX.
- **Phase 3 — Booking generalization + mixed fulfillment:** generalized service
  presentation, booking→sale linkage, parts-on-booking.

## Validation

1. Mode/capability config unit tests (composition, master-admin gate,
   single-mode back-compat).
2. `modeItemTaxonomy` tests for the new `retail` presets and non-regression of
   existing corrected modes; UOM/weight and pack-to-unit conversion tests.
3. Modifier de-gating tests: a service and a retail item can attach a modifier
   group; inventory-depleting add-on issues stock through `stock_effect_type`.
4. POS checkout integration test for a mixed basket (service labor + retail
   parts + food) in one transaction with correct stock and VAT.
5. Services booking→sale linkage test (idempotent, parts added to the same
   transaction).
6. `npm run check:architecture`, `npm run lint:docs`, and
   `npm run check:tenant-schema-coverage` pass; rendered POS checks for desktop
   and one mobile viewport per the hardening contract.

## Authoritative Sources

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0008-tenant-workflow-mode-msme-simplification.md`
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
- `docs/architecture/adr/0019-food-and-beverage-mode-full-service-restaurant.md`
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md`
- `docs/architecture/adr/0033-commercial-promo-and-statutory-pos-discount-boundaries.md`
- `docs/features/UNIFIED_PRODUCT_DOMAIN.md`
- `docs/proposals/2026-07-06-flexible-item-types-mini-tiangge-jewelry.md`

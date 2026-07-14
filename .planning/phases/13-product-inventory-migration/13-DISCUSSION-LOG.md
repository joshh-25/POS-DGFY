# Phase 13: Product & Inventory Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 13-Product & Inventory Migration
**Areas discussed:** Movement-type mapping (8→5), Legacy category → new category mapping, Multi-location stock collapse

---

## Movement-type mapping (8→5)

| Option | Description | Selected |
|--------|-------------|----------|
| transfer=finding-only, production_*=adjustment, return=restock | transfer logged as a lossy-collapse finding (no row inserted); production_consumption/production_output both collapse into adjustment; return collapses into restock. | ✓ |
| transfer=adjustment (net-zero row), production_consumption=loss, production_output=restock, return=restock | Every legacy movement gets exactly one new row, including a fabricated zero-net adjustment for transfer; production framed as raw-material-out/finished-good-in via loss/restock. | |
| Let me describe a different mapping | User initially answered free-text, asking for Claude's recommendation. | |

**User's choice:** User asked "what do you think?" in free text. Claude recommended Option A (transfer=finding-only, production_*=adjustment, return=restock) with rationale: (1) a transfer has no honest target representation since the new schema has zero location dimension anywhere, so a `finding` is more honest than a fabricated net-zero row; (2) production_consumption/production_output are manufacturing-specific semantics that would misrepresent shrinkage stats if forced into `loss`/`restock`, and the raw-material-vs-finished-good distinction is already deferred at the milestone level. User confirmed: "okay let's lock that in."

**Notes:** purchase_receipt→restock, calculated_loss→loss, adjustment→adjustment, and goods_issue→sale were treated as obvious/undisputed and not put to a vote.

---

## Legacy category → new category mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Everything maps to 'retail' | Legacy items are physical stocked goods (current_stock, unit_of_measure, cost_per_unit) — matches retail semantics better than service (bookable, no stock) or food (extra compliance/nutrition connotations). One flat rule. | ✓ |
| ingredient/packaging→retail, product→food | Legacy 'product' maps to food (finished sellable item); ingredient/packaging map to retail. | |
| Let me describe a different mapping | | |

**User's choice:** Everything maps to 'retail'.
**Notes:** None.

---

## Multi-location stock collapse

| Option | Description | Selected |
|--------|-------------|----------|
| Fully discarded after summing (single opening-balance row per product) | One inventory_movements row per product, quantity = sum across all legacy locations. Nothing preserves which location contributed what. | ✓ |
| One opening-balance row per (product, legacy location), no location FK | Insert one row per legacy (item_id, location_id) pair; per-location breakdown survives as separate rows with location identity noted in reference_id/snapshot JSON, not as a real column. | |
| Let me describe a different approach | | |

**User's choice:** Fully discarded after summing (single opening-balance row per product).
**Notes:** None.

---

## Claude's Discretion

- Exact `findings` reason-code string for the `transfer` collapse and the `MAPPING_REASON_CODES` shape it uses.
- Ordering/dependency mechanics for `product_composition` (BOM) `ingredient_id` resolution via `legacy_id_map`.
- Exact opening-balance `inventory_movements` row's `reference_type`/`reference_id` values.

## Deferred Ideas

None raised during this discussion.

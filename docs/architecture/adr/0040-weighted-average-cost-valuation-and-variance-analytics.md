---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-04-20
last_reviewed: 2026-05-07
review_by: 2026-10-20
applies_to: architecture_decision
topic: weighted_average_cost_valuation_and_variance_analytics
---

# ADR 0040: On-Hand Weighted Average Cost Valuation Across Inventory, PO, JO, Suppliers, and Reporting

## Status
Accepted (2026-04-20)

## Context
Cost per item was stored as a static item-level value (`items.cost_per_unit`) while operational inventory can be received at different unit costs over time and across locations.

This created reporting and decision gaps:
1. Item valuation could drift from open FIFO balances.
2. PO/supplier comparisons lacked a current inventory-cost baseline.
3. JO output batches could keep stale or static product costs instead of reflecting consumed input batch costs.
4. Dashboard and executive summaries did not distinguish legacy static valuation from on-hand weighted valuation.

The change is cross-boundary (`inventory + purchase orders + job orders + suppliers + reports + dashboard + frontend presentation`) and follows modular-boundary compatibility constraints.

## Decision
Adopt on-hand weighted average cost as the shared valuation metric while preserving backward compatibility.

1. Canonical valuation basis:
   - `available_qty = max(quantity - quantity_consumed, 0)` per open FIFO batch.
   - `weighted_avg_cost = sum(available_qty * batch_cost) / sum(available_qty)` when open quantity exists.
   - `inventory_value = sum(available_qty * batch_cost)`.
2. Scope support:
   - global
   - optional location-scoped valuation (`location_id`) where available.
3. Fallback behavior:
   - when no open batches exist, use `item.cost_per_unit` with current ledger stock for display metrics.
   - include metric source (`fifo_batches` or `item_cost_fallback`).
4. Transparency requirements:
   - include non-blocking drift diagnostics (`ledger_qty` vs `batch_qty`).
5. PO semantics:
   - receipt unit price remains the inventory costing source-of-truth.
   - no retroactive PO/invoice revaluation in this phase.
   - add variance analytics (`supplier price vs current weighted average`) for procurement decisions.
6. JO completion semantics:
   - compute output unit cost from actual consumed ingredient/packaging movement cost.
   - `jo_output_unit_cost = total_consumed_batch_cost / produced_qty_for_completion`.
   - persist this cost in `production_output` movement and resulting FIFO batch.
   - keep `items.cost_per_unit` unchanged in this phase.
7. Compatibility:
   - existing legacy fields remain present in dashboard/report payloads.
   - weighted fields are additive.

## Consequences
1. Inventory valuation and reporting are aligned to actual on-hand FIFO economics.
2. Supplier comparison can be performed against a current weighted baseline rather than static item defaults.
3. JO output batches better reflect real consumption costs and improve downstream analytics.
4. Consumers can migrate incrementally to weighted fields because legacy contracts are preserved.

## Guardrails
1. No architecture allowlist exception is introduced for this change.
2. No destructive schema migration is required for this phase.
3. Weighted metrics are advisory/analytic and do not backfill historical posted movements.
4. Drift diagnostics are informational and must not block transactional operations.

## Rollout Notes
1. Deploy additive API/UI fields first.
2. Keep legacy metrics visible during transition.
3. Expand revaluation/accounting workflows only in a separate ADR phase if needed.

## Remediation Addendum (2026-04-20)
1. PO analysis must include fallback-required item fields (`cost_per_unit`, `current_stock`) in query projections to keep no-open-batch variance baselines correct.
2. `cost_variance.line_samples[].source` must be derived from valuation metric source contracts (`fifo_batches` vs `item_cost_fallback`), not object-presence checks.
3. PO detail endpoint supports optional `valuation_location_id` so receipt/review UX can render live location-aware weighted baseline values.
4. PO receipt UX must recompute variance badges when receive location changes and protect against stale async responses.
5. CSV exports for PO analysis and executive summary include additive weighted-cost/variance rows to align downloaded reports with API/UI metrics.

## Price Boundary Addendum (2026-05-07)
Inventory cost and customer selling price are separate contracts:

1. `items.cost_per_unit`, weighted-average cost, FIFO batch cost, and cost snapshots are internal valuation/COGS fields.
2. `items.default_sale_price` is the explicit operator-owned customer selling price for item-backed sales, POS cart defaults, Storefront catalog prices, Storefront checkout, and Dispatch Order revenue lines.
3. Customer-facing sale flows must not fall back from missing `default_sale_price` to `cost_per_unit`.
4. When an item is configured as POS-visible or Storefront-visible, sale readiness requires `default_sale_price > 0`. Internal inventory rows may remain cost-only.
5. Pure service rows may keep optional internal service cost for profitability, but Services Mode must not show FIFO, average-cost, or on-hand inventory value controls for service-only rows.

## Mode-Aware Tracking Addendum (2026-05-07)

Reports, dashboard metrics, stock movements, and valuation services must apply the same stock-bearing policy used by POS and Storefront:

1. Pure service rows are stock-exempt when `items.category = service` or `items.mode_item_preset = service`.
2. Pure service rows may contribute to revenue, booking, POS, Storefront, and sales reports, but must not contribute to stock aging, low-stock, surplus/shortage, inventory value, weighted-average inventory valuation, FIFO batch, or stock-movement metrics.
3. Physical Services Mode rows, F&B ingredients, F&B packaged goods, Food Manufacturing materials/products, and MSME stock items remain stock-bearing and continue to appear in inventory reports and movement tracking.
4. Manual stock movement and transfer creation must fail closed for pure service rows even if stale stock/FIFO fields exist from legacy imports.
5. Data-quality counts for missing cost or zero stock are inventory-readiness metrics and must exclude pure service rows so service businesses are not reported as inventory-defective for valid service catalog entries.

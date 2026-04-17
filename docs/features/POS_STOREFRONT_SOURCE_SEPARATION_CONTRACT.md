---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-04-16
applies_to: pos_storefront_source_separation
topic: source_channel_contract_matrix
---

# POS + Storefront Source-Separation Contract Matrix

## Canonical Taxonomy
1. `order_source` is the channel-of-origin field.
2. Allowed values:
   - `in_store`: physical cashier/POS terminal transaction
   - `online_store`: storefront checkout transaction handled through POS order lifecycle
3. `order_method` remains fulfillment behavior (`dine_in`, `takeout`, `pickup`, `delivery`) and must not be used as channel-origin proxy.

## Surface Matrix
| Surface | Read Contract | Required UX Behavior | Gate |
|---|---|---|---|
| POS Incoming Queue | `/pos/incoming-orders` | Show online-store lifecycle only (`placed` to `out_for_delivery`) | No in-store leakage |
| POS History | `/pos/transactions` + `order_source` filter | Explicit source badge + source filter (`All`, `In-Store`, `Online Store`) | No cashier-null inference |
| Unified Sales | `/sales/transactions` + `pos_order_source` | Preserve `source=POS` grouping and show POS channel subtype badge/filter | Backward-compatible source grouping |
| CSV Export | `/sales/transactions?export=csv` | Include `pos_order_source` column for reconciliation | Export field parity with API row payload |
| Storefront Checkout | `/store/cart/quote`, `/store/checkout` | Error copy must be actionable and map to fulfillment/location constraints | Deterministic user-facing failure states |

## Acceptance Metrics
1. Filter accuracy: source-filtered results match backend source truth with zero cross-source leakage.
2. Operator clarity: transaction source is identifiable without relying on cashier assignment presence.
3. Reporting traceability: exported rows include channel discriminator for POS-sourced records.
4. Error transparency: checkout/quote/track failures provide deterministic, actionable messages for stock, validation, and location capability constraints.

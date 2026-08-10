# Purchase Orders Module

This module contains transport handlers, use-cases, and repository logic for
purchase-order flows.

Boundary shape:

`routes -> controller handlers -> use-cases -> repository -> models/services`

Legacy files under `src/controllers/purchaseOrderController.js` and
`src/services/purchaseOrderService.js` remain as compatibility facades during
migration.

## Current Contracts
1. `GET /purchase-orders/:po_id` supports optional `valuation_location_id`.
2. PO detail item payloads include additive weighted valuation fields:
 - `lineItems[].item.weighted_avg_cost`
 - `lineItems[].item.cost_metrics` (`global` and optional `scoped`)
3. Location-aware weighted valuation is read-only/analytic for PO review/receipt
   and does not change PO receipt cost source-of-truth.

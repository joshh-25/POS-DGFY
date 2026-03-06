# Purchase Orders Module

This module contains transport handlers, use-cases, and repository logic for
purchase-order flows.

Boundary shape:

`routes -> controller handlers -> use-cases -> repository -> models/services`

Legacy files under `src/controllers/purchaseOrderController.js` and
`src/services/purchaseOrderService.js` remain as compatibility facades during
migration.

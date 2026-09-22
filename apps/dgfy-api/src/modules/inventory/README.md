# Inventory Module

Inventory module compatibility layer for item, stock movement, composition validation,
and folder operations.

Current migration shape:

`routes -> controllers/itemController -> modules/inventory use-cases -> modules/inventory repository -> legacy services`

Legacy services stay active during migration to preserve API behavior while
inventory use-cases/repositories become the stable boundary for incremental
decomposition.

## Inventory Health ownership

`domain/inventoryHealth.js` is the read-only source for stock-health
classification (`out_of_stock`, `low_stock`, `healthy`, `overstock`, and
`unconfigured`), SQL predicates, and expiry buckets consumed by dashboard,
alerts, AI, reports, and Business Admin adapters. The
`services/inventoryHealthService.js` path is only a compatibility re-export.
`services/costValuationService.js` remains the single valuation owner for
FIFO/open-batch and item-cost fallback rules, including branch projections.

Catalog continues to own item identity and authoring, stock movement services
continue to own quantity mutations and history, and recipe services continue
to own composition. Inventory Health only projects those existing records; it
does not create a second mutation path or move ownership into reporting.

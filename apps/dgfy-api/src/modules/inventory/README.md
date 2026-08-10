# Inventory Module

Inventory module compatibility layer for item, stock movement, composition validation,
and folder operations.

Current migration shape:

`routes -> controllers/itemController -> modules/inventory use-cases -> modules/inventory repository -> legacy services`

Legacy services stay active during migration to preserve API behavior while
inventory use-cases/repositories become the stable boundary for incremental
decomposition.

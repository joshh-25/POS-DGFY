// Dependency-injection wiring point for the inventory module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../products/index.js's buildProductsModule() pattern.
//
// Task 1 (08-04-PLAN.md) builds the repository/entity/reserved-effect-
// contract layers and re-exports them here (architecture guardrail requires
// every module directory to carry an index.js from its first commit). Task 2
// adds the usecases/controllers/routes.js layer and this file's
// buildInventoryModule() factory.
//
// Composition wiring (mounting createInventoryRoutes() under /inventory in
// apps/dgfy-api/src/routes/index.js) is 08-08's scope, not this file's.

export {
    InventoryMovementRepository,
    buildInventoryMovementRepository,
    InsufficientStockError,
    InventoryProductNotFoundError
} from './repositories/inventoryMovementRepository.js';
export { InventoryMovementEntity, createInventoryMovementEntity } from './entities/inventoryMovementEntity.js';
export { recordSaleEffect, recordBookingEffect } from './usecases/inventoryEffectContracts.js';

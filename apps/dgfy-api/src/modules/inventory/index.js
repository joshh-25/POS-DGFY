// Dependency-injection wiring point for the inventory module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../products/index.js's buildProductsModule() pattern.
//
// Task 1 (08-04-PLAN.md) built the repository/entity/reserved-effect-
// contract layers. Task 2 adds the usecases/controllers/routes.js layer and
// this file's buildInventoryModule() factory, closing every manual-movement
// usecase over InventoryMovementRepository (tenant-scoped, resolved via the
// injected TenantConnector) and the businesses module's BusinessRepository
// (membership/staff-or-owner access control only — membership lives in the
// landlord dgfy_core database).
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
export {
    MOVEMENT_TYPES,
    buildRecordRestockUseCase,
    buildRecordLossUseCase,
    buildRecordAdjustmentUseCase,
    buildListMovementsUseCase
} from './usecases/inventoryMovementUseCases.js';
export { buildInventoryMovementController } from './controllers/inventoryMovementController.js';
export { createInventoryRoutes } from './routes.js';

import { InventoryMovementRepository } from './repositories/inventoryMovementRepository.js';
import { recordSaleEffect, recordBookingEffect } from './usecases/inventoryEffectContracts.js';
import {
    buildRecordRestockUseCase,
    buildRecordLossUseCase,
    buildRecordAdjustmentUseCase,
    buildListMovementsUseCase
} from './usecases/inventoryMovementUseCases.js';

/**
 * Builds the fully wired inventory module: one InventoryMovementRepository
 * instance (tenant-scoped, resolved via the injected tenantConnector) plus
 * every manual-movement usecase closed over it and the injected
 * businessRepository (used ONLY for membership/staff-or-owner access
 * control). Also re-exposes the reserved (unwired) D-06 effect contracts so
 * 08-08's composition root and Phase 9 can reach them from one place.
 *
 * @param {{tenantConnector, businessDatabaseRegistryRepository?, businessRepository}} deps
 * @returns {{repository: InventoryMovementRepository, useCases: Object, effectContracts: {recordSaleEffect: Function, recordBookingEffect: Function}}}
 */
export function buildInventoryModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository
} = {}) {
    const repository = new InventoryMovementRepository({ tenantConnector, businessDatabaseRegistryRepository });

    return {
        repository,
        useCases: {
            recordRestock: buildRecordRestockUseCase({ repository, businessRepository }),
            recordLoss: buildRecordLossUseCase({ repository, businessRepository }),
            recordAdjustment: buildRecordAdjustmentUseCase({ repository, businessRepository }),
            listMovements: buildListMovementsUseCase({ repository, businessRepository })
        },
        effectContracts: { recordSaleEffect, recordBookingEffect }
    };
}

export default buildInventoryModule;

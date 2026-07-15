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
export {
    InventoryReservationRepository,
    buildInventoryReservationRepository
} from './repositories/inventoryReservationRepository.js';
export { InventoryMovementEntity, createInventoryMovementEntity } from './entities/inventoryMovementEntity.js';
export { recordSaleEffect, recordBookingEffect } from './usecases/inventoryEffectContracts.js';
export {
    MOVEMENT_TYPES,
    buildRecordRestockUseCase,
    buildRecordLossUseCase,
    buildRecordSaleUseCase,
    buildRecordAdjustmentUseCase,
    buildListMovementsUseCase
} from './usecases/inventoryMovementUseCases.js';
export {
    buildAvailableToSellUseCase,
    buildReserveStockUseCase,
    buildCommitReservationUseCase,
    buildReleaseReservationUseCase,
    buildExpireDueReservationsUseCase,
    buildSetReservationExpiryUseCase
} from './usecases/inventoryReservationUseCases.js';
export { buildInventoryMovementController } from './controllers/inventoryMovementController.js';
export { createInventoryRoutes } from './routes.js';

import { InventoryMovementRepository } from './repositories/inventoryMovementRepository.js';
import { InventoryReservationRepository } from './repositories/inventoryReservationRepository.js';
import { recordSaleEffect, recordBookingEffect } from './usecases/inventoryEffectContracts.js';
import {
    buildRecordRestockUseCase,
    buildRecordLossUseCase,
    buildRecordSaleUseCase,
    buildRecordAdjustmentUseCase,
    buildListMovementsUseCase
} from './usecases/inventoryMovementUseCases.js';
import {
    buildAvailableToSellUseCase,
    buildReserveStockUseCase,
    buildCommitReservationUseCase,
    buildReleaseReservationUseCase,
    buildExpireDueReservationsUseCase,
    buildSetReservationExpiryUseCase
} from './usecases/inventoryReservationUseCases.js';

/**
 * Builds the fully wired inventory module: one InventoryMovementRepository
 * instance (tenant-scoped, resolved via the injected tenantConnector) plus
 * every manual-movement usecase closed over it; PLUS one
 * InventoryReservationRepository instance and all reservation usecases
 * (10-02: D-07/D-09/D-10, ADR 0029) closed over it and the injected
 * recordSale single-writer effect. Also re-exposes the reserved (unwired)
 * D-06 effect contracts so 08-08's composition root and Phase 9 can reach
 * them from one place.
 *
 * Exposes reservationPorts object ({ reserveStock, commitReservation,
 * releaseReservation, expireDueReservations, availableToSell,
 * setReservationExpiry }) so 10-06/10-08's composition can inject them.
 *
 * @param {{tenantConnector, businessDatabaseRegistryRepository?, businessRepository}} deps
 * @returns {{repository: InventoryMovementRepository, useCases: Object, effectContracts: {recordSaleEffect: Function, recordBookingEffect: Function}, reservationRepository: InventoryReservationRepository, reservationPorts: Object}}
 */
export function buildInventoryModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository
} = {}) {
    const repository = new InventoryMovementRepository({ tenantConnector, businessDatabaseRegistryRepository });
    const reservationRepository = new InventoryReservationRepository({ tenantConnector, businessDatabaseRegistryRepository });

    // Build the recordSale single-writer to pass to reservation usecases
    const recordSaleUseCase = buildRecordSaleUseCase({ repository, businessRepository });

    return {
        repository,
        useCases: {
            recordRestock: buildRecordRestockUseCase({ repository, businessRepository }),
            recordLoss: buildRecordLossUseCase({ repository, businessRepository }),
            recordSale: recordSaleUseCase,
            recordAdjustment: buildRecordAdjustmentUseCase({ repository, businessRepository }),
            listMovements: buildListMovementsUseCase({ repository, businessRepository })
        },
        effectContracts: { recordSaleEffect, recordBookingEffect },
        // 10-02: Reservation capability (D-07/D-09/D-10, ADR 0029)
        reservationRepository,
        reservationPorts: {
            reserveStock: buildReserveStockUseCase({ repository: reservationRepository, businessRepository }),
            commitReservation: buildCommitReservationUseCase({ repository: reservationRepository, recordSaleUseCase }),
            releaseReservation: buildReleaseReservationUseCase({ repository: reservationRepository }),
            expireDueReservations: buildExpireDueReservationsUseCase({ repository: reservationRepository }),
            availableToSell: buildAvailableToSellUseCase({ repository: reservationRepository }),
            setReservationExpiry: buildSetReservationExpiryUseCase({ repository: reservationRepository })
        }
    };
}

export default buildInventoryModule;

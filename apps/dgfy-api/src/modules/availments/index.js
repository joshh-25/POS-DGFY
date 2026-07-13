// Dependency-injection wiring point for the availments module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../inventory/index.js's buildInventoryModule() pattern.
//
// Task 09-04 builds the repository/entity/error-classes layers. The
// usecases/controllers/routes.js layers will be added in 09-05/09-06.
//
// Composition wiring (mounting createAvailmentRoutes() under /availments in
// apps/dgfy-api/src/routes/index.js) is a later task's scope, not this file's.

export {
    AvailmentRepository,
    AvailmentNotFoundError,
    AvailmentFinalizedError,
    AvailmentLineNotFoundError,
    NoOpenShiftError,
    TenantDatabaseUnavailableError
} from './repositories/availmentRepository.js';
export { AvailmentEntity, createAvailmentEntity } from './entities/availmentEntity.js';

import { AvailmentRepository } from './repositories/availmentRepository.js';

/**
 * Builds the fully wired availments module: one AvailmentRepository instance
 * (tenant-scoped, resolved via the injected tenantConnector) plus injected
 * ports for compliance gating, inventory sale effects, and device-bridge
 * printing.
 *
 * @param {{
 *   tenantConnector,
 *   businessDatabaseRegistryRepository?,
 *   businessRepository,
 *   productRepository,
 *   assertComplianceGate,
 *   recordSaleEffect,
 *   shiftRepository,
 *   deviceBridgeClient
 * }} deps
 * @returns {{repository: AvailmentRepository, useCases: Object}}
 */
export function buildAvailmentsModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository,
    productRepository,
    assertComplianceGate,
    recordSaleEffect,
    shiftRepository,
    deviceBridgeClient
} = {}) {
    const repository = new AvailmentRepository({ tenantConnector, businessDatabaseRegistryRepository });

    return {
        repository,
        useCases: {
            // 09-05 will add: createAvailment, addLine, updateLine, removeLine, restoreLine, applyDiscount
            // 09-06 will add: finalizeAvailment
        }
    };
}

export default buildAvailmentsModule;

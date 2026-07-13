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
export {
    ComplianceEvidenceRepository,
    DuplicateComplianceEvidenceError
} from './repositories/complianceEvidenceRepository.js';
export { AvailmentEntity, createAvailmentEntity } from './entities/availmentEntity.js';
export { createAvailmentRoutes } from './routes.js';
export { buildAvailmentController } from './controllers/availmentController.js';
export { assembleEvidenceBundle } from './usecases/complianceEvidenceUseCases.js';

import { AvailmentRepository } from './repositories/availmentRepository.js';
import { ComplianceEvidenceRepository } from './repositories/complianceEvidenceRepository.js';
import {
    buildCreateAvailmentUseCase,
    buildGetByIdUseCase,
    buildAddLineUseCase,
    buildUpdateLineUseCase,
    buildRemoveLineUseCase,
    buildRestoreLineUseCase,
    buildApplyDiscountUseCase,
    buildFinalizeAvailmentUseCase
} from './usecases/availmentUseCases.js';
import { buildAttestComplianceEvidenceUseCase } from './usecases/complianceEvidenceUseCases.js';

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
 * @returns {{repository: AvailmentRepository, complianceEvidenceRepository: ComplianceEvidenceRepository, useCases: Object}}
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
    // D-23: the interim per-business compliance-evidence attestation store
    // finalize reads for compliant_active checkout (see complianceEvidenceUseCases.js).
    const complianceEvidenceRepository = new ComplianceEvidenceRepository({
        tenantConnector,
        businessDatabaseRegistryRepository
    });

    return {
        repository,
        complianceEvidenceRepository,
        useCases: {
            // 09-05: Line-editing and discount usecases
            createAvailment: buildCreateAvailmentUseCase({ repository, businessRepository }),
            getById: buildGetByIdUseCase({ repository, businessRepository }),
            addLine: buildAddLineUseCase({ repository, businessRepository, productRepository }),
            updateLine: buildUpdateLineUseCase({ repository, businessRepository }),
            removeLine: buildRemoveLineUseCase({ repository, businessRepository }),
            restoreLine: buildRestoreLineUseCase({ repository, businessRepository }),
            applyDiscount: buildApplyDiscountUseCase({ repository, businessRepository }),
            // 09-06: operator attestation endpoint for the D-23 evidence store
            attestComplianceEvidence: buildAttestComplianceEvidenceUseCase({
                repository: complianceEvidenceRepository,
                businessRepository
            }),
            // 09-06: finalize orchestration usecase (money recompute, compliance
            // gating + evidence assembly, open-shift binding, atomic persist with
            // sale effects, best-effort print)
            finalizeAvailment: buildFinalizeAvailmentUseCase({
                repository,
                businessRepository,
                productRepository,
                assertComplianceGate,
                recordSaleEffect,
                shiftRepository,
                complianceEvidenceRepository,
                deviceBridgeClient
            })
        }
    };
}

export default buildAvailmentsModule;

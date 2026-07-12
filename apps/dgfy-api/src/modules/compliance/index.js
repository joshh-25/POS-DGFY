// Dependency-injection wiring point for the compliance module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../shifts/index.js's buildShiftsModule() pattern.
//
// Task 1 (08-06-PLAN.md) built the pure-function policy layer (constants,
// policyPacks, policyEngine — the D-05-deviated evaluateComplianceDecision).
// Task 2 adds the repository/entity/usecases/controller/routes.js layers
// and this file's buildComplianceModule() factory, exposing
// assertComplianceGate — the Phase 9 hand-off contract (FSC-02).
//
// Composition wiring (mounting createComplianceRoutes() under /compliance in
// apps/dgfy-api/src/routes/index.js, and injecting the returned
// assertComplianceGate into buildShiftsModule({ assertComplianceGate }) so
// shift-open can call it) is 08-08's scope, not this file's.

export {
    COMPLIANCE_MODE_STATE,
    COMPLIANCE_DECISION,
    COMPLIANCE_OPERATION,
    COMPLIANCE_REASON_CODE,
    COMPLIANCE_VERIFICATION_STATUS,
    COMPLIANCE_VERIFIER_ACTOR_TYPE,
    COMPLIANCE_PROFILE_DEFAULT,
    COMPLIANCE_MODE_CHOICES,
    DOCUMENT_CONTEXTS,
    POS_OPERATIONS
} from './policy/constants.js';
export { getActivePolicyPack, listPolicyPacks } from './policy/policyPacks.js';
export { evaluateComplianceDecision, evaluateComplianceChecklist, buildPreflightResult } from './policy/policyEngine.js';
export {
    ComplianceModeStateRepository,
    buildComplianceModeStateRepository,
    ComplianceStateNotFoundError
} from './repositories/complianceModeStateRepository.js';
export { ComplianceEntity, createComplianceEntity } from './entities/complianceEntity.js';
export {
    buildGetComplianceStateUseCase,
    buildSubmitComplianceEvidenceUseCase,
    buildReviewComplianceStateUseCase
} from './usecases/complianceUseCases.js';
export { buildAssertComplianceGate } from './usecases/complianceGate.js';
export { buildComplianceController } from './controllers/complianceController.js';
export { createComplianceRoutes } from './routes.js';

import { ComplianceModeStateRepository } from './repositories/complianceModeStateRepository.js';
import {
    buildGetComplianceStateUseCase,
    buildSubmitComplianceEvidenceUseCase,
    buildReviewComplianceStateUseCase
} from './usecases/complianceUseCases.js';
import { buildAssertComplianceGate } from './usecases/complianceGate.js';

/**
 * Builds the fully wired compliance module: one ComplianceModeStateRepository
 * instance (tenant-scoped, resolved via the injected tenantConnector) plus
 * every compliance usecase closed over it and the injected businessRepository
 * (used ONLY for membership/owner-role access control — membership lives in
 * the landlord dgfy_core database), and the bound assertComplianceGate port
 * (FSC-02) — Phase 9's hand-off contract. This phase never calls
 * assertComplianceGate from within this module itself; it is exposed here so
 * 08-08's composition root can inject it into other modules
 * (buildShiftsModule({ assertComplianceGate })) once Phase 9 wires the real
 * call sites.
 *
 * @param {{tenantConnector, businessDatabaseRegistryRepository?, businessRepository}} deps
 * @returns {{repository: ComplianceModeStateRepository, useCases: Object, assertComplianceGate: Function}}
 */
export function buildComplianceModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository
} = {}) {
    const repository = new ComplianceModeStateRepository({ tenantConnector, businessDatabaseRegistryRepository });

    return {
        repository,
        useCases: {
            getComplianceState: buildGetComplianceStateUseCase({ repository, businessRepository }),
            submitComplianceEvidence: buildSubmitComplianceEvidenceUseCase({ repository, businessRepository }),
            reviewComplianceState: buildReviewComplianceStateUseCase({ repository, businessRepository })
        },
        assertComplianceGate: buildAssertComplianceGate({ repository })
    };
}

export default buildComplianceModule;

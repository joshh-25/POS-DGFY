// Dependency-injection wiring point for the compliance module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../shifts/index.js's buildShiftsModule() pattern.
//
// Task 1 (08-06-PLAN.md) builds the pure-function policy layer (constants,
// policyPacks, policyEngine — the D-05-deviated evaluateComplianceDecision)
// and re-exports it here (architecture guardrail requires every module
// directory to carry an index.js from its first commit). Task 2 adds the
// repository/entity/usecases/controller/routes.js layers and this file's
// buildComplianceModule() factory, exposing assertComplianceGate — the
// Phase 9 hand-off contract.
//
// Composition wiring (mounting createComplianceRoutes() under /compliance in
// apps/dgfy-api/src/routes/index.js) is 08-08's scope, not this file's.

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

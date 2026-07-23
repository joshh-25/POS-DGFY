import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter), mirrors
// ../../shifts/controllers/shiftController.js. Parses HTTP request data,
// calls the injected use case, and formats the response via
// sendUseCaseResult. No business logic, no direct model/repository imports
// — this directory is blocked from importing models by
// apps/dgfy-api/eslint.config.mjs's no-restricted-imports rule. Use cases
// are received via the `useCases` parameter (Dependency Inversion); this
// module never imports compliance/usecases/complianceUseCases.js directly.
//
// @param {Object} [useCases] - compliance module use cases (buildComplianceModule().useCases)
export function buildComplianceController(useCases = {}) {
    return {
        // GET /compliance/state?businessId=...&branchId=... (membership required)
        async getState(req, res) {
            const result = await useCases.getComplianceState({
                businessId: req.query.businessId,
                branchId: req.query.branchId,
                requestingAccountId: req.account.id
            });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /compliance/evidence (staff-or-owner)
        async submitEvidence(req, res) {
            const { businessId, branchId, complianceProfile, activePolicyPackVersion } = req.body || {};
            const result = await useCases.submitComplianceEvidence({
                businessId,
                branchId,
                requestingAccountId: req.account.id,
                complianceProfile,
                activePolicyPackVersion
            });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /compliance/review (owner; verifierActorType required, D-04)
        async review(req, res) {
            const {
                businessId,
                branchId,
                verifierActorType,
                verificationStatus,
                newState
            } = req.body || {};
            const result = await useCases.reviewComplianceState({
                businessId,
                branchId,
                requestingAccountId: req.account.id,
                verifierActorType,
                verificationStatus,
                newState
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildComplianceController;

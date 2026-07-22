import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter), mirrors
// ./tenantSessionController.js/./businessController.js. Parses HTTP request
// data, calls the injected use case, and formats the response via
// sendUseCaseResult. No business logic, no direct model/repository imports
// — this directory is blocked from importing models by
// apps/dgfy-api/eslint.config.mjs's no-restricted-imports rule.
//
// @param {Object} [useCases] - businesses module use cases (buildBusinessesModule().useCases)
export function buildTenantRegistryController(useCases = {}) {
    return {
        // GET /businesses/:id/tenant-registry (API-03, D-14): read-only safe
        // tenant registry metadata lookup — no session activation side
        // effect, independent of POST /businesses/:id/activate-session.
        async getTenantRegistry(req, res) {
            const result = await useCases.getTenantRegistry({
                businessId: req.params.id,
                requestingAccountId: req.account.id
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildTenantRegistryController;

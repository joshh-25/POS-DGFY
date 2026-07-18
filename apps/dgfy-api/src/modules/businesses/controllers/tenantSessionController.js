import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter), mirrors
// ./businessController.js/./locationController.js. Parses HTTP request
// data, calls the injected use case, and formats the response via
// sendUseCaseResult. No business logic, no direct model/repository imports
// — this directory is blocked from importing models by
// apps/dgfy-api/eslint.config.mjs's no-restricted-imports rule.
//
// DEVIATION FROM THE PLAN'S PSEUDOCODE: the plan's Task 4 pseudocode reads
// `req.user.id` and manually branches on `result.error.code === 'NO_MEMBERSHIP'`
// etc. to pick an HTTP status. Neither matches this codebase's established
// conventions: authenticateAccount (../../accounts/middleware/
// accountAuthMiddleware.js) sets `req.account`, not `req.user`, and every
// other controller in this module (businessController.js, locationController.js)
// resolves failure HTTP status from ApplicationResult.statusCode via
// sendUseCaseResult — never by branching on error codes in the controller.
// tenantSessionUseCases.js's DomainErrors already carry the correct
// statusCode (403 for NO_MEMBERSHIP/NO_TENANT_ASSIGNMENT, 404 for
// NO_TENANT_DATABASE, 503 for a missing registry), so this controller stays
// a one-line pass-through, consistent with the rest of the module.
//
// @param {Object} [useCases] - businesses module use cases (buildBusinessesModule().useCases)
export function buildTenantSessionController(useCases = {}) {
    return {
        // POST /businesses/:id/activate-session (D-14: mid-session business
        // switch using the same session token; API-04 membership +
        // tenant-local assignment enforcement happens inside the use case)
        async activateSession(req, res) {
            const result = await useCases.activateBusinessSession({
                businessId: req.params.id,
                accountId: req.account.id
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildTenantSessionController;

import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter), mirrors
// ../../accounts/controllers/accountController.js. Parses HTTP request
// data, calls the injected use case, and formats the response via
// sendUseCaseResult. No business logic, no direct model/repository imports
// — this directory is blocked from importing models by
// apps/dgfy-api/eslint.config.mjs's no-restricted-imports rule. Use cases
// are received via the `useCases` parameter (Dependency Inversion); this
// module never imports businesses/usecases/businessUseCases.js directly.
//
// @param {Object} [useCases] - businesses module use cases (buildBusinessesModule().useCases)
export function buildBusinessController(useCases = {}) {
    return {
        // POST /businesses (D-10: creator auto-becomes owner)
        async createBusiness(req, res) {
            const { legal_name, display_name, business_handle } = req.body || {};
            const result = await useCases.createBusiness({
                legal_name,
                display_name,
                business_handle,
                creatorAccountId: req.account.id
            });
            return sendUseCaseResult(res, result, 201);
        },

        // GET /businesses
        async listUserBusinesses(req, res) {
            const result = await useCases.listUserBusinesses({ accountId: req.account.id });
            return sendUseCaseResult(res, result, 200);
        },

        // GET /businesses/:id (membership required)
        async getBusiness(req, res) {
            const result = await useCases.getBusiness({
                businessId: req.params.id,
                requestingAccountId: req.account.id
            });
            return sendUseCaseResult(res, result, 200);
        },

        // PATCH /businesses/:id (owner role required)
        async updateBusiness(req, res) {
            const body = req.body || {};
            const updates = {};
            ['legal_name', 'display_name', 'status'].forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(body, key)) {
                    updates[key] = body[key];
                }
            });

            const result = await useCases.updateBusiness({
                businessId: req.params.id,
                requestingAccountId: req.account.id,
                updates
            });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /businesses/:id/staff (owner role required). Defaults to the
        // async invitation path (D-11); pass { mode: 'direct' } to onboard
        // immediately instead.
        async onboardStaff(req, res) {
            const { email, name, initialPassword, mode } = req.body || {};
            const businessId = req.params.id;
            const requestingAccountId = req.account.id;

            if (mode === 'direct') {
                const result = await useCases.onboardStaffDirect({
                    businessId,
                    email,
                    name,
                    initialPassword,
                    requestingAccountId
                });
                return sendUseCaseResult(res, result, 201);
            }

            const result = await useCases.onboardStaffViaInvitation({
                businessId,
                email,
                name,
                requestingAccountId
            });
            return sendUseCaseResult(res, result, 202);
        },

        // GET /businesses/:id/staff (membership required)
        async listBusinessMembers(req, res) {
            const result = await useCases.listBusinessMembers({
                businessId: req.params.id,
                requestingAccountId: req.account.id
            });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /invitations/:token/accept — unauthenticated: the invitee has
        // no DgfyAccount/session yet (accepting *is* how they onboard).
        async acceptInvitation(req, res) {
            const result = await useCases.acceptInvitation({ invitationToken: req.params.token });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildBusinessController;

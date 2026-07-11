import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter): parses
// HTTP request data, calls the injected use case, and formats the response
// via sendUseCaseResult. No business logic, no direct model/repository
// imports — this directory is blocked from importing models by
// apps/dgfy-api/eslint.config.mjs's no-restricted-imports rule. Use cases
// are received via the `useCases` parameter (Dependency Inversion); this
// module never imports accounts/usecases/accountUseCases.js directly.
//
// @param {Object} useCases - accounts module use cases (buildAccountsModule().useCases)
export function buildAccountController(useCases) {
    return {
        async register(req, res) {
            const { email, password, first_name, last_name, phone } = req.body || {};
            const result = await useCases.registerAccount({ email, password, first_name, last_name, phone });
            return sendUseCaseResult(res, result, 201);
        },

        async login(req, res) {
            const { email, password } = req.body || {};
            const result = await useCases.loginAccount({ email, password });
            return sendUseCaseResult(res, result, 200);
        },

        async getMe(req, res) {
            const result = await useCases.getAccount({ accountId: req.account.id });
            return sendUseCaseResult(res, result, 200);
        },

        async updateProfile(req, res) {
            // Only forward keys the client actually sent, so the use case's
            // partial-update semantics (has(key) checks) are preserved —
            // never send `undefined` for fields the client omitted.
            const body = req.body || {};
            const updates = {};
            ['email', 'password', 'first_name', 'last_name', 'phone'].forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(body, key)) {
                    updates[key] = body[key];
                }
            });

            const result = await useCases.updateAccountProfile({ accountId: req.account.id, updates });
            return sendUseCaseResult(res, result, 200);
        },

        async getAccount(req, res) {
            const result = await useCases.getAccountForAuthorization({
                accountId: req.params.id,
                requestingAccountId: req.account.id,
                role: req.account.role
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildAccountController;

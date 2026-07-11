// Dependency-injection wiring point for the accounts module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module).
//
// Wave 1 (.planning/phases/04-backend-accounts-businesses-and-tenancy-
// foundation/04-01-PLAN.md) wires the Entity, Repository, and Use Case
// layers. Wave 2 (04-02-PLAN.md) adds routes/controllers/auth-middleware on
// top of buildAccountsModule()'s exports — the caller (app.js or a test)
// builds the accounts module, then passes its useCases into
// createAccountRoutes()/buildAccountAuthMiddleware() to compose the full
// HTTP layer, per Dependency Inversion.

export { AccountEntity, buildAccountEntity } from './entities/accountEntity.js';
export { AccountRepository, buildAccountRepository } from './repositories/accountRepository.js';
export {
    buildRegisterAccountUseCase,
    buildLoginAccountUseCase,
    buildUpdateAccountProfileUseCase,
    buildGetAccountUseCase,
    buildGetAccountForAuthorizationUseCase,
    sanitizeAccount,
    generateAccountSessionToken
} from './usecases/accountUseCases.js';
export { buildAccountController } from './controllers/accountController.js';
export { createAccountRoutes } from './routes.js';
export { buildAccountAuthMiddleware } from './middleware/accountAuthMiddleware.js';

import { AccountRepository } from './repositories/accountRepository.js';
import {
    buildRegisterAccountUseCase,
    buildLoginAccountUseCase,
    buildUpdateAccountProfileUseCase,
    buildGetAccountUseCase,
    buildGetAccountForAuthorizationUseCase
} from './usecases/accountUseCases.js';

/**
 * Builds the fully wired accounts module: one AccountRepository instance
 * plus all use cases closed over it. Infrastructure dependencies
 * (Sequelize Account model, password hashing/comparison) are supplied by
 * the caller — Wave 2's routes/index.js or app.js — per Dependency
 * Inversion. This is the single place those concrete pieces are composed.
 *
 * `businessRepository` (Wave 3, 04-03-PLAN.md Task 8) is an OPTIONAL,
 * already-constructed BusinessRepository instance — not imported directly
 * from ../businesses/repositories/businessRepository.js — so the accounts
 * module never depends on the businesses module's internals (Dependency
 * Inversion), and so the caller (routes/index.js) can share the SAME
 * repository instance the /businesses routes use, rather than this module
 * constructing its own divergent one. When omitted, loginAccount's
 * `businesses` stays `[]` (Wave 1's original behavior).
 *
 * @param {{accountModel, hashPassword: Function, bcrypt: {compare: Function}, businessRepository?: Object}} deps
 */
export function buildAccountsModule({ accountModel, hashPassword, bcrypt, businessRepository }) {
    const repository = new AccountRepository(accountModel);

    return {
        repository,
        useCases: {
            registerAccount: buildRegisterAccountUseCase({ repository, hashPassword }),
            loginAccount: buildLoginAccountUseCase({ repository, bcrypt, businessRepository }),
            updateAccountProfile: buildUpdateAccountProfileUseCase({ repository, hashPassword, bcrypt }),
            getAccount: buildGetAccountUseCase({ repository }),
            getAccountForAuthorization: buildGetAccountForAuthorizationUseCase({ repository })
        }
    };
}

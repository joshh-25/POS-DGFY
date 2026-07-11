// Dependency-injection wiring point for the accounts module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module).
//
// Wave 1 (.planning/phases/04-backend-accounts-businesses-and-tenancy-
// foundation/04-01-PLAN.md) wires the Entity, Repository, and Use Case
// layers. Wave 2 (04-02-PLAN.md) adds routes/controllers on top of
// buildAccountsModule()'s exports.

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
 * @param {{accountModel, hashPassword: Function, bcrypt: {compare: Function}}} deps
 */
export function buildAccountsModule({ accountModel, hashPassword, bcrypt }) {
    const repository = new AccountRepository(accountModel);

    return {
        repository,
        useCases: {
            registerAccount: buildRegisterAccountUseCase({ repository, hashPassword }),
            loginAccount: buildLoginAccountUseCase({ repository, bcrypt }),
            updateAccountProfile: buildUpdateAccountProfileUseCase({ repository, hashPassword }),
            getAccount: buildGetAccountUseCase({ repository }),
            getAccountForAuthorization: buildGetAccountForAuthorizationUseCase({ repository })
        }
    };
}

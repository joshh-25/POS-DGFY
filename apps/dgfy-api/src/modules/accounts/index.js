// Dependency-injection wiring point for the accounts module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module).
//
// Wave 1 (.planning/phases/04-backend-accounts-businesses-and-tenancy-
// foundation/04-01-PLAN.md) wires the Entity layer only as each task lands;
// repository and use case wiring are added by later tasks in this same
// plan. Wave 2 (04-02-PLAN.md) adds routes/controllers on top of this
// module's exports.

export { AccountEntity, buildAccountEntity } from './entities/accountEntity.js';
export { AccountRepository, buildAccountRepository } from './repositories/accountRepository.js';

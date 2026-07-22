# accounts module

DGFY landlord-scoped account domain (registration, login, profile, lookup) for the standalone `apps/dgfy-api` service. Built against the new `dgfy_core.accounts` schema contract (`apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js`), per Phase 4 of the DGFY standalone refactor (`.planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/`).

## Relationship to `dgfyAuth`

This module is **not** related to `apps/dgfy-api/src/modules/dgfyAuth`. `dgfyAuth` proxies auth calls to the legacy backend (`apps/dgfy-api/src/infra/backendProxy.js`) against the legacy `dgfy_accounts` table and is intentionally out of scope for Phase 4 (its removal is planned for Phase 5). `accounts` is a ground-up Clean Architecture implementation against the new `dgfy_core` schema.

## Layout (Clean Architecture)

Follows `routes -> controllers -> usecases -> entities -> repositories -> models`, composed in `index.js`:

- `entities/accountEntity.js` — domain model; business rules (email format, password strength, verification/active state). No persistence, no HTTP.
- `repositories/accountRepository.js` — data access adapter; owns all Sequelize queries against `apps/dgfy-api/src/models/Landlord/Account.js`; translates Model <-> Entity.
- `usecases/accountUseCases.js` — application logic (registration, login, profile update, lookup, authorization); orchestrates entity validators + repository calls; always returns an `ApplicationResult` (`apps/dgfy-api/src/shared/contracts/applicationResult.js`), never throws domain-level failures (`apps/dgfy-api/src/shared/contracts/domainErrors.js`).
- `index.js` — the single dependency-injection wiring point for this module.
- `controllers/`, `routes.js` — HTTP transport layer, added in Wave 2 (`.planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/04-02-PLAN.md`).

## Wave 1 scope

Wave 1 (`04-01-PLAN.md`) delivers the Account model, entity, repository, and use cases with unit + integration test coverage. HTTP routes/controllers, business/tenancy membership, and staff onboarding are out of scope here — see the Phase 4 master plan (`.planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/04-PLAN.md`) for the full wave sequence.

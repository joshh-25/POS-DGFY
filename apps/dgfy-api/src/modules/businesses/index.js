// Dependency-injection wiring point for the businesses module. Scaffolded
// in Wave 2 (.planning/phases/04-backend-accounts-businesses-and-tenancy-
// foundation/04-02-PLAN.md); Wave 3 (04-03-PLAN.md) fills in the entity,
// repository, and use case layers plus real routes, mirroring
// ../accounts/index.js's buildAccountsModule() pattern.

export { buildBusinessController } from './controllers/businessController.js';
export { createBusinessRoutes } from './routes.js';

/**
 * Scaffolded placeholder — Wave 3 replaces this with a real DI wiring
 * function (repository + use cases) analogous to
 * ../accounts/index.js's buildAccountsModule().
 */
export function buildBusinessesModule() {
    return { useCases: Object.freeze({}) };
}

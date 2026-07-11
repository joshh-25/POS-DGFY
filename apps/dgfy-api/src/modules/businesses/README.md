# businesses module

Scaffolded in Wave 2 (`.planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/04-02-PLAN.md`). No business logic yet — entity, repository, use cases, and real routes are built in Wave 3 (`04-03-PLAN.md`).

## Relationship to `accounts`

This module will follow the same Clean Architecture layering as `../accounts/` once Wave 3 lands: `routes -> controllers -> usecases -> entities -> repositories -> models`, composed in `index.js`.

## Wave 2 scope

Only `routes.js` (empty router) and `controllers/businessController.js` (empty controller builder) exist as stubs so `apps/dgfy-api/src/modules/businesses/` satisfies the repo's architecture guardrail (`index.js`/`README.md`/a layer directory) ahead of Wave 3's real implementation.

# businesses module

Scaffolded in Wave 2 (`.planning/phases/04-backend-accounts-businesses-and-tenancy-foundation/04-02-PLAN.md`); real business creation, ownership, and staff onboarding logic landed in Wave 3 (`04-03-PLAN.md`).

## Relationship to `accounts`

Follows the same Clean Architecture layering as `../accounts/`: `routes -> controllers -> usecases -> repositories -> models`, composed in `index.js`'s `buildBusinessesModule()`. Businesses are authenticated via the accounts module's own `dgfy_account_session` bearer token (`authenticateAccount` middleware is injected by `routes/index.js`, not re-implemented here).

## Endpoints

- `POST /businesses` — create a business; creator auto-becomes owner (D-10)
- `GET /businesses` — list the authenticated account's businesses
- `GET /businesses/:id` — business detail (membership required)
- `PATCH /businesses/:id` — update business (owner role required)
- `POST /businesses/:id/staff` — onboard staff via invitation (default) or `{ mode: 'direct' }` (owner role required)
- `GET /businesses/:id/staff` — list business members (membership required)
- `POST /invitations/:token/accept` — accept a staff invitation (unauthenticated; the invitee has no session yet), mounted at the top-level `/invitations` path via `createInvitationRoutes()`

## Known limitation (Wave 3)

Staff onboarding (invitations, staff accounts, accepted assignments) is stored in the `BusinessRepository`'s in-memory maps, not a persisted table — no `dgfy_business_*` tenant database connection exists yet. This is Wave 4's concern (`04-04-PLAN.md`, tenant session/context binding); see `businessRepository.js`'s constructor doc comment.

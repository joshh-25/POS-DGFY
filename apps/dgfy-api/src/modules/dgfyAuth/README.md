# dgfyAuth module

Landlord-DB-only DGFY account auth use cases, repository, and models for the standalone `apps/dgfy-api` mobile auth service.

## Relationship to `backend/src/modules/dgfy`

This is a **deliberate, bounded duplication** of the auth-only slice of `backend/src/modules/dgfy` (preflight, registration, login, `me`, profile, password change/reset, email verification, session handoff) — not a shared package. That was an explicit tradeoff: a shared `packages/dgfy-auth-core` workspace package was tried first, but it required both `backend`'s and `apps/dgfy-api`'s Docker builds to depend on files outside their own directory, which was judged not worth it for this phase.

Business rules here **must stay identical** to `backend/src/modules/dgfy/usecases/dgfyAuthUseCases.js`'s corresponding functions. `tests/parity/dgfyAuthUseCases.parity.test.js` (in `backend/tests/`) runs the same behavioral assertions against both copies to catch drift — run it after changing either copy, and update both together.

Tenant/company membership, POS/tenant session, invitations, and admin account management are out of scope here — they depend on per-tenant database connections this service does not have.

Layout follows this repo's `controllers -> usecases -> repositories -> models` convention (composed in `index.js`).

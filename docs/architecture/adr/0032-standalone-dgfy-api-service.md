---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-07-08
last_reviewed: 2026-07-08
review_by: 2027-01-08
applies_to: architecture_decision
topic: standalone_dgfy_api_service
---

# ADR 0032: Standalone DGFY API Service (`apps/dgfy-api`)

Status: Accepted
Date: 2026-07-06
last_reviewed: 2026-07-06
doc_type: authoritative

## Context

Mobile clients need a DGFY account auth/registration surface. Rather than exposing the existing backend's tenant-shaped `/api` surface directly to mobile, `apps/dgfy-api` is introduced as a standalone service scoped to Phase 1 auth/registration only: preflight, OTP request/verify for `dgfy_account_verification`, registration with legal acknowledgement, login, `me`, profile update, password change, password reset, and logout. Company/tenant switching, POS/tenant session, invitations, and admin account management are out of scope — they depend on per-tenant database connections this service does not have.

Three approaches were evaluated for how `apps/dgfy-api` obtains the DGFY auth business logic already implemented in `backend/src/modules/dgfy`:

1. Proxy to backend over HTTP.
2. Extract a shared npm workspace package (`packages/dgfy-auth-core`) consumed by both `backend` and `apps/dgfy-api`.
3. Duplicate the auth-only slice into `apps/dgfy-api`, with a parity test suite as the drift guard.

Option 2 was implemented first and then reverted: it required `backend`'s existing Dockerfile to gain a build-context dependency on a directory outside `backend/` (`packages/dgfy-auth-core`), which was judged an unacceptable coupling of the *existing, working* backend image to the new service's existence — a `backend`-only PR should never need to touch `backend`'s build. Option 3 was chosen instead.

## Decision

`apps/dgfy-api/src/modules/dgfyAuth` is a **deliberate, bounded duplication** of the landlord-DB-only auth slice of `backend/src/modules/dgfy` — not a shared package, not an HTTP proxy. Specifically duplicated (adapted only where the slim, tenant-membership-free repository requires it):

- `usecases/dgfyAuthUseCases.js` — preflight, register, login, me, update profile, change password, request/verify email verification, request/complete password reset, create/exchange handoff, plus `generateDgfyToken`/`generateDgfyHandoffToken`/`sanitizeDgfyAccount`.
- `usecases/dgfyLegalUseCases.js` and `utils/dgfyLegalTerms.js` — pure, no persistence dependency.
- `repositories/dgfyAccountRepository.js` — the auth-only Sequelize methods (`findByEmail`, `findByPhone`, `findById`, `create`, `updateProfile`, `updatePassword`, `markEmailVerified`, `updateLastLogin`, `recordLegalAcknowledgement`, `transaction`, `createHandoff`, `consumeHandoff`), against this service's own Sequelize connection to the same physical landlord database backend uses.
- `models/DgfyAccount.js`, `DgfyAccountHandoff.js`, `DgfyLegalAcknowledgement.js` — same tables, independent model registration.

**Also duplicated, as infrastructure plumbing rather than business rules:**
- `src/infra/emailOtp.js` — mirrors `backend/src/services/emailOtpService.js`'s hashing (same `EMAIL_OTP_SECRET || JWT_SECRET || REFRESH_TOKEN_SECRET` precedence), TTL, and attempt-limit rules, scoped to only the two purposes this service issues (`dgfy_account_verification`, `dgfy_password_reset`), against the same `email_otps` table.
- `src/infra/tokenSession.js` — mirrors `backend/src/services/authService.js`'s `verifyToken`/`blacklistToken`/`isTokenBlacklisted`, same `JWT_SECRET`, same Redis instance, same `blacklist:token:<token>` key convention, so a token blacklisted by one service is honored by the other.

**Drift guard:** `backend/tests/parity/dgfyAuthUseCases.parity.test.js` runs the same behavioral assertions (registration success/validation/conflict/OTP-replay, login, legal-ack version enforcement, anti-enumeration password reset, handoff single-use replay rejection) against both `backend`'s and `apps/dgfy-api`'s copies via `describe.each`. One documented, intentional non-parity case is asserted separately: `buildGetDgfyMeUseCase` returns memberships from `repository.listMemberships` in both copies, but only `apps/dgfy-api`'s slim repository lacks that method and falls back to an empty array — this is not a bug, and the fallback is unit-tested on its own. Whoever changes either copy's business logic must update both together and keep this suite green.

**Mobile session contract:** bearer tokens only, no HttpOnly cookies. `apps/dgfy-api`'s controllers never set or read the DGFY browser session cookie — that's an explicit gap in ADR 0026 (which governs browser cookie/CSRF authority and says nothing about non-browser clients) that this ADR fills for the mobile case only. ADR 0026's HttpOnly-cookie mandate for browsers is unchanged; any future browser client of `apps/dgfy-api` must follow it, not this bearer contract.

## Consequences

- `apps/dgfy-api` is a fully standalone npm project (own `package.json`/lockfile, own `node_modules`), not an npm workspace member — no root `package.json` changes beyond an `install:all`/`dev:dgfy-api` convenience script. `backend`'s `package.json`, lockfile, and Dockerfile are completely untouched by this service's existence.
- `infrastructure/docker/dgfy-api/Dockerfile` is a new, independent multi-stage build (same tini/su-exec/non-root pattern as backend's), producing its own image (`ghcr.io/sieitzz/dgfy-platform/api`), its own container, `EXPOSE 5100`, own healthcheck. Wired into `docker-compose.yml` (prod), `docker-compose.override.yml` (local dev, build-from-source), and both `local-dev`/`local-test` disposable stacks.
- `npm run check:architecture` now also runs `check:architecture:dgfy-api`, which re-points `backend/scripts/check-architecture-guardrails.js` and `check-controller-boundaries.js` at `apps/dgfy-api/src/modules` via their existing `ARCH_GUARDRAIL_MODULES_ROOT`/`CONTROLLER_BOUNDARY_TARGETS` env-var overrides — no guardrail logic duplicated. `.github/workflows/ci.yml` gained a `test-dgfy-api` job; `.husky/pre-commit` runs the same guardrail check when `apps/dgfy-api/src/modules/**` is staged.
- **Deferred:** an nginx server block routing `api.dgfy.ph` to this service. `infrastructure/docker/nginx/nginx.conf.template` is shared across every environment (dev/qa/prod/beta) from one file — adding a domain-based server block before the domain/cert are actually provisioned everywhere risks breaking nginx config parsing for deployments that haven't set the new `DGFY_API_DOMAIN` env var yet. The compose `dgfy-api` service and nginx's `depends_on: dgfy-api: condition: service_healthy` are already wired; only the server block itself is deferred until the service's health is proven internally in each environment, per this ADR's own validation gates.
- Deferred: no automatic reconciliation between `apps/dgfy-api`'s and `backend`'s copies beyond the parity test — if a future phase needs more OTP purposes or session behavior on the mobile side, extend both deliberately, don't let the parity suite silently expand scope.

## Future Direction

`apps/dgfy-api` is the first instance of a broader, intentional convention: **all deployable entrypoint apps eventually move under a single top-level `apps/*` directory**, not just new services. The current split (`backend/` at repo root, `frontend/apps/{skupervisor,pos,store}` nested under `frontend/`) is transitional. The intended end state names each deployable surface explicitly under `apps/`, e.g. `apps/ims-backend` (today's `backend/`), `apps/dgfy-pos`, `apps/dgfy-storefront`, `apps/dgfy-skupervisor` (today's `frontend/apps/*`), alongside `apps/dgfy-api`.

This ADR does not itself perform that migration — `backend/` and `frontend/apps/*` are unaffected by this change. It records the direction so:
- Future ADRs proposing to relocate `backend/` or a `frontend/apps/*` entry into top-level `apps/*` can cite this as established direction rather than re-litigating whether `apps/*` is the right top-level convention.
- New deployable surfaces added between now and that migration should default to `apps/<name>` (following `apps/dgfy-api`'s shape: own `package.json`, own Dockerfile under `infrastructure/docker/<name>/`, own `check:architecture:<name>` guardrail invocation, own CI job) rather than inventing a new top-level location.
- The eventual `backend/` → `apps/ims-backend` move (and similarly for the frontend apps) is its own future ADR — it has a materially larger blast radius (build tooling, deploy scripts, CI paths, documentation cross-references) than this one and should not be bundled into it.

## Validation

- `npm --prefix apps/dgfy-api test`
- `npm --prefix backend test -- --runTestsByPath tests/parity/dgfyAuthUseCases.parity.test.js`
- `npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js` (backend's own copy, untouched by this change)
- `npm run check:architecture` (now covers `backend` and `apps/dgfy-api`)
- `npm run lint:docs`
- `docker build -f infrastructure/docker/dgfy-api/Dockerfile .`
- `docker compose -f infrastructure/docker/docker-compose.yml config` (and with `-f docker-compose.override.yml`, and each of `local-dev`/`local-test`)

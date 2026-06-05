# ADR 0026: Browser Session Cookie Authority

Status: Accepted
Date: 2026-06-02
last_reviewed: 2026-06-02
doc_type: authoritative

## Context

Browser auth previously persisted tenant, DGFY, storefront, and admin bearer tokens in browser-readable storage. That made any successful XSS payload capable of stealing session authority.

## Decision

Production browser session authority must live in `HttpOnly` cookies. JavaScript may hold short-lived access tokens in memory for request headers, but it must not persist access tokens, refresh tokens, tenant context tokens, DGFY account tokens, storefront customer tokens, or admin tokens in `localStorage` or `sessionStorage`.

Cookie-authenticated unsafe requests must include the `x-csrf-token` header matching the non-HttpOnly CSRF cookie issued with the session. Session cookies use `SameSite=Lax`, are `Secure` outside localhost, and are host-only unless `SESSION_COOKIE_DOMAIN` is explicitly configured for an approved production domain such as `.dgfy.ph`.

`POST /api/v1/auth/refresh-token` is a strict tenant route, but its tenant context can be recovered from the signed HttpOnly tenant refresh cookie when the companion tenant-context cookie/header is missing. Recovery verifies the refresh JWT with `REFRESH_TOKEN_SECRET`, reads the embedded `tenant_id`, resolves the landlord tenant row, and restores the request tenant token before the normal refresh use case runs. The refresh use case still owns blacklist/replay checks, token type validation, tenant mismatch rejection, active-user checks, rotation, and refresh-token revocation.

## Consequences

- Backend controllers may set and clear cookies as transport details, but token issuance, rotation, and validation remain in usecases/services.
- Frontend session state is module-memory only and must be rehydrated through cookie-backed refresh/session endpoints.
- Cross-tab coordination must not broadcast tokens.
- Release gates must include storage guards, cookie attribute checks, CSRF checks, and production auto-login guards.
- Missing tenant-context cookies should not strand a valid browser session when a signed tenant-bound refresh cookie is present; invalid, expired, missing-tenant, or unresolved refresh cookies still fail closed through the existing strict tenant/auth path.

## Validation

- `npm --prefix backend test -- --runTestsByPath tests/browserSessionCookies.test.js`
- `npm --prefix backend test -- --runTestsByPath tests/tenantHandler.emailOtp.test.js tests/dgfyTenantSession.transport.test.js tests/browserSessionCookies.test.js`
- `npm --prefix frontend test -- --run src/services/__tests__/browserTokenStorage.guard.test.js`
- `npm run check:architecture`
- `npm run check:compliance`

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

## Consequences

- Backend controllers may set and clear cookies as transport details, but token issuance, rotation, and validation remain in usecases/services.
- Frontend session state is module-memory only and must be rehydrated through cookie-backed refresh/session endpoints.
- Cross-tab coordination must not broadcast tokens.
- Release gates must include storage guards, cookie attribute checks, CSRF checks, and production auto-login guards.

## Validation

- `npm --prefix backend test -- --runTestsByPath tests/browserSessionCookies.test.js`
- `npm --prefix frontend test -- --run src/services/__tests__/browserTokenStorage.guard.test.js`
- `npm run check:architecture`
- `npm run check:compliance`

---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-07-08
last_reviewed: 2026-07-08
review_by: 2027-01-08
applies_to: architecture_decision
topic: browser_session_cookie_authority
---

# ADR 0026: Browser Session Cookie Authority

Status: Accepted
Date: 2026-06-02
last_reviewed: 2026-07-27
doc_type: authoritative

## Context

Browser auth previously persisted tenant, DGFY, storefront, and admin bearer tokens in browser-readable storage. That made any successful XSS payload capable of stealing session authority.

## Decision

Production browser session authority must live in `HttpOnly` cookies. JavaScript may hold short-lived access tokens in memory for request headers, but it must not persist access tokens, refresh tokens, tenant context tokens, DGFY account tokens, storefront customer tokens, or admin tokens in `localStorage` or `sessionStorage`.

Cookie-authenticated unsafe requests must include the `x-csrf-token` header matching the non-HttpOnly CSRF cookie issued with the session. Session cookies use `SameSite=Lax`, are `Secure` outside localhost, and are host-only unless `SESSION_COOKIE_DOMAIN` is explicitly configured for an approved production domain such as `.dgfy.ph`.

Refresh rotates both refresh authority and the CSRF cookie. A browser retry after successful refresh must replace any CSRF header captured on the original request with the current cookie value. A `CSRF_TOKEN_REQUIRED` response may trigger one bounded safe-token bootstrap and one retry; it must not disable CSRF enforcement or loop. Domain-level `401` responses such as invalid POS device pairing are not access-token expiry and must not trigger tenant-token refresh.

`POST /api/v1/auth/refresh-token` is a strict tenant route, but its tenant context can be recovered from the signed HttpOnly tenant refresh cookie when the companion tenant-context cookie/header is missing. Recovery verifies the refresh JWT with `REFRESH_TOKEN_SECRET`, reads the embedded `tenant_id`, resolves the landlord tenant row, and restores the request tenant token before the normal refresh use case runs. The refresh use case still owns blacklist/replay checks, token type validation, tenant mismatch rejection, active-user checks, rotation, and refresh-token revocation.

Pre-login identity operations, including `POST /api/v1/auth/lookup`, must never preflight tenant-session refresh or attach stale tenant authorization headers. A missing tenant refresh cookie is normal on login surfaces and must not produce a browser-visible refresh failure before company identification. When an operator changes account identity after company resolution, clients must invalidate the previous company selection and ignore any older in-flight lookup response.

DGFY terminal login may offer an explicit remembered-device option. Standard login remains limited to 24 hours; an operator who opts in may receive a session lasting up to 30 days. The backend must encode the selected lifetime in the signed DGFY token and apply the same lifetime to both the HttpOnly DGFY session cookie and its companion CSRF cookie. POS code must never store or reconstruct the submitted password in browser storage, IndexedDB, cookies, logs, or application-managed autofill. Native browser password-manager autofill through the standard `username` and `current-password` autocomplete fields is allowed. Logout, account revocation, and server-side token invalidation remain authoritative for both session durations.

## Consequences

- Backend controllers may set and clear cookies as transport details, but token issuance, rotation, and validation remain in usecases/services.
- Frontend session state is module-memory only and must be rehydrated through cookie-backed refresh/session endpoints.
- Cross-tab coordination must not broadcast tokens.
- Release gates must include storage guards, cookie attribute checks, CSRF checks, and production auto-login guards.
- Frontend refresh/retry tests must simulate CSRF rotation and prove that concurrent queued retries use the current cookie generation.
- Missing tenant-context cookies should not strand a valid browser session when a signed tenant-bound refresh cookie is present; invalid, expired, missing-tenant, or unresolved refresh cookies still fail closed through the existing strict tenant/auth path.
- Remembered-device login extends only the signed browser session lifetime; it does not weaken tenant selection, terminal pairing, role checks, shift rules, CSRF enforcement, logout, or revocation.

## Validation

- `npm --prefix backend test -- --runTestsByPath tests/browserSessionCookies.test.js`
- `npm --prefix backend test -- --runTestsByPath tests/tenantHandler.emailOtp.test.js tests/dgfyTenantSession.transport.test.js tests/browserSessionCookies.test.js`
- `npm --prefix frontend test -- --run src/services/__tests__/browserTokenStorage.guard.test.js src/services/__tests__/dgfyAuthService.cookieSession.test.js src/features/pos/__tests__/TerminalLockDrawer.dgfy.test.jsx`
- `npm run check:architecture`
- `npm run check:compliance`

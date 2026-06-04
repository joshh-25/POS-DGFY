---
status: reference
owner: engineering
last_reviewed: 2026-06-05
related_adr: docs/architecture/adr/0026-browser-session-cookie-authority.md
declaration_id: 2026-06-05-platform-admin-login-session-recovery
classification: regulatory
surfaces: authentication,browser-sessions,admin,compliance
reason_codes_impacted: PLATFORM_ADMIN_LOGIN_RECOVERY,CSRF_SESSION_ESTABLISHMENT,TENANT_REFRESH_ROUTE_POLICY
policy_version: 2026.06.05
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/csrfProtection.test.js tests/rtr_verification.test.js tests/adminAuthHandlers.test.js tests/adminAuthUsecase.test.js,npm --prefix frontend test -- --run src/services/__tests__/publicRoutePolicy.test.js,npm --prefix frontend run build:skupervisor,npm run check:architecture,npm run check:compliance,npm run lint:docs,git diff --check
rollback_note: Revert the platform-admin route-policy exclusion and CSRF session-establishment allowlist together if admin login recovery regresses; keep cookie-backed refresh/logout CSRF enforcement intact.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-05T00:00:00+08:00
preflight_request_ref: PLATFORM-ADMIN-LOGIN-SESSION-RECOVERY-2026-06-05
---

# Platform Admin Login Session Recovery

## Compliance Impact Classification

Regulatory.

This declaration covers the platform-admin login recovery fix for browser sessions that still carry stale SKUpervisor session cookies. The change affects authentication and admin access but does not alter tenant authorization, payment workflows, fiscal document classification, tax calculation, receipt numbering, or compliance activation decisions.

## Affected Surfaces

- The SKUpervisor browser shell does not attempt tenant `/api/v1/auth/refresh-token` on `/admin` routes because platform-admin pages use the admin auth session, not the tenant IMS session.
- Credential-based session-establishment endpoints, including `/api/v1/admin/login`, can replace a stale browser session without being blocked by an old or missing CSRF token.
- Cookie-backed refresh and logout paths remain CSRF-protected and must still send `x-csrf-token` matching the issued CSRF cookie.
- Platform-admin credentials remain validated by the existing `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` path. This change does not add a bypass or alternate admin credential source.

## Compliance Preconditions

1. Admin login must still validate configured credentials before issuing an admin token or admin session cookie.
2. Admin routes after login must still require admin-scoped authentication.
3. Tenant refresh must not be used as an admin-route recovery mechanism.
4. Cookie-authenticated refresh and other unsafe non-login mutations must keep CSRF enforcement.
5. Production release evidence must distinguish local gate success from deployed-SHA proof.

## Verification Evidence

Targeted validation for this declaration:

1. `npm --prefix backend test -- --runTestsByPath tests/csrfProtection.test.js tests/rtr_verification.test.js tests/adminAuthHandlers.test.js tests/adminAuthUsecase.test.js`
2. `npm --prefix frontend test -- --run src/services/__tests__/publicRoutePolicy.test.js`
3. `npm --prefix frontend run build:skupervisor`
4. `npm run check:architecture`
5. `npm run check:compliance`
6. `npm run lint:docs`
7. `git diff --check`

## Production Verification

Production verification for this fix must include:

1. Confirming `https://skupervisor.dgfy.ph` serves the frontend asset built from the deployed commit.
2. Confirming `/api/v1/admin/login` accepts the configured platform-admin credential with and without stale `sku_refresh_token` or `sku_admin_session` cookies.
3. Confirming the browser admin route no longer issues tenant `/api/v1/auth/refresh-token` during platform-admin login.
4. Recording the deployed SHA from the remote host and `.deploy-state/last_deployed_commit`.

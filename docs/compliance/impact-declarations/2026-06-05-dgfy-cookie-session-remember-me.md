---
status: reference
owner: engineering
last_reviewed: 2026-06-05
related_adr: docs/architecture/adr/0026-browser-session-cookie-authority.md
declaration_id: 2026-06-05-dgfy-cookie-session-remember-me
classification: regulatory
surfaces: storefront,dgfy-account,browser-sessions,authentication
reason_codes_impacted: DGFY_COOKIE_SESSION_REHYDRATION,BROWSER_TOKEN_STORAGE_REMOVED
policy_version: 2026.06.05
verification_evidence: npm --prefix frontend test -- --run src/services/__tests__/dgfyAuthService.cookieSession.test.js src/services/__tests__/browserTokenStorage.guard.test.js,npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx --testTimeout 15000,npm --prefix frontend run build:store,npm run check:architecture,npm run lint:docs
rollback_note: Revert the DGFY cookie-session rehydration client changes together; do not restore browser-readable DGFY token persistence.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-05T00:00:00+08:00
preflight_request_ref: DGFY-COOKIE-SESSION-REMEMBER-ME-2026-06-05
---

# DGFY Cookie Session Remember Me

## Compliance Impact Classification

Regulatory.

This declaration covers the DGFY storefront account "Remember me" repair. The change affects customer authentication and browser sessions, but does not alter tenant authorization, payment workflows, fiscal document classification, tax calculation, receipt numbering, or compliance activation decisions.

## Affected Surfaces

- The DGFY account service now calls `/api/v1/dgfy/auth/me` even when no in-memory access token exists, allowing the backend to authenticate the HttpOnly `sku_dgfy_session` cookie.
- The Storefront discovery/account shell rehydrates signed-in DGFY account state from the cookie-backed `/api/v1/dgfy/auth/me` response after browser reload or memory-token loss.
- DGFY logout is attempted for cookie-backed sessions even when the browser has no in-memory bearer token, so the backend can clear `sku_dgfy_session`.
- Browser-readable storage remains prohibited for DGFY access tokens, refresh tokens, tenant context tokens, storefront customer tokens, and admin tokens.

## Compliance Preconditions

1. DGFY session authority must remain in HttpOnly cookies or memory-only access tokens.
2. Cookie-backed unsafe requests must keep CSRF enforcement through the existing `sku_csrf_token` header path.
3. `/api/v1/dgfy/auth/me` must remain the validation step before loading account dashboard, activity, loyalty, or address data.
4. A failed DGFY cookie rehydration must not loop account dashboard calls or expose privileged data.

## Verification Evidence

Targeted validation for this declaration:

1. `npm --prefix frontend test -- --run src/services/__tests__/dgfyAuthService.cookieSession.test.js src/services/__tests__/browserTokenStorage.guard.test.js`
2. `npm --prefix frontend test -- --run apps/store/src/__tests__/discoveryHeaderAccount.integration.test.jsx --testTimeout 15000`
3. `npm --prefix frontend run build:store`
4. `npm run check:architecture`
5. `npm run lint:docs`

## Production Verification

Production verification for this fix must include:

1. Sign in on `https://dgfy.ph` with **Remember me** checked.
2. Reload the browser or open the site again before cookie expiry.
3. Confirm the header rehydrates to **My Account** without credential entry.
4. Confirm the account page loads profile/activity data through `/api/v1/dgfy/auth/me` and customer endpoints using cookie credentials.
5. Confirm **Sign out** clears the DGFY cookie session and returns the header to **Log in / Sign up**.

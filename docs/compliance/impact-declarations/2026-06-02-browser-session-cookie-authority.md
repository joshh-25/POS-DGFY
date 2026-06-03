---
status: reference
owner: engineering
last_reviewed: 2026-06-02
related_adr: docs/architecture/adr/0026-browser-session-cookie-authority.md
declaration_id: 2026-06-02-browser-session-cookie-authority
classification: regulatory
surfaces: pos,terminal,settings,admin,storefront,payments,compliance
reason_codes_impacted: SESSION_AUTHORITY_HARDENED,BROWSER_TOKEN_STORAGE_REMOVED
policy_version: 2026.06.02
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/browserSessionCookies.test.js,npm --prefix frontend test -- --run src/services/__tests__/browserTokenStorage.guard.test.js,npm run check:architecture,npm run check:compliance
rollback_note: Revert cookie/session transport and frontend memory-session changes together; do not restore browser-readable refresh tokens.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-02T00:00:00+08:00
preflight_request_ref: BROWSER-SESSION-COOKIE-AUTHORITY-2026-06-02
---

# Browser Session Cookie Authority

## Compliance Impact Classification

Regulatory.

This declaration covers session authority hardening for tenant IMS, POS terminal, DGFY/customer, storefront customer, and admin browser sessions. The change is compliance-sensitive because session compromise could affect POS/admin access and compliance evidence integrity.

## Affected Surfaces

- Tenant browser sessions now use HttpOnly refresh and tenant context cookies plus memory-only access tokens.
- DGFY, storefront customer, and admin sessions support HttpOnly cookie-backed authentication.
- Payment-related browser clients inherit the same cookie-backed session and CSRF contract when payment workflows are enabled.
- Cookie-authenticated unsafe requests require `x-csrf-token`.
- Frontend guarded application code no longer persists privileged session tokens in browser-readable storage.

## Compliance Preconditions

1. Browser session authority must not be persisted in `localStorage` or `sessionStorage`.
2. Session cookies must be `HttpOnly`; production cookies must be `Secure`.
3. Cookie-authenticated unsafe requests must include the CSRF header matching the issued CSRF cookie.
4. Deployment must explicitly configure any shared cookie domain and allowed origins.

## Verification Evidence

Targeted validation for this declaration:

1. `npm --prefix backend test -- --runTestsByPath tests/browserSessionCookies.test.js`
2. `npm --prefix frontend test -- --run src/services/__tests__/browserTokenStorage.guard.test.js`
3. `npm run lint:docs`
4. `npm run check:architecture`
5. `npm run check:compliance`

## No Fiscal Contract Change

This change does not alter fiscal document classification, receipt numbering, sales ledger persistence, or BIR accreditation claims. It strengthens browser session controls around compliance-sensitive access paths.

---
status: reference
owner: engineering
last_reviewed: 2026-06-18
related_adr: docs/architecture/adr/0026-browser-session-cookie-authority.md,docs/architecture/adr/0028-dgfy-account-company-switching.md
declaration_id: 2026-06-18-csrf-pos-terminal-lock
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: CSRF_TOKEN_REQUIRED,ALLOWED
policy_version: 2026.06.18
verification_evidence: npm run lint:docs,npm run check:architecture,npm --prefix frontend test -- --run src/services/__tests__/api.interceptor.test.js src/services/__tests__/adminService.interceptor.test.js src/services/__tests__/adminService.adminOperations.contract.test.js src/features/pos/__tests__/terminalSessionSource.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js,npm --prefix frontend run build:skupervisor,npm --prefix frontend run build:pos,git diff --check
rollback_note: Revert the shared API CSRF header injection and dedicated POS lock sequencing together if unsafe browser requests or POS unlock regress; backend CSRF enforcement remains unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-18T11:36:00+08:00
preflight_request_ref: CSRF-POS-LOCK-2026-06-18
---

# CSRF Header Propagation And POS Terminal Lock Sequencing

## Compliance Impact Classification

Regulatory.

This declaration covers frontend-only remediation for two production-facing control gaps:

1. Shared tenant and platform-admin API clients now attach the browser-readable `sku_csrf_token` as `x-csrf-token` on unsafe methods when a cookie-backed browser session is present.
2. The dedicated POS app remains locked until explicit terminal unlock succeeds, so the DGFY POS unlock drawer precedes open-shift prompting.
3. The DGFY-first POS drawer can fall back to the governed legacy tenant-local login path when `/dgfy/auth/login` rejects an unlinked legacy account with `401`; that fallback still resolves tenant context through `/auth/lookup`, validates tenant credentials, and keeps terminal selection before unlock.

The change is compliance-sensitive because missing CSRF headers caused cookie-authenticated protected actions to fail closed, including platform-admin DGFY account lifecycle actions and POS shift/device actions. The POS lock sequencing is terminal-sensitive because cashier workflows must authenticate and select company/terminal before shift operations.

## Affected Surfaces

- Tenant API requests through `frontend/src/services/api.js` attach `x-csrf-token` for unsafe methods while preserving existing bearer and company-token behavior.
- Platform-admin API requests through `frontend/src/services/adminService.js` attach `x-csrf-token` for unsafe methods while preserving existing admin bearer-token behavior.
- Platform-admin DGFY account actions such as profile update, suspend/reactivate, and delete are covered by the admin service contract test.
- POS terminal shift/open and other unsafe POS calls inherit the tenant API CSRF header.
- The dedicated POS app no longer refreshes cookie-only tenant sessions into an unlocked terminal state before the explicit POS unlock flow.
- The open-shift modal is suppressed while the terminal lock drawer is open, keeping login/company/terminal selection before shift opening.
- Unlinked legacy tenant-local POS users can use the same primary drawer credentials during the grace period; a DGFY account login `401` falls through to the existing tenant-local login path instead of trapping valid legacy credentials behind a collapsed details control.

## Compliance Preconditions

1. Backend CSRF enforcement remains the authority for rejecting cookie-authenticated unsafe requests without a matching `x-csrf-token`.
2. Frontend direct network calls outside the shared tenant/admin clients must still explicitly attach the browser-readable CSRF cookie or move to the shared clients.
3. DGFY POS unlock remains DGFY sign-in, accessible company selection, terminal/counter selection, then POS session creation.
4. Open-shift actions remain permission-gated and require a selected terminal identity after unlock.
5. Legacy POS login remains only a dated grace fallback and must not bypass the terminal lock sequencing, tenant lookup, credential validation, POS permissions, or terminal identity checks.

## Verification Evidence

Required validation for this branch:

1. `npm --prefix frontend test -- --run src/services/__tests__/api.interceptor.test.js src/services/__tests__/adminService.interceptor.test.js src/services/__tests__/adminService.adminOperations.contract.test.js src/features/pos/__tests__/terminalSessionSource.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js`
2. `npm --prefix frontend run build:skupervisor`
3. `npm --prefix frontend run build:pos`
4. `npm run lint:docs`
5. `npm run check:architecture`
6. `npm run check:compliance`
7. `git diff --check`

## Deployment Note

This remediation should deploy with the current source branch. If rollback is required, revert this declaration together with the frontend service and POS terminal changes so docs, tests, and runtime behavior remain aligned.

---
status: reference
owner: engineering
last_reviewed: 2026-07-02
related_adr: docs/architecture/adr/0026-browser-session-cookie-authority.md,docs/architecture/adr/0028-dgfy-account-company-switching.md,docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-02-auth-account-switch-pos-cashier-repair
classification: regulatory
surfaces: ims,pos,terminal,authentication
reason_codes_impacted: ALLOWED,RATE_LIMITED
policy_version: 2026.07.02
verification_evidence: npm --prefix backend test -- --runInBand tests/rateLimiter.behavior.test.js tests/auth.ratelimit.e2e.test.js,npm --prefix frontend test -- --run Pages/__tests__/Login.identityReset.test.jsx src/features/pos/__tests__/terminalLockDrawer.contract.test.jsx src/services/__tests__/api.publicAuthPolicy.test.js,npm --prefix frontend run build:all,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the identity-reset UI and five-minute auth window together if valid users cannot reauthenticate; preserve CSRF enforcement and the separately labelled legacy grace path during rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-02T12:45:00+08:00
preflight_request_ref: AUTH-ACCOUNT-SWITCH-POS-CASHIER-REPAIR-2026-07-02
---

# Authentication Account Switch And POS Cashier Repair

## Compliance Impact Classification

Regulatory.

This release prevents IMS and POS from submitting a changed identity with a stale company selection, removes the contradictory ordinary tenant-local cashier-password button, preserves the governed legacy grace login, and changes the default credentialed authentication limiter window from fifteen minutes to five minutes while retaining five attempts and IP-plus-normalized-email keying.

## Affected Surfaces

1. IMS pre-login company identification and account replacement.
2. POS DGFY sign-in, company selection, and locked-terminal account replacement.
3. Shared credentialed authentication throttling.
4. The separately labelled POS legacy grace entry.

## Compliance Preconditions

1. CSRF enforcement remains enabled for unsafe cookie-authenticated requests.
2. `/auth/lookup` remains a rate-limited pre-login identification endpoint and does not perform tenant-session refresh.
3. IMS and POS retain one shared authentication bucket for the same IP and normalized identity so alternating surfaces cannot bypass brute-force controls.
4. DGFY membership, tenant role/permissions, location grants, device pairing, and shift gates remain authoritative after authentication.
5. Existing unlinked tenant users retain only the separately labelled legacy grace path through June 17, 2027.
6. No checkout, payment, fiscal receipt, inventory persistence, or shift-accounting behavior changes in this release.

## Verification Evidence

The commands listed in the front matter must pass before promotion. Rendered QA must additionally prove that IMS and POS can replace Account A with Account B without retaining Account A's company choices, and that POS renders DGFY sign-in plus Legacy Grace Login without a standalone `Login as Cashier` action.

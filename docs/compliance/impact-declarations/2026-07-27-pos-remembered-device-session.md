---
status: reference
owner: engineering
last_reviewed: 2026-07-27
related_adr: docs/architecture/adr/0026-browser-session-cookie-authority.md
declaration_id: 2026-07-27-pos-remembered-device-session
classification: regulatory
surfaces: pos,terminal,authentication,session,compliance
reason_codes_impacted: POS_DGFY_LOGIN_SESSION_PERSISTENCE
policy_version: 2026.07.27
verification_evidence: targeted_frontend_tests,targeted_backend_tests,frontend_pos_build,npm_run_check_architecture,npm_run_check_compliance,git_diff_check
rollback_note: Revert the remembered-device UI and DGFY session lifetime changes together; standard DGFY login remains the fallback and no database rollback is required.
preflight_result: no_breach
preflight_reason_code: SESSION_AUTHORITY_REMAINS_SERVER_SIGNED
preflight_run_at: 2026-07-27T00:00:00+08:00
preflight_request_ref: POS-REMEMBERED-DEVICE-SESSION-2026-07-27
---

# POS Remembered-Device Session Compliance Impact

## Compliance Impact Classification

Regulatory. This declaration covers an optional remembered-device setting on DGFY terminal login. Standard login remains limited to 24 hours. Explicit opt-in extends only the signed browser session and matching CSRF cookie to 30 days.

## Affected Surfaces

1. POS terminal login password presentation and native browser autofill hints.
2. DGFY login request contract and signed session duration.
3. HttpOnly DGFY session and browser-readable CSRF cookie lifetimes.

## Compliance Preconditions

1. POS code must not store passwords or bearer authority in browser storage, IndexedDB, application cookies, logs, or application-managed autofill.
2. The remembered-device setting must be disabled by default and accepted only as an explicit boolean opt-in.
3. DGFY and CSRF cookie lifetimes must match.
4. Logout, token revocation, tenant membership, terminal pairing, role permissions, shift rules, and all transaction controls remain server-authoritative.
5. `SameSite=Lax`, production `Secure`, and HttpOnly session-cookie controls remain unchanged.

## Verification Evidence

Required validation includes DGFY use-case and transport tests, browser token-storage guards, terminal login interaction tests, the POS production build, architecture and compliance gates, and `git diff --check`.

## Change Boundaries

This change does not alter company selection, cashier assignment, shift ownership, payments, discounts, stock, receipts, offline synchronization, or Storefront behavior. It requires no database migration.

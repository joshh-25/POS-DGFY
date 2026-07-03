---
status: reference
owner: engineering
last_reviewed: 2026-06-15
related_adr: docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md
declaration_id: 2026-06-15-pos-terminal-lookup-rate-limit-adjustment
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,POS_LOGIN_TENANT_NOT_FOUND,POS_LOGIN_COMPANY_TOKEN_UNRESOLVED,RATE_LIMITED
policy_version: 2026.06.15
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/rateLimiter.behavior.test.js,npm --prefix frontend test -- --run src/features/pos/utils/__tests__/terminalUnlockDiagnostics.test.js src/features/pos/__tests__/terminalSessionSource.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js,npm --prefix frontend run build:pos,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the auth lookup limiter keying/configuration and POS retry-after diagnostic copy together; previous IP-only lookup throttling is conservative but can reintroduce shared-network cashier lockouts.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-15T16:20:00+08:00
preflight_request_ref: POS-TERMINAL-LOOKUP-RATE-LIMIT-2026-06-15
---

# POS Terminal Lookup Rate Limit Adjustment

## Compliance Impact Classification

Regulatory.

This declaration covers the POS terminal unlock adjustment that changes `POST /api/v1/auth/lookup` throttling from client-IP-only to client IP plus normalized email and updates the POS unlock diagnostic to show retry timing when the backend returns retry metadata.

The endpoint remains unauthenticated and still requires rate limiting because it resolves tenant context for a submitted email. The adjustment reduces false lockouts on shared store networks without allowing POS to bypass lookup, tenant capability checks, or cashier permissions.

## Affected Surfaces

1. Standalone POS terminal unlock still resolves tenant context with `/auth/lookup` before `/auth/login`.
2. The lookup limiter now scopes repeated attempts by client IP plus normalized email, so one cashier email does not consume the shared network bucket for another cashier email.
3. Lookup limits default to a 5-minute retry window and can be tuned with `RATE_LIMIT_LOOKUP_WINDOW_MS` and `RATE_LIMIT_LOOKUP_MAX_REQUESTS`.
4. POS unlock `429` messages can include retry timing from `retryAfterSeconds` or `Retry-After`.
5. POS must still fail closed on lookup `429` and must not fall back to stale browser tenant context.

## Compliance Preconditions

1. `/auth/lookup` remains rate-limited in production.
2. `/auth/lookup` remains CSRF-exempt only for pre-login tenant identification as documented in `docs/features/TENANT_MANAGEMENT.md`.
3. POS terminal unlock must not trust stale browser tenant context when lookup returns no tenant, multiple tenants, or a rate limit response.
4. Optional `/pos/device/status` `503` remains a device bridge availability issue, not an auth failure.
5. No persistence, fiscal receipt, checkout, payment, or terminal shift contracts are changed by this release.

## Verification Evidence

Required validation for this branch:

1. `npm --prefix backend test -- --runTestsByPath tests/rateLimiter.behavior.test.js`
2. `npm --prefix frontend test -- --run src/features/pos/utils/__tests__/terminalUnlockDiagnostics.test.js src/features/pos/__tests__/terminalSessionSource.contract.test.js src/features/pos/__tests__/terminalViewModeContracts.test.js`
3. `npm --prefix frontend run build:pos`
4. `npm run lint:docs`
5. `npm run check:architecture`
6. `npm run check:compliance`
7. `git diff --check`
8. Guarded production deploy summary from `scripts/deploy-remote.sh --yes`

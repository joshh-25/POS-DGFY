---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-06-15
applies_to: pos_terminal_unlock,auth_lookup_rate_limiting
topic: pos_terminal_lookup_rate_limit_adjustment_plan
---

# POS Terminal Lookup Rate Limit Adjustment Plan

## Objective

Reduce false POS terminal lockouts from shared store networks while preserving the anti-enumeration control on `POST /api/v1/auth/lookup`.

## Authoritative Inputs

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/api/specification.md`
- `docs/features/TENANT_MANAGEMENT.md`
- `docs/testing/pos-readiness-status.md`
- `docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md`
- `docs/architecture/adr/0026-browser-session-cookie-authority.md`

## Plan

1. Keep POS terminal unlock tenant resolution on `/auth/lookup` before `/auth/login`.
2. Keep lookup rate limiting enabled because the endpoint is unauthenticated and can reveal whether an email maps to a tenant.
3. Change lookup throttling from IP-only to IP plus normalized email so one cashier or test account does not consume the shared network bucket for every other cashier.
4. Expose lookup-specific environment tuning through `RATE_LIMIT_LOOKUP_WINDOW_MS` and `RATE_LIMIT_LOOKUP_MAX_REQUESTS`.
5. Keep `429` fail-closed for tenant resolution. POS must not fall back to a stale browser company token when lookup is rate-limited.
6. Surface retry timing from `retryAfterSeconds` or `Retry-After` in the POS unlock error message.
7. Validate with targeted backend limiter tests, POS unlock diagnostics tests, docs lint, architecture checks, compliance checks, POS build, and guarded production deployment.

## Boundary And ADR Decision

Classification: `within-existing-boundary`.

No new ADR is required. The change stays inside existing middleware and POS diagnostic behavior, preserves the required route/controller/use-case boundaries, and does not alter persistence, session-cookie authority, POS checkout ownership, or device-bridge ownership.

## Rollback

Revert the rate limiter keying/configuration change and POS diagnostic copy. The previous behavior is conservative but can reintroduce shared-IP cashier lockouts after repeated lookup attempts.

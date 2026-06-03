---
status: reference
owner: engineering
last_reviewed: 2026-06-03
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-06-03-production-env-fail-stop
classification: regulatory
surfaces: authentication,browser-sessions,payments,production-config,release-gates
reason_codes_impacted: PRODUCTION_ENV_FAIL_STOP,HOSTING_PROFILE_PREFLIGHT
policy_version: 2026.06.03
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/productionEnvValidation.test.js tests/productionEnvGuard.test.js tests/hostingProfilePreflight.test.js,npm run check:production-env,npm run check:architecture,npm run check:compliance
rollback_note: Revert validator/runtime/gate changes together only if production deployment remains blocked; do not restore log-only production startup for security-sensitive env values.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-03T00:00:00+08:00
preflight_request_ref: PRODUCTION-ENV-FAIL-STOP-2026-06-03
---

# Production Env Fail-Stop Validation

## Compliance Impact Classification

Regulatory.

This declaration covers production startup and release-gate hardening for security-sensitive configuration. The change is compliance-sensitive because missing authentication, browser-session, hosting-profile, or payment-provider values can alter access control, session integrity, subscription access, or payment state handling.

## Affected Surfaces

- Production startup now exits non-zero when required env values are missing or invalid.
- Hosting profile preflight now shares the same validator as runtime startup.
- Local release and CI gates include production env fixture validation.
- Deploy validation checks the real target `backend/.env` through the shared validator before proceeding.
- Production env templates include explicit `SESSION_COOKIE_SECURE=true` for browser-session cookies.

## Compliance Preconditions

1. Production env failure output must name variables or validation reasons only, never secret values.
2. Shared hosting remains explicitly degraded and must use `AUTH_BLACKLIST_FAILURE_MODE=fail_open`, local temp storage, and no Redis.
3. VPS hosting must use Redis-backed fail-closed blacklist behavior.
4. Payment-enabled or live PayMongo configuration must include mode-appropriate credentials and webhook secret.
5. `DB_AUTO_SYNC=true` is forbidden in hosted production profiles.

## Verification Evidence

Targeted validation for this declaration:

1. `npm --prefix backend test -- --runTestsByPath tests/productionEnvValidation.test.js tests/productionEnvGuard.test.js tests/hostingProfilePreflight.test.js`
2. `npm run check:production-env`
3. `npm run lint:docs`
4. `npm run check:architecture`
5. `npm run check:compliance`

## No Fiscal Document Contract Change

This change does not alter fiscal document classification, receipt numbering, POS ledger persistence, eSales reporting, or BIR accreditation claims. It hardens production configuration before auth, payment, browser-session, or compliance-sensitive runtime behavior can start in a degraded state.

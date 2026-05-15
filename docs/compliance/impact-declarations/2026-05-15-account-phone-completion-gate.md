---
status: reference
owner: engineering
last_reviewed: 2026-05-15
related_adr: none
declaration_id: 2026-05-15-account-phone-completion-gate
classification: major
surfaces: settings,user_registration
reason_codes_impacted: ALLOWED,VALIDATION_FAILED
policy_version: 2026.05.15
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/auth.test.js tests/userHandlers.transport.test.js tests/phoneCompletionRollout.config.test.js tests/authenticate.phoneCompletionGate.middleware.test.js,npm --prefix frontend exec vitest run src/services/__tests__/api.globalErrors.test.js,npm run check:architecture,npm run check:docs,npm run build:skupervisor,npm --prefix backend run verify:phone-rollout,npm --prefix backend run verify:phone-rollout:config-safe
rollback_note: Return PHONE_COMPLETION_ENFORCEMENT_MODE to observe or revert the auth gate, cache invalidation hook, and frontend redirect while keeping nullable phone columns and existing registration/profile validation intact.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-15T11:14:00+08:00
preflight_request_ref: ACCOUNT-PHONE-COMPLETION-GATE-2026-05-15
---

# Account Phone Completion Gate

## Compliance Impact Classification

Major.

This declaration covers the staged post-login completion gate for accepted legacy accounts whose stored `users.phone_number` is still blank. The change affects access sequencing inside authenticated tenant work, but it does not alter compliance lifecycle state, fiscal receipt issuance, tax computation, or payment authorization.

## Affected Surfaces

- Authenticated tenant request handling through `authenticate`.
- Settings > Profile remediation flow for legacy accepted users.
- Authenticated frontend redirect behavior when the API returns `PHONE_NUMBER_REQUIRED`.
- Environment-driven rollout control through `PHONE_COMPLETION_ENFORCEMENT_MODE` and `PHONE_COMPLETION_ENFORCED_TENANTS`.

## Compliance Preconditions

1. Legacy accepted users must retain an available path to inspect and complete their own profile.
2. Logout must remain available while the account is incomplete.
3. Non-test environments must default to observe mode until operators intentionally enable tenant or global enforcement.
4. Other authenticated tenant work must fail closed only for tenants where enforcement has been intentionally enabled and verified safe.
5. Successful phone completion must invalidate stale auth cache state immediately so the user is not held in a blocked state after correction.
6. Outstanding legacy-user gaps must remain visible to operators until rollout closure is complete.

## Verification Evidence

- `npm --prefix backend test -- --runTestsByPath tests/auth.test.js tests/userHandlers.transport.test.js tests/phoneCompletionRollout.config.test.js tests/authenticate.phoneCompletionGate.middleware.test.js`
- `npm --prefix frontend exec vitest run src/services/__tests__/api.globalErrors.test.js`
- `npm run check:architecture`
- `npm run check:docs`
- `npm run build:skupervisor`
- `npm --prefix backend run verify:phone-rollout`
- `npm --prefix backend run verify:phone-rollout:config-safe`

## No Architecture Exception Required

The change remains inside the existing auth and users boundaries. No ADR or allowlist update is required.

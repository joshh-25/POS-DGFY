---
status: reference
owner: engineering
last_reviewed: 2026-05-17
related_adr: none
declaration_id: 2026-05-17-account-password-policy
classification: regulatory
surfaces: settings,tenant_registration,user_registration,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED
policy_version: 2026.05.17
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/passwordValidation.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js tests/storeHandlers.transport.test.js,npm --prefix frontend test -- Pages/__tests__/RegisterTokenHandoff.test.jsx Pages/__tests__/AcceptInvite.test.jsx Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx src/utils/__tests__/passwordPolicy.test.js,npm run build:frontend,npm --prefix frontend run build:all,npm run lint:docs,npm run check:architecture,git diff --check
rollback_note: Revert the password validator simplification, generator UI/helper, and documentation updates; existing stored password hashes remain untouched.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-17T16:45:00+08:00
preflight_request_ref: ACCOUNT-PASSWORD-POLICY-2026-05-17
---

# Account Password Policy Simplification

## Compliance Impact Classification

Regulatory.

This declaration covers simplifying user-facing account password requirements to a minimum length of 8 characters across company registration, tenant user registration, invitation acceptance, and Settings > Profile password changes. The tenant registration use case is compliance-sensitive because it governs company account creation and activation paths, but this change does not alter compliance lifecycle state, POS receipt issuance, tax calculation, payment authorization, or tenant compliance activation gates.

## Affected Surfaces

- Public company registration validates `adminPassword` with minimum length only.
- Tenant user registration and invitation acceptance validate account passwords with minimum length only.
- Settings > Profile password changes validate current password presence, new password minimum length, and confirmation match before submission.
- Frontend registration, invitation, company registration, and Settings password-change flows expose an optional readable 16-character password generator.

## Compliance Preconditions

1. Password policy changes must not mutate existing password hashes or force resets.
2. Backend validation remains authoritative for direct API calls and must reject passwords shorter than 8 characters.
3. Frontend validation must match backend minimum-length behavior and must not retain obsolete composition requirements.
4. The generator is optional convenience UI only; users may still type any password with at least 8 characters.
5. Email OTP, phone-number requirements, tenant approval, and invitation behavior remain unchanged.

## Verification Evidence

- `npm --prefix backend test -- --runTestsByPath tests/passwordValidation.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js tests/storeHandlers.transport.test.js`
- `npm --prefix frontend test -- Pages/__tests__/RegisterTokenHandoff.test.jsx Pages/__tests__/AcceptInvite.test.jsx Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx src/utils/__tests__/passwordPolicy.test.js`
- `npm run build:frontend`
- `npm --prefix frontend run build:all`
- `npm run lint:docs`
- `npm run check:architecture`
- `git diff --check`

## No Architecture Exception Required

The change stays within existing auth, tenant registration, user profile, and Settings boundaries. No new architecture allowlist entry or ADR is required.

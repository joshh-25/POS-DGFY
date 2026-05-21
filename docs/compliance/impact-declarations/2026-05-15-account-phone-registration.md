---
status: reference
owner: engineering
last_reviewed: 2026-05-15
related_adr: none
declaration_id: 2026-05-15-account-phone-registration
classification: regulatory
surfaces: settings,tenant_registration,user_registration,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED
policy_version: 2026.05.15
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/phoneNumber.utils.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js tests/adminTenantHandlers.transport.test.js tests/authTenantIsolation.hardening.test.js tests/subscriptionIntegration.test.js --runInBand --testTimeout=120000,npm --prefix backend test -- --runTestsByPath tests/auth.test.js --runInBand --testTimeout=120000,npm --prefix frontend test -- Pages/__tests__/RegisterTokenHandoff.test.jsx Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx Pages/__tests__/AcceptInvite.test.jsx,npm run check:architecture,npm run check:compliance,npm run lint:docs,npm --prefix frontend run build,git diff --check
rollback_note: Revert the account phone migrations, validators, registration/profile payload changes, and UI phone enforcement; keep existing tenant/user records untouched because phone columns are nullable.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-15T01:23:00+08:00
preflight_request_ref: ACCOUNT-PHONE-REGISTRATION-2026-05-15
---

# Account Phone Registration Requirement

## Compliance Impact Classification

Regulatory.

This declaration covers account contact requirements in tenant registration and user account creation. The touched tenant provisioning use cases are compliance-sensitive because they govern company registration and activation paths, but this change does not alter compliance lifecycle state, fiscal receipt output, POS transaction rules, tax computation, or payment authorization.

## Affected Surfaces

- Public company registration: `adminPhone` is required and persisted as `tenants.admin_phone`.
- Tenant provisioning: founder/admin users receive `users.phone_number` from the submitted company admin phone.
- Company-user registration and invitation acceptance: `phone_number` is required at account creation.
- Settings > Profile: existing users can add or change phone numbers, and profile identity saves cannot leave the resulting phone blank.
- Settings > Company > Manage Users: accepted users show phone numbers or a missing-phone marker for legacy rows.

## Compliance Preconditions

1. Phone fields remain contact metadata only and must not drive compliance lifecycle state.
2. Phone columns are nullable to avoid breaking historical users and pending tenants during rollout.
3. New company/user creation must fail validation when phone is missing or outside the supported format.
4. Existing users must retain a supported self-service path to add or correct phone numbers.
5. Tenant-aware migration behavior must keep active tenant databases aligned with the canonical user schema.

## Verification Evidence

- `npm --prefix backend test -- --runTestsByPath tests/phoneNumber.utils.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js tests/adminTenantHandlers.transport.test.js tests/authTenantIsolation.hardening.test.js tests/subscriptionIntegration.test.js --runInBand --testTimeout=120000`
- `npm --prefix backend test -- --runTestsByPath tests/auth.test.js --runInBand --testTimeout=120000`
- `npm --prefix frontend test -- Pages/__tests__/RegisterTokenHandoff.test.jsx Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx Pages/__tests__/AcceptInvite.test.jsx`
- `npm run check:architecture`
- `npm run check:compliance`
- `npm run lint:docs`
- `npm --prefix frontend run build`
- `git diff --check`

## No Architecture Exception Required

The change stays within existing tenant registration, auth, user profile, and Settings boundaries. No new architecture allowlist entry or ADR is required.

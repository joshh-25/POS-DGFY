---
status: reference
owner: engineering
last_reviewed: 2026-05-18
related_adr: docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md
declaration_id: 2026-05-18-default-company-registration-auto-activation
classification: regulatory
surfaces: settings,tenant_registration,user_registration,compliance,pos,terminal
reason_codes_impacted: ALLOWED,VALIDATION_FAILED
policy_version: 2026.05.18
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/registerCompanyRequestUseCase.autoApproval.test.js,npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx,npm run lint:docs,npm run check:architecture,git diff --check
rollback_note: Set TENANT_REGISTRATION_APPROVAL_MODE=manual or revert the approval-mode default change to restore pending platform-admin review before tenant provisioning.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-18T00:00:00+08:00
preflight_request_ref: DEFAULT-COMPANY-REGISTRATION-AUTO-ACTIVATION-2026-05-18
---

# Default Company Registration Auto-Activation

## Compliance Impact Classification

Regulatory.

This declaration covers changing public company registration from manual platform-admin approval by default to default auto-standard provisioning and activation. The tenant registration path is compliance-sensitive because it creates tenant databases and founder admin users, but this change does not alter POS receipt issuance, tax calculation, payment authorization, or tenant compliance activation gates.

## Affected Surfaces

- Public company registration defaults to `TENANT_REGISTRATION_APPROVAL_MODE=auto_standard`.
- Registrations without a provider subscription immediately provision an isolated tenant database and return `status=active` with a company token.
- The frontend registration flow can continue using the active response to sign the founder in through the normal login API.
- `TENANT_REGISTRATION_APPROVAL_MODE=manual` remains available as an explicit rollback/admin-review mode.

## Compliance Preconditions

1. Email OTP verification remains required before company registration creates tenant state.
2. Public company registration rate limits must remain strict because registration can provision tenant databases by default.
3. Payment/subscription registration remains blocked while `PAYMENTS_ENABLED=false`.
4. Compliance mode selection still persists at registration and does not bypass existing compliance lifecycle gates.
5. Provisioning failures must not return login-ready success.

## Verification Evidence

- `npm --prefix backend test -- --runTestsByPath tests/registerCompanyRequestUseCase.autoApproval.test.js`
- `npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx`
- `npm run lint:docs`
- `npm run check:architecture`
- `git diff --check`

## No Architecture Exception Required

The change stays within the existing tenant registration, provisioning, auth handoff, and documentation boundaries. No new architecture allowlist entry is required.

---
status: reference
owner: engineering
last_reviewed: 2026-06-03
related_adr: docs/architecture/adr/0022-global-dgfy-account-business-registration.md
declaration_id: 2026-06-03-dgfy-business-registration-session-handoff
classification: regulatory
surfaces: authentication,browser-sessions,user_registration,storefront,onboarding,settings,compliance
reason_codes_impacted: DGFY_TENANT_SESSION_HANDOFF,AUTHORIZATION_FAILED,VALIDATION_FAILED
policy_version: 2026.06.03
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js,npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx,npm run check:architecture,npm run lint:docs
rollback_note: Disable the DGFY tenant-session endpoint and route active company registration back to SKUpervisor login with email/company token prefilled. Keep DGFY account and membership records intact.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-03T00:00:00+08:00
preflight_request_ref: DGFY-BUSINESS-REGISTRATION-SESSION-HANDOFF-2026-06-03
---

# DGFY Business Registration Session Handoff

## Compliance Impact Classification

Regulatory.

This declaration covers changing public company registration from a DGFY-account-to-login handoff into a DGFY-account-to-IMS session handoff after active tenant provisioning. The change affects authentication, browser sessions, user registration, Storefront account routing, and first-login onboarding. It does not alter fiscal document classification, tax computation, receipt numbering, payment-provider settlement, or compliance activation decisions.

## Affected Surfaces

- Storefront DGFY account creation/sign-in now opens the authenticated **My Account** page after success.
- Storefront **Register Your Business** creates a short-lived DGFY handoff token before routing to SKUpervisor company registration.
- `/register-company` exchanges the DGFY handoff token, focuses the business registration form, and collects only company name plus Business Industry as business data.
- Active company registration calls `/api/v1/dgfy/auth/tenant-session` to issue the normal SKUpervisor tenant session for an accepted DGFY founder membership.
- IMS onboarding remains the first master-admin experience because the standard tenant login bootstrap still exposes onboarding metadata.

## Compliance Preconditions

1. Tenant-session handoff must require an authenticated active DGFY account.
2. Tenant-session handoff must only succeed for an accepted membership on an active tenant and active tenant user.
3. Company registration must still derive founder email, phone, and password hash server-side from the DGFY account.
4. Company registration must continue requiring verified DGFY email and current company/marketplace terms acknowledgement.
5. Fallback must preserve manual SKUpervisor login when tenant-session exchange fails after active provisioning.

## Verification Evidence

Targeted validation for this declaration:

1. `npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js`
2. `npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx`
3. `npm run check:architecture`
4. `npm run lint:docs`

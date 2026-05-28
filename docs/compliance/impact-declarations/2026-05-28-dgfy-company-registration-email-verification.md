---
status: reference
owner: engineering
last_reviewed: 2026-05-28
related_adr: docs/architecture/adr/0022-global-dgfy-account-business-registration.md
declaration_id: 2026-05-28-dgfy-company-registration-email-verification
classification: regulatory
surfaces: settings,compliance,user_registration,storefront
reason_codes_impacted: AUTHORIZATION_FAILED,VALIDATION_FAILED
policy_version: 2026.05.28
verification_evidence: npm run lint:docs,npm run check:architecture,npm --prefix backend test tests/registerCompanyRequestUseCase.autoApproval.test.js,npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx,npm --prefix frontend run build
rollback_note: Restore the company-registration OTP UI and backend company_registration OTP consumption only if product explicitly returns to two-step same-address verification. Existing DGFY email verification state remains valid.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-28T00:00:00+08:00
preflight_request_ref: DGFY-COMPANY-EMAIL-VERIFICATION-2026-05-28
---

# DGFY Company Registration Email Verification

## Compliance Impact Classification

Regulatory.

This declaration covers the DGFY company-registration email-ownership rule. Public company registration still requires an authenticated DGFY account with a verified email, but registering a company with that same verified DGFY email no longer requires a second same-address SMTP OTP.

## Affected Surfaces

- Public company registration through `/api/v1/admin/tenants/register`.
- DGFY account email verification through `/api/v1/dgfy/auth/email-verification/request` and `/api/v1/dgfy/auth/email-verification/verify`.
- Registration UI at `/register-company`.
- Governed registration docs and ADRs.

## Compliance Preconditions

1. Company registration must reject unverified DGFY accounts before tenant creation.
2. Company registration must derive founder email from the authenticated DGFY account; clients must not provide or override founder email.
3. A verified DGFY account email is sufficient for same-address company registration and must not trigger a second same-address company OTP.
4. If DGFY email change is implemented later, the new email must clear verification state and complete `dgfy_account_verification` before company registration.
5. Legal acknowledgement checks remain fail-closed before tenant creation.

## Verification Evidence

- `npm run lint:docs`
- `npm run check:architecture`
- `npm --prefix backend test tests/registerCompanyRequestUseCase.autoApproval.test.js`
- `npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx`
- `npm --prefix frontend run build`

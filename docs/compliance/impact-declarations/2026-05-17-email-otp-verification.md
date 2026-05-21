---
status: reference
owner: engineering
last_reviewed: 2026-05-17
related_adr: docs/architecture/adr/0021-email-otp-verification-for-account-email-ownership.md
declaration_id: 2026-05-17-email-otp-verification
classification: regulatory
surfaces: settings,compliance,user_registration
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,AUTHENTICATION_FAILED
policy_version: 2026.05.17
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/emailService.deliveryProvider.test.js tests/emailOtpService.test.js tests/authUsecases.applicationResult.test.js tests/tenantHandler.emailOtp.test.js tests/auth.test.js tests/authTenantIsolation.hardening.test.js,npm --prefix frontend test -- Pages/__tests__/RegisterTokenHandoff.test.jsx Pages/__tests__/AcceptInvite.test.jsx Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx,npm run lint:docs,npm run check:architecture,npm --prefix frontend run build,production npm --prefix backend run verify:email,production npm --prefix backend run verify:email -- --send-to skupervisor@gmail.com
rollback_note: Set EMAIL_OTP_ENFORCEMENT_ENABLED=false to stop requiring OTP codes while leaving the additive email_otps table and verified SMTP settings in place.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-17T14:14:26+08:00
preflight_request_ref: EMAIL-OTP-VERIFY-2026-05-17
---

# Email OTP Verification For Account Email Ownership

## Compliance Impact Classification

Regulatory.

The change adds email-ownership verification before company registration, tenant-user registration, invitation acceptance, and profile email changes can create or mutate account identity. It touches Settings and tenant-registration behavior but does not change POS receipt issuance, payment authorization, tax calculation, or compliance activation reason-code policy.

## Affected Surfaces

- Public company registration, where founder/admin email ownership is verified before tenant request creation.
- Public tenant-user registration, where the joining user's email is verified under tenant context before account creation.
- Invitation acceptance, where token-only invite links still require an OTP sent to the invited email.
- Settings > Profile email changes, where the new email must be verified before landlord lookup mappings are updated.
- Production email delivery configuration, where Brevo SMTP is the verified provider and Brevo HTTPS API fallback remains available when an API key is provisioned.

## Compliance Preconditions

1. OTP enforcement must fail closed when configured email delivery cannot send a code.
2. OTP codes must be single-use, purpose scoped, attempt limited, and consumed with a conditional update.
3. Rollback must not require schema rollback; `EMAIL_OTP_ENFORCEMENT_ENABLED=false` must disable code requirements while preserving existing account state.
4. Production email delivery must be verified before treating OTP-required registration and email-change flows as user-ready.

## Verification Evidence

- `npm --prefix backend test -- --runTestsByPath tests/emailService.deliveryProvider.test.js tests/emailOtpService.test.js tests/authUsecases.applicationResult.test.js tests/tenantHandler.emailOtp.test.js tests/auth.test.js tests/authTenantIsolation.hardening.test.js`
- `npm --prefix frontend test -- Pages/__tests__/RegisterTokenHandoff.test.jsx Pages/__tests__/AcceptInvite.test.jsx Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx`
- `npm run lint:docs`
- `npm run check:architecture`
- `npm --prefix frontend run build`
- Production deploy completed at commit `064766a3c465ca398f2abd821eb8465b72e13e7c`; `20260517000001-create-email-otps.cjs` is up.
- Production `npm --prefix backend run verify:email` passed after correcting `SMTP_USER` to the Brevo SMTP login.
- Production `npm --prefix backend run verify:email -- --send-to skupervisor@gmail.com` sent a real message through provider `smtp`.

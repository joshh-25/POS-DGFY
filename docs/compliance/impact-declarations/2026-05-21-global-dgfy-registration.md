---
status: reference
owner: engineering
last_reviewed: 2026-05-21
related_adr: docs/architecture/adr/0022-global-dgfy-account-business-registration.md
declaration_id: 2026-05-21-global-dgfy-registration
classification: regulatory
surfaces: settings,compliance,user_registration,storefront
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,AUTHENTICATION_FAILED,AUTHORIZATION_FAILED
policy_version: 2026.05.21
verification_evidence: npm run lint:docs,npm run check:architecture,npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js,npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx
rollback_note: Hide the DGFY account registration UI and route public company registration back to the previous tenant-local registration flow only after restoring the prior backend request contract. The additive dgfy_accounts and membership tables can remain unused during rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-21T00:00:00+08:00
preflight_request_ref: GLOBAL-DGFY-REGISTRATION-2026-05-21
---

# Global DGFY Registration

## Compliance Impact Classification

Regulatory.

This declaration covers the current DGFY account registration and company-registration handoff. Public company registration now requires an authenticated landlord-scoped DGFY account, derives founder contact and credentials from that account, keeps new companies in `non_compliant_active`, and links founder/company membership in landlord state. It does not change POS tax calculation, receipt issuance, payment authorization, or compliance activation decisions.

## Affected Surfaces

- Public DGFY account registration, login, and bootstrap.
- Public company registration through `/api/v1/admin/tenants/register`.
- Tenant provisioning, which seeds the tenant master-admin user from the DGFY account.
- Landlord DGFY account membership links for founder and invitation flows.
- Storefront optional customer authentication, where a DGFY token may lazily link to a tenant-local store customer.
- Registration and login UI handoff, where the client stores the DGFY account session separately from tenant JWT sessions and then routes company registration through the tenant login handoff.

## Compliance Preconditions

1. Company registration must continue requiring `company_registration` email OTP for the authenticated DGFY account email.
2. Clients must not be able to override founder email, phone, password hash, plan, or compliance mode in the company-registration payload.
3. New companies must start `non_compliant_active`; compliance activation remains a post-login Settings lifecycle.
4. DGFY account records and tenant-local staff/customer records remain distinct even when linked.
5. Rollback must preserve existing tenant-local login compatibility.

## Verification Evidence

- `npm run lint:docs`
- `npm run check:architecture`
- `npm --prefix backend test -- --runTestsByPath tests/dgfyAuthUseCases.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js`
- `npm --prefix backend test -- --runTestsByPath tests/reproduce_import_bypass.test.js tests/ai_cost_control_e2e.test.js`
- `npm --prefix frontend test -- Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx`

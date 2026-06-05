---
status: reference
owner: engineering
last_reviewed: 2026-06-03
related_adr: docs/architecture/adr/0015-tenant-user-invitation-registry.md
declaration_id: 2026-06-03-invitation-token-only-links
classification: regulatory
surfaces: settings,admin,auth,invitations,tenant-onboarding
reason_codes_impacted: INVITATION_LINK_TOKEN_ONLY,COMPANY_TOKEN_URL_EXPOSURE_REMOVED
policy_version: 2026.06.03
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/settingsCompanyInfo.usecase.test.js tests/settingsHandlers.companyInfo.test.js tests/userManagementToolRegistry.test.js tests/aiTools.test.js tests/emailTemplates.invitation.test.js,npm --prefix frontend test -- --run Pages/__tests__/AcceptInvite.test.jsx Components/users/__tests__/UserManagementModal.rbacContract.test.js,npm run check:architecture,npm run check:compliance
rollback_note: Revert Settings, AI tool, and invite acceptance changes together only if the tenant invitation registry is unavailable; do not restore company-token invite URLs for new invitations.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-03T00:00:00+08:00
preflight_request_ref: INVITATION-TOKEN-ONLY-LINKS-2026-06-03
---

# Invitation Token-Only Link Enforcement

## Compliance Impact Classification

Regulatory.

This declaration covers removal of legacy company-token invite/join links from authenticated Settings, AI tool, email-template, and invitation acceptance surfaces. The change affects tenant onboarding and account lifecycle controls because tenant context should be resolved from scoped invitation records instead of reusable company tokens exposed in URLs.

## Affected Surfaces

- Settings no longer renders or copies a `/register?token=<company_token>` company join link.
- Settings company-info payload no longer includes `registration_link`.
- The AI `get_company_join_link` tool is retired so AI cannot generate company-token registration URLs.
- Invitation email templates build `/accept-invite?token=<invitation_token>` links only.
- The invitation acceptance page ignores `company` and `companyToken` URL parameters for registry-backed validation, OTP request, and account acceptance.

## Compliance Preconditions

1. New tenant user invitations must use landlord-registry invitation tokens.
2. Frontend invitation acceptance must not forward URL-derived company tokens as tenant context for registry-backed links.
3. Backend tenant resolution for token-only invitation acceptance remains server-owned through the invitation registry.
4. Any remaining legacy compatibility must be limited to already-issued, unexpired tenant-local links and must not be used for new generated links.

## Verification Evidence

Targeted validation for this declaration:

1. `npm --prefix backend test -- --runTestsByPath tests/settingsCompanyInfo.usecase.test.js tests/settingsHandlers.companyInfo.test.js tests/userManagementToolRegistry.test.js tests/aiTools.test.js tests/emailTemplates.invitation.test.js`
2. `npm --prefix backend test -- --runTestsByPath tests/authTenantIsolation.hardening.test.js tests/authUsecases.applicationResult.test.js tests/tenantHandler.emailOtp.test.js tests/emailOtpService.test.js`
3. `npm --prefix frontend test -- --run Pages/__tests__/AcceptInvite.test.jsx Components/users/__tests__/UserManagementModal.rbacContract.test.js`
4. `npm run check:architecture`
5. `npm run check:compliance`

## No Fiscal Document Contract Change

This change does not alter fiscal document classification, receipt numbering, POS ledger persistence, eSales reporting, or BIR accreditation claims. It hardens tenant onboarding links and invitation tenant-context resolution.

---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-07-03
applies_to: dgfy_company_access, invitation_acceptance, company_switching
topic: compliance_impact_declaration
declaration_id: 2026-07-03-dgfy-business-step-up-removal-hotfix
classification: major
surfaces: authentication,authorization,pos,terminal,dgfy_company_access,invitation_acceptance,company_switching
reason_codes_impacted: ALLOWED,AUTHENTICATION_FAILED,AUTHORIZATION_FAILED
policy_version: 2026.07.03
verification_evidence: npm --prefix backend test -- --runInBand tests/dgfyAuthUseCases.test.js tests/dgfyAccountRepository.invitationSchema.test.js,npm --prefix frontend test -- src/features/pos/__tests__/terminalSessionSource.contract.test.js
rollback_note: Revert this hotfix if invitation acceptance, company switching, or POS company session activation allows access without an authenticated accepted DGFY tenant membership. Do not delete memberships or tenant data during rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-04T11:30:00+08:00
preflight_request_ref: DGFY-BUSINESS-STEP-UP-REMOVAL-HOTFIX-2026-07-03
---

# DGFY Business Step-Up Removal Hotfix Compliance Impact

## Compliance Impact Classification

Major.

This hotfix removes the extra `dgfy_business_step_up` email-code requirement from routine DGFY company invitation acceptance/rejection and company switch/open-inventory actions.

The change does not weaken the core tenant-access boundary: invitation acceptance still requires an authenticated DGFY account matching the pending explicit `DgfyAccountTenantMembership`, rejection still requires that same pending membership, and switching still requires an accepted active membership. Email or phone matching alone remains insufficient for company access.

Ownership transfer remains protected by business step-up. DGFY account registration, password reset, and legacy-link OTP flows are unchanged.

No payment, checkout, fiscal, or regulated transaction flow is changed.

## Affected Surfaces

1. DGFY company invitation acceptance and rejection.
2. DGFY company switching and open-inventory handoff.
3. POS company session activation that depends on accepted tenant membership.

## Compliance Preconditions

1. The DGFY account must be authenticated before accepting, rejecting, or switching a company membership.
2. The account must match an explicit pending or accepted tenant membership.
3. Email or phone ownership alone must not grant tenant access.
4. Ownership transfer remains protected by business step-up.

## Verification Evidence

Run the commands listed in the front matter before promotion. Manual QA should verify:

1. Invited users can accept/reject only their own pending membership.
2. Accepted users can switch into their assigned company.
3. Uninvited users cannot access a company by email or phone match only.
4. POS company login continues to require authenticated DGFY tenant access.

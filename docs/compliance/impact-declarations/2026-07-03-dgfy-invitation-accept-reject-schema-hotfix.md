---
status: reference
owner: engineering
last_reviewed: 2026-07-03
related_adr: docs/architecture/adr/0028-dgfy-account-company-switching.md
declaration_id: 2026-07-03-dgfy-invitation-accept-reject-schema-hotfix
classification: major
surfaces: ims,pos,terminal,storefront,authentication
reason_codes_impacted: TENANT_SCHEMA_DRIFT,DGFY_INVITATION_ACCEPTANCE
policy_version: 2026.07.03
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/dgfyAccountRepository.invitationSchema.test.js tests/dgfyAuthUseCases.test.js,npm run check:architecture,npm run check:compliance
rollback_note: Revert the tenant-user invitation schema guard if accept/reject mutations regress; existing pending memberships remain landlord-scoped and can be retried after rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-03T15:05:00+08:00
preflight_request_ref: DGFY-INVITATION-ACCEPT-REJECT-SCHEMA-HOTFIX-2026-07-03
---

# DGFY Invitation Accept/Reject Schema Hotfix

## Compliance Impact Classification

Major.

The hotfix keeps DGFY invitation authorization unchanged while making the tenant-local user authorization-profile write path resilient to older tenant schemas. Pending invitations are still accepted or rejected only by the invited DGFY account membership, and accepted memberships remain the authority for IMS/POS company access.

## Affected Surfaces

1. DGFY customer account business invitation acceptance.
2. DGFY customer account business invitation rejection.
3. Tenant-local `users` authorization profile activation/cancellation during DGFY invitation lifecycle.
4. IMS/POS downstream access that depends on accepted `DgfyAccountTenantMembership` rows.

## Compliance Preconditions

1. Email or phone matching remains insufficient for access.
2. Invitation accept/reject still requires the pending landlord membership to belong to the authenticated DGFY account.
3. Accept still requires the governed DGFY business step-up check unless the account already has a fresh step-up.
4. The hotfix must not expose `company_token` in DGFY customer/account responses.
5. The schema guard may only add or widen tenant-local user lifecycle columns needed by the existing DGFY invitation contract.

## Verification Evidence

Focused repository/use-case tests must pass for the schema guard and invitation lifecycle. Architecture and compliance gates must pass before production promotion.

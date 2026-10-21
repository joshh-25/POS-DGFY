---
status: reference
owner: engineering
last_reviewed: 2026-10-16
related_adr: docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md,docs/architecture/adr/0022-global-dgfy-account-business-registration.md
declaration_id: 2026-10-16-automatic-catalog-only-business-registration
classification: regulatory
surfaces: tenant-registration,admin,api,pos,terminal,inventory,storefront,settings,payments,compliance
reason_codes_impacted: IMPACT_DECLARATION_REQUIRED,ALLOWED,VALIDATION_FAILED,TENANT_CAPABILITY_DISABLED
policy_version: 2026.10.16
verification_evidence: npm run lint:docs,npm run check:architecture,npm run audit:backend-tests:check,npm run build,git diff --check,focused-registration-and-capability-tests
rollback_note: Set TENANT_REGISTRATION_APPROVAL_MODE=manual through the approved rollback/admin-review path or revert this phase as one unit. Do not enable unrestricted POS or Storefront access while rollback is being evaluated.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-16T19:30:00+08:00
preflight_request_ref: AUTOMATIC-CATALOG-ONLY-BUSINESS-REGISTRATION-2026-10-16
snapshot_commit: pending-local
---

# Automatic Catalog-Only Business Registration

## Compliance Impact Classification

Regulatory.

This declaration covers the public business-registration lifecycle, tenant provisioning defaults,
POS capability gating, and Storefront visibility defaults. The change allows automatic background
provisioning, but it does not grant unrestricted activation: a new owner can complete onboarding
and manage catalog items/categories only. Selling, checkout, scanning, operational POS pages, and
public Storefront visibility remain disabled until the existing audited Platform Admin capability
controls are enabled.

## Affected Surfaces

- Public DGFY company registration and landlord application/provisioning lifecycle.
- Registration status and transactional email delivery containing the POS onboarding link.
- Tenant-local `tenant_pos_enabled=false` and `store_is_visible=false` defaults.
- POS terminal routing/sidebar and backend capability enforcement.
- OPIS catalog-only navigation and existing Platform Admin capability controls.

## Compliance Preconditions

1. The registration response must return no company token or tenant session; authenticated company
   selection remains the authority for onboarding access.
2. Automatic provisioning must remain auditable and retryable, and partial tenant databases must
   be cleaned up according to the existing provisioning contract.
3. New tenants must remain unable to sell or use operational POS pages until `pos_enabled` is
   enabled by Platform Admin with an audit reason.
4. Storefront discovery/public visibility must remain disabled until `storefront_visible` is
   enabled by Platform Admin with an audit reason.
5. Existing payment, compliance, permission, stock, location, and fiscal gates must not be
   bypassed by catalog-only access or the emailed onboarding link.
6. Registration rate limits and email-delivery audit records remain enabled for the public path.

## Verification Evidence

- `npm run lint:docs`
- `npm run check:architecture`
- `npm run audit:backend-tests:check`
- `git diff --check`
- Focused backend registration, email-template, capability-bootstrap, and ecosystem tests: 20 passed.
- Focused OPIS catalog-only navigation tests: 16 passed.
- Focused POS catalog-only sidebar and tenant-capability parsing tests: 2 passed.
- POS, OPIS, Storefront, and IMS production builds completed successfully.
- Landlord integration execution remains pending local schema repair; the current test database
  reports `Unknown column 'is_demo' in 'field list'` before lifecycle assertions can run.

## No Architecture Exception Required

The change stays within the existing registration, tenant-provisioning, tenant-capability,
authenticated company-selection, POS, Storefront, OPIS, and Platform Admin boundaries. No new
architecture allowlist entry is required.

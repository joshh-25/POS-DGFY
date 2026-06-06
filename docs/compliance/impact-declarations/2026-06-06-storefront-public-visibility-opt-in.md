---
status: reference
owner: engineering
last_reviewed: 2026-06-06
related_adr: docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md,docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-06-06-storefront-public-visibility-opt-in
classification: major
surfaces: onboarding,settings,storefront-discovery,tenant-provisioning
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,STOREFRONT_PUBLIC_VISIBILITY_DISABLED,STOREFRONT_PRIMARY_LOCATION_REQUIRED
policy_version: 2026.06.06
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,npm --prefix backend test -- --runTestsByPath tests/onboardingUsecases.applicationResult.test.js tests/onboardingValidator.test.js tests/tenantProvisioning.storefrontBootstrap.test.js tests/storefrontPublicVisibilityAuditService.test.js,npm --prefix frontend test -- --run src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx,npm --prefix frontend run build:skupervisor,git diff --check
rollback_note: Revert the public-visibility opt-in contract, onboarding payload persistence, provisioning default visibility override, audit script wiring, and Settings/Onboarding UI changes together; then rerun discovery reconciliation before redeploying the previous frontend and backend commit.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-06T00:00:00+08:00
preflight_request_ref: STOREFRONT-PUBLIC-VISIBILITY-OPT-IN-2026-06-06
---

# Storefront Public Visibility Opt-In

## Compliance Impact Classification

Major.

This declaration covers the storefront public-visibility opt-in change for tenant provisioning, onboarding, Settings, and storefront discovery audit tooling. It is compliance-sensitive because it changes whether newly provisioned or onboarding tenants are exposed on DGFY public discovery, map feeds, and public storefront profile reads. It does not change fiscal receipt issuance, tax calculation, payment authorization, subscription billing, tenant authentication, admin authorization, stock deduction, or checkout totals.

## Affected Surfaces

- Tenant provisioning now seeds `store_is_visible=false` before discovery bootstrap, preventing synthetic fallback coordinates from publishing a new tenant by default.
- Onboarding `primary_location` can persist `public_storefront_visible`; hidden storefronts may continue onboarding without creating a public location pin.
- Settings defaults `storeIsVisible` to false unless the tenant setting is explicitly true and warns when public visibility is on without an active primary storefront pin.
- Storefront discovery/profile publication remains dependent on both the visibility setting and a valid active primary or allowed legacy fallback location.
- Operators can run the storefront public visibility audit to find hidden tenants that remain indexed, visible tenants without active pins, invalid visibility settings, stale indexed locations, and fallback-location publication.

## Compliance Preconditions

1. `store_is_visible=false` must be stronger than Customer Access Mode and must hide the tenant from public discovery, map feeds, and public storefront profile reads.
2. Turning visibility on must not publish a tenant without a real active primary storefront pin unless a governed legacy fallback path still applies.
3. Onboarding may mark the primary-location checklist satisfied while hidden, but must require location readiness again when public visibility is enabled.
4. The visibility switch must not bypass item-level Storefront visibility, stock policy, payment readiness, or checkout validation.
5. Release evidence must include exact deployed SHA proof and public-discovery/profile smoke after production deployment.

## Verification Evidence

Required validation for this declaration:

1. `npm run lint:docs`
2. `npm run check:architecture`
3. `npm run check:compliance`
4. `npm --prefix backend test -- --runTestsByPath tests/onboardingUsecases.applicationResult.test.js tests/onboardingValidator.test.js tests/tenantProvisioning.storefrontBootstrap.test.js tests/storefrontPublicVisibilityAuditService.test.js`
5. `npm --prefix frontend test -- --run src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/pages/__tests__/Settings.deepLinking.integration.test.jsx`
6. `npm --prefix frontend run build:skupervisor`
7. `git diff --check`

## Production Verification

Production verification for this change must include:

1. Confirming the remote `HEAD`, `.deploy-state/last_deployed_commit`, and latest deploy summary all match the target SHA.
2. Confirming `https://skupervisor.dgfy.ph` serves the frontend asset built from the deployed commit.
3. Running or recording the storefront public visibility audit against production tenant data.
4. Confirming hidden tenants are not returned by public discovery/map/profile reads and visible tenants still require a valid active primary storefront pin before publication.

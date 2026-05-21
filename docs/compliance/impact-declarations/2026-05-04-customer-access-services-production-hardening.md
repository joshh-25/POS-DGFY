---
status: reference
owner: engineering
last_reviewed: 2026-05-04
related_adr: 0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-05-04-customer-access-services-production-hardening
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED,CUSTOMER_ACCESS_MODE_BLOCKED,STORE_CATALOG_LOCATION_INVALID,STORE_CATALOG_RUNTIME_ERROR
policy_version: 2026.05.04
verification_evidence: npm run lint:docs,npm run check:architecture,npm --prefix backend test,npm --prefix frontend test,npm run build:store,npm --prefix frontend run build:skupervisor,git diff --check
rollback_note: Revert the customer access/services hardening commits, roll back additive migrations where policy allows, refresh storefront discovery index, and redeploy with CUSTOMER_ACCESS_MODES_ENABLED=false.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-04T14:45:00+08:00
preflight_request_ref: CAM-PROD-HARDENING-2026-05-04
---

# Customer Access And Services Production Hardening

## Compliance Impact Classification

Regulatory.

This declaration covers the production hardening release that touches POS catalog behavior, Storefront catalog behavior, Settings, tenant registration approval, Services Mode, and Customer Access Mode rollout controls.

## Affected Surfaces

- POS catalog and checkout surfaces keep POS visibility separate from Storefront visibility.
- Settings surfaces expose Storefront access, inventory display, hosting profile, workflow mode, and tenant registration controls.
- Tenant registration approval can remain manual or use the explicit `auto_standard` mode.
- Storefront public quote, checkout, service booking, and waitlist mutations fail closed when Customer Access enforcement makes the effective mode non-transaction.
- Services Mode adds service booking, waitlist, reminder, provider/resource, and intake contracts while keeping POS service sale behavior stock-exempt.

## Compliance Preconditions

1. `CUSTOMER_ACCESS_MODES_ENABLED=false` remains the production-safe default until controlled tenant rollout evidence exists.
2. `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS` must be scoped to explicit tenant identifiers for canary enforcement while the global flag is false.
3. `TENANT_REGISTRATION_APPROVAL_MODE=manual` remains the default unless the operator intentionally enables `auto_standard`.
4. Payment capability remains controlled by existing payment readiness and compliance gates; Customer Access Mode must not bypass fiscal, stock, location, or payment checks.
5. POS visibility and Storefront visibility remain separate contracts.

## Verification Evidence

- `npm run lint:docs`
- `npm run check:architecture`
- `npm --prefix backend test -- onboardingRepository.schemaCompatibility.test.js catalogVisibilityPolicy.test.js storeUsecases.applicationResult.test.js servicesMode.usecases.test.js settingsValidator.customerAccessModes.test.js onboardingUsecases.applicationResult.test.js customerAccessPolicy.test.js storefrontDiscoveryRepository.test.js settingsHandlers.transport.test.js runtimeSchemaAuditService.test.js`
- `npm --prefix frontend test -- apps/store/src/__tests__/checkoutRules.test.js apps/store/src/__tests__/customerAccess.test.js src/features/settings/__tests__/settingsDeepLink.contract.test.js src/features/onboarding/__tests__/OnboardingSetupModal.behavior.test.jsx src/features/settings/__tests__/workflowMode.services.test.js`
- `npm --prefix frontend test -- apps/store/src/__tests__/checkoutRules.test.js apps/store/src/__tests__/customerAccess.test.js apps/store/src/__tests__/businessModePins.test.js apps/store/src/__tests__/discoveryFlow.integration.test.jsx apps/store/src/__tests__/storefrontFollow.integration.test.jsx`
- `npm run build:store`
- `npm --prefix frontend run build:skupervisor`
- `git diff --check`

---
status: reference
owner: engineering
last_reviewed: 2026-05-09
related_adr: 0017-customer-access-modes-and-inventory-display.md
declaration_id: 2026-05-08-tenant-deletion-premium-settings-compliance-fix
classification: regulatory
surfaces: tenant,settings,storefront,compliance
reason_codes_impacted: ALLOWED,NON_COMPLIANT_FISCAL_FIELDS_BLOCKED
policy_version: 2026.05.08
verification_evidence: npm --prefix backend test -- --runTestsByPath tests/deleteTenantUseCase.test.js tests/settingsUsecases.applicationResult.test.js tests/settingsComplianceChangedKeys.integration.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js tests/adminTenantHandlers.transport.test.js tests/adminTenantLifecycle.integration.test.js tests/subscriptionIntegration.test.js tests/requirePremium.middleware.test.js,npm --prefix frontend test -- src/pages/__tests__/TenantManager.editPlan.integration.test.jsx Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx,npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check
rollback_note: Revert the tenant deletion/index cleanup, premium default, Settings change-set, and migration changes; then reconcile storefront discovery index before re-enabling public discovery.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-05-08T00:00:00+08:00
preflight_request_ref: TENANT-SETTINGS-PREMIUM-FIX-2026-05-08
---

# Tenant Deletion, Premium Defaults, And Settings Compliance Fix

## Compliance Impact Classification

Regulatory.

This declaration covers a targeted fix for three runtime contracts:

- permanent tenant deletion now clears the landlord Storefront discovery row before database deletion, fails closed when discovery cleanup fails, and best-effort restores discovery if database deletion fails afterward;
- pending and active tenant registrations are premium-capable by default while provider subscription flows remain disabled when payments are paused;
- manual premium-capable tenants do not synthesize active paid subscription state without a provider subscription id;
- bulk Settings saves compare incoming values against persisted settings before compliance preflight so unchanged fiscal POS fields do not block unrelated non-compliant-mode Settings changes.

## Affected Surfaces

- Tenant management delete flow and storefront discovery read model cleanup.
- Tenant registration/provisioning plan metadata and the backfill migration for pending/active tenant rows.
- Settings update preflight behavior for non-compliant tenants.

## Compliance Preconditions

1. Non-compliant tenants must still be blocked from changing fiscal-only POS fields.
2. Provider subscription payloads with `subscriptionId` must still return `PAYMENTS_DISABLED` while payments are paused.
3. Storefront discovery reconciliation remains the fallback cleanup path, but tenant delete must not rely on the scheduler to hide removed tenants.
4. Pending and active tenants must remain premium-capable even if a legacy admin update payload includes `plan=standard`.

## Verification Evidence

- `npm --prefix backend test -- --runTestsByPath tests/deleteTenantUseCase.test.js tests/settingsUsecases.applicationResult.test.js tests/settingsComplianceChangedKeys.integration.test.js tests/registerCompanyRequestUseCase.autoApproval.test.js tests/adminTenantHandlers.transport.test.js tests/adminTenantLifecycle.integration.test.js tests/subscriptionIntegration.test.js tests/requirePremium.middleware.test.js`
- `npm --prefix frontend test -- src/pages/__tests__/TenantManager.editPlan.integration.test.jsx Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx`
- `npm run lint:docs`
- `npm run check:architecture`
- `npm run check:compliance`
- `git diff --check`

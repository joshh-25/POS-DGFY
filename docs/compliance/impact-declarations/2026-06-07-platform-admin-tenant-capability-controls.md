---
status: reference
owner: engineering
last_reviewed: 2026-06-11
related_adr: docs/architecture/adr/0010-storefront-discovery-item-match-index-and-union-query.md
declaration_id: 2026-06-07-platform-admin-tenant-capability-controls
classification: regulatory
surfaces: admin-tenants,tenant-management,pos,storefront-discovery,ims,settings,compliance,terminal
reason_codes_impacted: ALLOWED,TENANT_CAPABILITY_DISABLED,CUSTOMER_ACCESS_MODE_BLOCKED,VALIDATION_FAILED
policy_version: 2026.06.07
verification_evidence: npm run check:architecture,npm run lint:docs,npm run check:compliance,npm --prefix backend test -- --runTestsByPath tests/tenantCapabilityReadiness.schemaCompatibility.test.js tests/adminTenantCapabilities.transport.test.js tests/tenantCapabilityRouteGates.test.js tests/updateTenantCapabilitiesUseCase.rollback.test.js tests/adminTenantCapabilityValidator.test.js tests/listTenantCapabilityAuditLogs.usecase.test.js tests/tenantCapabilitySettings.test.js tests/listTenants.usecase.test.js --runInBand,cd frontend && npm exec vitest run src/utils/__tests__/tenantCapabilityMessages.test.js src/utils/__tests__/errorHandler.test.js src/components/common/__tests__/GlobalApiErrorListener.test.js src/components/common/__tests__/TenantCapabilityNotice.test.jsx src/components/common/__tests__/TenantCapabilityLayout.render.test.jsx src/components/common/__tests__/tenantCapabilityNotice.contract.test.js src/features/pos/__tests__/TerminalPageLayout.capabilityNotice.test.jsx src/features/pos/__tests__/terminalViewModeContracts.test.js src/services/__tests__/api.globalErrors.test.js apps/store/src/__tests__/customerAccess.test.js apps/store/src/__tests__/storefrontErrorMessages.test.js src/pages/__tests__/TenantManager.capabilities.integration.test.jsx -- --pool=threads,npm --prefix frontend run build:skupervisor,npm --prefix frontend run build:pos,npm --prefix frontend run build:store,git diff --check
rollback_note: Revert the admin capability endpoint, Tenant Manager capability UI, IMS/POS route gates, and related docs together; then rerun storefront discovery sync for any tenant whose Storefront visibility changed during the rollout.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-07T10:30:00+08:00
preflight_request_ref: PLATFORM-ADMIN-TENANT-CAPABILITY-CONTROLS-2026-06-07
---

# Platform Admin Tenant Capability Controls

## Compliance Impact Classification

Regulatory.

This declaration covers platform-admin Tenant Manager controls for tenant-level IMS access, POS access, and public Storefront / Maps publication. The change is compliance-sensitive because platform admins can now disable POS and IMS route groups and can change Storefront public exposure without logging into the tenant IMS. It does not change fiscal receipt formatting, tax computation, payment capture, stock deduction, tenant lifecycle status, subscription plan policy, or item-level POS/Storefront visibility.

## Affected Surfaces

- Tenant Manager reads active tenant capability settings and renders IMS, POS, Storefront / Maps, and Storefront access-mode controls.
- Tenant Manager groups IMS/POS as core workspace access, groups Storefront visibility/access modes as public Storefront controls, and exposes first-class tenant search across company identity and capability state without changing the capability payload contract.
- `PATCH /api/v1/admin/tenants/:id/capabilities` requires a reason, validates strict booleans/access modes, writes tenant-local `system_settings` rows for `tenant_ims_enabled`, `tenant_pos_enabled`, `store_is_visible`, and `customer_access_mode`, and persists a landlord `tenant_admin_audit_logs` row with before/after snapshots.
- `GET /api/v1/admin/tenants/:id/capabilities/audit-logs` exposes recent tenant-scoped capability audit logs to platform admins.
- `/api/v1/pos/*` returns `403 TENANT_CAPABILITY_DISABLED` when platform POS access is disabled. Shared mode routes that authorize through POS permission fallbacks ignore those fallback permissions while POS is disabled.
- Authenticated IMS route groups return `403 TENANT_CAPABILITY_DISABLED` when platform IMS access is disabled; auth, current-user remediation, admin, receive-token, billing/payment, and public Storefront routes stay outside this gate.
- Storefront visibility/access-mode changes refresh the landlord discovery index after successful tenant setting writes; failed refreshes roll back Storefront setting changes before returning failure.
- Tenant-facing IMS, POS, and Storefront UI now normalize `TENANT_CAPABILITY_DISABLED` and `CUSTOMER_ACCESS_MODE_BLOCKED` into explicit "Platform admin changed your permissions" copy. The tenant shell also reads existing system settings after user hydration to show disabled or downgraded capability state before a blocked click when settings are readable. This remains in-app message/banner only; it does not add email, notification-center records, schema changes, fiscal behavior changes, or new authorization decisions.
- Tenant Manager capability confirmation modals show the tenant/customer impact preview before the platform admin submits the required audit reason.

## Compliance Preconditions

1. Missing `tenant_ims_enabled` and `tenant_pos_enabled` settings default to enabled so legacy tenants are not disabled by missing rows.
2. Storefront public exposure remains governed by `store_is_visible` and still requires the existing discovery/profile/index readiness rules.
3. `customer_access_mode` must remain one of `ghost`, `catalog`, `inquiry`, or `transaction`.
4. Capability switches must not mutate tenant lifecycle status, subscription plan metadata, item-level catalog overrides, branch availability overrides, payment readiness, or fiscal compliance mode.
5. Capability changes must keep a durable platform-admin reason and before/after audit snapshot.
6. Tenant-facing capability messages must remain explanatory UI only; backend route gates and Storefront access-mode use cases remain the source of enforcement truth.

## Verification Evidence

Required validation for this declaration:

1. `npm run check:architecture`
2. `npm run lint:docs`
3. `npm run check:compliance`
4. `npm --prefix backend test -- --runTestsByPath tests/tenantCapabilityReadiness.schemaCompatibility.test.js tests/adminTenantCapabilities.transport.test.js tests/tenantCapabilityRouteGates.test.js tests/updateTenantCapabilitiesUseCase.rollback.test.js tests/adminTenantCapabilityValidator.test.js tests/listTenantCapabilityAuditLogs.usecase.test.js tests/tenantCapabilitySettings.test.js tests/listTenants.usecase.test.js --runInBand`
5. From `frontend/`: `npm exec vitest run src/pages/__tests__/TenantManager.capabilities.integration.test.jsx src/pages/__tests__/TenantManager.editPlan.integration.test.jsx src/pages/__tests__/TenantManager.forceNonCompliant.integration.test.jsx -- --pool=threads`
6. Tenant Manager audit-trail rendering: `npm --prefix frontend test -- TenantManager.capabilities.integration.test.jsx`
7. Tenant-facing capability messaging and affected tenant surfaces, from `frontend/`: `npm exec vitest run src/utils/__tests__/tenantCapabilityMessages.test.js src/utils/__tests__/errorHandler.test.js src/components/common/__tests__/GlobalApiErrorListener.test.js src/components/common/__tests__/TenantCapabilityNotice.test.jsx src/components/common/__tests__/TenantCapabilityLayout.render.test.jsx src/components/common/__tests__/tenantCapabilityNotice.contract.test.js src/features/pos/__tests__/TerminalPageLayout.capabilityNotice.test.jsx src/features/pos/__tests__/terminalViewModeContracts.test.js src/services/__tests__/api.globalErrors.test.js apps/store/src/__tests__/customerAccess.test.js apps/store/src/__tests__/storefrontErrorMessages.test.js src/pages/__tests__/TenantManager.capabilities.integration.test.jsx -- --pool=threads`
8. Result for the current tenant-facing messaging slice: 12 files / 81 tests passed on 2026-06-11.
9. `npm --prefix frontend run build:skupervisor`
10. `npm --prefix frontend run build:pos`
11. `npm --prefix frontend run build:store`
12. `git diff --check`

## Production Verification

Production verification must confirm that active tenants keep enabled IMS/POS defaults when the new settings are absent, POS-disabled tenants receive `TENANT_CAPABILITY_DISABLED` on POS routes, and Storefront visibility/access-mode changes produce the expected public discovery/profile result after discovery sync.

Current production evidence from 2026-06-08:

- Deployed target SHA: `023e5f9ff0c71340cb9f92a9a7d7526920a62e05`.
- Emergency no-staging bypass was explicitly recorded because stale QA deployed-head evidence was the sole failed promotion gate after QA smoke, rollback/restore docs, architecture, and compliance checks passed. This does not close `System_Audit/7.2-Release_evidence_depends_on_stale_or_bypassable_QA_paths.md`; it records the auditable bypass for this release only.
- Production remote `HEAD` and `.deploy-state/last_deployed_commit` both matched `023e5f9ff0c71340cb9f92a9a7d7526920a62e05`.
- Production deploy summary `/var/www/skupervisor/logs/deploy/deploy_20260608_024256.summary.txt` reported backend, IMS, POS, Storefront, and public endpoint health checks passing, frontend asset parity passing, tenant schema sync healthy, and strict index-headroom checks healthy.
- `https://skupervisor.dgfy.ph/api/v1/health` returned `200` with `environment=production`, database connected, Redis connected, and `runtimeSchema=healthy`.
- Platform-admin smoke against `https://skupervisor.dgfy.ph` returned login `200`, tenant list `200`, `tenant_count=13`, `capabilities.unavailable` count `0`, and capability audit-log route `200`.
- The production smoke specifically verified that tenant readiness still loads when the tenant-local `tenant_locations` model does not expose optional `storefront_last_synced_at`; `storefront_readiness` remained publishable for the sampled active tenant with coordinates.
- `npm run gate:release:prod-contracts:env` was not run locally because `.env.prod.local` was absent in the workstation checkout; production deploy wrapper health and smoke evidence above are the current production proof for this declaration.

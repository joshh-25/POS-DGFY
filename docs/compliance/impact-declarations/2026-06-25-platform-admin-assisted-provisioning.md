---
status: reference
owner: engineering
last_reviewed: 2026-06-25
related_adr: docs/architecture/adr/0022-global-dgfy-account-business-registration.md,docs/architecture/adr/0028-dgfy-account-company-switching.md
declaration_id: 2026-06-25-platform-admin-assisted-provisioning
classification: regulatory
surfaces: tenant-registration,admin,settings,pos,terminal,docs,api,compliance
reason_codes_impacted: IMPACT_DECLARATION_REQUIRED,ALLOWED,VALIDATION_FAILED,DGFY_MEMBERSHIP_REQUIRED,POS_UNLOCK_DENIED
policy_version: 2026.06.25
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check,npm --prefix backend test -- --runInBand tests/dgfyAdminAccountUseCases.test.js tests/adminAssistedProvisioningUseCase.test.js tests/dgfyAdminAccountRoutes.contract.test.js tests/adminAssistedProvisioningRoutes.contract.test.js tests/tenantAdminAuditLogActions.contract.test.js,npm --prefix frontend test -- --run src/services/__tests__/adminService.adminOperations.contract.test.js,npm --prefix frontend test -- --run src/pages/__tests__/DgfyAccountManager.integration.test.jsx src/pages/__tests__/TenantManager.capabilities.integration.test.jsx,npm --prefix frontend run build
rollback_note: Revert the admin assisted provisioning migration, DGFY/admin tenant use cases, admin routes, Tenant Manager and DGFY Accounts panels, tests, and docs together; keep public OTP-backed registration and DGFY membership session rules unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-25T00:00:00+08:00
preflight_request_ref: PLATFORM-ADMIN-ASSISTED-PROVISIONING-2026-06-25
snapshot_commit: pending-local
---

# Platform Admin Assisted Provisioning

## Compliance Impact Classification

Regulatory.

This declaration covers the platform-admin-only onboarding path for creating admin-provisioned DGFY accounts, ownerless tenant companies, combined DGFY+tenant provisioning, and force owner handover. The slice changes tenant registration, account lifecycle, and POS/IMS access setup boundaries, so it is treated as regulatory even though it does not change fiscal receipt generation, tax computation, or payment capture.

## Affected Surfaces

1. Platform Admin can create active DGFY accounts without public OTP only through authenticated admin routes.
2. Platform Admin can create ownerless tenant companies and provision tenant databases immediately for IMS/POS setup.
3. Platform Admin can create a DGFY account and tenant in one action, including tenant-local master admin profile and accepted founder membership.
4. Platform Admin can assign or force-assign ownership only to an existing active DGFY account id.
5. Tenant Manager and DGFY Accounts admin panels expose assisted provisioning forms with required audit reasons.
6. Landlord audit logs record account creation, tenant creation, combined creation, owner assignment, force owner assignment, and temporary-password remediation events without secrets.

## Compliance Preconditions

1. Public DGFY registration still requires `dgfy_account_verification` OTP and legal acknowledgement.
2. Public company registration still requires an authenticated DGFY account and does not use the admin provisioning routes.
3. Admin-provisioned account email verification source is `platform_admin_provisioned`; phone remains unverified.
4. Temporary passwords are response-only and must not be persisted in audit snapshots, logs, or docs.
5. Ownerless tenants must not issue DGFY tenant sessions, POS sessions, switcher access, or owner-authorized actions until explicit accepted membership exists.
6. Owner handover must create or update `DgfyAccountTenantMembership`; ownership must not be inferred from matching email or phone.
7. Admin provisioning evidence does not replace merchant-facing legal acknowledgement before self-service owner actions, public commerce, or other sensitive business actions.

## Verification Evidence

1. `npm run lint:docs`
2. `npm run check:architecture`
3. `npm run check:compliance`
4. `git diff --check`
5. `npm --prefix backend test -- --runInBand tests/dgfyAdminAccountUseCases.test.js tests/adminAssistedProvisioningUseCase.test.js tests/dgfyAdminAccountRoutes.contract.test.js tests/adminAssistedProvisioningRoutes.contract.test.js tests/tenantAdminAuditLogActions.contract.test.js`
6. `npm --prefix frontend test -- --run src/services/__tests__/adminService.adminOperations.contract.test.js`
7. `npm --prefix frontend test -- --run src/pages/__tests__/DgfyAccountManager.integration.test.jsx src/pages/__tests__/TenantManager.capabilities.integration.test.jsx`
8. `npm --prefix frontend run build`

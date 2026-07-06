---
status: reference
owner: engineering
last_reviewed: 2026-06-27
related_adr: docs/architecture/adr/0022-global-dgfy-account-business-registration.md,docs/architecture/adr/0028-dgfy-account-company-switching.md
declaration_id: 2026-06-27-assisted-provisioning-ui-consolidation
classification: regulatory
surfaces: tenant-registration,admin,settings,docs,api,pos,terminal,compliance
reason_codes_impacted: IMPACT_DECLARATION_REQUIRED,ALLOWED,VALIDATION_FAILED
policy_version: 2026.06.27
verification_evidence: npm run lint:docs,npm run check:architecture,npm run check:compliance,git diff --check,npm --prefix backend test -- --runInBand tests/adminAssistedProvisioningUseCase.test.js tests/adminAssistedProvisioningRoutes.contract.test.js tests/dgfyAdminAccountUseCases.test.js tests/dgfyAdminAccountRoutes.contract.test.js tests/dgfyAuthUseCases.test.js tests/dgfyTenantSessionService.contract.test.js tests/dgfyTenantSession.transport.test.js,npm --prefix frontend test -- --run src/pages/__tests__/TenantManager.assistedProvisioning.integration.test.jsx src/pages/__tests__/DgfyAccountManager.integration.test.jsx,npm run build:skupervisor
rollback_note: Revert the Tenant Manager UI and frontend service changes together; the backward-compatible backend legacy provision endpoint remains available and unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-27T12:00:00+08:00
preflight_request_ref: ASSISTED-PROVISIONING-UI-CONSOLIDATION-2026-06-27
snapshot_commit: pending-local
---

# Assisted Provisioning UI Consolidation

## Compliance Impact Classification

Regulatory. The change removes the redundant legacy Platform Admin tenant-creation control, retains the governed company-only, DGFY-plus-company, and DGFY-account-only paths, and makes post-commit provisioning failures explicitly retryable and reconcilable.

## Affected Surfaces

Platform Admin Tenant Manager, the shared admin frontend service, and focused Tenant Manager/DGFY Account Manager regression tests are affected. The settings classification is inherited from the compliance-sensitive Tenant Manager surface; no tenant Settings behavior changes.

## Compliance Preconditions

1. The backend legacy tenant provisioning endpoint remains unchanged for compatibility.
2. Public DGFY registration, legal acknowledgement, ownership, accepted membership, tenant-session, and POS authorization rules remain unchanged.
3. Company-only UI copy states that DGFY login, switching, owner actions, and POS access require owner assignment and accepted membership.
4. Temporary passwords remain response-only and are cleared from the rendered assisted-provisioning state before every new submission.
5. No payment, fiscal, PayMongo, production data, or deployment surface is changed.
6. Retry is limited to exact platform-admin partial records. Completed memberships and mismatched account, tenant, phone, ownership, or source records remain conflicts.
7. An active tenant is never database-provisioned again during ownership reconciliation.

## Verification Evidence

The commands named in front matter must pass before this slice is considered complete. Rendered desktop/mobile checks of `/admin/tenants` and `/admin/dgfy-accounts` are required separately and must not be replaced by component tests.

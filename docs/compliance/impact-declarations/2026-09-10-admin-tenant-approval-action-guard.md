---
status: reference
owner: engineering
last_reviewed: 2026-09-10
declaration_id: 2026-09-10-admin-tenant-approval-action-guard
classification: regulatory
surfaces: admin,tenant-registration,settings,compliance
reason_codes_impacted: VALIDATION_FAILED,ALLOWED
policy_version: 2026.09.10
verification_evidence: TenantManager public-registration action integration tests,IMS lint,IMS production build,architecture/compliance/docs checks,git diff --check
rollback_note: Revert the Tenant Manager action-state guard, its regression tests, and this declaration together. The backend approval guard and all tenant records remain unchanged; rollback only restores the misleading approval controls for pending records without a public registration application.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-10T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-ADMIN-TENANT-APPROVAL-GUARD-LOCAL-ONLY
---

# Admin tenant approval action guard

## Compliance Impact Classification

Regulatory, because the Tenant Manager controls a platform-admin approval path for tenant registration and provisioning. The change only prevents an invalid public-registration action from being offered for unrelated pending tenant records.

## Affected Surfaces

- Platform-admin Tenant Manager action controls in `apps/dgfy-ims/Pages/admin/TenantManager.jsx`.
- Existing backend approval validation remains unchanged.

## Compliance Preconditions

- Tenant identity, authorization, registration review, and provisioning rules remain server-side.
- The UI only derives available actions from the tenant status and the linked registration application state.
- No tenant record, registration application, capability, payment, or database schema is written by this change.

## Verification Evidence

- Pending tenants without a linked public registration no longer render Approve or Reject actions.
- Pending public registrations still render Approve and Reject.
- Focused integration tests pass (2 tests), changed-file lint passes with only existing warnings, and no database or API contract changes are introduced.

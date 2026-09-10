---
status: reference
owner: engineering
last_reviewed: 2026-09-10
declaration_id: 2026-09-10-admin-tenant-approval-action-guard
classification: regulatory
surfaces: admin,tenant-registration,settings,compliance
reason_codes_impacted: VALIDATION_FAILED,ALLOWED
policy_version: 2026.09.10
verification_evidence: list-tenants lifecycle-policy tests, TenantManager registration-action integration tests, IMS lint, IMS production build, git diff --check
rollback_note: Revert the registration action policy, list response field, UI guard, tests, documentation, and this declaration together; tenant records and server approval validation remain unchanged.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-10T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-ADMIN-TENANT-APPROVAL-GUARD-LOCAL-ONLY
---

# Admin tenant approval action guard

## Compliance Impact Classification

Regulatory, because the Tenant Manager controls a platform-admin approval path for tenant registration and provisioning. The change prevents invalid public-registration actions from being offered for unrelated or already-transitioned pending tenant records and exposes no new write or authorization path.

## Affected Surfaces

- Platform-admin Tenant Manager action controls in `apps/dgfy-ims/Pages/admin/TenantManager.jsx`.
- The landlord tenant list response in `apps/dgfy-api` now includes the server-computed `registration_action` descriptor and the registration application's existing update timestamp.
- Existing approve, retry, reject, authorization, and atomic registration transitions remain unchanged.

## Compliance Preconditions

- Tenant identity, authorization, registration review, and provisioning rules remain server-side.
- The UI treats the descriptor as display guidance and fails closed for missing or non-actionable states; direct API calls remain protected by the existing lifecycle predicates.
- No tenant record, registration application, capability, payment, or tenant database is written by the list/action-guard change.
- The existing ten-minute stale provisioning threshold is reused; no new bypass or manual activation path is introduced.

## Verification Evidence

- Pending tenants without a linked public registration no longer render Approve or Reject actions.
- Pending public registrations render Approve and Reject; failed or stale approved provisioning renders Retry setup; fresh setup renders an in-progress message.
- Focused Jest and Vitest suites pass, IMS production build passes, and lint reports no new errors.

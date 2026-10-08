---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-09-26
related_adr: docs/architecture/adr/0021-dgfy-global-account-identity.md
declaration_id: 2026-09-26-dgfy-business-registration-admin-review
classification: regulatory
surfaces: admin,api,database,onboarding,user_registration,settings,pos,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,AUTHENTICATION_FAILED,AUTHORIZATION_FAILED,RESOURCE_NOT_FOUND,SERVICE_UNAVAILABLE
policy_version: 2026.09.26
verification_evidence: Registration upload review/ZIP/audit tests 3 suites 9/9, combined registration/legal/materialization/admin-handler tests 14 suites 66/66, API and IMS lint, IMS production build, architecture guardrails, docs/ADR lint
rollback_note: Revert the admin registration-review UI, admin service wrappers, upload-review use case/routes/controllers, download-audit model/migrations, tenant-list registration reference, tests, and this declaration together; the landlord draft and materialization contracts remain available for a later admin-review implementation.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-08T09:13:46.750Z
preflight_request_ref: PREFLIGHT-37754614808-2026-09-26-DGFY-BUSINESS-REGISTRATION-ADMIN-REVIEW
---

# 2026-09-26 DGFY business registration admin review and secure downloads

## Compliance Impact Classification

Regulatory. This change gives authorized platform administrators access to
submitted registration evidence and private uploads, including secure file
downloads and menu-original archives. It does not expose storage keys,
automatically extract or publish menu items, or grant applicant access to
another registration.

## Affected Surfaces

- Platform-admin Tenant Manager registration review surface.
- Landlord registration upload metadata and download-audit records.
- Authenticated admin download routes for pending drafts and materialized
  tenants.
- Existing tenant-admin audit history for downloads after tenant materialization.

## Compliance Preconditions

1. Every review and download route is behind `authenticateAdmin` and the
   `admin.tenants` platform-admin permission policy.
2. Draft/tenant resolution is server-side. A tenant route must resolve the
   linked registration draft and cannot select an unrelated upload by client
   input alone; removed uploads are excluded.
3. Downloaded files are checked for private-root containment, regular-file
   status, recorded size, and SHA-256 integrity before bytes are returned.
4. Archive entry names are sanitized and generated from server-owned category
   and position values. The ZIP includes only active menu originals plus a
   metadata manifest; raw storage keys are never returned to the client.
5. Individual and archive downloads create an administrative audit record. A
   pending draft uses the landlord registration-download audit table; a
   materialized tenant uses the existing tenant-admin audit trail.

## Verification Evidence

- Upload review, checksum validation, ZIP manifest, and pending-draft audit
  tests: 3 suites, 9/9 tests.
- Combined registration/legal/materialization/admin-handler regression tests:
  14 suites, 66/66 tests.
- API and IMS lint pass with no errors; IMS production build passes.
- The local compliance declaration uses the repository's `NOT-EXECUTED-*`
  handoff convention; live compliance preflight, migration rehearsal,
  authenticated browser acceptance, and deployed review remain required before
  release promotion.

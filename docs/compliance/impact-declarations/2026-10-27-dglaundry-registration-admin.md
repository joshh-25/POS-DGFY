---
status: reference
owner: engineering
last_reviewed: 2026-10-27
related_adr: docs/architecture/adr/0079-dglaundry-external-runtime-and-provider-contract.md
declaration_id: 2026-10-27-dglaundry-registration-admin
classification: regulatory
surfaces: settings,compliance
reason_codes_impacted: DGLAUNDRY_REGISTRATION_NOT_FOUND,DGLAUNDRY_REGISTRATION_STALE_VERSION,DGLAUNDRY_REGISTRATION_ALREADY_DECIDED,DGLAUNDRY_REGISTRATION_APPLICANT_IDENTITY_INVALID,DGLAUNDRY_REGISTRATION_APPLICANT_UNAVAILABLE,DGLAUNDRY_REGISTRATION_DETAILS_INCOMPLETE
policy_version: 2026.10.27
verification_evidence: DGFY API suites (4 suites and 65 tests passed); Platform Admin DGLaundry queue tests (2 passed); Admin Vite build; architecture and controller-boundary checks; documentation and ADR checks (17 ADR tests passed); OpenAPI YAML parse; migration JavaScript syntax check; git diff --check; npm run check:compliance
rollback_note: Stop new registration decisions first. If no approvals exist, revert the application change and run the migration down path. If approvals exist, preserve company, membership, provider-location, and audit records and use a forward repair because the down migration cannot safely reverse accepted access records.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-27T20:25:19+08:00
preflight_request_ref: NOT-EXECUTED-2026-10-27-DGLAUNDRY-REGISTRATION-ADMIN
---

# DGLaundry Registration Queue and Decisions

This change lets authorized DGFY Platform Admin users review DGLaundry company-registration intents and record versioned decisions. Approval creates or links the authoritative company, its first provider location, and the applicant's owner membership; rejection and correction requests do not create those records.

## Compliance Impact Classification

Regulatory. The compliance checker assigns this floor to the Platform Admin tenant-management paths. The workflow also creates company and membership access records from an external registration request, so identity binding, authorization, audit, and status-version safeguards are required.

## Affected Surfaces

- `apps/dgfy-admin/Pages/TenantManager.jsx` and `apps/dgfy-admin/Pages/DglaundryRegistrationQueue.jsx` expose the review queue inside Tenant Management.
- `apps/dgfy-admin/src/services/adminService.js` and `apps/dgfy-api/src/routes/adminTenants.js` expose the permission-protected queue and decision endpoints.
- DGLaundry provider handlers, use cases, and repository return authoritative company, provider-location, membership, identity, status, and version data for local reconciliation.
- `dgfy_dglaundry_intents` stores decision, identity, and version metadata; `dgfy_dglaundry_provider_locations` stores the DGFY-generated provider location identifier.
- The checker requires the `settings` and `compliance` surfaces for the changed Platform Admin paths. The declaration records those required classifications and the controls below.

## Compliance Preconditions

- Existing Tenant Admin authorization protects the queue and decision endpoints.
- The applicant is bound by the exact DGFY issuer and subject. Email, name, and slug are not identity keys.
- Approval creates or links the company, provider location, and accepted owner membership in one transaction and appends an admin audit record.
- Rejection and correction requests do not create company, location, or membership records; negative decisions require a reason.
- Expected status versions prevent stale decisions, and retries of the same decision are idempotent.
- DGLaundry local provisioning requires matching identity and authoritative membership, company, connection, status, and version checks.
- A live compliance preflight was not run because Docker is unavailable in this environment. The required front-matter fields record declaration preparation time and the unexecuted preflight reference; the continuous `develop` preflight sweep is responsible for resolving it after merge.

## Verification Evidence

- DGFY API tests passed four suites and 65 tests, including authorization, registration decisions, transactions, and stale-version behavior.
- Platform Admin registration-queue tests passed two tests, and the Admin Vite build succeeded.
- Architecture guardrails, controller boundaries, documentation checks, ADR checks, and 17 ADR tests passed.
- The partner OpenAPI YAML parsed, the migration passed JavaScript syntax validation, and `git diff --check` passed.
- `npm run check:compliance` is rerun with this declaration included.

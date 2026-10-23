---
status: draft_pr
owner: DGFY POS and OPIS
last_reviewed: 2026-10-23
related_adr: docs/architecture/adr/0020-mode-aware-rbac-and-role-presets.md,docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md
declaration_id: 2026-10-23-pos-opis-rbac-catalog-finalization
classification: regulatory
surfaces: pos,terminal,settings,inventory,business_admin,tenant_schema,compliance
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,AUTHORIZATION_FAILED,UNAUTHORIZED
policy_version: 2026.10.23
verification_evidence: focused-api-jest-64-tests,backend-lint,check-architecture,check-tenant-schema-coverage-staged,code-audit-archive-test,git-diff-cached-check
rollback_note: Revert the POS catalog normalization, staff-role/RBAC, OPIS Business Admin navigation and presentation, tenant migration, tests, and this declaration together. Preserve existing tenant, user, role, catalog, and audit records; do not remove additive schema objects during rollback without a separate migration review.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-23T00:00:00+08:00
preflight_request_ref: NOT-EXECUTED-20261023-POS-OPIS-RBAC-CATALOG-FINALIZATION
---

# POS and OPIS RBAC, navigation, and catalog finalization

## Compliance Impact Classification

Regulatory. This commit combines server-authoritative staff-role and permission
updates, OPIS Business Admin navigation and presentation changes, additive tenant
schema support, and POS catalog taxonomy normalization. The POS fix removes an
incorrect cross-surface validation block without removing authentication,
permission, inventory-authority, tenant-scope, or catalog persistence checks.

## Affected Surfaces

- POS terminal catalog creation/update, terminal controls, and effective button permissions.
- Tenant settings, staff-role assignment, permission dependencies, and capability resolution.
- OPIS Business Admin navigation, user access presentation, and settings workflows.
- Inventory/catalog taxonomy validation and the shared POS/IMS catalog persistence path.
- Additive tenant-schema migration and its registry/readiness checks.

## Compliance Preconditions

1. The API remains authoritative for authentication, tenant scope, location scope,
   permissions, staff-role write authority, inventory authority, and POS operator access.
2. POS-originated catalog writes normalize only invalid or stale taxonomy fields to a
   valid workflow-mode preset; they do not bypass Joi validation, route permissions,
   inventory-authority gates, repository validation, or catalog invalidation.
3. Non-POS inventory/IMS/OPIS writes continue to use strict mode-taxonomy validation.
4. Staff-role and dependent-permission changes remain server-enforced and do not grant
   access from frontend visibility alone.
5. The tenant migration remains additive and must pass the migration-runner/schema
   coverage check before promotion. This local commit does not deploy or claim a live
   policy-engine preflight result; the promotion-time compliance sweep must reconcile
   the `NOT-EXECUTED-*` request reference.

## Verification Evidence

- Focused API coverage passed: 5 suites, 64 tests, including POS catalog create/update
  normalization, strict non-POS taxonomy behavior, mobile POS sync, inventory-authority
  gates, capability overlays, and handler transport contracts.
- Backend lint passed with zero errors; the reported warnings are pre-existing and
  outside this change set.
- API architecture guardrails and controller-boundary checks passed.
- Staged tenant-schema coverage passed for the migration file.
- Code-audit archive contract test passed.
- `git diff --cached --check` passed before commit.

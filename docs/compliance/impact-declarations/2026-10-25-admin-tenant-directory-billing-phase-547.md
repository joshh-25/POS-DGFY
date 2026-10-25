---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-25
related_adr: docs/architecture/adr/0047-platform-admin-identity-and-page-rbac.md
declaration_id: 2026-10-25-admin-tenant-directory-billing-phase-547
classification: regulatory
surfaces: settings,compliance
reason_codes_impacted: NONE
policy_version: 2026.10.25
verification_evidence: 229 Admin Vitest tests and 21 API Jest tests; Admin production build; local desktop/mobile synthetic journey; repository architecture, docs, compliance, version, and API syntax checks
rollback_note: Revert the tenant directory read optimization, Billing routes, tenant-scoped read-only archived presentation, focused tests, documentation, and this declaration together; no migration, tenant record, ledger entry, or financial policy rollback is required.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-25T08:26:04.800Z
preflight_request_ref: PREFLIGHT-LOCAL-1792916646344-2026-10-25-ADMIN-TENANT-DIRECTORY-BILLING-PHASE-547
---

# Tenant directory and Billing workspace (#2776, Phase 547)

## Compliance Impact Classification

Regulatory. The changed Platform Admin tenant-management and service paths map to the existing
`settings,compliance` regulatory floor. This wave adds a lightweight tenant-list read option and
reorganizes existing Revenue & Settlement entry points behind the existing Platform Master Admin
boundary. It does not change compliance policy, financial policy, or a reason-code decision.

## Affected Surfaces

- Platform Admin tenant directory: skip optional per-tenant capability reads on the default list
  request while retaining the enriched behavior for explicit capability filters and other callers.
- Platform Admin Billing routes: expose the existing global Revenue & Settlement workspace and a
  tenant-scoped detail view under the existing master-only route policy.
- Tenant compliance and financial decisions remain enforced by their existing API authorization
  and use-case behavior; the frontend route checks are usability boundaries only.

## Compliance Preconditions

- The `include_capabilities=false` option only skips enrichment reads. It does not change tenant
  grants, compliance status, list redaction, or the enriched default used by existing API callers.
- Revenue and settlement APIs, write actions, reasons, audit behavior, policy, and server-side
  authorization remain unchanged. The detail view locks active reads to the route tenant.
- Archived tenant Billing presents scoped records without financial mutation controls. This is a
  UI read-only presentation and does not claim a new API-wide archived-write prohibition.
- No tenant schema, migration, provider call, production data, monetary ledger, or financial-policy
  change is part of this work.

## Verification Evidence

Focused Admin and API tests, the Admin production build, API syntax checks, architecture and docs
checks, the local desktop/mobile synthetic journey, and the local request-time preflight result are
recorded in Phase 547 and the implementation PR. Browser API responses used synthetic fixtures;
they do not represent deployed tenant or finance data, server latency, or a PROD p95 measurement.

The request-time compliance preflight passed locally against the repository's disposable
MySQL/Redis/API fixture workflow: `no_breach`, reason `ALLOWED`, at
`2026-10-25T08:26:04.800Z`, reference
`PREFLIGHT-LOCAL-1792916646344-2026-10-25-ADMIN-TENANT-DIRECTORY-BILLING-PHASE-547`. No deployed
environment was used or changed.

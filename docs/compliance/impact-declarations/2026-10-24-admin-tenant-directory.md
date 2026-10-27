---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-24
related_adr: docs/architecture/adr/0047-platform-admin-identity-and-page-rbac.md
declaration_id: 2026-10-24-admin-tenant-directory
classification: regulatory
surfaces: settings,compliance
reason_codes_impacted: NONE
policy_version: 2026.10.24
verification_evidence: Local request-time preflight passed against disposable MySQL/Redis/API fixtures; focused Admin Vitest, production build, lint, rendered desktop/mobile UI proof, docs, architecture, compliance, version, diff, and marker checks are recorded in the implementation PR
rollback_note: Revert the Platform Admin directory search/filter and URL-state behavior, its focused tests and documentation, and this declaration together. No API, permission grant, migration, or new write path is introduced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-24T03:09:33.972Z
preflight_request_ref: PREFLIGHT-LOCAL-1792811289372-2026-10-24-ADMIN-TENANT-DIRECTORY
---

# Searchable Platform Admin tenant directory (#2743, Phase 542)

## Compliance Impact Classification

Regulatory is the computed minimum because `apps/dgfy-admin/Pages/TenantManager.jsx` is classified
on the `settings,compliance` surfaces. This phase changes directory search, client-side filters,
URL state, list loading/error presentation, and archived status labeling. It does not change the
`admin.tenants` grant, the tenant-list API, compliance decisions, audit writes, or existing
per-tenant actions.

## Affected Surfaces

- `settings`, `compliance` — Platform Admin tenant directory presentation and client-side
  filtering using the existing full-list read.
- Privacy — the required `q` URL parameter can be included in PostHog `$current_url`/`$pageleave`
  and Sentry `request.url`. This is accepted for #2743 and tracked for shared observability
  remediation in [#2748](https://github.com/Sieitzz/dgfy-platform/issues/2748).

## Compliance Preconditions

1. The directory calls `getTenants('all')` and performs search/filter locally; changing filters
   issues no read request and triggers no mutation.
2. Search reads only tenant name, admin email, domain, and tenant ID. It never reads or displays
   `company_token`.
3. Capability filtering reads the list payload directly. `unavailable` and `n/a` remain distinct
   from `off`; non-active tenants are not inferred to have disabled capabilities.
4. Existing per-tenant controls and their service calls are unchanged. This phase adds no endpoint,
   permission grant, migration, or server-side write path.
5. No deployed environment, tenant record, or database is changed by this PR.

The request-time preflight ran locally against the disposable API, MySQL, and Redis fixtures and passed. Its reconciled reference is `PREFLIGHT-LOCAL-1792811289372-2026-10-24-ADMIN-TENANT-DIRECTORY`. The local sweep reconciled this declaration in place; no deployed environment or tenant data was changed.

## Verification Evidence

Focused directory validation passed 17 Vitest tests across the pure-module and component files.
Full Admin validation, build, lint, rendered UI proof, architecture/docs/compliance/version checks,
and the changed-file marker scan are recorded in the implementation PR's Testing Evidence.

## Rollback

Revert the directory search/filter behavior and this declaration. There is no migration, data
rollback, server change, or new permission grant.

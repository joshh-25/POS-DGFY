---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-25
related_adr: docs/architecture/adr/0047-platform-admin-identity-and-page-rbac.md
declaration_id: 2026-10-25-admin-tenant-console-integration-cleanup
classification: regulatory
surfaces: settings,compliance
reason_codes_impacted: NONE
policy_version: 2026.10.24
verification_evidence: Request-time preflight against disposable API/MySQL/Redis fixtures before implementation; focused Admin and shared observability checks, affected builds, rendered desktop/mobile journeys, architecture, docs, compliance, version, hygiene, and privacy evidence will be recorded in the PR
rollback_note: Revert the tenant-console cleanup and empty-state correction, Admin-only observability URL redaction and focused tests, documentation updates, and this declaration together. No API, permission, schema, migration, or deployed tenant change is introduced.
preflight_request_ref: PREFLIGHT-LOCAL-1792859561527-2026-10-25-ADMIN-TENANT-CONSOLE-INTEGRATION-CLEANUP
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-24T16:34:12.472Z
---

# Platform Admin tenant-console integration cleanup and URL privacy remediation (#2757, #2748, Phase 545)

Complete the final tenant-console cleanup, repair the missing-registration empty state and known test selector failure, and remove query strings from Admin telemetry URLs while preserving browser URL/history behavior and non-Admin telemetry.

## Compliance Impact Classification

The regulatory floor comes from the Platform Admin tenant UI and service paths, which are classified on the `settings,compliance` surfaces. The work preserves server-side grants, API contracts, compliance decisions, audit behavior, and tenant data; the observability change reduces captured query data for the Admin surface only.

## Affected Surfaces

- `settings`, `compliance` — Platform Admin tenant directory/detail cleanup, registration empty state, and existing service wrappers.
- Privacy — Admin PostHog page-view/page-leave URL properties and Sentry `request.url` have query strings removed. Browser URLs/history and non-Admin event behavior stay unchanged.

## Compliance Preconditions

- Existing Platform Admin server-side session, page grants, endpoint authorization, write reasons, confirmations, eligibility, and audit behavior remain authoritative.
- The missing-registration state is shown only for the existing application-not-found response; permission, transport, and server errors remain distinct and retryable.
- URL scrubbing is gated by the resolved Admin surface and applies to outgoing observability payloads; it never rewrites `window.location` or history.
- No endpoint, permission grant, compliance decision, database schema, migration, or deployed tenant mutation is introduced.

## Request-Time Preflight

Passed before implementation against disposable API, MySQL, and Redis fixtures. Result: `no_breach`,
reason `ALLOWED`, at `2026-10-24T16:34:12.472Z`; request reference
`PREFLIGHT-LOCAL-1792859561527-2026-10-25-ADMIN-TENANT-CONSOLE-INTEGRATION-CLEANUP`.

## Verification Evidence

Evidence for focused Admin/shared-client checks, affected builds, rendered desktop/mobile journeys, architecture/docs/compliance/version/hygiene checks, and telemetry payload interception will be added after implementation.

## Rollback

Revert the scoped UI cleanup, registration empty-state handling, Admin-only URL redaction, tests, documentation, and this declaration. There is no schema, persisted tenant data, API contract, or deployed change to roll back.

## Post-Merge Verification

- [ ] `deployment` — an authorized deployment role verifies the tested task-branch SHA in DEV; record workflow URL and running Admin image/build identity. Owner: deployment role; blocks final DEV soak readiness.
- [ ] `deployment` — after the Wave 4 merge, obtain qualifying DEV soak evidence from the final epic SHA under the release policy. Owner: deployment role; blocks final aggregate PR readiness.
- [ ] `operational` — preserve #1923 STAGING persistence/publication checks and #2633/#2639 deployed evidence and PROD capability-read recovery as outstanding external release verification. Owner: existing issue owners; blocks release qualification.

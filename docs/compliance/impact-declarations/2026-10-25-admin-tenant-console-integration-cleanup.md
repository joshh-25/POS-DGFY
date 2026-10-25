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
verification_evidence: Admin 29-file/212-test suite, focused 25-test selector/registration files, shared observability 86 tests, five consumer builds, lint, architecture, docs/strict ADR, compliance, and app-version checks pass; synthetic desktop/mobile browser journey passes; disposable DB-tier API matrix passes all 34 test files including tenant lifecycle, while the full 872-file fast tier in the focused Testing Agent gate has 27 failures and is not represented as green
rollback_note: Revert the tenant-console cleanup and empty-state correction, Admin-only observability URL redaction and focused tests, documentation updates, and this declaration together. No API, permission, schema, migration, or deployed tenant change is introduced.
preflight_request_ref: PREFLIGHT-LOCAL-1792859561527-2026-10-25-ADMIN-TENANT-CONSOLE-INTEGRATION-CLEANUP
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-24T16:34:12.472Z
---

# Platform Admin tenant-console integration cleanup and URL privacy remediation (#2757, #2748, Phase 552)

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

The 29-file/212-test Admin suite, focused selector/registration files (25 tests), shared
observability suites (2 files/86 tests), five affected consumer builds, Admin/shared lint,
architecture, docs/strict ADR, compliance, and app-version checks pass. The synthetic browser
journey passes at 1440×1000 and 390×844 with directory query/history preservation and no page or
console errors or horizontal overflow; report and screenshots are under `.tmp/`.

The shared-client tests invoke PostHog's installed `before_send` hook directly for `$pageview` and
`$pageleave`, nested URL/referrer/person properties, and non-Admin behavior. The local browser run
observed PostHog feature-flag requests only; it did not observe a network event payload.

The Testing Agent ran against target code SHA `cc125a40a` with disposable MySQL 8 and Redis 7.
All 34 DB-tier test files passed across eight groups, including
`adminTenantLifecycle.integration.test.js` and registration-upload coverage. The overall focused
gate is `FAIL`, because 27 suites failed in the 872-file fast tier; no backend production files
changed here and those failures have not been baseline-compared. Full evidence is under
`.tmp/release-gates/cc125a40a/`. The earlier direct host API run could not reach MySQL; its target
lifecycle suite passed in the disposable DB-tier run. Child merge-hygiene passes against the
registered epic base, `git diff --check` passes, and the final changed-file debug-marker scan found
no matches.

## Rollback

Revert the scoped UI cleanup, registration empty-state handling, Admin-only URL redaction, tests, documentation, and this declaration. There is no schema, persisted tenant data, API contract, or deployed change to roll back.

## Post-Merge Verification

- [ ] `deployment` — an authorized deployment role verifies the tested task-branch SHA in DEV; record workflow URL and running Admin image/build identity. Owner: deployment role; blocks final DEV soak readiness.
- [ ] `deployment` — after the Wave 4 merge, obtain qualifying DEV soak evidence from the final epic SHA under the release policy. Owner: deployment role; blocks final aggregate PR readiness.
- [ ] `operational` — preserve #1923 STAGING persistence/publication checks and #2633/#2639 deployed evidence and PROD capability-read recovery as outstanding external release verification. Owner: existing issue owners; blocks release qualification.

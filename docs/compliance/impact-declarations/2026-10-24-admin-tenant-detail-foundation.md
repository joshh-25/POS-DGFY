---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-24
related_adr: docs/architecture/adr/0047-platform-admin-identity-and-page-rbac.md
declaration_id: 2026-10-24-admin-tenant-detail-foundation
classification: regulatory
surfaces: settings,compliance
reason_codes_impacted: NONE
policy_version: 2026.10.24
verification_evidence: API focused suites (8 suites/75 tests) and authenticated DB-backed tenant lifecycle suite (10 tests) pass; Admin and final implementation validation evidence will be recorded before opening the PR
rollback_note: Revert the additive tenant detail read, Admin detail/Add tenant routes, moved assisted-provisioning UI, tests, and documentation together. No schema migration or permission grant is added.
preflight_request_ref: PREFLIGHT-LOCAL-1792829038640-2026-10-24-ADMIN-TENANT-DETAIL-FOUNDATION
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-24T08:05:15.676Z
---

# Platform Admin tenant detail foundation and Add tenant (#2755, Phase 543)

This phase adds a single-tenant admin read, bookmarkable tenant detail routes, and a dedicated assisted-provisioning page while preserving Platform Admin authorization, audit behavior, and tenant privacy safeguards.

## Compliance Impact Classification

The regulatory floor is set by the Platform Admin tenant route/controller and assisted-provisioning surfaces, which the path matrix classifies as `settings,compliance`. The work adds a safe read and relocates existing provisioning UI; it does not introduce a new permission grant, compliance decision, persistence policy, or tenant write capability.

## Affected Surfaces

- `settings`, `compliance` — Platform Admin tenant directory, tenant detail, and assisted-provisioning pages plus the tenant admin API route.
- Privacy — tenant identifiers stay out of analytics and Sentry route labels. Shared URL/query capture remains a separate dependency tracked by #2748.

## Compliance Preconditions

- The detail API reuses the safe list projection and excludes company tokens, password hashes, raw settings, and database names.
- Existing Platform Admin session and `admin.tenants` authorization remain authoritative. The combined DGFY-account provisioning path retains its existing second grant and backend enforcement.
- Assisted provisioning retains existing reason, eligibility, audit, and temporary-password behavior. Secrets remain in component memory and are cleared on page exit or before another attempt.
- The detail UI is read-only for archived tenants; this does not change existing API archived-write behavior.
- No database migration or deployed tenant mutation is introduced.
- The outbound query-string privacy follow-up remains in #2748; route-label normalization does not claim to scrub captured URLs.

## Request-Time Preflight

The local request-time preflight passed against the disposable API, MySQL, and Redis fixtures before implementation began: `result=no_breach`, `reason_code=ALLOWED`, run at `2026-10-24T08:05:15.676Z`, reference `PREFLIGHT-LOCAL-1792829038640-2026-10-24-ADMIN-TENANT-DETAIL-FOUNDATION`. No deployed environment or tenant data was changed.

## Verification Evidence

API evidence is verified: 8 focused Jest suites/75 tests and the authenticated DB-backed tenant lifecycle suite/10 tests pass. Record the Admin, browser-session, build/lint, architecture/documentation/compliance, app-version, and rendered UI results here and in the PR after final checks.

## Rollback

Revert the additive API read, Admin routes/pages, assisted-provisioning move, tests, documentation updates, and this declaration. There is no schema migration, permission-grant change, or deployed data rollback.

## Post-Merge Verification

- [ ] DEV — after the final integration PR reaches `develop`, verify the tenant Overview, archived read-only state, navigation query restoration, and Add tenant page with desktop and mobile viewports; owner: Pat.
- [ ] Privacy — complete shared Admin URL scrubbing in #2748 before the final DEV soak; owner: PM/Worker.
- [ ] Compliance — confirm the final integrated commit retains a reconciled preflight reference and the compliance gate remains green; owner: compliance sweep.

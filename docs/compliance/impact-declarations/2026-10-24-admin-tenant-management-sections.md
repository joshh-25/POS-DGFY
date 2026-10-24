---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-24
related_adr: docs/architecture/adr/0047-platform-admin-identity-and-page-rbac.md
declaration_id: 2026-10-24-admin-tenant-management-sections
classification: regulatory
surfaces: settings,compliance,payments
reason_codes_impacted: NONE
policy_version: 2026.10.24
verification_evidence: Admin-only section moves, including the existing capability controls and audit entry point on Access & storefront; unavailable capability reads remain unknown and disable writes. Existing API grants, reasons, eligibility, audit writes, and endpoints remain authoritative. Current focused Admin validation passes 4 files / 37 tests, the Admin build and changed-file lint pass, and mocked desktop/mobile Access route proof passes without mutations, browser errors, or horizontal overflow. The existing full Admin run reported 202 passing tests and six failures in the unchanged #2750 StoreTemplateManager suite; it predates the final Access relocation. Focused disposable backend matrix against implementation SHA 7cec71f966139ce9d231e48e185086e4180f84bd covered 872 fast-tier and 34 DB-tier files; all DB files passed, while 50 fast-tier failures remained across 24 unmodified suites. The changed tenant capability transport test passed; the container recorded 12 OOM-killed child processes. The focused matrix reported fail and skipped 16 other release gates; its target SHA and result are recorded in the PR verification comment. The #1923 STAGING persistence/publication checks, #2633/#2639 deployed evidence, and PROD capability-read recovery are outstanding external release verification and are not claimed as complete.
rollback_note: Revert the Admin tenant-detail sections, owner and billing preselection UI, their tests and documentation, and this declaration. No schema migration or server-side policy change is introduced.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-24T09:48:00.701Z
preflight_request_ref: PREFLIGHT-LOCAL-1792835197869-2026-10-24-ADMIN-TENANT-MANAGEMENT-SECTIONS
---

# Platform Admin tenant-management detail sections (#2756, Phase 544)

Move existing tenant lifecycle, registration, compliance, store setup, and access controls into bookmarkable tenant detail sections, add the existing owner workflow, and provide validated tenant/application preselection for global billing tools. URL context never authorizes or submits an operation.

## Compliance Impact Classification

The minimum classification is `regulatory` because the Platform Admin tenant UI and service are classified on `settings,compliance`. Billing-page preselection is included as the `payments` surface; the change does not alter payment policy or execute a payment action.

## Affected Surfaces

- `settings`, `compliance` — tenant administration controls, section routing, and existing Admin API calls.
- `payments` — validated, read-only URL preselection for existing global billing tools.

## Compliance Preconditions

- Existing Platform Admin grants and backend authorization remain authoritative; section rendering is an additional usability boundary.
- Existing reasons, confirmations, eligibility checks, audits, events, and backend errors remain unchanged.
- Capability reads that are unavailable or incomplete remain unknown in the UI and disable writes; the UI never infers an On/Off value from missing data.
- Billing context is validated against loaded authorized data; it never submits, mutates, or grants authority.
- No API/schema/grant change, migration, or deployed tenant mutation is introduced. This child PR remains scoped to the registered epic branch and does not deploy to STAGING.

## Request-Time Preflight

Passed before implementation against disposable API/MySQL/Redis fixtures: `no_breach`, reason `ALLOWED`, at `2026-10-24T09:48:00.701Z`; request reference `PREFLIGHT-LOCAL-1792835197869-2026-10-24-ADMIN-TENANT-MANAGEMENT-SECTIONS`. No deployed host or tenant data was used.

## Verification Evidence

Current focused Admin tests pass (4 files / 37 tests), and the Admin production build and lint pass. The existing full Admin run reported 202 passing tests and six failures in the unchanged `StoreTemplateManager.registrationIndustries.integration.test.jsx` suite tracked by #2750; that run predates the final Access relocation. Mocked desktop/mobile proof of the Access route, impact-preview cancel flow, audit loading, query preservation, and read-only behavior passes with no browser errors or 390 px horizontal overflow. The earlier DEV browser evidence covers only the deployed state at that time; it does not verify this final Access relocation. Architecture, docs/ADR lint, compliance, epic-base version policy, and whitespace checks pass. Relevant API contract tests previously passed (10 suites / 88 tests). The focused disposable backend matrix targeted implementation SHA `7cec71f966139ce9d231e48e185086e4180f84bd`: all 34 DB-tier files passed; the fast tier had 6,703 passing tests and 50 failures across 24 unmodified suites. The changed tenant capability transport test passed. The container recorded 12 OOM-killed child processes; the focused matrix reported fail and skipped 16 other release gates. #1923 STAGING persistence/publication checks, #2633/#2639 deployed regression evidence, and PROD capability-read recovery remain outstanding external release verification; no STAGING deployment is part of this child PR.

## Rollback

Revert the Admin-only section routes/pages, owner and billing preselection UI, associated tests/docs, and this declaration. No persisted business state or schema change needs rollback.

## Post-Merge Verification

- [ ] DEV — after final integration to `develop`, verify each tenant section, permission/read-only states, billing preselection, and directory return context at desktop and mobile viewports; owner: Pat.
- [ ] Compliance — confirm the integrated commit retains this reconciled preflight reference and the compliance gate remains green; owner: compliance sweep.

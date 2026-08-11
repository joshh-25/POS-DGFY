---
status: reference
authority_level: reference
owner: pos
last_reviewed: 2026-08-11
applies_to: pos_release_hardening
topic: release_scope_containment
---

# POS Release Hardening Phase 40 Scope

## Decision

The current `feat/DGFY-POS-release-hardening` worktree is **not one releasable
change**. It contains several independently reviewable product areas plus local
generated files. It must be split by domain before any pull request is promoted
through `develop`, `staging`, and a `release/<label>` branch to `main`.

This phase does not authorize a production deployment. A merge to `main`
deploys production under the authoritative Release Candidate Policy, so the
worktree must not be committed, pushed, or described as production-ready as a
single batch.

## Authoritative constraints

- `docs/START_HERE.md` defines the required documentation lookup order.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` keeps backend changes within
  `routes -> controllers -> usecases -> repositories -> models`.
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md` requires applicable boundary
  and documentation checks.
- `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`
  governs cashier identity, terminal pairing, shift safety, Day Close PINs, and
  Z-reading behavior.
- `docs/ops/RELEASE_CANDIDATE_POLICY.md` defines the only supported release
  path: `feature -> develop -> staging -> release/<label> -> main`.
- `docs/ai/PR.md` requires conventional, domain-batched commits and the
  repository's prohibited-marker scan before any commit.

## Release slices

Each slice requires its own intentional file inventory, tests, compliance
evidence, and review. A file shared by two slices belongs to the earliest slice
that provides the dependency and must not be duplicated across commits.

### Slice A: DGFY identity, company handoff, and cashier-owned PIN

Scope:

- DGFY company selection and one-time POS handoff.
- Global-account versus tenant-account credential authority.
- Cashier-owned Day Close PIN setup, authorization, reset, and audit behavior.
- Cross-company browser-session isolation.

Primary areas:

- `apps/dgfy-api/src/modules/dgfy/`
- `apps/dgfy-api/src/modules/users/`
- `apps/dgfy-api/src/services/dgfyTenantSessionService.js`
- `apps/dgfy-api/src/services/userService.js`
- `apps/dgfy-web/Pages/DgfyCompanySelect.jsx`
- `apps/dgfy-web/apps/store/src/customer-dashboard/`
- `apps/dgfy-web/src/services/browserSession.js`
- `apps/dgfy-web/src/services/dgfyAuthService.js`

Required boundary: no password, PIN, handoff token, or authenticated browser
state may be persisted in source, test reports, Playwright auth directories, or
committed environment files.

### Slice B: POS terminal, shift close, Z-reading, and printing

Scope:

- Open/resume/close-shift behavior and post-shift handoff.
- Day Close readiness, personal PIN confirmation, and Z-reading generation.
- Cashier close summaries and canonical payment-method breakdowns.
- Browser, iMin, and device-bridge print payloads and audit reporting.

Primary areas:

- `apps/dgfy-api/src/modules/pos/`
- `apps/dgfy-api/src/routes/pos.js`
- `apps/dgfy-api/device-bridge/receipts/receiptFormatter.js`
- `apps/dgfy-web/src/features/pos/`
- `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`

Required boundary: financially recognized totals, payment classifications,
refunds, voids, receipt branding, and printer-result auditing must be resolved
and validated before this slice is production-ready. Phase 41 owns that work.

### Slice C: F&B modifier hierarchy and tenant schema

Scope:

- Folder-level modifier assignments and item-level override behavior.
- Effective modifier-group resolution across API, POS, and Storefront.
- Tenant migration and schema-registry coverage.

Primary areas:

- `apps/dgfy-api/src/modules/fnb/`
- `apps/dgfy-api/src/models/Fnb*`
- `apps/dgfy-api/src/modules/shared/utils/effectiveFnbModifierGroups.js`
- `apps/dgfy-migration-runner/migrations/20260810000003-create-fnb-folder-modifier-assignments.cjs`
- F&B POS and Storefront components and tests.

Required boundary: the untracked migration is part of this slice only. It must
not enter a POS-only commit or pull request. Migration registry coverage,
forward application, compatibility behavior, and tenant-schema evidence are
required before promotion.

### Slice D: Storefront checkout, service, and order lifecycle

Scope:

- Storefront cart persistence and navigation.
- Guest checkout OTP and PayMongo/QR Ph order finalization.
- Service booking and delivery/order-state behavior.
- F&B customer checkout UI not already owned by Slice C.

Primary areas:

- `apps/dgfy-web/apps/store/src/auth/`
- `apps/dgfy-web/apps/store/src/shared/`
- `apps/dgfy-web/apps/store/src/modes/services/`
- Storefront checkout hooks, route hosts, and end-to-end tests.

Required boundary: payment success must never be represented as order success
until durable order creation and idempotent reconciliation are proven. Delivery
completion rules must remain compatible with manual delivery mode.

### Slice E: CI and release-policy enforcement

Scope:

- Pull-request quality workflow changes.
- Compliance, architecture, budget, and readiness scripts.
- Release-candidate policy documentation.

Primary areas:

- `.github/workflows/`
- `scripts/`
- root `package.json`
- `docs/ops/RELEASE_CANDIDATE_POLICY.md`

Required boundary: workflow changes must be reviewed independently from product
behavior. A new workflow cannot be relied on as a live branch-protection gate
until it exists on the target branch and its required-check configuration is
verified.

## Explicitly excluded local artifacts

Phase 40 adds narrow ignore coverage without deleting local data:

- legacy frontend build, report, Playwright auth, and `.env.e2e` files;
- compatibility-backend uploads and temporary runtime data;
- root temporary workspace data;
- Android/Gradle caches, IDE state, build outputs, and `local.properties`.

The ignore rules intentionally keep Android source, application source,
migrations, tests, documentation, and workflow definitions visible for review.
Uploaded tenant/customer media remains local runtime data and is not release
source.

## Current blockers carried into later phases

- The worktree remains intentionally dirty and must be split into the five
  release slices before commit or pull-request creation.
- The branch is 16 commits behind and 8 commits ahead of
  `dgfy-platform/develop`; upstream synchronization is unsafe until the source
  slices are preserved in intentional commits.
- The compliance check currently needs a scoped impact declaration for the
  sensitive POS changes.
- Frontend size budgets currently fail for the POS checkout terminal and the
  SKUpervisor terminal page.
- The maintained Playwright workspace does not yet have local E2E credentials,
  so the release flow cannot claim authenticated browser coverage.
- Financial/printer gaps remain for Phase 41, including receipt branding,
  durable client-print audit reporting, and an explicit refund/void policy.
- The F&B migration must be validated as part of Slice C, not silently bundled
  with the POS release slice.

## Phase 40 acceptance evidence

- Narrow `.gitignore` rules reduced the pre-document visible untracked
  inventory from 5,178 to 28.
- Those 28 files are source, tests, one migration, one workflow, and one
  workflow-check script; they remain visible deliberately. This Phase 40 scope
  document is the twenty-ninth current untracked file.
- No upload, credential, Android source, migration, application source, or user
  file was deleted or moved.
- Generated paths were confirmed through `git check-ignore -v`.
- Release slices, dependencies, exclusions, and blockers are recorded before
  any branch synchronization, commit, pull request, or deployment.

## Release verdict

**Split and harden first. Do not ship the current worktree as one change.**

The next eligible governed phase is Phase 41: Financial and Printer Hardening.

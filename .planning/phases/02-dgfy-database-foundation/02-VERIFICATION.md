---
phase: 02-dgfy-database-foundation
verified: 2026-07-11T00:00:00Z
status: gaps_found
score: 3/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Re-running schema migration and verification proves expected tables, columns, indexes, constraints, metadata records, and tenant coverage."
    status: failed
    reason: >
      Code review finding CR-01 (.planning/phases/02-dgfy-database-foundation/02-REVIEW.md) is
      unresolved in the codebase as of this verification. verify.js's `migration_metadata` block
      (src/commands/verify.js:337-355) wraps the primary target's check AND the entire
      `for (const name of businessDbNames)` loop in a single try/catch, unlike `business_schemas`
      which correctly scopes try/catch per target. Directly verified by reading the current file:
      the exact code the review quoted is still present, byte-for-byte. If any business target's
      `checkMigrationMetadata` throws partway through a multi-target run, the catch block (a)
      pushes a second finding mislabeled with the PRIMARY target's database name instead of the
      target that actually failed, (b) silently drops any business targets that succeeded before
      the failing one, and (c) produces no entry at all for the target that failed. Since
      `idempotency` is derived directly from `migration_metadata`, this corruption cascades into
      the idempotency section (D-22) as well. No test in phase02Verification.test.js exercises a
      mid-loop business-target failure (confirmed by reading the file's `migration_metadata`
      describe block — both tests there only vary which migrations are recorded, never inject a
      thrown error partway through the loop), so this defect is both real and currently untested.
      This is precisely the scenario D-21/D-22 exist to make trustworthy (per-target migration
      metadata evidence that CI/deploy tooling and operators can rely on), so a partial-failure run
      produces misleading, not merely incomplete, evidence.
    artifacts:
      - path: "apps/dgfy-migration-runner/src/commands/verify.js"
        issue: "migration_metadata try/catch scoped across the whole business-target loop (lines 337-355) instead of per-target like business_schemas (lines 319-333)."
    missing:
      - "Scope the migration_metadata try/catch per target (primary target and each business target independently), matching the business_schemas pattern, so one target's failure cannot mislabel or hide another target's already-computed finding."
      - "Add a regression test in phase02Verification.test.js that injects a thrown error on a middle business target's checkMigrationMetadata call and asserts every other target's finding survives intact with the correct target_database on the failed entry."
---

# Phase 2: DGFY Database Foundation Verification Report

**Phase Goal:** DGFY landlord and tenant database foundations exist beside legacy with additive, repeatable migrations and schema verification.
**Verified:** 2026-07-11
**Status:** gaps_found
**Re-verification:** No — initial verification (ROADMAP.md's `[x]` mark and completion date were applied prematurely by the Plan 02-04 executor's final commit `185bfbf3`, before this verification step ever ran; that mark is not treated as evidence per the task's explicit instruction, and this report re-derives status independently from the codebase).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator can create DGFY landlord and tenant schemas without mutating legacy schemas by default. | ✓ VERIFIED | `assertTargetDbNameAllowed` (src/safety/targetGuard.js) rejects any non-`dgfy_`-prefixed target before any connection. `ensureLegacyFingerprintBaseline()`/`computeLegacySchemaFingerprint()` (schema.js) capture a durable pre-migration `information_schema` fingerprint of the legacy DB and `checkLegacyNonMutation()` (verify.js) fails closed if no baseline exists. 59/59 dgfyCoreSchema/dgfyBusinessSchema/phase02Verification unit tests pass exercising this logic against fake QueryInterfaces. The one live-MySQL end-to-end confirmation (`phase02Integration.test.js`) is gated behind `RUN_PHASE02_INTEGRATION=true` + real DB credentials that are not available in this sandbox (permission-denied on `.env`/`.env.example` reads by design) — its clean-skip path was confirmed (1 skipped, 0 failed) but its assertions were never exercised against a live database, exactly as 02-04-SUMMARY.md's own "Known Gaps" section discloses. This residual gap is routed to Human Verification below rather than treated as a failure, since the underlying logic is otherwise fully covered by unit tests against real Umzug/QueryInterface call shapes. |
| 2 | Developer can inspect landlord tables for Accounts, Businesses, Branches, Tenancy registry, tenant DB pointers, and migration metadata. | ✓ VERIFIED | `dgfyCoreContract.js` and `20260710020000-create-dgfy-core-foundation.cjs` both define/create `accounts`, `businesses`, `business_memberships`, `business_database_registry` (tenant DB pointers: `database_name`, `stable_opaque_suffix`, status, verified_at), `business_audit_logs`, and `storefront_discovery_index` (the "Branches" success-criteria wording is satisfied via the locked D-10/D-11 decision that canonical branches live tenant-local and `dgfy_core` only keeps a discovery/routing projection — documented explicitly in docs/database/dgfy-foundation.md and enforced by a dedicated "no canonical branches/locations in dgfy_core" test). Migration metadata itself lives in the separate `dgfy_migration_meta` DB per D-04, inspectable via `dgfy_migration_meta.schema_migrations`/`command_executions`. |
| 3 | Developer can inspect tenant foundation tables for Staff Accounts, Assignments, Terminal identity, and tenant-local ownership metadata. | ✓ VERIFIED | `dgfyBusinessContract.js` and `20260710021000-create-dgfy-business-foundation.cjs` create `staff_accounts`, `account_staff_assignments`, `roles`/`role_permissions`, `terminal_identities`, `tenant_ownership_metadata`, `tenant_audit_logs`, plus canonical `locations`. 20/20 dgfyBusinessSchema.test.js tests assert every contract table/index/FK is created, cross-database references to `dgfy_core` are deliberately plain UUID columns (MySQL cannot FK across databases), and every product/POS/inventory/fiscal/promo table name is absent. |
| 4 | Re-running schema migration and verification proves expected tables, columns, indexes, constraints, metadata records, and tenant coverage. | ✗ FAILED (partial) | `verify.js` implements `core_schema`, `business_schemas`, `migration_metadata`, `tenant_coverage`, `idempotency`, and `legacy_non_mutation` report sections, and 29/29 phase02Verification/reportCommands tests pass for the paths those tests exercise. However, code review finding **CR-01** (02-REVIEW.md) is unresolved in the current code: `migration_metadata`'s try/catch wraps the primary target AND the entire business-target loop together (verify.js:337-355), so a mid-loop failure on one business target silently drops already-computed results for earlier targets, mislabels the failing target's entry with the primary target's database name, and cascades into `idempotency` (which is derived directly from `migration_metadata`). This is untested and directly undermines the trustworthiness of the very evidence D-21/D-22 require. See Gaps Summary below. |

**Score:** 3/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/dgfy-migration-runner/src/commands/schema.js` | Pending-only destructive gate, multi-target migration, legacy fingerprint baseline capture | ✓ VERIFIED | Confirmed `isPendingMigrationDestructive`/`assertDestructiveAllowed` ordering (post-metadata-bootstrap, pre-`umzug.up()`), `ensureLegacyFingerprintBaseline()`, `buildMigrationsForKind()`, business-target loop. |
| `apps/dgfy-migration-runner/src/commands/verify.js` | D-21 through D-24 verification report sections | ⚠️ VERIFIED WITH DEFECT | All six sections exist and are wired to real schema/metadata inspection, but `migration_metadata`'s try/catch scoping bug (CR-01) is unresolved — see Truth #4 and Gaps Summary. |
| `apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js` | `dgfy_core` table/column/index/FK/reject-list contract | ✓ VERIFIED | 6 tables, plain names, `rejectedTables` covers product/POS/inventory/fiscal/promo domains. |
| `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` | `dgfy_business_*` tenant foundation contract | ✓ VERIFIED | 8 tables (locations, staff_accounts, account_staff_assignments, roles, role_permissions, terminal_identities, tenant_ownership_metadata, tenant_audit_logs), same reject list. |
| `apps/dgfy-migration-runner/src/migrations/schema/20260710020000-create-dgfy-core-foundation.cjs` | Additive idempotent core migration | ✓ VERIFIED | Existence-guarded `createTable`/`addIndex` for every contract table; 19/19 dgfyCoreSchema tests pass including idempotency and rollback. |
| `apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs` | Additive idempotent business migration | ✓ VERIFIED | Existence-guarded `createTable`/`addIndex` for every contract table; 20/20 dgfyBusinessSchema tests pass including idempotency and rollback. |
| `docs/database/dgfy-foundation.md` | Governed schema/verification-evidence doc | ✓ VERIFIED | Authoritative front matter, `last_reviewed: 2026-07-11`, cites DBF-01–05/D-01–24; `npm run lint:docs` passes (21 governed docs validated). |
| `apps/dgfy-migration-runner/tests/phase02Integration.test.js` | Real MySQL end-to-end evidence | ⚠️ EXISTS, UNCONFIRMED LIVE | Gated behind `RUN_PHASE02_INTEGRATION=true`; confirmed clean-skip locally (1 skipped) but never run against a live MySQL server in this or the executor's session (env credentials denied by sandbox permissions). Routed to Human Verification. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `dgfyCoreContract.js` | migration + `verify.js` | Shared contract shape (`Object.entries(contract.tables)`) | ✓ WIRED | Migration and verify both consume the identical contract object; confirmed by direct source read. |
| `dgfyBusinessContract.js` | migration + `verify.js` | Shared contract shape | ✓ WIRED | Same pattern as core contract. |
| `business_database_registry` | `verify.js` tenant coverage | `SELECT database_name FROM business_database_registry` | ✓ WIRED (registry-gaps informational only, per D-08 accepted initial-verification input) | `checkTenantCoverage()` confirmed at verify.js:185-213. |
| `schema.js` legacy fingerprint baseline | `verify.js` legacy_non_mutation | Shared `computeLegacySchemaFingerprint()`/`LEGACY_FINGERPRINT_ARTIFACT_NAME` | ✓ WIRED | Both files import the same exported function/constant; confirmed. |
| `dgfy_migration_meta.schema_migrations` (target-scoped) | `migration_metadata` + `idempotency` | `MetaSequelizeStorage.executed()` per target | ⚠️ WIRED BUT NOT FAULT-ISOLATED | Wiring exists and passes for every currently-tested happy/first-failure path, but is not per-target fault-isolated (CR-01) — see Truth #4. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full runner unit suite | `npm --prefix apps/dgfy-migration-runner test -- --watchman=false` | 131 passed, 1 skipped (gated integration test, no live MySQL) | ✓ PASS |
| Pending-only destructive gate (D-17) | `npm --prefix apps/dgfy-migration-runner test -- schemaCommand.test.js` | 9/9 passed, including the 3 named D-17 tests | ✓ PASS |
| Core/business schema contract + migration idempotency | `npm --prefix apps/dgfy-migration-runner test -- dgfyCoreSchema.test.js dgfyBusinessSchema.test.js phase02Verification.test.js` | 59/59 passed | ✓ PASS |
| CR-01 code fix confirmation | Direct read of `apps/dgfy-migration-runner/src/commands/verify.js` lines 337-355 | Code is unchanged from the reviewed snapshot; bug is present verbatim | ✗ FAIL (confirms gap) |
| Docs/architecture gates | `npm run lint:docs && npm run check:architecture` | Both OK | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|--------------|--------|----------|
| DBF-01 | 02-02, 02-03, 02-04 | New DGFY landlord schema created beside legacy without mutating it by default | ✓ SATISFIED | Target guard + legacy fingerprint baseline/comparison mechanism implemented and unit-tested; live-DB confirmation pending (Human Verification). |
| DBF-02 | 02-02 | Landlord schema contains Accounts, Businesses, Branches, Tenancy registry, tenant DB pointers, migration metadata | ✓ SATISFIED | All tables present in contract + migration; "Branches" satisfied via documented D-10/D-11 projection-only design. |
| DBF-03 | 02-03 | Tenant schema foundation contains Staff Accounts, Assignments, Terminal identity, tenant-local ownership metadata | ✓ SATISFIED | All tables present in contract + migration. |
| DBF-04 | 02-01, 02-02, 02-03, 02-04 | Migrations additive/repeatable/tracked by metadata, no `sync({alter:true})` | ⚠️ PARTIALLY SATISFIED | Migrations are additive/idempotent (verified). Metadata tracking itself is target-scoped and correct in the happy path, but the CR-01 defect means multi-target failure evidence cannot be trusted — this is the mechanism DBF-04 relies on for "tracked by migration metadata." |
| DBF-05 | 02-01, 02-04 | Verification proves tables/columns/indexes/constraints/migration records/tenant coverage | ⚠️ PARTIALLY SATISFIED | All six report sections exist and are wired; CR-01 undermines the reliability of `migration_metadata`/`idempotency` findings under partial failure, which DBF-05 requires operators/CI to trust as evidence. |

No orphaned requirements — REQUIREMENTS.md's Phase 2 row (DBF-01 through DBF-05) is fully covered by the union of `requirements`/`requirements_covered` fields across all four plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/dgfy-migration-runner/src/commands/verify.js` | 337-355 | Un-scoped try/catch across primary + business-target loop (CR-01, unresolved) | 🛑 Blocker | Silently drops/mislabels per-target migration-metadata and idempotency evidence on partial failure. |
| `apps/dgfy-migration-runner/src/commands/verify.js` | 441 | Falsy `if (executionId)` reintroduces the WR-02 falsy-`0` pitfall `schema.js` explicitly guards against (WR-01, unresolved) | ⚠️ Warning | Latent only (MySQL auto-increment starts at 1); inconsistent with the project's own documented invariant. |
| `apps/dgfy-migration-runner/src/config/env.js` | 38-62 | `parseBusinessDbNames` does not reject duplicate `DGFY_BUSINESS_DB_NAMES` entries (WR-02, unresolved) | ⚠️ Warning | Duplicate targets would double-migrate/double-report the same business DB. |
| `apps/dgfy-migration-runner/src/commands/schema.js` | 83-88 | `ensureLegacyFingerprintBaseline` treats any `fs.access` failure (not just ENOENT) as "missing, capture now" (WR-03, unresolved) | ⚠️ Warning | Non-ENOENT failures could silently overwrite the D-23 non-mutation baseline; not observed in tests. |
| `apps/dgfy-migration-runner/src/migrations/schema/20260710020000-create-dgfy-core-foundation.cjs`, `...021000-create-dgfy-business-foundation.cjs` | ~285-303 | Dead PostgreSQL-only `DROP TYPE` statements guarded by a MySQL dialect check, always fail and are swallowed (WR-04, unresolved) | ℹ️ Info | Harmless (caught via `.catch(() => {})`) but misleading dead code. |
| `apps/dgfy-migration-runner/src/metadata/bootstrap.js` | 78-113 | `ensureMetadataSchema` docstring overstates drift detection (missing-column-only, not type/nullability) (WR-05, unresolved) | ℹ️ Info | Documentation/implementation gap; not a functional defect today. |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any file modified by this phase (direct grep across all `src/commands`, `src/config`, `src/metadata`, `src/schemaContracts`, and both migration files — zero matches).

## Human Verification Required

### 1. Run the gated real-MySQL Phase 02 integration test end-to-end

**Test:** Run `RUN_PHASE02_INTEGRATION=true npm --prefix apps/dgfy-migration-runner test -- phase02Integration.test.js --watchman=false` in an environment with real, reachable MySQL admin credentials (a MySQL server is reachable on `127.0.0.1:3306` in this sandbox, but its credentials are gated by permission settings that deny reading `.env`/`.env.example`, so this verifier could not exercise it).
**Expected:** The test creates disposable `dgfy_core_it_*`/`dgfy_business_it*`/`sku_it_*` schemas, runs `schema migrate`, reruns it (asserting `executed === 0`), runs `verify`, and asserts every report section (`core_schema`, `business_schemas`, `migration_metadata`, `tenant_coverage`, `idempotency`, `legacy_non_mutation`) plus every `summary.*_ok` flag, then cleans up only its own disposable schemas.
**Why human:** Requires live MySQL credentials that are intentionally inaccessible to this automated verification session; this is the same gap the Plan 04 executor's own SUMMARY.md "Known Gaps" section discloses (D6, `human_judgment: true`).

## Gaps Summary

One must-have truth is not fully achieved: **"Re-running schema migration and verification proves expected tables, columns, indexes, constraints, metadata records, and tenant coverage."** The verification command's design is sound and its happy-path behavior is well-tested (29/29 phase02Verification tests pass), but the unresolved CR-01 code-review finding — confirmed still present in `apps/dgfy-migration-runner/src/commands/verify.js` at the exact lines the review cited — means the `migration_metadata` (and derived `idempotency`) report sections can silently lose, duplicate, or mislabel per-target evidence the moment any business target's metadata check throws mid-loop. Since D-21/D-22 (and the requirements DBF-04/DBF-05 built on them) exist specifically to make this per-target evidence trustworthy for CI/deploy tooling and operators, an untested failure-cascade bug in the exact code path responsible for that evidence is a goal-blocking gap, not a cosmetic one. The fix is small and well-scoped (mirror the already-correct `business_schemas` per-target try/catch pattern) and should be closed with a regression test proving a mid-loop business-target failure cannot corrupt other targets' findings before this phase is considered complete.

Four smaller warnings/info items (WR-01 through WR-05, IN-01/IN-02 in 02-REVIEW.md) remain unresolved but do not block the phase goal on their own; they are listed above for completeness and should be tracked as follow-up hardening.

---

*Verified: 2026-07-11*
*Verifier: Claude (gsd-verifier)*

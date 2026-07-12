---
phase: 04-backend-accounts-businesses-and-tenancy-foundation
reviewed: 2026-07-12T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - apps/dgfy-migration-runner/src/schema/applyBusinessSchema.js
  - apps/dgfy-migration-runner/src/commands/activateTenant.js
  - apps/dgfy-migration-runner/tests/activateTenant.test.js
  - apps/dgfy-migration-runner/src/cli.js
  - apps/dgfy-migration-runner/tests/cliContract.test.js
  - apps/dgfy-api/tests/e2e/phase4FullFlow.test.js
  - apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 04: Code Review Report (Scoped — Plan 04-09 Gap Closure)

**Reviewed:** 2026-07-12T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

This is a scoped re-review of exactly the 7 files plan 04-09 added/modified to ship the
`activate-tenant` operator CLI (production analog of the existing dgfy-api test helper
`provisionAndActivateTenantDatabase`). Phases 04-01 through 04-08 were reviewed previously
(see `04-REVIEW.iter2.md`/`04-REVIEW.iter3.md`/`04-REVIEW-FIX.md`/`04-REVIEW-FIX.iter3.md` in
this directory) and are out of scope here; this file overwrites the prior gap-closure review
and is now the authoritative review state for plan 04-09.

The plan's own STRIDE threat-model requirements (T-04-09-01 through T-04-09-SC) all hold under
inspection:
- `assertTargetDbNameAllowed()` (generic `dgfy_` pattern) AND an explicit
  `BUSINESS_DB_NAME_PATTERN` check both run, in that order, before any connection is opened
  (`activateTenant.js:39-44`) — `dgfy_core` and arbitrary non-`dgfy_` names are both rejected
  pre-connection, confirmed by `activateTenant.test.js`'s two guard-rejection unit tests.
- The registry row is only ever `SELECT`ed and `UPDATE`d, keyed on the unique `database_name`
  column, never `INSERT`ed (`activateTenant.js:64-75`, `:132-135`).
- The `UPDATE` only runs after `applyAndVerifyBusinessSchema()` resolves successfully
  (`activateTenant.js:119-135`); any verification failure (missing table) throws before the
  registry is ever touched, confirmed by `activateTenant.test.js`'s missing-table and
  missing-row unit tests.
- The report/summary payloads built in `activateTenant.js` (`:90-99`, `:137-148`) contain only
  `database_name`, `business_id`, `migrations_executed`, `verified_tables`, and boolean flags —
  no host/user/password/DSN, confirmed by inspecting `reportWriter.js`/`summaryWriter.js`,
  which serialize exactly that object with no additional fields.
- Every SQL statement against `business_database_registry` is parameterized
  (`replacements: [...]`); the one string-interpolated statement
  (`` CREATE DATABASE IF NOT EXISTS `${databaseName}` ``, `activateTenant.js:116`) is only
  reachable after both name guards have already run unconditionally at the top of the
  function, on every code path (idempotent and non-idempotent).
- The idempotency branch (`status === 'active' && verified_at`) does not just re-read the
  registry — it re-opens a tenant connection and re-runs `applyAndVerifyBusinessSchema()`
  before reporting `already_active: true`, so a broken/drifted schema on an already-"active"
  row would still throw rather than silently succeed.

No BLOCKER-level defect was found against those specific requirements. However, standard-depth
review surfaced several real gaps in the surrounding logic and test coverage — most notably
that the command's fail-closed posture only checks for a *missing* registry row, not for the
row being in an unexpected *status* (the `business_database_registry.status` ENUM defines
`migrating` and `deprecated` states that this command would silently overwrite back to
`active` if ever reached), and that the actual mutating behavior (the real
apply→verify→UPDATE happy path and the idempotent re-verify path) has zero coverage in the
always-run (skip-safe) unit suite — both are only exercised by the DB-backed integration block
that is skipped unless `RUN_ACTIVATE_TENANT_INTEGRATION=true` is explicitly set.

## Warnings

### WR-01: `activate-tenant` never validates the registry row's current status before reactivating it

**File:** `apps/dgfy-migration-runner/src/commands/activateTenant.js:70-135`
**Issue:** The only guard against acting on an "unexpected" row is `if (!registryRow)` (fail
closed on a missing row). Any row that DOES exist but is not `status === 'active' &&
verified_at` (the idempotent fast-path condition) falls through to the full
apply+verify+UPDATE path, which unconditionally sets `status = 'active'` at the end
(`activateTenant.js:132-135`). `business_database_registry.status` is an ENUM of
`'provisioning' | 'active' | 'migrating' | 'deprecated'`
(`apps/dgfy-api/src/models/Landlord/BusinessDatabaseRegistry.js:49-53`). Nothing today
prevents a future/administrative transition of a row to `'deprecated'` (e.g. an offboarded or
compliance-suspended business) — but if that ever happens, running
`activate-tenant --database-name <that name>` would silently resurrect it to `active`/verified
with no warning or override requirement, since the command treats "row exists" and "row is in
a legitimate pre-activation state" as the same thing.
**Fix:** Require an explicit precondition on `registryRow.status` before proceeding past the
idempotent check, e.g.:
```js
if (registryRow.status !== 'provisioning') {
  throw new TargetGuardError(
    `activate-tenant refuses to activate database_name "${databaseName}" — registry status is ` +
    `"${registryRow.status}", expected "provisioning" (or already-active/verified for a no-op).`
  );
}
```

### WR-02: No concurrency guard between the registry SELECT and the activating UPDATE

**File:** `apps/dgfy-migration-runner/src/commands/activateTenant.js:64-135`
**Issue:** Two concurrent `activate-tenant` invocations for the same `database_name` would
both `SELECT` the same `provisioning` row, both see the idempotency condition as false, and
both proceed to run `CREATE DATABASE IF NOT EXISTS` + Umzug migrations + verification +
`UPDATE` against the same tenant database with no locking (no transaction, no `SELECT ... FOR
UPDATE`, no advisory lock). Umzug's own storage-based pending-check is not atomic across
processes, so this can race DDL execution (e.g. duplicate/partial migration attempts) against
the same schema.
**Fix:** Wrap the SELECT and the eventual status transition in a single transaction with
`SELECT ... FOR UPDATE`, or take a named MySQL advisory lock (`GET_LOCK(databaseName, ...)`)
around the whole apply+verify+update sequence.

### WR-03: Registry mutation happens before audit/report bookkeeping, so a post-mutation failure is reported as "failed" even though activation already succeeded

**File:** `apps/dgfy-migration-runner/src/commands/activateTenant.js:132-160`
**Issue:** The `UPDATE business_database_registry ... SET status = 'active' ...` at
lines 132-135 durably commits before `writeJsonReport`, `writeSummaryReport`, and
`recordCommandComplete` run (lines 150-157). If any of those three calls throws (disk full,
meta-DB hiccup, etc.), execution falls into the `catch` block (line 160), which records
`exitStatus: 'failed'` and rethrows — `cli.js`'s `main().catch` then prints `fatal: ...` and
exits with code 1. An operator watching the CLI would reasonably conclude activation failed
and re-run/escalate, when the tenant database has, in fact, already been flipped to
`active`/`verified`.
**Fix:** Record command completion (success) immediately after the UPDATE commits, and treat
report/summary writing as best-effort logging that doesn't flip the recorded outcome to
`failed` for an already-successful activation (or reorder so report generation happens before
the mutating UPDATE, with the UPDATE itself as the last, idempotent step).

### WR-04: The core mutating behavior (happy path + idempotent re-verify path) has no coverage in the always-run test suite

**File:** `apps/dgfy-migration-runner/tests/activateTenant.test.js:108-271` (skip-safe blocks) vs. `:277-411` (integration-gated block)
**Issue:** The skip-safe (always-run) unit tests in this file only cover: (1) the missing-table
verification error in `applyAndVerifyBusinessSchema` in isolation, (2) the two guard-rejection
cases, and (3) the missing-registry-row fail-closed case. The actual "resolve provisioning row
→ CREATE DATABASE → apply+verify → UPDATE to active/verified" happy path, and the idempotent
"already active/verified → re-verify → report `already_active: true` without a second UPDATE"
path — the two behaviors this command exists to provide, and the specific idempotency
guarantee this phase's own threat model calls out — are ONLY exercised inside
`describeIfIntegration(...)` (lines 277-411), gated behind `RUN_ACTIVATE_TENANT_INTEGRATION=true`
(line 30), which is not set in ordinary CI/local runs (the file even logs a SKIPPED notice at
lines 39-47 when unset). A regression in the UPDATE's `WHERE database_name = ?` clause, in the
idempotency condition, or in the "never re-UPDATE when already active" behavior would not be
caught by the default test run.
**Fix:** Add a mocked-DB unit test (in the skip-safe section, following the existing
`jest.unstable_mockModule` pattern already used in this file) that: seeds a `provisioning` row
via a mocked `coreSequelize.query`, asserts the exact `UPDATE ... SET status = ?, verified_at =
?, updated_at = ? WHERE database_name = ?` call and its replacements, and a second test that
seeds an `active`/verified row and asserts `applyAndVerifyBusinessSchema` is called (re-verify)
but the mocked `query` never receives a second `UPDATE`.

### WR-05: Report-building/write/record sequence is duplicated near-verbatim between the idempotent and non-idempotent branches

**File:** `apps/dgfy-migration-runner/src/commands/activateTenant.js:80-159`
**Issue:** Lines 81-110 (idempotent branch) and lines 118-159 (main branch) both: create/reuse
a tenant connection, call `applyAndVerifyBusinessSchema`, build a near-identical report object,
call `writeJsonReport`, call `writeSummaryReport`, and call `recordCommandComplete`. The only
differences are the `already_active` flag and whether the registry `UPDATE` runs. This
duplication means a future change to the report shape or the write/record sequence (e.g. WR-03's
fix) has to be made twice, and the two copies can silently drift.
**Fix:** Extract a shared `finishActivation({ config, executionId, metaSequelize, databaseName,
registryRow, migrationsExecuted, verifiedTables, alreadyActive })` helper that builds the report,
writes it, and records completion once, called from both branches.

## Info

### IN-01: `cli.js`'s `buildProgram()` JSDoc is stale — says "six" subcommands, omits `activate-tenant`

**File:** `apps/dgfy-migration-runner/src/cli.js:16-21`
**Issue:** The comment reads "Builds the Commander program wiring all six RUN-02 subcommands to
their run*() handlers" and doesn't mention `activate-tenant` at all, even though the function
now wires seven (schema:migrate, data:dry-run, data:apply, verify, status, rollback-plan,
activate-tenant) and the import list at line 11 already includes `runActivateTenant`.
**Fix:** Update the comment to reflect the current command count and mention `activate-tenant`.

### IN-02: Test title/assertion count mismatch in `cliContract.test.js`

**File:** `apps/dgfy-migration-runner/tests/cliContract.test.js:11-17`
**Issue:** The test is titled `'--help stdout lists all seven commands'` but the array it
iterates only has six entries (`['schema', 'data', 'verify', 'status', 'rollback-plan',
'activate-tenant']`, line 14). The title appears to be counting total leaf subcommands (schema
migrate + data dry-run + data apply + verify + status + rollback-plan + activate-tenant = 7)
while the assertion only checks top-level program/command names (6), which is confusing and
gives a false impression that a 7th distinct string is being verified.
**Fix:** Either rename the test to "...lists all six top-level commands" or add explicit
assertions for the `data`/`schema` subcommand names too (`dry-run`, `apply`, `migrate`) to
genuinely cover "seven."

### IN-03: Duplicated "tolerant `showAllTables()` extraction + missing-table diff" logic between production code and the test helper

**File:** `apps/dgfy-migration-runner/src/schema/applyBusinessSchema.js:65-78` vs. `apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js:78-94`
**Issue:** Both files independently reimplement the identical logic for normalizing
`showAllTables()` results (string vs. `{tableName}`/`{table_name}` shapes) and computing the
missing-tables diff against `dgfyBusinessContract.tables`. The duplication is intentional today
per both files' own comments (the test helper is documented as a "fast, IN-PROCESS CI stand-in"
for the shipped command), but nothing structurally enforces the two copies stay in sync — a
future change to the table-name extraction logic in one file (e.g. to handle a new
dialect/driver quirk) could silently diverge from the other, undermining the test helper's
claim to prove "the exact same real-migration + real-verification behavior."
**Fix:** Consider extracting the table-normalization + diff logic into one small shared utility
importable by both packages (or accept the duplication explicitly and add a cross-file
consistency test that fails if the two implementations diverge).

### IN-04: Sequelize connections opened by `runActivateTenant` are never closed

**File:** `apps/dgfy-migration-runner/src/commands/activateTenant.js:46-47, 81, 118`
**Issue:** `coreSequelize`, `metaSequelize`, and (on either branch) `tenantSequelize` are opened
via the `create*Connection` factories but never `.close()`d on the success path or the error
path. This mirrors the pre-existing pattern in the (out-of-scope) `schema.js`/`status.js`/
`verify.js` command modules, so it's not a regression specific to this change, but it does apply
to the new code path too: pooled MySQL connections with idle timers
(`config/db.js`'s `poolForRuntimeMode`) can keep the Node process alive for up to the pool's
`idle` window after the command logically "completes," and the leak would compound if this
function is ever invoked in-process (e.g. a future long-running operator tool, or repeated
calls within the same process) rather than as a fresh one-shot CLI invocation.
**Fix:** Add a `finally` block that closes all opened Sequelize instances, or route this
through a shared connection-lifecycle helper used consistently by all command modules.

---

_Reviewed: 2026-07-12T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

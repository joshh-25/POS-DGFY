---
phase: 01-architecture-and-migration-runner-contract
reviewed: 2026-07-10T12:03:30Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - apps/dgfy-migration-runner/.env.example
  - apps/dgfy-migration-runner/jest.config.cjs
  - apps/dgfy-migration-runner/package.json
  - apps/dgfy-migration-runner/src/cli.js
  - apps/dgfy-migration-runner/src/commands/data.js
  - apps/dgfy-migration-runner/src/commands/rollbackPlan.js
  - apps/dgfy-migration-runner/src/commands/schema.js
  - apps/dgfy-migration-runner/src/commands/status.js
  - apps/dgfy-migration-runner/src/commands/verify.js
  - apps/dgfy-migration-runner/src/config/db.js
  - apps/dgfy-migration-runner/src/config/env.js
  - apps/dgfy-migration-runner/src/metadata/bootstrap.js
  - apps/dgfy-migration-runner/src/metadata/checksum.js
  - apps/dgfy-migration-runner/src/metadata/storage.js
  - apps/dgfy-migration-runner/src/migrations/schema/00000000000000-runner-contract-placeholder.cjs
  - apps/dgfy-migration-runner/src/reports/reportWriter.js
  - apps/dgfy-migration-runner/src/reports/summaryWriter.js
  - apps/dgfy-migration-runner/src/safety/destructiveGate.js
  - apps/dgfy-migration-runner/src/safety/targetGuard.js
  - apps/dgfy-migration-runner/src/utils/errors.js
  - apps/dgfy-migration-runner/tests/cliContract.test.js
  - apps/dgfy-migration-runner/tests/dataCommand.test.js
  - apps/dgfy-migration-runner/tests/dbFactories.test.js
  - apps/dgfy-migration-runner/tests/env.test.js
  - apps/dgfy-migration-runner/tests/metadataBootstrap.test.js
  - apps/dgfy-migration-runner/tests/reportCommands.test.js
  - apps/dgfy-migration-runner/tests/reportWriter.test.js
  - apps/dgfy-migration-runner/tests/safetyGates.test.js
  - apps/dgfy-migration-runner/tests/schemaCommand.test.js
  - apps/dgfy-migration-runner/tests/umzugStorage.test.js
  - infrastructure/docker/dgfy-migration-runner/Dockerfile
  - infrastructure/docker/dgfy-migration-runner/entrypoint.sh
findings:
  critical: 2
  warning: 8
  info: 7
  total: 17
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-10T12:03:30Z
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Summary

The migration runner's safety gates (`destructiveGate.js`, `targetGuard.js`), the `validateEnv → assertTargetDbNameAllowed/assertDestructiveAllowed → connect → ensureMetadataSchema → record → report` ordering in `schema.js`/`data.js`, and the Umzug storage adapter are implemented carefully and match their documented contracts (verified via cross-referencing every command handler's call order against RUN-03/D-09/D-12). No hardcoded secrets were found and `.env.example` ships with empty placeholder values only.

However, two provable functional bugs undermine explicit, tested contracts elsewhere: `verify.js` does not actually "always complete... instead of throwing" when metadata schema bootstrap fails (its own JSDoc's claim), and the D-13 human-readable summary line/file will print `status=unknown` on *every single real invocation* because none of the five command report builders ever populate the field `buildSummaryLine` reads. Neither defect is caught by the existing test suite because tests hand-craft report payloads or mock the failure path away rather than exercising the real production report shapes. A cluster of secondary reliability, defense-in-depth, and packaging gaps (pooled-connection `LAST_INSERT_ID()` reuse, a falsy-`0`-executionId guard bug, two commands that never mark their own audit row `failed`, unscoped destructive-file detection, an import-time `dotenv` side effect, unvalidated migration-name-to-`require()` path construction, a broken `npm run lint` script, and a `REPORT_DIR` default that diverges from the Docker image's provisioned writable mount) round out the findings below.

## Critical Issues

### CR-01: `verify.js` throws instead of always completing when metadata schema bootstrap fails

**File:** `apps/dgfy-migration-runner/src/commands/verify.js:28-67`
**Issue:** The function's own JSDoc states: "verify() always completes and reports findings — a failed check flips the corresponding summary boolean to false instead of throwing." That promise only holds for the two checks explicitly wrapped in `try/catch` (`ensureMetadataSchema` at line 30 and `targetSequelize.authenticate()` at line 37). Everything after that — `recordCommandStart` (line 42), `writeJsonReport`/`writeSummaryReport` (lines 60-61), and `recordCommandComplete` (line 63) — is **not** wrapped. When `ensureMetadataSchema` fails (`metadataSchemaOk = false`), it almost always means the `command_executions` table itself doesn't exist yet or the meta DB is unreachable — which is precisely the table `recordCommandStart` needs to `bulkInsert` into on the very next line. That call throws, propagates out of `runVerify()` uncaught, and crashes the whole command (surfacing as `[dgfy-migration-runner] fatal: ...` + `process.exit(1)` from `cli.js`), directly contradicting the documented "never throws" behavior of a command whose entire purpose is to safely report DB health. This path is untested — `tests/reportCommands.test.js`'s `runVerify` suite only mocks `ensureMetadataSchema` to always resolve, so the failure branch is never exercised.
**Fix:**
```js
// Wrap the audit-trail bookkeeping so a broken meta schema still yields a
// best-effort report instead of crashing verify's own error-tolerant contract.
let executionId;
try {
  executionId = await recordCommandStart(metaSequelize, { ... });
} catch (error) {
  executionId = null; // meta schema unusable — report without audit trail
}

const report = { ... };

let reportJsonPath;
let reportSummaryPath;
try {
  reportJsonPath = await writeJsonReport(config.reportDir, 'verify', report);
  reportSummaryPath = await writeSummaryReport(config.reportDir, 'verify', report);
} catch (error) {
  // still return the report even if the report writer itself fails
}

if (executionId) {
  try {
    await recordCommandComplete(metaSequelize, executionId, {
      exitStatus: 'success',
      reportJsonPath,
      reportSummaryPath
    });
  } catch (error) { /* best-effort — do not let audit bookkeeping crash verify */ }
}

return report;
```

### CR-02: Summary line/file always reports `status=unknown` for every real command run

**File:** `apps/dgfy-migration-runner/src/reports/summaryWriter.js:9`
**Issue:** `buildSummaryLine` computes `const status = report?.summary?.status || report?.exit_status || 'unknown';`. Checking every report object actually constructed by the five command handlers proves neither field is ever set:
- `src/commands/data.js` (dry-run report, lines 41-55; apply report, lines 110-119) — `summary` has `planned_inserts`/`rows_written` etc., no `status`.
- `src/commands/schema.js` (lines 96-105) — `summary: { total_pending, executed }`, no `status`.
- `src/commands/status.js` (lines 38-46) — `summary: { recent_commands, schema_migrations_executed }`, no `status`.
- `src/commands/verify.js` (lines 50-58) — `summary: { metadata_schema_ok, target_db_reachable, target_db_name }`, no `status`.
- `src/commands/rollbackPlan.js` (lines 55-66) — `summary: { migrations_covered }`, no `status`.

None of these set a top-level `exit_status` on the report object either (that field only exists on the separate `command_executions` DB row, set via `recordCommandComplete`, which the summary writer never sees). As a result, every `.summary.txt` file and every stdout line printed by `writeSummaryReport` (D-13's explicit "visibility in deploy logs" requirement) will read `status=unknown` regardless of whether the command actually succeeded or failed. `tests/reportWriter.test.js` and `tests/reportCommands.test.js` don't catch this because their fixture payloads manually include `exit_status: 'success'` at the top level — a shape no real command handler ever produces.
**Fix:** Either have each command handler stamp `report.summary.status` (or a top-level `report.status`) with `'success'`/`'failed'` before calling `writeSummaryReport`, or change `writeSummaryReport`/`buildSummaryLine` to accept the actual exit status as an explicit parameter from the caller (who already knows it) instead of inferring it from the report payload:
```js
// summaryWriter.js
export function buildSummaryLine(command, report, exitStatus = 'unknown') {
  const parts = [`[${command}] status=${exitStatus} generated_at=${report?.generated_at || ''}`];
  ...
}
```

## Warnings

### WR-01: `recordCommandStart`'s id lookup is not guaranteed to see its own insert under connection pooling

**File:** `apps/dgfy-migration-runner/src/metadata/bootstrap.js:113-140`
**Issue:** `recordCommandStart` issues `bulkInsert(...)` and then a *separate* `metaSequelize.query('SELECT LAST_INSERT_ID() AS id')` call. `LAST_INSERT_ID()` is a per-connection/session value. Sequelize's pool (`pool: { max: 5-10, min: 0, ... }`, `config/db.js:3-7`) does not guarantee the follow-up `SELECT` is routed to the same physical connection that performed the `INSERT`. If a different pooled connection services the `SELECT`, `LAST_INSERT_ID()` returns either `0` or a stale id from that connection's own last insert, corrupting the audit trail (`recordCommandComplete` would then update the wrong row, or none at all).
**Fix:** guarantee same-connection affinity with a transaction, or capture the insert id directly from the raw INSERT result on the same round-trip instead of a second query:
```js
const [insertId] = await metaSequelize.query(
  `INSERT INTO ${COMMAND_EXECUTIONS_TABLE} (...) VALUES (...)`,
  { type: Sequelize.QueryTypes.INSERT, replacements: { ... } }
);
return Number(insertId);
```

### WR-02: `executionId === 0` is treated as falsy, silently skipping failure recording

**File:** `apps/dgfy-migration-runner/src/commands/schema.js:118`, `apps/dgfy-migration-runner/src/commands/data.js:68,132`
**Issue:** The catch blocks guard with `if (metaSequelize && executionId)`. `recordCommandStart` can legitimately return `0` (see WR-01 — e.g. a session that has never inserted anything on the connection serving the follow-up `SELECT` returns `LAST_INSERT_ID() = 0`). `0` is falsy in JavaScript, so `recordCommandComplete` would silently never be called for that failed run even though a valid `metaSequelize` and a real (if wrong) `executionId` value exist.
**Fix:**
```js
if (metaSequelize && executionId !== undefined && executionId !== null) {
  await recordCommandComplete(metaSequelize, executionId, { ... });
}
```

### WR-03: `status.js` and `rollbackPlan.js` never mark their own execution row as failed

**File:** `apps/dgfy-migration-runner/src/commands/status.js` (no try/catch around lines 23-58), `apps/dgfy-migration-runner/src/commands/rollbackPlan.js` (no try/catch around lines 34-78)
**Issue:** Unlike `schema.js` and `data.js`, these two handlers call `recordCommandStart` and then perform further work (`metaSequelize.query`, `storage.executed()`, `requireCjs`, report writes) with no surrounding `try/catch`. If any of that later work throws (e.g. a report-write I/O error, a corrupt migration file in `rollbackPlan.js`, or a transient DB error in `status.js`'s `SELECT`), the corresponding `command_executions` row is left permanently in `exit_status='running'` with no `completed_at`/`error_message`, even though the command itself correctly fails and exits non-zero. This breaks the D-06 audit trail's completeness guarantee for two of the six subcommands (and, per CR-01, for parts of `verify.js` too) while `schema.js`/`data.js` get it right.
**Fix:** Wrap the post-`recordCommandStart` body in the same try/catch + `recordCommandComplete({ exitStatus: 'failed', errorMessage: error.message })` pattern already used in `schema.js`/`data.js`.

### WR-04: D-09 destructive-file scan is not scoped to pending migrations, so one historical destructive migration permanently gates all future runs

**File:** `apps/dgfy-migration-runner/src/commands/schema.js:60-63`
**Issue:** `isDestructive` is computed from `listMigrationFiles().some((path) => requireCjs(path).meta?.destructive === true)` — i.e. every `.cjs` file that has ever existed in `migrations/schema/`, not just the ones Umzug considers pending. The code comment explains this is deliberate (pending status requires a meta DB connection, which must not be opened before the gate runs), but the practical consequence is that once a single destructive migration ships, `schema migrate` requires `--confirm-destructive` forever after — even for a completely unrelated, non-destructive migration added months later with zero other pending destructive work. This defeats D-09's intent of confirming specifically when destructive work is about to run, and trains operators to pass `--confirm-destructive` reflexively, eroding the flag's safety value.
**Fix:** Either document this as accepted permanent behavior in the command's `--help` text, or scope the gate more precisely — e.g. cross-reference `listMigrationFiles()` against migrations already recorded in `schema_migrations` via a lightweight pre-connection check, so only *pending* destructive migrations trip the gate.

### WR-05: `env.js` performs a side-effecting `dotenv.config()` call at import time

**File:** `apps/dgfy-migration-runner/src/config/env.js:8`
**Issue:** `dotenv.config({ path: join(__dirname, '..', '..', '.env') })` runs unconditionally the moment `env.js` is imported — by every command module, every test file (transitively), and `cli.js` itself. This contradicts the module's "pure validation" framing (`validateEnv` itself is pure, but the module has a load-time side effect) and means a developer's real local `.env` file can silently inject values into the shared `process.env` before any test's `applyEnv()`/explicit `env` argument override takes effect. Existing tests are only safe today because every test file already calls `applyEnv()` with a fully-populated fixture before asserting; any future test that doesn't would silently inherit stray `.env` values instead of failing loudly.
**Fix:** Move `dotenv.config(...)` out of `env.js` and into `cli.js`'s `main()` (the actual process entrypoint), so `env.js` has no import-time side effects and can be safely imported by tests without ever touching the filesystem.

### WR-06: Migration `name` values are joined into a filesystem path and `require()`-executed without validation

**File:** `apps/dgfy-migration-runner/src/commands/rollbackPlan.js:45-47`, `apps/dgfy-migration-runner/src/commands/schema.js:30-35`
**Issue:** `rollbackPlan.js` builds `migrationPath = join(MIGRATIONS_DIR, name)` where `name` comes from `storage.executed()` (i.e., whatever string value is stored in the `schema_migrations.name` column), then calls `requireCjs(migrationPath)`, which executes arbitrary JavaScript. There is no check that `name` is a bare filename (e.g., rejecting `/`, `..`, or requiring it to match `basename(path.normalize(name))`). This requires prior write access to the meta database (a high-trust actor already), but it is still a defense-in-depth gap: a malformed or maliciously-crafted `name` value (e.g. `../../../../tmp/evil.cjs`) would resolve outside `MIGRATIONS_DIR` and execute on `require()`.
**Fix:**
```js
import { basename } from 'path';
// ...
const migrationPath = join(MIGRATIONS_DIR, basename(name));
if (migrationPath !== join(MIGRATIONS_DIR, name)) {
  throw new Error(`Refusing to load migration with unsafe name: ${name}`);
}
```

### WR-07: `npm run lint` is broken — `eslint` is not a declared dependency

**File:** `apps/dgfy-migration-runner/package.json:10`
**Issue:** `"lint": "eslint src"` is defined, but `eslint` does not appear in `dependencies` or `devDependencies` (only `jest` is listed). This package is not part of the repo's root `npm` workspaces (there is no `workspaces` field at the repo root, and sub-apps are managed via `cd && npm run` scripts), and no `eslint` binary exists in either the repo root's or this app's own `node_modules/.bin`. Running `npm run lint` from this package fails with `eslint: not found`.
**Fix:** add `eslint` (and a config consistent with the monorepo's other apps, e.g. `apps/dgfy-api`) to `devDependencies`, or remove/defer the script if linting is intentionally out of scope for this phase.

### WR-08: `REPORT_DIR` default doesn't match the Docker image's pre-provisioned writable mount

**File:** `apps/dgfy-migration-runner/.env.example` (`REPORT_DIR=./reports`), `apps/dgfy-migration-runner/src/config/env.js:83`, `infrastructure/docker/dgfy-migration-runner/Dockerfile:26`
**Issue:** `config/env.js` defaults `reportDir` to the relative path `./reports` when `REPORT_DIR` is unset, matching `.env.example`'s dev-oriented `REPORT_DIR=./reports` — but the Dockerfile only pre-creates/chowns the **absolute** `/reports` directory (`mkdir -p /reports && chown -R app:app /app /reports`, line 26) and never sets `ENV REPORT_DIR=/reports`. If an operator forgets to pass `REPORT_DIR=/reports` explicitly at `docker run`/compose time, the containerized app resolves the code's relative default `./reports` against `WORKDIR /app`, silently writing reports to the ephemeral container filesystem at `/app/reports` instead of the intended bind-mounted `/reports` volume — reports are then lost the moment the container is removed, with no error raised.
**Fix:** set `ENV REPORT_DIR=/reports` in the Dockerfile so the container has a correct, container-appropriate default independent of the dev-oriented `.env.example` value, and document that `REPORT_DIR` must be supplied as a real container environment variable for the value to reach both the app and any ownership-fixup logic in `entrypoint.sh`.

## Info

### IN-01: `computeFileChecksum` / `createCommandFailureRecord` / `normalizeErrorSignature` are dead code in production

**File:** `apps/dgfy-migration-runner/src/metadata/checksum.js:13`, `apps/dgfy-migration-runner/src/utils/errors.js:35,76`
**Issue:** These functions are exported and covered by unit tests (`dbFactories.test.js`, `safetyGates.test.js`) but are never imported or called from any `src/commands/*.js` handler. Consequently `recordCommandStart`'s `migrationFile`/`checksum` parameters (`bootstrap.js:118-120`) are always `null`/`undefined` in every real invocation, and `schema_migrations.checksum` (explicitly called out in `bootstrap.js`'s own comment as part of "Umzug's SCHEMA_MIGRATIONS_TABLE contract") is never populated by `MetaSequelizeStorage.logMigration`.
**Fix:** Wire `computeFileChecksum` into `schema.js`'s migration execution flow (recording each executed migration's checksum) and `createCommandFailureRecord` into the shared catch blocks for structured failure logging, or mark the gap explicitly as a deferred later-phase stub (matching the "Phase 1 contract stub" language already used elsewhere, e.g. in `data.js`).

### IN-02: Placeholder migration's `down()` is not idempotent unlike its `up()`

**File:** `apps/dgfy-migration-runner/src/migrations/schema/00000000000000-runner-contract-placeholder.cjs:41-43`
**Issue:** `up()` checks `showAllTables()` before creating the table (lines 10-13), but `down()` calls `queryInterface.dropTable('runner_contract_placeholder')` unconditionally. Re-running `down()` after the table has already been dropped will throw. Not currently reachable via the CLI (no rollback-execution command is wired in `cli.js` yet, and D-14 forbids `rollback-plan` from calling `down()` — confirmed by `tests/reportCommands.test.js`'s `downSpy` assertion), but this file is likely to be copied as a template for real migrations in later phases, and the asymmetry would then become a live footgun.
**Fix:** Mirror the existence check used in `up()` before dropping.

### IN-03: `ensureMetadataSchema`'s "structural mismatch" check only detects missing columns

**File:** `apps/dgfy-migration-runner/src/metadata/bootstrap.js:74-105`
**Issue:** The JSDoc claims fail-fast behavior "on any structural mismatch," but the implementation (lines 98-104) only compares expected column *names* against `describeTable()`'s result — it does not detect extra columns, renamed columns, or type drift (e.g. a `VARCHAR(32)` column narrowed from the expected `STRING(64)`). This is narrower than the docstring implies, and `metadataBootstrap.test.js` only exercises the missing-column scenario.
**Fix:** Either narrow the JSDoc to say "missing columns" explicitly, or extend the check to compare column types/nullability where `describeTable()` provides them.

### IN-04: Raw string interpolation of `this.tableName` into SQL in `MetaSequelizeStorage.executed()`

**File:** `apps/dgfy-migration-runner/src/metadata/storage.js:28`
**Issue:** `SELECT name FROM ${this.tableName} ORDER BY executed_at ASC` interpolates the constructor-supplied `tableName` directly into the query string rather than using an escaped/quoted identifier. Currently `tableName` is always the hardcoded `SCHEMA_MIGRATIONS_TABLE` constant (or a test-only override), so there is no exploitable path today, but the class's public constructor accepts an arbitrary string, making this a latent injection surface if `MetaSequelizeStorage` is ever instantiated with externally-influenced input.
**Fix:** Quote the identifier, e.g. `` `SELECT name FROM \`${this.tableName.replace(/`/g, '')}\` ORDER BY executed_at ASC` ``, or use `queryInterface.quoteIdentifier`.

### IN-05: `SOURCE_DB_PORT`/`TARGET_DB_PORT` of `"0"` or non-numeric strings silently fall back to `3306`

**File:** `apps/dgfy-migration-runner/src/config/env.js:68,75`
**Issue:** `Number.parseInt(env.SOURCE_DB_PORT, 10) || 3306` treats a parsed value of `0` as falsy and silently substitutes `3306`; a non-numeric string like `"abc"` parses to `NaN` (also falsy) and is likewise silently coerced to `3306` rather than surfacing a validation error. This is inconsistent with the rest of `validateEnv`, which otherwise fails fast on malformed/missing required config.
**Fix:** Validate the port explicitly (e.g. `Number.isInteger(port) && port > 0`, pushing an error on failure) instead of relying on `||` truthiness coercion.

### IN-06: `verify.js` discards the underlying error message when a check fails

**File:** `apps/dgfy-migration-runner/src/commands/verify.js:29-33,36-40`
**Issue:** `catch (error) { metadataSchemaOk = false; }` and `catch (error) { targetDbReachable = false; }` discard `error` entirely — the report only ever exposes a boolean, with no error message/code. `utils/errors.js` already provides `createCommandFailureRecord`/`normalizeErrorSignature` for capturing exactly this kind of detail elsewhere in the codebase, but `verify.js` doesn't use it. An operator running `verify` against a broken target DB gets `target_db_reachable: false` with zero diagnostic information about *why*.
**Fix:** Capture `error.message` into the report, e.g. `summary: { ..., target_db_error: targetDbReachable ? null : error.message }`.

### IN-07: CLI version hardcoded separately from `package.json`

**File:** `apps/dgfy-migration-runner/src/cli.js:22`
**Issue:** `.version('1.0.0')` duplicates `package.json`'s `"version": "1.0.0"` as a second hardcoded literal; the two will silently drift the next time one is bumped without the other.
**Fix:** Import the version from `package.json` instead, e.g. via `createRequire(import.meta.url)('../package.json').version`.

---

_Reviewed: 2026-07-10T12:03:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

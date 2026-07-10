---
phase: 01-architecture-and-migration-runner-contract
reviewed: 2026-07-10T00:00:00Z
depth: standard
files_reviewed: 31
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
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-10T00:00:00Z
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Summary

Reviewed the dgfy-migration-runner CLI contract (Phase 1 stub): env validation, DB connection factories, metadata bootstrap/storage, safety gates, report writers, all five command handlers, the placeholder Umzug migration, the full Jest test suite, and the Docker packaging (Dockerfile + entrypoint.sh).

The `validateEnv` → `assertTargetDbNameAllowed`/`assertDestructiveAllowed` → connect → `ensureMetadataSchema` → record → report ordering is implemented consistently in `schema.js` and `data.js`, and is well covered by tests (including call-order assertions). No hardcoded secrets, injection, or other Critical/security-tier issues were found — the app never interpolates user-controlled input into SQL or shell, and `.env.example` ships with empty values only.

However, several real functional defects were found that will bite in normal operation rather than exotic edge cases: (1) `recordCommandStart`'s "insert then `SELECT LAST_INSERT_ID()`" pattern is not connection-safe under Sequelize's pool; (2) `status.js`/`rollbackPlan.js` (and parts of `verify.js`) never mark a `command_executions` row `failed` on error, unlike `data.js`/`schema.js`, which can leave permanently-`running` audit rows; (3) `schema.js`'s destructive-gate check scans **every** migration file ever created (not just pending ones), so once any single migration is ever marked destructive, `--confirm-destructive` becomes permanently mandatory for all future runs regardless of what's actually pending; (4) the summary line written for every command always prints `status=unknown` because no command handler ever populates the field `buildSummaryLine` reads from — silently defeating the documented "visibility in deploy logs" goal; (5) `npm run lint` is broken (eslint isn't a declared dependency); (6) the Docker image's default `REPORT_DIR` handling has a footgun that can silently write reports inside the ephemeral container instead of the bind-mounted volume, or fail with EACCES depending on how the operator supplies `REPORT_DIR`.

None of these rise to data-loss/security-critical severity on their own, but several undermine documented design guarantees (D-06 audit trail completeness, D-09 destructive gating semantics, D-13 log visibility) and should be fixed before this becomes the template other phases build on.

## Warnings

### WR-01: `recordCommandStart`'s insert-then-`LAST_INSERT_ID()` pattern is not safe across pooled connections

**File:** `apps/dgfy-migration-runner/src/metadata/bootstrap.js:123-139`
**Issue:** `bulkInsert(...)` and the follow-up `metaSequelize.query('SELECT LAST_INSERT_ID() AS id')` are two independent `.query()` calls, each of which can be served by a different connection from Sequelize's pool (`poolForRuntimeMode` configures `min: 0`, so nothing guarantees connection affinity between calls). MySQL's `LAST_INSERT_ID()` is connection/session-scoped — if the pool hands back a different physical connection for the second call (which can happen under any concurrent load, or simply due to pool implementation details outside this code's control), the returned id can be `0`, stale, or (under real concurrency) another run's id. Every `recordCommandComplete(metaSequelize, executionId, ...)` call keys off this value via `WHERE id = executionId`, so a wrong id silently updates the wrong audit row or updates nothing.
**Fix:** guarantee same-connection affinity with a transaction (or capture `insertId` directly from the raw INSERT result instead of a second round-trip):
```js
export async function recordCommandStart(metaSequelize, { command, mode, argsJson, actor, runtimeMode, migrationFile, checksum }) {
    const now = new Date();
    return metaSequelize.transaction(async (transaction) => {
        await metaSequelize.getQueryInterface().bulkInsert(COMMAND_EXECUTIONS_TABLE, [{
            command, mode, args_json: argsJson, actor, runtime_mode: runtimeMode,
            migration_file: migrationFile, checksum, started_at: now,
            exit_status: 'running', created_at: now, updated_at: now
        }], { transaction });

        const [rows] = await metaSequelize.query('SELECT LAST_INSERT_ID() AS id', { transaction });
        const row = Array.isArray(rows) ? rows[0] : rows;
        return row ? Number(row.id) : null;
    });
}
```

### WR-02: `status.js`/`rollbackPlan.js` never mark a `command_executions` row `failed` on error (verify.js has a partial gap too)

**File:** `apps/dgfy-migration-runner/src/commands/status.js:20-57`
**Also affects:** `apps/dgfy-migration-runner/src/commands/rollbackPlan.js:31-77`, `apps/dgfy-migration-runner/src/commands/verify.js:42-69`
**Issue:** `data.js` and `schema.js` wrap all post-`recordCommandStart` work in `try { ... } catch (error) { if (metaSequelize && executionId) { await recordCommandComplete(..., { exitStatus: 'failed', errorMessage: error.message }); } throw error; }`. `status.js` and `rollbackPlan.js` have no equivalent — if `metaSequelize.query(...)`, `storage.executed()`, `requireCjs(...)`, or the report writers throw *after* `recordCommandStart` has already inserted a `running` row, that row is left with `exit_status='running'` and `completed_at=NULL` forever, with no `error_message` ever recorded. This permanently corrupts the D-06 audit trail's ability to answer "did this run finish, and how?" `verify.js` has the same gap for any error thrown after its two internal try/catches (e.g. inside `writeJsonReport`/`writeSummaryReport`/`recordCommandComplete` itself) — those two specific checks are handled, but the rest of the function is not.
**Fix:** mirror `data.js`/`schema.js`'s try/catch-and-mark-failed pattern in all five command handlers, e.g.:
```js
export async function runStatus({} = {}) {
  const { valid, errors, config } = validateEnv();
  if (!valid) throw new EnvValidationError(errors.join('; '));

  const metaSequelize = createMetaConnection(config);
  await ensureMetadataSchema(metaSequelize);

  let executionId;
  try {
    executionId = await recordCommandStart(metaSequelize, { command: 'status', ... });
    // ... existing body ...
    await recordCommandComplete(metaSequelize, executionId, { exitStatus: 'success', ... });
    return report;
  } catch (error) {
    if (executionId) {
      await recordCommandComplete(metaSequelize, executionId, { exitStatus: 'failed', errorMessage: error.message });
    }
    throw error;
  }
}
```

### WR-03: `schema:migrate`'s destructive-gate check scans every migration file ever created, not just pending ones

**File:** `apps/dgfy-migration-runner/src/commands/schema.js:60-63`
**Issue:** `const isDestructive = listMigrationFiles().some((path) => requireCjs(path).meta?.destructive === true);` inspects **every** `.cjs` file under `MIGRATIONS_DIR`, including migrations that have already executed and been logged in `schema_migrations`. Once a single destructive migration ever ships, this expression is `true` forever — every subsequent `schema migrate` invocation, even ones with zero pending migrations or only non-destructive pending migrations, will require `--confirm-destructive`. This defeats D-09's intent (require confirmation specifically when destructive work is actually about to run) and will train operators to pass `--confirm-destructive` reflexively on every invocation, eroding the flag's safety value. The comment justifies computing this "from the files on disk, before any target/meta connection factory is invoked" but doesn't account for already-executed migrations inflating the check.
**Fix:** scope the destructive check to migrations that are actually pending. This likely requires accepting the architectural cost of checking `umzug.pending()` (post-connection) before deciding on the destructive gate, or tracking executed names via a lightweight pre-connection mechanism — but as written, the gate is not "pending-scoped" despite reading as though it should be.

### WR-04: Report summary line always prints `status=unknown` — the documented "visibility in deploy logs" line never reflects success/failure

**File:** `apps/dgfy-migration-runner/src/reports/summaryWriter.js:9`
**Issue:** `const status = report?.summary?.status || report?.exit_status || 'unknown';` — but none of the five command handlers (`schema.js`, `data.js`, `verify.js`, `status.js`, `rollbackPlan.js`) ever set `summary.status` or a top-level `exit_status` on the report object passed to `writeSummaryReport`. `exit_status` only ever exists on the `command_executions` DB row (set via `recordCommandComplete`), never on the in-memory `report` object that gets summarized. As a result, every real invocation's stdout line / `*.summary.txt` file reads `status=unknown` regardless of actual outcome, defeating the explicit design goal in the file's own comment ("D-13 — visibility in deploy logs"). `reportWriter.test.js`'s `buildSummaryLine` test masks this because it manually constructs a payload with `exit_status: 'success'` at the top level — a shape no real command produces.
**Fix:** have each command populate the field before writing the summary, e.g.:
```js
// in each command handler, right before writeSummaryReport:
report.summary.status = 'success'; // or 'failed' in the catch branch
```
or change `writeSummaryReport`'s signature to accept an explicit status parameter instead of inferring it from report shape.

### WR-05: `npm run lint` is broken — `eslint` is not a declared dependency

**File:** `apps/dgfy-migration-runner/package.json:10`
**Issue:** `"lint": "eslint src"` is defined, but `eslint` does not appear in `dependencies` or `devDependencies` (only `jest` is listed). This package has its own `package-lock.json` / `node_modules` (it is not hoisted via npm workspaces — the repo root `package.json` has no `workspaces` field and manages sub-apps via `cd && npm run` scripts instead). Confirmed: zero `eslint` entries in `package-lock.json` and no `eslint` binary in `node_modules/.bin`. Running `npm run lint` fails with `eslint: not found`.
**Fix:** add `eslint` (and a config consistent with the monorepo's other apps, e.g. `apps/dgfy-api`) to `devDependencies`, or remove/defer the script if linting is intentionally out of scope for Phase 1.

### WR-06: `REPORT_DIR` default doesn't match the Docker image's pre-provisioned writable mount

**File:** `apps/dgfy-migration-runner/.env.example` (`REPORT_DIR=./reports`), `infrastructure/docker/dgfy-migration-runner/Dockerfile:26`, `infrastructure/docker/dgfy-migration-runner/entrypoint.sh:9`
**Issue:** `config/env.js` defaults `reportDir` to the relative path `./reports` when `REPORT_DIR` is unset — matching `.env.example`'s `REPORT_DIR=./reports` — but the Dockerfile only pre-creates/chowns the **absolute** `/reports` directory (`mkdir -p /reports && chown -R app:app /app /reports`), and `entrypoint.sh` only fixes ownership of `${REPORT_DIR:-/reports}` when `REPORT_DIR` is visible as a real shell environment variable. Two related gaps: (1) if an operator forgets to set `REPORT_DIR=/reports` explicitly via `docker run -e` / compose `environment:`, the app resolves the relative default `./reports` against `WORKDIR /app`, silently writing reports to the ephemeral container filesystem at `/app/reports` instead of the intended bind-mounted `/reports` volume — reports are lost on container removal; (2) if `REPORT_DIR` is instead only supplied via a bind-mounted `.env` file (consumed by `dotenv` inside the Node process per `config/env.js:8`), the shell running `entrypoint.sh` never sees that value (dotenv only affects `process.env` inside the already-started Node process, not the parent shell), so it falls back to chowning `/reports` while the app actually writes to whatever different path dotenv resolved — as the non-root `app` user, that write then fails with `EACCES`.
**Fix:** set `ENV REPORT_DIR=/reports` in the Dockerfile (forcing an absolute, container-appropriate default independent of `.env.example`'s dev-oriented relative default), and document that `REPORT_DIR` must be passed as a real container environment variable — not only inside a bind-mounted `.env` file — for the entrypoint's ownership fixup to apply to the directory the app actually writes to.

## Info

### IN-01: `checksum`/`migration_file` audit columns and `computeFileChecksum` are entirely unwired

**File:** `apps/dgfy-migration-runner/src/metadata/checksum.js` (whole file), `apps/dgfy-migration-runner/src/metadata/storage.js:16-21`, `apps/dgfy-migration-runner/src/commands/schema.js` (`recordCommandStart` call omits `migrationFile`/`checksum`)
**Issue:** `computeFileChecksum` is exported but never called from any command handler or from `MetaSequelizeStorage.logMigration` (which always inserts an implicit `checksum: undefined` despite `schema_migrations.checksum` existing specifically to store it, per the bootstrap.js comment "Umzug's SCHEMA_MIGRATIONS_TABLE contract"). `command_executions.migration_file`/`.checksum` are likewise never populated. It's exercised only directly by `dbFactories.test.js`. If deferred to a later phase, that intent isn't marked anywhere (unlike the explicit "Phase 1 contract stub" language used elsewhere in this codebase, e.g. in `data.js`).
**Fix:** wire checksum computation into `logMigration`/`recordCommandStart`, or add a comment marking this as an intentional later-phase stub for discoverability.

### IN-02: `SOURCE_DB_PORT`/`TARGET_DB_PORT` of `"0"` (or any non-numeric string) silently falls back to `3306`

**File:** `apps/dgfy-migration-runner/src/config/env.js:68,75`
**Issue:** `Number.parseInt(env.SOURCE_DB_PORT, 10) || 3306` treats a parsed value of `0` as falsy and silently substitutes `3306`; a non-numeric string like `"abc"` parses to `NaN` (also falsy) and is likewise silently coerced to `3306` rather than surfacing a validation error. This is inconsistent with the rest of `validateEnv`, which otherwise fails fast on malformed/missing required config.
**Fix:** validate the port explicitly (e.g. `Number.isInteger(port) && port > 0` with a pushed error on failure) instead of relying on `||` truthiness coercion.

### IN-03: `verify.js` swallows the underlying error entirely when a check fails

**File:** `apps/dgfy-migration-runner/src/commands/verify.js:29-33, 36-40`
**Issue:** `catch (error) { metadataSchemaOk = false; }` and `catch (error) { targetDbReachable = false; }` discard `error` completely — the report only ever exposes a boolean, with no error message/code. `utils/errors.js` already provides `createCommandFailureRecord`/`normalizeErrorSignature` specifically for capturing this kind of detail elsewhere in the codebase, but `verify.js` doesn't use it. An operator running `verify` against a broken target DB gets `target_db_reachable: false` with zero diagnostic information about why.
**Fix:** capture `error.message` into the report, e.g. `summary: { ..., target_db_error: targetDbReachable ? null : error.message }`.

### IN-04: CLI version hardcoded separately from `package.json`

**File:** `apps/dgfy-migration-runner/src/cli.js:22`
**Issue:** `.version('1.0.0')` duplicates `package.json`'s `"version": "1.0.0"` as a second hardcoded literal; the two will silently drift the next time one is bumped without the other.
**Fix:** import the version from `package.json` instead, e.g. `createRequire(import.meta.url)('../package.json').version`.

### IN-05: Placeholder migration's `down()` is not idempotent like its `up()`

**File:** `apps/dgfy-migration-runner/src/migrations/schema/00000000000000-runner-contract-placeholder.cjs:41-43`
**Issue:** `up()` checks `showAllTables()` before creating the table (idempotent), but `down()` calls `queryInterface.dropTable('runner_contract_placeholder')` unconditionally — if ever invoked when the table doesn't exist, it throws. Per D-14, `down()` is never invoked by any current command handler (`rollbackPlan.js`'s `downSpy` test confirms this), so it doesn't currently bite, but the asymmetry is a latent trap for later phases that copy this file as a template for real migrations.
**Fix:** guard `down()` symmetrically with an existence check, matching `up()`'s pattern.

---

_Reviewed: 2026-07-10T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---
phase: 02-dgfy-database-foundation
reviewed: 2026-07-11T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - apps/dgfy-migration-runner/src/cli.js
  - apps/dgfy-migration-runner/src/commands/schema.js
  - apps/dgfy-migration-runner/src/commands/verify.js
  - apps/dgfy-migration-runner/src/config/db.js
  - apps/dgfy-migration-runner/src/config/env.js
  - apps/dgfy-migration-runner/src/metadata/bootstrap.js
  - apps/dgfy-migration-runner/src/metadata/storage.js
  - apps/dgfy-migration-runner/src/migrations/schema/20260710020000-create-dgfy-core-foundation.cjs
  - apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs
  - apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js
  - apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js
  - apps/dgfy-migration-runner/tests/dbFactories.test.js
  - apps/dgfy-migration-runner/tests/dgfyBusinessSchema.test.js
  - apps/dgfy-migration-runner/tests/dgfyCoreSchema.test.js
  - apps/dgfy-migration-runner/tests/env.test.js
  - apps/dgfy-migration-runner/tests/metadataBootstrap.test.js
  - apps/dgfy-migration-runner/tests/phase02Integration.test.js
  - apps/dgfy-migration-runner/tests/phase02Verification.test.js
  - apps/dgfy-migration-runner/tests/reportCommands.test.js
  - apps/dgfy-migration-runner/tests/schemaCommand.test.js
  - apps/dgfy-migration-runner/tests/umzugStorage.test.js
  - docs/database/dgfy-foundation.md
findings:
  critical: 1
  warning: 5
  info: 2
  total: 8
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Reviewed the DGFY database-foundation migration runner: CLI wiring, the
`schema migrate`/`verify` command handlers, connection factories, env
validation, metadata bootstrap/storage, the two Phase 02 foundation
migrations, their schema contracts, the accompanying unit/integration test
suites, and the authoritative documentation page.

Overall the contract-driven migration/verification design is solid — the
core and business foundation migrations line up column-for-column,
index-for-index, and FK-for-FK against their respective schema contracts,
existence-guards make both migrations idempotent, target-scoped metadata
storage correctly isolates `dgfy_core` from every `dgfy_business_*` target,
and the destructive-migration gate is correctly computed from pending-only
state before any mutation. However, `verify.js`'s `migration_metadata`
section has a real data-integrity bug (see CR-01) that can silently corrupt
the very evidence artifact D-21/D-22 exist to produce, plus several
smaller warnings around a reintroduced falsy-`0` pitfall, missing
duplicate-name validation, an overly broad "baseline missing" check, dead
PostgreSQL-only cleanup code in both migrations' `down()`, and a
documentation/implementation gap in `ensureMetadataSchema`.

## Critical Issues

### CR-01: `migration_metadata` loses/duplicates/mislabels findings when one target's metadata check throws

**File:** `apps/dgfy-migration-runner/src/commands/verify.js:337-355`

**Issue:** Every other multi-target check in this file (`business_schemas`)
wraps **each target's** own check in its own `try/catch` so one target's
failure never affects another target's already-computed result. The
`migration_metadata` block does the opposite — it wraps the primary target's
check **and** the entire `for (const name of businessDbNames)` loop in a
single `try/catch`:

```js
const migrationMetadata = [];
try {
  migrationMetadata.push(
    await checkMigrationMetadata(metaSequelize, resolveTargetKind(config.targetDb.name), config.targetDb.name)
  );
  for (const name of businessDbNames) {
    migrationMetadata.push(await checkMigrationMetadata(metaSequelize, 'business', name));
  }
} catch (error) {
  migrationMetadata.push({
    target_database: config.targetDb.name,
    ok: false,
    expected_migrations: [],
    executed_migrations: [],
    missing_migrations: [],
    error: error.message
  });
}
```

If the primary target's check succeeds (already pushed) and then, say,
`dgfy_business_beta`'s `checkMigrationMetadata` throws (storage query
failure, connection drop, malformed migration file, etc.), the catch block:

- Pushes a **second** entry mislabeled `target_database: config.targetDb.name`
  (the primary target, not the target that actually failed), producing a
  duplicate/contradictory entry for the primary database.
- **Silently drops** any business targets that were checked successfully
  before the one that failed (e.g. `dgfy_business_alpha` in a 3-target run
  would vanish from the report entirely).
- Produces **no entry at all** for the business target that actually failed,
  so an operator reading the report cannot tell which target is broken.

This directly undermines the file's own stated contract ("verify() always
completes and reports findings... a failed check flips the corresponding
finding/summary boolean to false instead of throwing") and the phase's
D-21/D-22 acceptance criteria, which depend on `migration_metadata` being a
trustworthy per-target record. `idempotency` is derived directly from
`migration_metadata` (`idempotency = migrationMetadata.map(...)`), so this
corruption cascades into the idempotency section too. No existing test
exercises a mid-loop failure (all current tests only fail the very first
call or fail `core_schema`'s connection), so this is currently untested.

**Fix:** Scope the try/catch per target, matching the `business_schemas`
pattern already used elsewhere in this file:

```js
const migrationMetadata = [];
try {
  migrationMetadata.push(
    await checkMigrationMetadata(metaSequelize, resolveTargetKind(config.targetDb.name), config.targetDb.name)
  );
} catch (error) {
  migrationMetadata.push({
    target_database: config.targetDb.name,
    kind: resolveTargetKind(config.targetDb.name),
    ok: false,
    expected_migrations: [],
    executed_migrations: [],
    missing_migrations: [],
    error: error.message
  });
}

for (const name of businessDbNames) {
  try {
    // eslint-disable-next-line no-await-in-loop
    migrationMetadata.push(await checkMigrationMetadata(metaSequelize, 'business', name));
  } catch (error) {
    migrationMetadata.push({
      target_database: name,
      kind: 'business',
      ok: false,
      expected_migrations: [],
      executed_migrations: [],
      missing_migrations: [],
      error: error.message
    });
  }
}
```

## Warnings

### WR-01: `verify.js` reintroduces the exact falsy-`0` `executionId` pitfall schema.js explicitly guards against

**File:** `apps/dgfy-migration-runner/src/commands/verify.js:441`

**Issue:** `schema.js` carries an explicit comment: *"executionId can
legitimately be 0 — do not treat it as falsy (WR-02)"* and correctly guards
with `executionId !== undefined && executionId !== null` (schema.js:296).
`verify.js` uses a plain truthiness check instead:

```js
if (executionId) {
  try {
    await recordCommandComplete(metaSequelize, executionId, { ... });
  } catch (error) { ... }
}
```

If `recordCommandStart` ever legitimately resolves to `0` (e.g. a different
metadata table/dialect/test double whose auto-increment or mock starts at
0), this block is silently skipped and the corresponding
`command_executions` row is left stuck at `exit_status: 'running'` forever
— the same failure mode WR-02 was written to prevent, now reintroduced in a
sibling file. In production this is currently latent (MySQL
`AUTO_INCREMENT` starts at 1), but it's an inconsistency against the
project's own documented invariant and untested (every test double for
`recordCommandStart` resolves to `1`, never `0`).

**Fix:**
```js
if (executionId !== undefined && executionId !== null) {
  try {
    await recordCommandComplete(metaSequelize, executionId, { ... });
  } catch (error) { ... }
}
```

### WR-02: `DGFY_BUSINESS_DB_NAMES` does not reject duplicate entries

**File:** `apps/dgfy-migration-runner/src/config/env.js:38-62`

**Issue:** `parseBusinessDbNames` validates each entry's shape (non-empty,
matches `BUSINESS_DB_NAME_PATTERN`) but never checks for duplicates within
the list. A value like `DGFY_BUSINESS_DB_NAMES=dgfy_business_alpha,dgfy_business_alpha`
passes validation and produces `businessDbNames: ['dgfy_business_alpha', 'dgfy_business_alpha']`.
Downstream, `schema.js`'s `businessRuns` and `verify.js`'s `businessDbNames`
loops iterate this array directly with no de-duplication, so the same
business database gets migrated/verified twice per invocation, producing
duplicate (and, depending on timing, one stale/one fresh) entries in
`business_targets`, `business_schemas`, and `migration_metadata` — evidence
arrays that are supposed to have exactly one entry per configured target.

**Fix:** Reject duplicates in `parseBusinessDbNames` (or dedupe with a
reported error), before any connection is opened:

```js
const seen = new Set();
entries.forEach((entry, index) => {
  // ...existing blank/pattern checks...
  if (seen.has(entry)) {
    errors.push(`DGFY_BUSINESS_DB_NAMES entry "${entry}" is duplicated`);
    return;
  }
  seen.add(entry);
  names.push(entry);
});
```

### WR-03: `ensureLegacyFingerprintBaseline` treats any `fs.access` failure as "baseline missing," risking a silent overwrite

**File:** `apps/dgfy-migration-runner/src/commands/schema.js:83-88`

**Issue:** The function's own docstring guarantees it "Never overwrites an
existing baseline on later reruns — D-23's non-mutation proof depends on
comparing against the original pre-any-DGFY-migration state." The
implementation, however, treats *every* `fs.access` failure identically as
"missing, capture now":

```js
try {
  await fsPromises.access(baselinePath);
  return { path: baselinePath, captured: false };
} catch (error) {
  // Missing (or otherwise unreadable) — fall through and capture it now.
}
```

If the artifact exists but `access` fails for a non-ENOENT reason (e.g. a
permissions error, a transient filesystem issue, an NFS mount hiccup), this
code proceeds to recompute the fingerprint and `writeFile` over the same
path — which, if the underlying write succeeds despite the read-check
failure, silently replaces the original pre-migration baseline with a
current (potentially already-migrated) snapshot, defeating the entire
non-mutation proof this artifact exists to provide.

**Fix:** Only treat `ENOENT` as "missing"; rethrow anything else so a
permissions/filesystem problem surfaces as a real error instead of a silent
baseline overwrite:

```js
try {
  await fsPromises.access(baselinePath);
  return { path: baselinePath, captured: false };
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}
```

### WR-04: Both foundation migrations' `down()` issue PostgreSQL-only `DROP TYPE` statements guarded by a MySQL dialect check

**File:** `apps/dgfy-migration-runner/src/migrations/schema/20260710020000-create-dgfy-core-foundation.cjs:284-293`
**File:** `apps/dgfy-migration-runner/src/migrations/schema/20260710021000-create-dgfy-business-foundation.cjs:295-303`

**Issue:** Both `down()` implementations end with:

```js
if (queryInterface.sequelize && queryInterface.sequelize.getDialect() === 'mysql') {
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_accounts_status').catch(() => {});
  // ... five more DROP TYPE statements ...
}
```

`DROP TYPE` is PostgreSQL syntax for its named enum types; MySQL has no
`DROP TYPE` statement at all (MySQL `ENUM` is an inline column type, not a
named database object). This block is guarded by `dialect === 'mysql'` —
the one dialect for which every one of these statements is guaranteed to be
a syntax error — and every call is silently swallowed via
`.catch(() => {})`. The code is dead/misleading: it always fails, does
nothing, and looks like it's cleaning up enum types that were never created
as separate objects in the first place (this project is MySQL-only per
`config/db.js`'s hardcoded `dialect: 'mysql'`).

**Fix:** Remove the dead `DROP TYPE` block entirely from both migrations'
`down()` — MySQL requires no enum-type cleanup since `ENUM` is inline to the
column definition and is dropped automatically with `dropTable`.

### WR-05: `ensureMetadataSchema`'s docstring overstates what the implementation actually validates

**File:** `apps/dgfy-migration-runner/src/metadata/bootstrap.js:78-113`

**Issue:** The docstring states: *"on later runs, fail fast with
MetadataSchemaError on any structural mismatch instead of silently
altering."* The implementation, however, only checks for **missing column
names**:

```js
const existingColumns = await queryInterface.describeTable(tableName);
const missingNames = Object.keys(expectedColumns).filter((name) => !existingColumns[name]);
if (missingNames.length > 0) {
  throw new MetadataSchemaError(...);
}
```

A column that exists but has drifted in type, nullability, or width (e.g.
`actor` narrowed from `VARCHAR(120)` to `VARCHAR(20)`, or `exit_status`'s
ENUM values changed) would pass this check silently — that's a real
structural mismatch the docstring claims is caught but isn't. This is a
documentation/implementation gap rather than a functional defect today, but
it could give false confidence that any schema drift in
`dgfy_migration_meta` will be caught.

**Fix:** Either narrow the docstring to state precisely what's checked
("missing columns only — type/nullability drift is not detected"), or
extend the check to compare `describeTable`'s reported `type`/`allowNull`
against `expectedColumns` for each existing column.

## Info

### IN-01: `MetaSequelizeStorage.executed()` interpolates `tableName` directly into the SQL string

**File:** `apps/dgfy-migration-runner/src/metadata/storage.js:46-52`

**Issue:**
```js
const [rows] = await this.sequelize.query(
  `SELECT name FROM ${this.tableName} WHERE target_database = ? ORDER BY executed_at ASC`,
  { replacements: [this.targetDatabase] }
);
```
`target_database` is safely parameterized, but `this.tableName` is
interpolated directly. Every current call site passes a fixed,
developer-controlled string (`SCHEMA_MIGRATIONS_TABLE` or a test literal),
so this isn't exploitable today. If `tableName` is ever sourced from
runtime configuration or user input in the future, this becomes an
injection vector.

**Fix:** Validate `tableName` against an allow-list/identifier pattern
before interpolating, or keep it a compile-time constant only (drop the
constructor override option if it's unused in production).

### IN-02: A corrupted (not missing) legacy fingerprint baseline is reported with a misleading "run schema migrate first" message

**File:** `apps/dgfy-migration-runner/src/commands/verify.js:223-237`

**Issue:**
```js
try {
  const raw = await fs.readFile(baselinePath, 'utf8');
  baseline = JSON.parse(raw);
} catch (error) {
  return {
    ok: false,
    baseline_found: false,
    baseline_path: baselinePath,
    reason: 'Legacy non-mutation baseline artifact is missing — run schema migrate first to capture it.'
  };
}
```
Both a missing file (`ENOENT`) and a present-but-corrupted file (`JSON.parse`
throwing `SyntaxError`) hit this same catch and get the same "missing —
run schema migrate first" message. An operator debugging a genuinely
corrupted baseline file would be told to just re-run `schema migrate`,
which won't fix a corrupted file that already exists (since
`ensureLegacyFingerprintBaseline` no-ops when the file already exists per
`fs.access`).

**Fix:** Distinguish the two cases and surface the actual parse error when
the file exists but is unreadable/corrupt:
```js
} catch (error) {
  return {
    ok: false,
    baseline_found: false,
    baseline_path: baselinePath,
    reason: error.code === 'ENOENT'
      ? 'Legacy non-mutation baseline artifact is missing — run schema migrate first to capture it.'
      : `Legacy non-mutation baseline artifact could not be read/parsed: ${error.message}`
  };
}
```

---

_Reviewed: 2026-07-11T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

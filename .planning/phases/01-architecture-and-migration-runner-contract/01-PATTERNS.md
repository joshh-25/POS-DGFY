# Phase 1: Architecture and Migration Runner Contract - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 20 (new package files + Docker + tests)
**Analogs found:** 16 / 20 (remaining 4 are Umzug/Commander-library-shaped, no repo analog — use RESEARCH.md Context7 excerpts instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `apps/dgfy-migration-runner/package.json` | config | batch | `apps/dgfy-api/package.json` | exact (same standalone-app shape) |
| `apps/dgfy-migration-runner/jest.config.cjs` | config | test | `apps/dgfy-api/jest.config.cjs` | exact |
| `apps/dgfy-migration-runner/src/config/env.js` | config | request-response (pure validation) | `apps/dgfy-api/src/config/env.js` | role-match (needs extending: enum + allowlist) |
| `apps/dgfy-migration-runner/src/config/db.js` | service | CRUD (connection factory) | `apps/dgfy-api/src/config/db.js` + `backend/src/config/sequelize.config.cjs` | role-match (needs SOURCE_DB_*/TARGET_DB_* split) |
| `apps/dgfy-migration-runner/src/cli.js` | controller | request-response (command dispatch) | none in repo (Commander library shape) | no analog — use RESEARCH.md Context7 `/tj/commander.js` excerpts |
| `apps/dgfy-migration-runner/src/commands/schema.js` | controller | batch | `backend/scripts/sync-tenant-schemas.js` (mode dispatch + report shape) | role-match |
| `apps/dgfy-migration-runner/src/commands/data.js` | controller | batch | `backend/scripts/sync-tenant-schemas.js` | role-match |
| `apps/dgfy-migration-runner/src/commands/verify.js` | controller | batch | `backend/scripts/sync-tenant-schemas.js` (inspect* functions) | role-match |
| `apps/dgfy-migration-runner/src/commands/status.js` | controller | batch | `backend/scripts/sync-tenant-schemas.js` (report/summary assembly) | role-match |
| `apps/dgfy-migration-runner/src/commands/rollbackPlan.js` | controller | batch | `backend/scripts/sync-tenant-schemas.js` (report assembly, no execution) | partial-match |
| `apps/dgfy-migration-runner/src/migrations/schema/00000000000000-runner-contract-placeholder.cjs` | migration | CRUD (DDL) | `backend/migrations/20240101000003-create-suppliers.cjs` | exact |
| `apps/dgfy-migration-runner/src/metadata/bootstrap.js` | service | CRUD | `backend/migrations/20240101000003-create-suppliers.cjs` (idempotent create-if-missing pattern) | partial-match |
| `apps/dgfy-migration-runner/src/metadata/storage.js` | service | CRUD | none (Umzug custom storage shape) | no analog — use RESEARCH.md Context7 `/sequelize/umzug` excerpts |
| `apps/dgfy-migration-runner/src/metadata/checksum.js` | utility | transform | `backend/scripts/sync-tenant-schemas.js` (`normalizeErrorSignature` hashing) | role-match |
| `apps/dgfy-migration-runner/src/reports/reportWriter.js` | utility | file-I/O | `backend/scripts/sync-tenant-schemas.js` (`writeReport`) | exact |
| `apps/dgfy-migration-runner/src/reports/summaryWriter.js` | utility | file-I/O | `backend/scripts/sync-tenant-schemas.js` (stdout summary + `writeReport`) | role-match |
| `apps/dgfy-migration-runner/src/safety/destructiveGate.js` | middleware | request-response (guard) | `backend/scripts/sync-tenant-schemas.js` (`parseArgs` mode validation) | partial-match |
| `apps/dgfy-migration-runner/src/safety/targetGuard.js` | middleware | request-response (guard) | `apps/dgfy-api/src/config/env.js` (env-derived validation) | partial-match |
| `apps/dgfy-migration-runner/src/utils/errors.js` | utility | transform | `backend/scripts/sync-tenant-schemas.js` (`normalizeErrorSignature`, `createSyncFailureRecord`) | role-match |
| `infrastructure/docker/dgfy-migration-runner/Dockerfile` + `entrypoint.sh` | config | batch (one-shot container) | `infrastructure/docker/dgfy-api/Dockerfile` + `entrypoint.sh` | exact |

## Pattern Assignments

### `apps/dgfy-migration-runner/package.json` (config, batch)

**Analog:** `apps/dgfy-api/package.json` (lines 1-35)

```json
{
  "name": "@dgfy/dgfy-migration-runner",
  "version": "1.0.0",
  "description": "One-shot DGFY migration runner: schema/data migration, verification, reporting",
  "type": "module",
  "main": "src/cli.js",
  "scripts": {
    "start": "node src/cli.js",
    "test": "node --experimental-vm-modules node_modules/.bin/jest --config jest.config.cjs --runInBand",
    "lint": "eslint src"
  },
  "dependencies": {
    "commander": "^15.0.0",
    "dotenv": "^16.6.1",
    "mysql2": "^3.6.5",
    "sequelize": "^6.37.8",
    "umzug": "^3.8.3"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  },
  "engines": { "node": ">=18.0.0" }
}
```
Follow `apps/dgfy-api` exactly: `"type": "module"` ESM, `--experimental-vm-modules` jest invocation, no `nodemon`/`dev` script needed since this is a one-shot CLI, not a long-running server.

---

### `apps/dgfy-migration-runner/jest.config.cjs` (config, test)

**Analog:** `apps/dgfy-api/jest.config.cjs` (full file, 9 lines) — copy verbatim, only difference is none expected. Root `<rootDir>/tests` convention matches RESEARCH.md's recommended `tests/` directory.

---

### `apps/dgfy-migration-runner/src/config/env.js` (config, request-response/pure validation)

**Analog:** `apps/dgfy-api/src/config/env.js` (full file, lines 1-16)

```javascript
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '.env') });

export const PORT = Number.parseInt(process.env.PORT || '5100', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';
```

**Extend, don't just copy** (per D-03, D-11, D-12, RUN-03):
- Replace single `NODE_ENV` string with a validated three-tier enum (`development`/`staging`/`production`) — reject unknown values with a thrown/pure-return error, no default silently masking invalid input.
- Add `SOURCE_DB_HOST/PORT/USER/PASSWORD/NAME` and `TARGET_DB_HOST/PORT/USER/PASSWORD/NAME` — mirror the naming style used for `DB_HOST`/`DB_USER`/`DB_NAME` in `backend/src/config/sequelize.config.cjs` (lines 6-13) but namespaced.
- Add `TARGET_DB_NAME` pattern validation (`^dgfy_[a-z0-9_]+$` per D-12) as a pure function, callable without any DB import — this file must stay side-effect-free besides `dotenv.config()`, per RUN-03 ("validate...before connecting").
- Add `REPORT_DIR` and `MIGRATION_ACTOR` env vars (D-13, security V2 note).
- Keep the `dotenv.config({ path: join(__dirname, '..', '..', '.env') })` pattern — same relative depth from `src/config/`.

---

### `apps/dgfy-migration-runner/src/config/db.js` (service, CRUD connection factory)

**Analogs:** `apps/dgfy-api/src/config/db.js` (full file, lines 1-47) and `backend/src/config/sequelize.config.cjs` (full file, lines 1-42)

```javascript
import './env.js';
import { Sequelize } from 'sequelize';

const sequelize = new Sequelize(
    resolveDatabaseName(),
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        dialect: process.env.DB_DIALECT || 'mysql',
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: { max: 10, min: 0, acquire: 10000, idle: 10000 },
        define: { timestamps: true, underscored: false, freezeTableName: true }
    }
);

export const testConnection = async () => {
    try {
        await sequelize.authenticate();
        return true;
    } catch (error) {
        return false;
    }
};

export default sequelize;
```

**Adapt per D-03/D-05:** build **three** factories instead of one default export — `createSourceConnection()`, `createTargetConnection()`, `createMetaConnection()` (for `dgfy_migration_meta`) — each a thin wrapper over this same `new Sequelize(...)` shape, each reading its own `SOURCE_DB_*`/`TARGET_DB_*`/meta-specific env vars from the extended `env.js`. Critically, per RUN-03, none of these factories should be invoked at module load time — construct lazily inside command handlers, after env/gate validation passes (unlike `apps/dgfy-api/src/config/db.js` which constructs `sequelize` eagerly at import time — do NOT copy that eager-construction detail).

The `env: production` pooling numbers in `backend/src/config/sequelize.config.cjs` (lines 34-39, `max: 5`) are a good reference for stricter production defaults (D-11).

---

### `apps/dgfy-migration-runner/src/commands/*.js` (controller, batch)

**Analog:** `backend/scripts/sync-tenant-schemas.js` — mode dispatch (lines 239-263), main run function shape (lines 438-457), and completion/exit-code handling (lines 622-644)

**Mode/options parsing pattern** (lines 239-263):
```javascript
function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        reportFile: '',
        failOnError: false,
        mode: process.env.TENANT_SCHEMA_SYNC_MODE || 'report'
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--report-file') { options.reportFile = argv[i + 1] || ''; i += 1; continue; }
        if (arg === '--fail-on-error') { options.failOnError = true; continue; }
        if (arg === '--mode') { options.mode = argv[i + 1] || options.mode; i += 1; }
    }
    return options;
}
```
Replace this manual `argv` parsing with Commander (`--confirm-destructive`, `--mode` etc. become `.option(...)` declarations per RESEARCH.md's Commander recommendation), but keep the same **shape** of a plain-object `options` argument passed into an exported, independently-testable run function — this is what makes `runTenantSchemaSync` unit-testable without a live CLI invocation, and each `commands/*.js` handler should follow the same "exported pure-ish async function takes options object, does validation → connects → executes → writes report → returns report object" structure.

**Command run function skeleton** (lines 438-457, 622-636):
```javascript
export async function runTenantSchemaSync({ reportFile = '', failOnError = false, mode = 'report' } = {}) {
    const normalizedMode = String(mode || 'report').trim().toLowerCase();
    if (!['report', 'repair-dry-run', 'repair-apply', 'alter'].includes(normalizedMode)) {
        throw new Error(`Invalid tenant schema sync mode: ${mode}`);
    }
    console.log(`[TenantSchemaSync] starting mode=${normalizedMode}`);
    const report = { generated_at: new Date().toISOString(), mode: normalizedMode, summary: { /* ... */ }, results: [] };
    // ... do work, mutate report.summary/report.results ...
    await writeReport(reportFile, report);
    console.log(`[TenantSchemaSync] completed total=... ok=... failed=...`);
    if (failOnError && report.summary.failed > 0) { process.exitCode = 1; }
    return report;
}
```
Each of `schema.js`/`data.js`/`verify.js`/`status.js`/`rollbackPlan.js` should follow this: validate mode → build a `report` object with `generated_at`/command-specific fields/`summary`/`results` → do work → write via `reportWriter.js` → log completion line → set `process.exitCode` on failure → return the report. This gives RUN-05 (report contract) and RUN-02 (explicit command surface) for free by construction.

**Destructive-mode gate integration:** `data.js`'s `apply` handler and any destructive `schema.js` migration must call `safety/destructiveGate.js` before connecting — model this validation as an early-return/throw at the top of the run function, same position where `sync-tenant-schemas.js` validates `normalizedMode` (lines 439-442) before doing any DB work.

**Main-module invocation guard** (lines 638-644) — reuse only if commands are still directly node-runnable; otherwise this responsibility moves to `cli.js`'s Commander action handlers, which should catch and translate errors the same way:
```javascript
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
    const options = parseArgs();
    runTenantSchemaSync(options).catch((error) => {
        console.error(`[TenantSchemaSync] fatal: ${error.message}`);
        process.exit(1);
    });
}
```

---

### `apps/dgfy-migration-runner/src/migrations/schema/00000000000000-runner-contract-placeholder.cjs` (migration, CRUD/DDL)

**Analog:** `backend/migrations/20240101000003-create-suppliers.cjs` (full file, lines 1-97)

```javascript
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const existingTables = await queryInterface.showAllTables();
    const hasTable = existingTables.some((table) => String(table).toLowerCase() === 'placeholder_table');
    if (!hasTable) {
      await queryInterface.createTable('placeholder_table', { /* columns */ });
    }
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('placeholder_table');
  }
};
```
Keep the `up`/`down` signature exactly as Sequelize v6 expects (`queryInterface`, `Sequelize`) per RESEARCH.md — this lets Umzug's resolver call `migration.up(context, Sequelize)` unmodified. Keep the idempotent "check before create" defensive style shown in the suppliers migration (lines 4-7, 67-78) since this placeholder must be safe to run against partially-bootstrapped environments. Per D-14/CONTEXT.md, this file must stay a genuine placeholder/no-op contract proof — do not add real `dgfy_*` landlord schema DDL here (that's Phase 2).

---

### `apps/dgfy-migration-runner/src/metadata/bootstrap.js` (service, CRUD)

**Analog:** `backend/migrations/20240101000003-create-suppliers.cjs` idempotent-create pattern (lines 4-7, 67-90) — "check existing tables/columns/indexes, create only what's missing" is the right shape for the self-heal-on-first-run / validate-on-subsequent-runs behavior in D-08. On mismatch (structure exists but doesn't match expected column set), fail fast rather than silently altering — this diverges from the suppliers migration's silent `addColumn` backfill; bootstrap.js should throw a descriptive error instead when it finds an existing-but-wrong `dgfy_migration_meta` schema.

---

### `apps/dgfy-migration-runner/src/metadata/checksum.js` (utility, transform)

**Analog:** `backend/scripts/sync-tenant-schemas.js` (`normalizeErrorSignature`, lines 185-220)

```javascript
export function normalizeErrorSignature(message) {
    const raw = String(message || '').trim();
    // ...
    const fingerprint = crypto
        .createHash('sha1')
        .update(`${errorCode}|${normalizedMessage}`)
        .digest('hex')
        .slice(0, 16);
    return { error_code: errorCode, normalized_message: normalizedMessage, fingerprint };
}
```
Use Node's built-in `crypto.createHash` the same way for migration-file checksums (D-06 "migration-file/checksum reference") — hash file contents (`sha1` or `sha256`) and truncate/format consistently, following this exact pattern rather than introducing a new hashing library.

---

### `apps/dgfy-migration-runner/src/reports/reportWriter.js` (utility, file-I/O)

**Analog:** `backend/scripts/sync-tenant-schemas.js` (`writeReport`, lines 430-436)

```javascript
async function writeReport(reportFile, payload) {
    if (!reportFile) {
        return;
    }
    await fs.mkdir(dirname(reportFile), { recursive: true });
    await fs.writeFile(reportFile, JSON.stringify(payload, null, 2), 'utf8');
}
```
Copy this pattern directly for the JSON report file (D-15). Extend to accept a `REPORT_DIR` + `{timestamp}-{command}.json` naming convention (D-16) instead of a single caller-supplied path, and export it (this repo version is unexported/module-private — `reportWriter.js` should export it since both `reportWriter.js` and `summaryWriter.js` need the write-with-mkdir-recursive behavior).

---

### `apps/dgfy-migration-runner/src/reports/summaryWriter.js` (utility, file-I/O)

**Analog:** `backend/scripts/sync-tenant-schemas.js` stdout summary pattern (lines 626-629)

```javascript
console.log(
    `[TenantSchemaSync] completed total=${report.summary.tenants_total} ok=${report.summary.succeeded} failed=${report.summary.failed}`
);
console.log(JSON.stringify(report, null, 2));
```
Split into two responsibilities per D-13/D-16: (1) build a short human-readable summary string in the same terse `key=value` style shown above, (2) write it to `{timestamp}-{command}.summary.txt` via `reportWriter.js`'s mkdir+writeFile helper, AND (3) `console.log` that same summary string to stdout for deploy-log visibility. Do not `console.log` the full JSON blob (unlike the analog) — that's the separate `.json` file's job now.

---

### `apps/dgfy-migration-runner/src/safety/destructiveGate.js` (middleware, request-response guard)

**Analog:** `backend/scripts/sync-tenant-schemas.js` mode validation guard (lines 439-442)

```javascript
const normalizedMode = String(mode || 'report').trim().toLowerCase();
if (!['report', 'repair-dry-run', 'repair-apply', 'alter'].includes(normalizedMode)) {
    throw new Error(`Invalid tenant schema sync mode: ${mode}`);
}
```
Model `destructiveGate.js` as a pure function taking `{ isDestructive, confirmDestructiveFlag, runtimeMode }` and throwing a descriptive error if `isDestructive && !confirmDestructiveFlag` — same "validate and throw before any work begins" placement as the mode check above, called at the very top of `data.js`'s apply handler and any destructive `schema.js` path, before `config/db.js` connection factories are invoked (RUN-03 ordering requirement).

---

### `apps/dgfy-migration-runner/src/safety/targetGuard.js` (middleware, request-response guard)

**Analog:** `apps/dgfy-api/src/config/env.js` env-derived pure value pattern (lines 10-15) — same "derive and validate synchronously from `process.env`, no I/O" shape. Add a pure function `assertTargetDbNameAllowed(dbName, runtimeMode)` that checks the `^dgfy_[a-z0-9_]+$` pattern (D-12) and throws before `config/db.js`'s target connection factory is called.

---

### `apps/dgfy-migration-runner/src/utils/errors.js` (utility, transform)

**Analog:** `backend/scripts/sync-tenant-schemas.js` (`createSyncFailureRecord`, lines 222-237)

```javascript
export function createSyncFailureRecord(tenant, error) {
    const signature = normalizeErrorSignature(error?.message || error);
    return {
        tenant_id: tenant.id,
        status: 'failed',
        error_code: signature.error_code,
        error_message: String(error?.message || error || 'Unknown error'),
        normalized_message: signature.normalized_message,
        fingerprint: signature.fingerprint
    };
}
```
Follow this shape for a shared `createCommandFailureRecord(command, error)` used by all `commands/*.js` handlers to populate the `results`/error section of their JSON reports consistently — same fields (`error_code`, `error_message`, `normalized_message`, `fingerprint`) so `status`/reporting commands can aggregate failures uniformly across command types.

---

### `infrastructure/docker/dgfy-migration-runner/Dockerfile` + `entrypoint.sh` (config, batch/one-shot container)

**Analog:** `infrastructure/docker/dgfy-api/Dockerfile` (full file, lines 1-37) and `infrastructure/docker/dgfy-api/entrypoint.sh` (full file, lines 1-16)

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/dgfy-migration-runner/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache curl tini su-exec \
 && addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/dgfy-migration-runner/package*.json ./
COPY apps/dgfy-migration-runner/src ./src
RUN mkdir -p /reports && chown -R app:app /app /reports
COPY infrastructure/docker/dgfy-migration-runner/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "src/cli.js", "--help"]
```
Follow the same deps/runtime two-stage build, `tini`/`su-exec`/non-root `app` user pattern, and root-then-drop-privilege reasoning as `dgfy-api`. Key differences from the analog: no `EXPOSE`/`HEALTHCHECK` (this is a one-shot CLI, not a long-running HTTP service — RUN-01 requires it be separate from long-running containers), and the writable bind mount is `/reports` (mapped to `REPORT_DIR`, D-13) instead of `/app/logs`.

```sh
#!/bin/sh
set -e
cd /app
if [ "$(id -u)" = '0' ]; then
  mkdir -p "${REPORT_DIR:-/reports}"
  chown -R app:app "${REPORT_DIR:-/reports}" 2>/dev/null || true
  exec su-exec app "$0" "$@"
fi
echo "[entrypoint] NODE_ENV=${NODE_ENV:-production} command=$*"
exec "$@"
```
Same root-fixup-then-`su-exec`-then-`exec "$@"` structure as `dgfy-api/entrypoint.sh` (lines 9-16), swapping the `logs` bind mount for `REPORT_DIR`.

---

## Shared Patterns

### Env-driven pure config, loaded before any I/O
**Source:** `apps/dgfy-api/src/config/env.js` (lines 1-16)
**Apply to:** `config/env.js`, `safety/destructiveGate.js`, `safety/targetGuard.js`
```javascript
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
```
All validation logic must be reachable and unit-testable without importing `config/db.js` or any Sequelize connection — this satisfies RUN-03's "validate before connecting" requirement structurally, not just by call order.

### Command run function contract: options in, report object out
**Source:** `backend/scripts/sync-tenant-schemas.js` (`runTenantSchemaSync`, lines 438-636)
**Apply to:** all files in `commands/`
Every command handler: exported async function, takes a plain options object, validates mode/flags first (throw on invalid), builds a `report` object (`generated_at`, command-specific fields, `summary`, `results`), does the work, writes JSON+summary via `reports/`, logs a terse completion line, sets `process.exitCode` on failure, returns the report object. This makes every command independently unit-testable (per RESEARCH.md's test plan) without spinning up the full CLI.

### JSON report + separate human summary, written via mkdir-recursive
**Source:** `backend/scripts/sync-tenant-schemas.js` (`writeReport`, lines 430-436)
**Apply to:** `reports/reportWriter.js`, `reports/summaryWriter.js`, all `commands/*.js`
```javascript
await fs.mkdir(dirname(reportFile), { recursive: true });
await fs.writeFile(reportFile, JSON.stringify(payload, null, 2), 'utf8');
```

### Error normalization/fingerprinting for aggregable failure records
**Source:** `backend/scripts/sync-tenant-schemas.js` (`normalizeErrorSignature`, `createSyncFailureRecord`, lines 185-237)
**Apply to:** `utils/errors.js`, `metadata/checksum.js`, all `commands/*.js` error paths

### Standalone-app packaging (own package.json, Dockerfile, ESM, jest)
**Source:** `apps/dgfy-api/package.json`, `apps/dgfy-api/jest.config.cjs`, `infrastructure/docker/dgfy-api/Dockerfile`, `infrastructure/docker/dgfy-api/entrypoint.sh`
**Apply to:** entire `apps/dgfy-migration-runner` package and its Docker surface

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/dgfy-migration-runner/src/cli.js` | controller | request-response | No Commander-based CLI exists in this repo yet; use RESEARCH.md Context7 `/tj/commander.js` excerpts for subcommand/option/action-handler structure. |
| `apps/dgfy-migration-runner/src/metadata/storage.js` | service | CRUD | No Umzug custom storage class exists in this repo; use RESEARCH.md Context7 `/sequelize/umzug` excerpts (`logMigration`/`unlogMigration`/`executed` methods, `SequelizeStorage` reference shape). |
| `apps/dgfy-migration-runner/tests/cliContract.test.js` | test | request-response | No existing CLI-contract/snapshot test in repo; follow `apps/dgfy-api` Jest conventions structurally but content is new (help-text/option assertions per RESEARCH.md test plan). |
| `apps/dgfy-migration-runner/tests/umzugConfig.test.js` | test | CRUD | No existing Umzug integration test in repo; use RESEARCH.md Context7 `/sequelize/umzug` resolver/context examples as the reference shape, mocked QueryInterface per RESEARCH.md's RUN-04 test guidance. |

## Metadata

**Analog search scope:** `apps/dgfy-api/`, `backend/src/config/`, `backend/migrations/`, `backend/scripts/`, `infrastructure/docker/dgfy-api/`
**Files scanned:** `apps/dgfy-api/package.json`, `apps/dgfy-api/src/config/env.js`, `apps/dgfy-api/src/config/db.js`, `apps/dgfy-api/jest.config.cjs`, `backend/src/config/sequelize.config.cjs`, `backend/migrations/20240101000003-create-suppliers.cjs`, `backend/scripts/sync-tenant-schemas.js`, `infrastructure/docker/dgfy-api/Dockerfile`, `infrastructure/docker/dgfy-api/entrypoint.sh`
**Pattern extraction date:** 2026-07-10

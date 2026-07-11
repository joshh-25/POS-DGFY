# Phase 03: old-to-new-migration-proof - Pattern Map

**Mapped:** 2026-07-11
**Files analyzed:** 14
**Analogs found:** 14 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/dgfy-migration-runner/src/commands/data.js` | command | request-response + batch + report | `apps/dgfy-migration-runner/src/commands/data.js` | exact |
| `apps/dgfy-migration-runner/src/data/legacySource.js` | service | CRUD/read-only + transform | `apps/dgfy-migration-runner/src/config/db.js` + `backend/src/utils/TenantConnector.js` | role-match |
| `apps/dgfy-migration-runner/src/data/mappings.js` | utility | transform | `apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js` + `dgfyBusinessContract.js` + legacy models | role-match |
| `apps/dgfy-migration-runner/src/data/dryRun.js` | service | read-only batch + report assembly | `apps/dgfy-migration-runner/src/commands/data.js` + `src/commands/verify.js` | role-match |
| `apps/dgfy-migration-runner/src/data/apply.js` | service | CRUD/write batch + checkpointed retry | `apps/dgfy-migration-runner/src/metadata/bootstrap.js` + `src/metadata/storage.js` | role-match |
| `apps/dgfy-migration-runner/src/data/verifyData.js` | service | read-only reconciliation + report | `apps/dgfy-migration-runner/src/commands/verify.js` | role-match |
| `apps/dgfy-migration-runner/src/config/env.js` | config | transform + validation | `apps/dgfy-migration-runner/src/config/env.js` | exact |
| `apps/dgfy-migration-runner/src/config/db.js` | config/factory | request-response connection factory | `apps/dgfy-migration-runner/src/config/db.js` | exact |
| `apps/dgfy-migration-runner/src/metadata/bootstrap.js` | metadata service | schema CRUD + batch | `apps/dgfy-migration-runner/src/metadata/bootstrap.js` | exact |
| `apps/dgfy-migration-runner/src/metadata/dataState.js` | metadata service | CRUD + idempotent lookup | `apps/dgfy-migration-runner/src/metadata/storage.js` + `bootstrap.js` | role-match |
| `apps/dgfy-migration-runner/src/reports/*.js` | utility | file-I/O | `apps/dgfy-migration-runner/src/reports/reportWriter.js` + `summaryWriter.js` | exact |
| `docs/database/dgfy-data-migration-map.md` | documentation | transform specification | `docs/database/dgfy-foundation.md` + schema contracts | role-match |
| `apps/dgfy-migration-runner/tests/dataMigration*.test.js` | test | batch + report + retry | `apps/dgfy-migration-runner/tests/dataCommand.test.js` + `metadataBootstrap.test.js` | role-match |
| `apps/dgfy-migration-runner/tests/phase03Integration.test.js` | test | live DB batch + verification | `apps/dgfy-migration-runner/tests/phase02Integration.test.js` | role-match |

## Pattern Assignments

### `apps/dgfy-migration-runner/src/commands/data.js` (command, request-response + batch + report)

**Analog:** `apps/dgfy-migration-runner/src/commands/data.js`

**Imports pattern** (lines 1-8):
```js
import { validateEnv } from '../config/env.js';
import { createTargetConnection, createMetaConnection } from '../config/db.js';
import { assertTargetDbNameAllowed } from '../safety/targetGuard.js';
import { assertDestructiveAllowed } from '../safety/destructiveGate.js';
import { ensureMetadataSchema, recordCommandStart, recordCommandComplete } from '../metadata/bootstrap.js';
import { writeJsonReport } from '../reports/reportWriter.js';
import { writeSummaryReport } from '../reports/summaryWriter.js';
import { EnvValidationError } from '../utils/errors.js';
```

**Dry-run command ordering** (lines 17-39):
```js
export async function runDataDryRun({} = {}) {
  const { valid, errors, config } = validateEnv();
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);

  let metaSequelize;
  let executionId;

  try {
    createTargetConnection(config);
    metaSequelize = createMetaConnection(config);
    await ensureMetadataSchema(metaSequelize);

    executionId = await recordCommandStart(metaSequelize, {
      command: 'data:dry-run',
      mode: 'dry-run',
      argsJson: JSON.stringify({}),
      actor: config.actor,
      runtimeMode: config.runtimeMode
    });
```

**Apply destructive gate pattern** (lines 86-103):
```js
export async function runDataApply({ confirmDestructive = false } = {}) {
  const { valid, errors, config } = validateEnv();
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);
  assertDestructiveAllowed({ isDestructive: true, confirmDestructive, runtimeMode: config.runtimeMode });

  let metaSequelize;
  let executionId;

  try {
    createTargetConnection(config);
    metaSequelize = createMetaConnection(config);
    await ensureMetadataSchema(metaSequelize);

    executionId = await recordCommandStart(metaSequelize, {
```

**Report + completion pattern** (lines 41-64, 111-129):
```js
const report = {
  generated_at: new Date().toISOString(),
  command: 'data:dry-run',
  mode: 'dry-run',
  summary: {
    planned_inserts: 0,
    planned_updates: 0,
    planned_skips: 0,
    planned_conflicts: 0,
    orphan_records: 0,
    tenant_coverage: []
  },
  results: []
};

const reportJsonPath = await writeJsonReport(config.reportDir, 'data:dry-run', report);
const reportSummaryPath = await writeSummaryReport(config.reportDir, 'data:dry-run', report, 'success');

await recordCommandComplete(metaSequelize, executionId, {
  exitStatus: 'success',
  reportJsonPath,
  reportSummaryPath
});
```

**Failure handling pattern** (lines 67-75, 132-140):
```js
} catch (error) {
  // executionId can legitimately be 0 — do not treat it as falsy (WR-02).
  if (metaSequelize && executionId !== undefined && executionId !== null) {
    await recordCommandComplete(metaSequelize, executionId, {
      exitStatus: 'failed',
      errorMessage: error.message
    });
  }
  throw error;
}
```

Planner note: keep `data.js` as the CLI entry and delegate real work to `src/data/*`; do not create a new command surface. `runDataApply` must keep the destructive gate before any connection factory call.

---

### `apps/dgfy-migration-runner/src/data/legacySource.js` (service, read-only CRUD + transform)

**Analogs:** `apps/dgfy-migration-runner/src/config/db.js`, `backend/src/utils/TenantConnector.js`

**Lazy connection factory pattern** (`config/db.js` lines 18-27, 67-77):
```js
export function createSourceConnection(config) {
    const { host, port, user, password, name } = config.sourceDb;
    return new Sequelize(name, user, password, {
        host,
        port,
        dialect: 'mysql',
        logging: false,
        pool: poolForRuntimeMode(config.runtimeMode),
        define: { timestamps: true, underscored: false, freezeTableName: true }
    });
}

export function createBusinessTargetConnection(config, databaseName) {
    const { host, port, user, password } = config.targetDb;
    return new Sequelize(databaseName, user, password, {
        host,
        port,
        dialect: 'mysql',
        logging: false,
        pool: poolForRuntimeMode(config.runtimeMode),
        define: { timestamps: true, underscored: false, freezeTableName: true }
    });
}
```

**Tenant DB shape analog** (`TenantConnector.js` lines 23-27, 69-95):
```js
async getConnection(tenant) {
    if (!tenant || !tenant.db_name) {
        throw new Error('Invalid tenant configuration: missing db_name');
    }

    const sequelize = new Sequelize(
        tenant.db_name,
        process.env.DB_USER || 'root',
        process.env.DB_PASSWORD || '',
        {
            host: process.env.DB_HOST || 'localhost',
            dialect: 'mysql',
            logging: (msg) => logger.debug(`[Tenant: ${tenant.name}] ${msg}`),
            pool: {
                max: 7,
                min: 0,
                acquire: 10000,
                idle: 5000,
                evict: 1000
            },
            define: {
                underscored: true,
                timestamps: true,
                createdAt: 'created_at',
                updatedAt: 'updated_at'
            }
        }
    );
```

Planner note: implement a runner-local legacy tenant source factory rather than importing backend `TenantConnector`; Phase 1 isolated the runner from backend runtime dependencies. Use explicit operator source target list, never auto-discover all tenants.

---

### `apps/dgfy-migration-runner/src/data/mappings.js` (utility, transform)

**Analogs:** `dgfyCoreContract.js`, `dgfyBusinessContract.js`, legacy models.

**Core target columns** (`dgfyCoreContract.js` lines 29-48, 52-80, 84-108):
```js
accounts: {
  columns: [
    'id',
    'first_name',
    'last_name',
    'email',
    'phone',
    'password_hash',
    'status',
    'email_verified_at',
    'phone_verified_at',
    'last_login_at',
    'created_at',
    'updated_at'
  ],
  indexes: ['unique_accounts_email', 'unique_accounts_phone'],
  uniqueConstraints: ['unique_accounts_email', 'unique_accounts_phone'],
  foreignKeys: [],
  projectionOnly: false
},

businesses: {
  columns: [
    'id',
    'business_handle',
    'legal_name',
    'display_name',
    'status',
    'created_at',
    'updated_at'
  ],
```

**Business target columns** (`dgfyBusinessContract.js` lines 39-75, 80-102, 125-146):
```js
locations: {
  columns: [
    'id',
    'name',
    'address_line',
    'latitude',
    'longitude',
    'is_active',
    'is_primary',
    'created_at',
    'updated_at'
  ],
  indexes: ['idx_locations_active', 'idx_locations_primary'],
  uniqueConstraints: [],
  foreignKeys: [],
  projectionOnly: false
},

staff_accounts: {
  columns: [
    'id',
    'display_name',
    'email',
    'phone',
    'status',
    'is_master_admin',
    'created_at',
    'updated_at'
  ],
```

**Legacy account shape** (`DgfyAccount.js` lines 28-44, 45-87):
```js
email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    set(value) {
        this.setDataValue('email', String(value || '').trim().toLowerCase());
    }
},
phone: {
    type: DataTypes.STRING(40),
    allowNull: false,
    unique: true
},
password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
},
is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
},
email_verified_at: {
    type: DataTypes.DATE,
    allowNull: true
},
```

**Legacy business shape** (`Tenant.js` lines 27-43, 121-138):
```js
db_name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
},
company_token: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
},
status: {
    type: DataTypes.ENUM('pending', 'active', 'inactive', 'rejected', 'archived'),
    defaultValue: 'pending'
},
owner_dgfy_account_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
        model: 'dgfy_accounts',
        key: 'id'
    }
},
ownership_status: {
    type: DataTypes.ENUM('claimed', 'unassigned', 'handover_pending'),
```

**Legacy membership shape** (`DgfyAccountTenantMembership.js` lines 12-45, 61-69):
```js
dgfy_account_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
        model: 'dgfy_accounts',
        key: 'id'
    }
},
tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
        model: 'tenants',
        key: 'id'
    }
},
tenant_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
},
role: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'staff'
},
status: {
    type: DataTypes.ENUM('pending', 'accepted', 'declined', 'removed'),
```

**Legacy staff/location/terminal shapes** (`User.js` lines 5-60, `TenantLocation.js` lines 4-45, `SystemSetting.js` lines 10-21):
```js
user_id: {
  type: DataTypes.INTEGER,
  primaryKey: true,
  autoIncrement: true
},
username: {
  type: DataTypes.STRING(50),
  allowNull: false,
  unique: true
},
email: {
  type: DataTypes.STRING(100),
  allowNull: false,
  unique: true,
  validate: {
    isEmail: true
  }
},
phone_number: {
  type: DataTypes.STRING(40),
  allowNull: true
},
role: {
  type: DataTypes.ENUM('admin', 'manager', 'staff', 'cashier', 'po', 'do', 'jo'),
  defaultValue: 'staff'
},
is_master_admin: {
  type: DataTypes.BOOLEAN,
  defaultValue: false,
  allowNull: false
},
```

Planner note: keep mappers pure and shared by dry-run/apply. Required mappings: accounts, businesses, business registry, business memberships, ownership metadata, staff, assignments, roles/permissions, locations, terminal identities, optional storefront projection, and audit evidence.

---

### `apps/dgfy-migration-runner/src/data/dryRun.js` (service, read-only batch + report assembly)

**Analogs:** `apps/dgfy-migration-runner/src/commands/data.js`, `src/commands/verify.js`

**Report summary shape to extend** (`data.js` lines 41-55):
```js
const report = {
  generated_at: new Date().toISOString(),
  command: 'data:dry-run',
  mode: 'dry-run',
  summary: {
    planned_inserts: 0,
    planned_updates: 0,
    planned_skips: 0,
    planned_conflicts: 0,
    orphan_records: 0,
    tenant_coverage: []
  },
  results: [],
  note: 'Phase 1 contract stub proving dry-run gating/reporting only — real source-to-target transformation logic ships in Phase 3'
};
```

**Never-throw finding pattern** (`verify.js` lines 37-55, 137-145):
```js
async function checkTableAgainstContract({ queryInterface, dbQuery, databaseName, tableName, tableContract, exists }) {
  if (!exists) {
    return {
      table: tableName,
      ok: false,
      exists: false,
      missing_columns: tableContract.columns,
      missing_indexes: tableContract.indexes,
      missing_unique_constraints: tableContract.uniqueConstraints || [],
      missing_foreign_keys: (tableContract.foreignKeys || []).map((fk) => fk.column)
    };
  }
}

function failedSchemaResult(databaseName, error) {
  return {
    database: databaseName,
    ok: false,
    tables: [],
    rejected_tables_present: [],
    error: error?.message || String(error)
  };
}
```

Planner note: dry-run should inspect source, target, metadata maps, and constraints, then classify inserts/updates/skips/conflicts/orphans without target mutation. Use the same mappers and target lookup code as apply.

---

### `apps/dgfy-migration-runner/src/data/apply.js` (service, CRUD/write batch + checkpointed retry)

**Analogs:** `apps/dgfy-migration-runner/src/metadata/bootstrap.js`, `src/metadata/storage.js`

**Transaction pattern** (`bootstrap.js` lines 125-153):
```js
export async function recordCommandStart(metaSequelize, {
    command,
    mode,
    argsJson,
    actor,
    runtimeMode,
    migrationFile,
    checksum
}) {
    const now = new Date();
    return metaSequelize.transaction(async (transaction) => {
        await metaSequelize.getQueryInterface().bulkInsert(COMMAND_EXECUTIONS_TABLE, [{
            command,
            mode,
            args_json: argsJson,
            actor,
            runtime_mode: runtimeMode,
            migration_file: migrationFile,
            checksum,
            started_at: now,
            exit_status: 'running',
            created_at: now,
            updated_at: now
        }], { transaction });

        const [rows] = await metaSequelize.query('SELECT LAST_INSERT_ID() AS id', { transaction });
        const row = Array.isArray(rows) ? rows[0] : rows;
        return row ? Number(row.id) : null;
    });
}
```

**Scoped metadata storage pattern** (`storage.js` lines 24-52):
```js
export class MetaSequelizeStorage {
    constructor({ sequelize, tableName = SCHEMA_MIGRATIONS_TABLE, targetDatabase = DEFAULT_TARGET_DATABASE }) {
        this.sequelize = sequelize;
        this.tableName = tableName;
        this.targetDatabase = targetDatabase;
    }

    async logMigration({ name }) {
        await this.sequelize.getQueryInterface().bulkInsert(this.tableName, [{
            name,
            target_database: this.targetDatabase,
            executed_at: new Date()
        }]);
    }

    async executed() {
        const [rows] = await this.sequelize.query(
            `SELECT name FROM ${this.tableName} WHERE target_database = ? ORDER BY executed_at ASC`,
            { replacements: [this.targetDatabase] }
        );
        return rows.map((row) => row.name);
    }
}
```

Planner note: create `legacy_id_map`, per-entity checkpoints, and data-quality finding helpers with the same explicit scope discipline as `targetDatabase`. Look up maps before inserting, checkpoint after durable writes, and record skipped/conflicting records instead of silently dropping them.

---

### `apps/dgfy-migration-runner/src/data/verifyData.js` (service, reconciliation + report)

**Analog:** `apps/dgfy-migration-runner/src/commands/verify.js`

**Multi-target loop pattern** (lines 317-332, 354-369):
```js
const businessSchemas = [];
for (const name of businessDbNames) {
  try {
    // eslint-disable-next-line no-await-in-loop
    const businessSequelize = createBusinessTargetConnection(config, name);
    // eslint-disable-next-line no-await-in-loop
    businessSchemas.push(await checkContractSchema({
      connection: businessSequelize,
      databaseName: name,
      contract: dgfyBusinessContract
    }));
  } catch (error) {
    businessSchemas.push(failedSchemaResult(name, error));
  }
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

**Tenant coverage pattern** (lines 185-212):
```js
async function checkTenantCoverage({ targetSequelize, businessDbNames, businessSchemas }) {
  let registryAvailable = true;
  let registryDatabaseNames = new Set();
  try {
    const [rows] = await targetSequelize.query('SELECT database_name FROM business_database_registry');
    registryDatabaseNames = new Set((rows || []).map((row) => row.database_name));
  } catch (error) {
    registryAvailable = false;
  }

  const schemaOkByName = new Map(businessSchemas.map((result) => [result.database, result.ok]));

  const targets = businessDbNames.map((name) => ({
    database: name,
    has_expected_schema: schemaOkByName.get(name) === true,
    registry_covered: registryAvailable ? registryDatabaseNames.has(name) : null
  }));
```

Planner note: data verification must compare source counts, target counts, map completeness, required relationships, checkpoint state, unresolved data-quality findings, and retry/idempotency evidence. Avoid the known false-clean sentinel pattern in `verify.js` lines 343-379 where error fallbacks set `missing_migrations: []`.

---

### `apps/dgfy-migration-runner/src/config/env.js` (config, transform + validation)

**Analog:** `apps/dgfy-migration-runner/src/config/env.js`

**Side-effect-free validation pattern** (lines 1-12, 64-72):
```js
// NOTE (WR-05): loading a real .env file is a process-entrypoint concern,
// not something this module should do at import time — see cli.js's main()
// for the actual dotenv.config() call.
export const RUNTIME_MODES = ['development', 'staging', 'production'];
export const TARGET_DB_NAME_PATTERN = /^dgfy_[a-z0-9_]+$/;
export const BUSINESS_DB_NAME_PATTERN = /^dgfy_business_[a-z0-9][a-z0-9_]*$/;

/**
 * Pure validation of the runner's environment contract. Never opens a DB
 * connection, never imports a DB client — RUN-03 requires this ordering to
 * be structurally guaranteed, not just conventional.
 */
export function validateEnv(env = process.env) {
```

**Explicit list parsing pattern** (lines 38-61, 97-101):
```js
function parseBusinessDbNames(rawValue) {
    if (isBlank(rawValue)) {
        return { names: [], errors: [] };
    }

    const entries = String(rawValue).split(',').map((entry) => entry.trim());
    const errors = [];
    const names = [];

    entries.forEach((entry, index) => {
        if (entry === '') {
            errors.push(`DGFY_BUSINESS_DB_NAMES entry at position ${index + 1} is empty`);
            return;
        }
        if (!BUSINESS_DB_NAME_PATTERN.test(entry)) {
            errors.push(
                `DGFY_BUSINESS_DB_NAMES entry "${entry}" does not match required pattern ${BUSINESS_DB_NAME_PATTERN}`
            );
            return;
        }
        names.push(entry);
    });

    return { names, errors };
}
```

Planner note: add explicit legacy source target selection to config with the same pure parser style. Reject blanks, duplicates, invalid IDs/db names, source/target count mismatches, and implicit all-tenant discovery before any connection is opened.

---

### `apps/dgfy-migration-runner/src/config/db.js` (config/factory, request-response connection factory)

**Analog:** `apps/dgfy-migration-runner/src/config/db.js`

**Factory conventions** (lines 1-7, 18-27, 42-53):
```js
import { Sequelize } from 'sequelize';

function poolForRuntimeMode(runtimeMode) {
    return runtimeMode === 'production'
        ? { max: 5, min: 0, acquire: 30000, idle: 10000 }
        : { max: 10, min: 0, acquire: 10000, idle: 10000 };
}

export function createSourceConnection(config) {
    const { host, port, user, password, name } = config.sourceDb;
    return new Sequelize(name, user, password, {
        host,
        port,
        dialect: 'mysql',
        logging: false,
        pool: poolForRuntimeMode(config.runtimeMode),
        define: { timestamps: true, underscored: false, freezeTableName: true }
    });
}

export function createMetaConnection(config) {
    // Meta schema lives on the same MySQL server as target, per D-05/D-07.
    const { host, port, user, password } = config.targetDb;
    const { name } = config.metaDb;
```

Planner note: add a `createLegacyTenantSourceConnection(config, databaseName)` analog if source tenant DB credentials are shared with `SOURCE_DB_*`. Do not read process env inside the factory; use the validated config object.

---

### `apps/dgfy-migration-runner/src/metadata/bootstrap.js` (metadata service, schema CRUD + batch)

**Analog:** `apps/dgfy-migration-runner/src/metadata/bootstrap.js`

**Metadata table registry pattern** (lines 5-8, 47-50, 83-112):
```js
export const META_DB_NAME = 'dgfy_migration_meta';
export const COMMAND_EXECUTIONS_TABLE = 'command_executions';
export const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';

const EXPECTED_TABLE_COLUMNS = {
    [COMMAND_EXECUTIONS_TABLE]: COMMAND_EXECUTIONS_COLUMNS,
    [SCHEMA_MIGRATIONS_TABLE]: SCHEMA_MIGRATIONS_COLUMNS
};

export async function ensureMetadataSchema(metaSequelize) {
    const queryInterface = metaSequelize.getQueryInterface();

    let existingTables;
    try {
        existingTables = await queryInterface.showAllTables();
    } catch (error) {
        if (!isUnknownDatabaseError(error)) {
            throw error;
        }
        await createMetaDatabaseIfMissing(metaSequelize);
        existingTables = await queryInterface.showAllTables();
    }

    const normalizedExisting = new Set(existingTables.map((table) => String(table).toLowerCase()));

    for (const [tableName, expectedColumns] of Object.entries(EXPECTED_TABLE_COLUMNS)) {
        if (!normalizedExisting.has(tableName.toLowerCase())) {
            await queryInterface.createTable(tableName, expectedColumns);
            continue;
        }

        const existingColumns = await queryInterface.describeTable(tableName);
        const missingNames = Object.keys(expectedColumns).filter((name) => !existingColumns[name]);
        if (missingNames.length > 0) {
            throw new MetadataSchemaError(
                `${META_DB_NAME}.${tableName} is missing expected column(s): ${missingNames.join(', ')}`
            );
        }
    }
}
```

Planner note: extend `EXPECTED_TABLE_COLUMNS` with `legacy_id_map`, `data_checkpoints`, and `data_quality_findings`; create missing tables on first run and fail fast on structural drift. Tests should update expected table counts and missing-column failures.

---

### `apps/dgfy-migration-runner/src/metadata/dataState.js` (metadata service, CRUD + idempotent lookup)

**Analogs:** `apps/dgfy-migration-runner/src/metadata/storage.js`, `bootstrap.js`

**Parameterized query pattern** (`storage.js` lines 46-52):
```js
async executed() {
    const [rows] = await this.sequelize.query(
        `SELECT name FROM ${this.tableName} WHERE target_database = ? ORDER BY executed_at ASC`,
        { replacements: [this.targetDatabase] }
    );
    return rows.map((row) => row.name);
}
```

**Bulk insert/update pattern** (`bootstrap.js` lines 136-148, 162-173):
```js
await metaSequelize.getQueryInterface().bulkInsert(COMMAND_EXECUTIONS_TABLE, [{
    command,
    mode,
    args_json: argsJson,
    actor,
    runtime_mode: runtimeMode,
    migration_file: migrationFile,
    checksum,
    started_at: now,
    exit_status: 'running',
    created_at: now,
    updated_at: now
}], { transaction });

await metaSequelize.getQueryInterface().bulkUpdate(
    COMMAND_EXECUTIONS_TABLE,
    {
        completed_at: new Date(),
        exit_status: exitStatus,
        report_json_path: reportJsonPath || null,
        report_summary_path: reportSummaryPath || null,
        error_message: errorMessage || null,
        updated_at: new Date()
    },
    { id: executionId }
);
```

Planner note: expose helpers like `findLegacyIdMap`, `recordLegacyIdMap`, `getCheckpoint`, `markCheckpoint`, and `recordDataQualityFinding`. Scope each row by run scope/source tenant/entity/table and keep SQL parameterized.

---

### `apps/dgfy-migration-runner/src/reports/*.js` (utility, file-I/O)

**Analogs:** `reportWriter.js`, `summaryWriter.js`

**JSON report pattern** (`reportWriter.js` lines 10-32):
```js
export async function writeReportFile(filePath, contents) {
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents, 'utf8');
}

export function buildReportFileName(reportDir, command, generatedAt = new Date()) {
    const timestamp = generatedAt.toISOString().replace(/[:.]/g, '-');
    const safeCommand = String(command).replace(/[^a-z0-9-]+/gi, '-');
    return join(reportDir, `${timestamp}-${safeCommand}.json`);
}

export async function writeJsonReport(reportDir, command, payload) {
    const generatedAt = payload && payload.generated_at ? new Date(payload.generated_at) : new Date();
    const filePath = buildReportFileName(reportDir, command, generatedAt);
    await writeReportFile(filePath, JSON.stringify(payload, null, 2));
    return filePath;
}
```

**Summary line pattern** (`summaryWriter.js` lines 8-31, 39-49):
```js
export function buildSummaryLine(command, report, exitStatus) {
    const status = exitStatus !== undefined ? exitStatus : (report?.summary?.status || report?.exit_status || 'unknown');
    const generatedAt = report?.generated_at || '';
    const parts = [`[${command}] status=${status} generated_at=${generatedAt}`];

    if (report?.summary && typeof report.summary === 'object') {
        Object.entries(report.summary).forEach(([key, value]) => {
            if (key === 'status') {
                return;
            }
            if (value !== null && typeof value === 'object') {
                return;
            }
            parts.push(`${key}=${value}`);
        });
    }

    return parts.join(' ');
}
```

Planner note: use existing writers unchanged unless summary output needs additional scalar fields. Put detailed per-tenant/entity findings in JSON; keep summary scalar and terse.

---

### `docs/database/dgfy-data-migration-map.md` (documentation, transform specification)

**Analogs:** `docs/database/dgfy-foundation.md`, `dgfyCoreContract.js`, `dgfyBusinessContract.js`, legacy models.

**Contract source-of-truth wording** (`dgfyCoreContract.js` lines 1-19, `dgfyBusinessContract.js` lines 1-28):
```js
/**
 * Phase 02 DGFY core landlord schema contract.
 *
 * Single source of truth for the `dgfy_core` landlord database contract:
 * required tables, columns, indexes, unique constraints, and foreign keys
 * that the Phase 02 additive migration must create, plus an explicit
 * reject list of out-of-scope operational table names...
 */
```

Planner note: the doc should enumerate source table/field, target table/field, transform rule, skip/conflict rule, ID-map key, verification check, and explicitly deferred fields. It is MIG-01 evidence, not general architecture prose.

---

### `apps/dgfy-migration-runner/tests/dataMigration*.test.js` (test, batch + report + retry)

**Analogs:** `dataCommand.test.js`, `env.test.js`, `metadataBootstrap.test.js`

**Command test setup pattern** (`dataCommand.test.js` lines 43-64, 69-83):
```js
const mockCreateTargetConnection = jest.fn();
const mockCreateMetaConnection = jest.fn();
const mockEnsureMetadataSchema = jest.fn().mockResolvedValue(undefined);
const mockRecordCommandStart = jest.fn().mockResolvedValue(1);
const mockRecordCommandComplete = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../src/config/db.js', () => ({
  createSourceConnection: jest.fn(),
  createTargetConnection: mockCreateTargetConnection,
  createMetaConnection: mockCreateMetaConnection
}));

const { runDataDryRun, runDataApply } = await import('../src/commands/data.js');

beforeEach(async () => {
  reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-data-'));
  applyEnv({ REPORT_DIR: reportDir });
  mockCreateTargetConnection.mockReset().mockReturnValue({ getQueryInterface: () => ({}) });
  mockCreateMetaConnection.mockReset().mockReturnValue({ config: {}, query: jest.fn() });
});
```

**Gating assertions** (`dataCommand.test.js` lines 85-104):
```js
test('runDataApply({confirmDestructive:false}) rejects with DestructiveOperationError and never calls createTargetConnection', async () => {
  await expect(runDataApply({ confirmDestructive: false })).rejects.toThrow(DestructiveOperationError);

  expect(mockCreateTargetConnection).not.toHaveBeenCalled();
  expect(mockCreateMetaConnection).not.toHaveBeenCalled();
});

test('runDataDryRun({}) succeeds without requiring confirmDestructive', async () => {
  const report = await runDataDryRun({});

  expect(report.command).toBe('data:dry-run');
  expect(report.mode).toBe('dry-run');
});
```

**Env parser test pattern** (`env.test.js` lines 109-171):
```js
test('DGFY_BUSINESS_DB_NAMES parses a comma-separated list of valid dgfy_business_* names', () => {
    const env = baseEnv({ DGFY_BUSINESS_DB_NAMES: 'dgfy_business_alpha, dgfy_business_beta' });

    const result = validateEnv(env);

    expect(result.valid).toBe(true);
    expect(result.config.businessDbNames).toEqual(['dgfy_business_alpha', 'dgfy_business_beta']);
});

test('DGFY_BUSINESS_DB_NAMES rejects an empty entry in the list', () => {
    const env = baseEnv({ DGFY_BUSINESS_DB_NAMES: 'dgfy_business_alpha,,dgfy_business_beta' });

    const result = validateEnv(env);

    expect(result.valid).toBe(false);
    expect(result.config).toBeNull();
});
```

**Metadata bootstrap test pattern** (`metadataBootstrap.test.js` lines 48-110):
```js
test('first run (showAllTables returns []) calls createTable for both command_executions and schema_migrations', async () => {
    const createTable = jest.fn().mockResolvedValue();
    const metaSequelize = buildMetaSequelize({
        showAllTables: jest.fn().mockResolvedValue([]),
        createTable,
        describeTable: jest.fn(),
        addColumn: jest.fn(),
        bulkInsert: jest.fn(),
        bulkUpdate: jest.fn(),
        query: jest.fn()
    });

    await ensureMetadataSchema(metaSequelize);

    expect(createTable).toHaveBeenCalledWith(COMMAND_EXECUTIONS_TABLE, expect.any(Object));
    expect(createTable).toHaveBeenCalledWith(SCHEMA_MIGRATIONS_TABLE, expect.any(Object));
});
```

Planner note: add focused unit tests for mapper purity, dry-run non-mutation, apply gating, ID-map lookup-before-insert, checkpoint resume, skip/conflict finding rows, duplicate target-list rejection, and report contents.

---

### `apps/dgfy-migration-runner/tests/phase03Integration.test.js` (test, live DB batch + verification)

**Analog:** `apps/dgfy-migration-runner/tests/phase02Integration.test.js`

Pattern to copy from Phase 2 integration: create disposable `sku_it_*`, `dgfy_core_it_*`, `dgfy_business_it_*`, run schema/data commands, rerun to prove idempotency, verify reports, then clean up only disposable schemas. Phase 2 verification documents this exact expectation in `.planning/phases/02-dgfy-database-foundation/02-VERIFICATION.md`.

Planner note: keep the test gated behind an opt-in env var like `RUN_PHASE03_INTEGRATION=true` because it needs live MySQL admin credentials. It should prove dry-run no mutation, apply writes mapped foundation records, retry no duplicates, and data verification compares source/target/map/checkpoint state.

## Shared Patterns

### Authentication / Authorization Linkage
**Source:** `backend/src/services/dgfyTenantSessionService.js`
**Apply to:** mappings for business memberships and account-staff assignments
```js
const findAcceptedMembership = async ({ account, tenantId, companyToken }) => {
  const where = {
    dgfy_account_id: account.id,
    status: 'accepted'
  };
  if (tenantId) where.tenant_id = tenantId;

  const memberships = await DgfyAccountTenantMembership.findAll({
    where,
    include: [{
      model: Tenant,
      as: 'tenant',
      attributes: ['id', 'name', 'db_name', 'company_token', 'status', 'plan']
    }],
    order: [['updated_at', 'DESC']]
  });
```

Use accepted `dgfy_account_tenant_memberships` rows or explicit owner fields. Do not infer access from email/phone. Runtime email repair exists at `dgfyTenantSessionService.js` lines 98-103, but migration planning should treat that as a repair escape hatch, not a general linking rule.

### Terminal Registry Sanitization
**Source:** `backend/src/services/dgfyPosTerminalPolicyService.js` and `backend/src/modules/settings/usecases/posTerminalRegistrySecrets.js`
**Apply to:** terminal identity mapper
```js
const TERMINAL_ID_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

const sanitizeTerminalId = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return TERMINAL_ID_PATTERN.test(normalized) ? normalized : '';
};

const registry = parseJsonSetting(lookup.get('pos_terminal_registry'))
  .map((entry) => ({
    terminal_id: sanitizeTerminalId(entry?.terminal_id),
    label: String(entry?.label || '').trim(),
    location_id: parsePositiveInt(entry?.location_id),
    is_active: entry?.is_active !== false
  }))
  .filter((entry) => entry.terminal_id && entry.is_active);
```

`posTerminalRegistrySecrets.js` lines 52-65 show the read-safe fields: `terminal_id`, `label`, `location_id`, `cashier_email`, `is_active`, `is_default`, `pairing_version`, `paired_device_ready`. Do not migrate `terminal_password_hash`, pairing secrets, shifts, transactions, or fiscal records.

### Role / Permission Defaults
**Source:** `backend/src/config/permissions.js`
**Apply to:** role and role_permission seed mapper
```js
export const DEFAULT_ROLE_PERMISSIONS = {
    admin: getAllPermissions(), // Admin gets everything by default (legacy support)
    manager: [
        ...Object.values(PERMISSIONS.INVENTORY.actions),
        ...Object.values(PERMISSIONS.SUPPLIERS.actions),
        ...Object.values(PERMISSIONS.ORDERS.actions),
        ...Object.values(PERMISSIONS.DISPATCH.actions),
        ...Object.values(PERMISSIONS.POS.actions),
        ...Object.values(PERMISSIONS.STOCK.actions),
        ...Object.values(PERMISSIONS.REPORTS.actions),
        PERMISSIONS.AI.actions.AI_CHAT_VIEW,
        PERMISSIONS.AI.actions.AI_CHAT_ACTION,
        PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
```

Seed standard roles once per `dgfy_business_*` database. Map legacy roles into target assignment role enum conservatively: owner/admin-like to `owner` or `manager` only when source membership/ownership proves it; otherwise `staff`.

### Report Files
**Source:** `apps/dgfy-migration-runner/src/reports/reportWriter.js`, `summaryWriter.js`
**Apply to:** dry-run/apply/verify reports
```js
const timestamp = generatedAt.toISOString().replace(/[:.]/g, '-');
const safeCommand = String(command).replace(/[^a-z0-9-]+/gi, '-');
return join(reportDir, `${timestamp}-${safeCommand}.json`);
```

Every command should write JSON plus `.summary.txt`, record paths in `command_executions`, and keep detailed findings in JSON.

### Metadata Drift Handling
**Source:** `apps/dgfy-migration-runner/src/metadata/bootstrap.js`
**Apply to:** metadata table additions
```js
if (!normalizedExisting.has(tableName.toLowerCase())) {
    await queryInterface.createTable(tableName, expectedColumns);
    continue;
}

const existingColumns = await queryInterface.describeTable(tableName);
const missingNames = Object.keys(expectedColumns).filter((name) => !existingColumns[name]);
if (missingNames.length > 0) {
    throw new MetadataSchemaError(
        `${META_DB_NAME}.${tableName} is missing expected column(s): ${missingNames.join(', ')}`
    );
}
```

Create missing metadata tables on first run; fail on partial/old metadata schema. Do not silently `addColumn` metadata drift during data migration.

### Out-of-Scope Table Guard
**Source:** `dgfyCoreContract.js` lines 162-195 and `dgfyBusinessContract.js` lines 190-221
**Apply to:** mappers, verification, tests
```js
rejectedTables: [
  'items',
  'products',
  'skus',
  'product_variants',
  'categories',
  'purchase_orders',
  'job_orders',
  'stock_movements',
  'item_location_stocks',
  'fifo_batches',
  'suppliers',
  'supplier_items',
  'pos_transactions',
  'pos_transaction_lines',
```

Phase 03 must not migrate Product/POS/Storefront/fiscal operational data. Terminal identity is allowed; terminal transactions, shifts, payments, fiscal events, and inventory are not.

## No Analog Found

All planned files have usable analogs in the runner or backend source shape. No file needs to fall back solely to research examples.

## Metadata

**Analog search scope:** `apps/dgfy-migration-runner/src`, `apps/dgfy-migration-runner/tests`, `backend/src/models`, `backend/src/services`, `backend/src/utils`, `backend/src/modules/settings`, `docs/database`
**Files scanned:** 70+
**Pattern extraction date:** 2026-07-11

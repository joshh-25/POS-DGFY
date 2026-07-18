# Phase 02: dgfy-database-foundation - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 12
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/dgfy-migration-runner/src/commands/schema.js` | command | request-response + batch | `apps/dgfy-migration-runner/src/commands/schema.js` | exact |
| `apps/dgfy-migration-runner/src/safety/destructiveGate.js` | utility | request-response | `apps/dgfy-migration-runner/src/commands/schema.js` + `src/safety/destructiveGate.js` | role-match |
| `apps/dgfy-migration-runner/src/commands/verify.js` | command | request-response + report | `apps/dgfy-migration-runner/src/commands/verify.js` | exact |
| `apps/dgfy-migration-runner/src/config/env.js` | config | transform | `apps/dgfy-migration-runner/src/config/env.js` | exact |
| `apps/dgfy-migration-runner/src/reports/summaryWriter.js` | utility | file-I/O | `apps/dgfy-migration-runner/src/reports/summaryWriter.js` | exact |
| `apps/dgfy-migration-runner/src/reports/reportWriter.js` | utility | file-I/O | `apps/dgfy-migration-runner/src/reports/reportWriter.js` | exact |
| `apps/dgfy-migration-runner/src/metadata/bootstrap.js` | metadata service | CRUD + batch | `apps/dgfy-migration-runner/src/metadata/bootstrap.js` | exact |
| `apps/dgfy-migration-runner/src/metadata/storage.js` | metadata service | CRUD | `apps/dgfy-migration-runner/src/metadata/storage.js` | exact |
| `apps/dgfy-migration-runner/src/migrations/schema/*dgfy-core*.cjs` | migration | CRUD/schema DDL | `backend/migrations/20260521000001-create-dgfy-accounts.cjs` + `20260603000002-create-dgfy-account-admin-audit-logs.cjs` | role-match |
| `apps/dgfy-migration-runner/src/migrations/schema/*dgfy-business*.cjs` | migration | CRUD/schema DDL | `backend/migrations/20260330000003-create-tenant-locations.cjs` | role-match |
| `apps/dgfy-migration-runner/tests/schemaCommand.test.js` | test | request-response + batch | `apps/dgfy-migration-runner/tests/schemaCommand.test.js` | exact |
| `apps/dgfy-migration-runner/tests/reportCommands.test.js` / `metadataBootstrap.test.js` | test | report + metadata CRUD | `apps/dgfy-migration-runner/tests/reportCommands.test.js` + `metadataBootstrap.test.js` | exact |

## Pattern Assignments

### `apps/dgfy-migration-runner/src/commands/schema.js` (command, request-response + batch)

**Analog:** `apps/dgfy-migration-runner/src/commands/schema.js`

**Imports pattern** (lines 1-16):
```js
import { readdirSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Sequelize } from 'sequelize';
import { Umzug } from 'umzug';

import { validateEnv } from '../config/env.js';
import { createTargetConnection, createMetaConnection } from '../config/db.js';
import { assertTargetDbNameAllowed } from '../safety/targetGuard.js';
import { assertDestructiveAllowed } from '../safety/destructiveGate.js';
import { ensureMetadataSchema, recordCommandStart, recordCommandComplete } from '../metadata/bootstrap.js';
import { MetaSequelizeStorage } from '../metadata/storage.js';
import { writeJsonReport } from '../reports/reportWriter.js';
import { writeSummaryReport } from '../reports/summaryWriter.js';
import { EnvValidationError } from '../utils/errors.js';
```

**Core command pattern** (lines 60-89):
```js
export async function runSchemaMigrate({ confirmDestructive = false } = {}) {
  const { valid, errors, config } = validateEnv();
  if (!valid) {
    throw new EnvValidationError(errors.join('; '));
  }

  assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);

  const isDestructive = listMigrationFiles().some((path) => requireCjs(path).meta?.destructive === true);
  assertDestructiveAllowed({ isDestructive, confirmDestructive, runtimeMode: config.runtimeMode });

  let metaSequelize;
  let executionId;

  try {
    const targetSequelize = createTargetConnection(config);
    metaSequelize = createMetaConnection(config);
    await ensureMetadataSchema(metaSequelize);

    const umzug = new Umzug({
      migrations: {
        glob: join(MIGRATIONS_DIR, '*.cjs'),
        resolve: resolveMigration
      },
      context: targetSequelize.getQueryInterface(),
      storage: new MetaSequelizeStorage({ sequelize: metaSequelize }),
      logger: undefined
    });
```

**Report + completion pattern** (lines 91-124):
```js
const pendingMigrations = await umzug.pending();
const executed = await umzug.up();

const report = {
  generated_at: new Date().toISOString(),
  command: 'schema:migrate',
  mode,
  migrations_executed: executed.map((migration) => migration.name),
  summary: {
    total_pending: pendingMigrations.length,
    executed: executed.length
  }
};

const reportJsonPath = await writeJsonReport(config.reportDir, 'schema:migrate', report);
const reportSummaryPath = await writeSummaryReport(config.reportDir, 'schema:migrate', report, 'success');

await recordCommandComplete(metaSequelize, executionId, {
  exitStatus: 'success',
  reportJsonPath,
  reportSummaryPath
});
```

**Failure handling pattern** (lines 125-134):
```js
} catch (error) {
  if (metaSequelize && executionId !== undefined && executionId !== null) {
    await recordCommandComplete(metaSequelize, executionId, {
      exitStatus: 'failed',
      errorMessage: error.message
    });
  }
  throw error;
}
```

Planner note: D-17 requires replacing the current all-file destructive scan with pending-only detection. Preserve the command ordering discipline, but expect a meta-storage read before final destructive classification.

---

### `apps/dgfy-migration-runner/src/commands/verify.js` (command, request-response + report)

**Analog:** `apps/dgfy-migration-runner/src/commands/verify.js`

**Imports pattern** (lines 1-7):
```js
import { validateEnv } from '../config/env.js';
import { createTargetConnection, createMetaConnection } from '../config/db.js';
import { assertTargetDbNameAllowed } from '../safety/targetGuard.js';
import { ensureMetadataSchema, recordCommandStart, recordCommandComplete } from '../metadata/bootstrap.js';
import { writeJsonReport } from '../reports/reportWriter.js';
import { writeSummaryReport } from '../reports/summaryWriter.js';
import { EnvValidationError } from '../utils/errors.js';
```

**Never-throw verification pattern** (lines 28-40):
```js
let metadataSchemaOk = true;
try {
  await ensureMetadataSchema(metaSequelize);
} catch (error) {
  metadataSchemaOk = false;
}

let targetDbReachable = true;
try {
  await targetSequelize.authenticate();
} catch (error) {
  targetDbReachable = false;
}
```

**Best-effort audit/report pattern** (lines 42-94):
```js
let executionId = null;
try {
  executionId = await recordCommandStart(metaSequelize, {
    command: 'verify',
    mode: 'verify',
    argsJson: JSON.stringify({}),
    actor: config.actor,
    runtimeMode: config.runtimeMode
  });
} catch (error) {
  executionId = null;
}

const report = {
  generated_at: new Date().toISOString(),
  command: 'verify',
  summary: {
    metadata_schema_ok: metadataSchemaOk,
    target_db_reachable: targetDbReachable,
    target_db_name: config.targetDb.name
  }
};
```

Planner note: extend this shape with table/column/index/constraint checks, migration metadata checks, `business_database_registry` tenant coverage, idempotency proof, and legacy `sku_*` fingerprint proof. Keep the command returning a report instead of crashing on failed checks.

---

### `apps/dgfy-migration-runner/src/config/env.js` (config, transform)

**Analog:** `apps/dgfy-migration-runner/src/config/env.js`

**Side-effect-free config pattern** (lines 1-8):
```js
// NOTE (WR-05): loading a real .env file is a process-entrypoint concern,
// not something this module should do at import time
export const RUNTIME_MODES = ['development', 'staging', 'production'];
export const TARGET_DB_NAME_PATTERN = /^dgfy_[a-z0-9_]+$/;
```

**Validation + config object pattern** (lines 32-85):
```js
export function validateEnv(env = process.env) {
  const errors = [];
  const runtimeMode = env.RUNTIME_MODE || 'development';
  if (!RUNTIME_MODES.includes(runtimeMode)) {
    errors.push(`RUNTIME_MODE "${runtimeMode}" is invalid — must be one of ${RUNTIME_MODES.join(', ')}`);
  }

  if (errors.length > 0) {
    return { valid: false, errors, config: null };
  }

  const config = {
    runtimeMode,
    sourceDb: { host: env.SOURCE_DB_HOST, port: Number.parseInt(env.SOURCE_DB_PORT, 10) || 3306 },
    targetDb: { host: env.TARGET_DB_HOST, port: Number.parseInt(env.TARGET_DB_PORT, 10) || 3306, name: env.TARGET_DB_NAME },
    metaDb: { name: 'dgfy_migration_meta' },
    reportDir: env.REPORT_DIR || './reports',
    actor
  };

  return { valid: true, errors: [], config };
}
```

Planner note: D-20 should change the default report directory to the container-safe mounted path used by Docker (`/reports`) while preserving test override behavior.

---

### `apps/dgfy-migration-runner/src/reports/*.js` (utility, file-I/O)

**Analogs:** `apps/dgfy-migration-runner/src/reports/reportWriter.js`, `summaryWriter.js`

**JSON report file pattern** (`reportWriter.js` lines 10-32):
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

**Summary status pattern** (`summaryWriter.js` lines 8-31):
```js
export function buildSummaryLine(command, report, exitStatus) {
  const status = exitStatus !== undefined ? exitStatus : (report?.summary?.status || report?.exit_status || 'unknown');
  const generatedAt = report?.generated_at || '';
  const parts = [`[${command}] status=${status} generated_at=${generatedAt}`];

  if (report?.summary && typeof report.summary === 'object') {
    Object.entries(report.summary).forEach(([key, value]) => {
      if (key === 'status') return;
      if (value !== null && typeof value === 'object') return;
      parts.push(`${key}=${value}`);
    });
  }

  return parts.join(' ');
}
```

---

### `apps/dgfy-migration-runner/src/metadata/bootstrap.js` and `storage.js` (metadata service, CRUD + batch)

**Analogs:** `apps/dgfy-migration-runner/src/metadata/bootstrap.js`, `storage.js`

**Metadata table contract** (`bootstrap.js` lines 5-38):
```js
export const META_DB_NAME = 'dgfy_migration_meta';
export const COMMAND_EXECUTIONS_TABLE = 'command_executions';
export const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';

const COMMAND_EXECUTIONS_COLUMNS = {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  command: { type: DataTypes.STRING(64), allowNull: false },
  exit_status: { type: DataTypes.ENUM('running', 'success', 'failed'), allowNull: false, defaultValue: 'running' },
  report_json_path: { type: DataTypes.STRING(500), allowNull: true },
  report_summary_path: { type: DataTypes.STRING(500), allowNull: true },
  error_message: { type: DataTypes.TEXT, allowNull: true }
};

const SCHEMA_MIGRATIONS_COLUMNS = {
  name: { type: DataTypes.STRING(255), primaryKey: true },
  checksum: { type: DataTypes.STRING(64), allowNull: true },
  executed_at: { type: DataTypes.DATE, allowNull: false }
};
```

**Create-or-validate pattern** (`bootstrap.js` lines 76-105):
```js
export async function ensureMetadataSchema(metaSequelize) {
  const queryInterface = metaSequelize.getQueryInterface();
  let existingTables;
  try {
    existingTables = await queryInterface.showAllTables();
  } catch (error) {
    if (!isUnknownDatabaseError(error)) throw error;
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
    if (missingNames.length > 0) throw new MetadataSchemaError(`${META_DB_NAME}.${tableName} is missing expected column(s): ${missingNames.join(', ')}`);
  }
}
```

**Umzug storage pattern** (`storage.js` lines 10-30):
```js
export class MetaSequelizeStorage {
  constructor({ sequelize, tableName = SCHEMA_MIGRATIONS_TABLE }) {
    this.sequelize = sequelize;
    this.tableName = tableName;
  }

  async logMigration({ name }) {
    await this.sequelize.getQueryInterface().bulkInsert(this.tableName, [{
      name,
      executed_at: new Date()
    }]);
  }

  async executed() {
    const [rows] = await this.sequelize.query(`SELECT name FROM ${this.tableName} ORDER BY executed_at ASC`);
    return rows.map((row) => row.name);
  }
}
```

Planner note: the table already has `checksum`; Phase 2 can wire checksums through storage without changing the existing metadata DB name.

---

### `apps/dgfy-migration-runner/src/migrations/schema/*dgfy-core*.cjs` (migration, schema DDL)

**Analogs:** `backend/migrations/20260521000001-create-dgfy-accounts.cjs`, `backend/migrations/20260603000002-create-dgfy-account-admin-audit-logs.cjs`, backend landlord models

**Account + membership schema reference** (`20260521000001-create-dgfy-accounts.cjs` lines 3-64, 66-130):
```js
await queryInterface.createTable('dgfy_accounts', {
  id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
  first_name: { type: Sequelize.STRING(80), allowNull: false },
  last_name: { type: Sequelize.STRING(80), allowNull: false },
  email: { type: Sequelize.STRING(255), allowNull: false },
  password_hash: { type: Sequelize.STRING(255), allowNull: false },
  is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
});

await queryInterface.addIndex('dgfy_accounts', ['email'], {
  unique: true,
  name: 'unique_dgfy_accounts_email'
});

await queryInterface.createTable('dgfy_account_tenant_memberships', {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  dgfy_account_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'dgfy_accounts', key: 'id' } },
  tenant_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tenants', key: 'id' } },
  role: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'staff' },
  status: { type: Sequelize.ENUM('pending', 'accepted', 'declined', 'removed'), allowNull: false, defaultValue: 'pending' },
  source: { type: Sequelize.ENUM('founder', 'invite'), allowNull: false, defaultValue: 'invite' }
});
```

**Idempotent helper pattern** (`20260603000002-create-dgfy-account-admin-audit-logs.cjs` lines 1-23):
```js
const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).some((entry) => {
    const value = typeof entry === 'string'
      ? entry
      : (entry?.tableName || entry?.table_name || String(entry));
    return String(value).toLowerCase() === String(tableName).toLowerCase();
  });
};

const hasIndex = async (queryInterface, tableName, indexName) => {
  try {
    const indexes = await queryInterface.showIndex(tableName);
    return (indexes || []).some((index) => String(index.name).toLowerCase() === String(indexName).toLowerCase());
  } catch {
    return false;
  }
};
```

**Audit table pattern** (`20260603000002-create-dgfy-account-admin-audit-logs.cjs` lines 31-100):
```js
if (!await tableExists(queryInterface, 'dgfy_account_admin_audit_logs')) {
  await queryInterface.createTable('dgfy_account_admin_audit_logs', {
    audit_log_id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
    dgfy_account_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'dgfy_accounts', key: 'id' } },
    action: { type: Sequelize.ENUM('profile_update', 'suspend', 'reactivate'), allowNull: false },
    actor_username: { type: Sequelize.STRING(120), allowNull: false },
    reason: { type: Sequelize.STRING(500), allowNull: true },
    request_id: { type: Sequelize.STRING(100), allowNull: true },
    before_snapshot: { type: Sequelize.JSON, allowNull: true },
    after_snapshot: { type: Sequelize.JSON, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
  });
}

await addIndexIfMissing(queryInterface, 'dgfy_account_admin_audit_logs', ['dgfy_account_id', 'created_at'], {
  name: 'idx_dgfy_account_admin_audit_account_time'
});
```

Planner note: adapt table names to D-05 plain DGFY names: `accounts`, `businesses`, `business_memberships`, `business_database_registry`, `business_audit_logs`, and `storefront_discovery_index` inside `dgfy_core`. Do not copy legacy `dgfy_` prefixes into the new DGFY-only DB.

---

### `apps/dgfy-migration-runner/src/migrations/schema/*dgfy-business*.cjs` (migration, schema DDL)

**Analog:** `backend/migrations/20260330000003-create-tenant-locations.cjs`; model analog `backend/src/models/TenantLocation.js`

**Canonical location migration pattern** (`20260330000003-create-tenant-locations.cjs` lines 3-95):
```js
const existingTables = await queryInterface.showAllTables();
const tableSet = new Set(
  (existingTables || []).map((entry) => (
    typeof entry === 'string'
      ? entry.toLowerCase()
      : String(entry.tableName || entry).toLowerCase()
  ))
);

if (!tableSet.has('tenant_locations')) {
  await queryInterface.createTable('tenant_locations', {
    location_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: Sequelize.STRING(255), allowNull: false },
    address_line: { type: Sequelize.TEXT, allowNull: false },
    latitude: { type: Sequelize.DECIMAL(10, 8), allowNull: false },
    longitude: { type: Sequelize.DECIMAL(11, 8), allowNull: false },
    is_open: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true }
  });

  await queryInterface.addIndex('tenant_locations', ['name'], { name: 'idx_tenant_locations_name' });
  await queryInterface.addIndex('tenant_locations', ['is_active'], { name: 'idx_tenant_locations_active' });
  await queryInterface.addIndex('tenant_locations', ['latitude', 'longitude'], { name: 'idx_tenant_locations_lat_lng' });
}
```

**Model shape reference** (`TenantLocation.js` lines 4-87):
```js
const TenantLocation = sequelize.define('TenantLocation', {
  location_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  address_line: { type: DataTypes.TEXT, allowNull: false },
  latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: false },
  longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: false },
  is_primary_storefront: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  tableName: 'tenant_locations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['is_primary_storefront', 'is_active'] },
    { fields: ['latitude', 'longitude'] }
  ]
});
```

Planner note: inside `dgfy_business_*`, rename the table to plain `locations`. Add staff/user authorization profiles, DGFY account-to-staff assignments, role/permission basics, terminal identities, and tenant-local audit/ownership metadata. Defer products, POS, inventory, fiscal, and operational Storefront tables.

---

### `dgfy_core.storefront_discovery_index` (migration/model reference, projection)

**Analogs:** `backend/migrations/20260331000009-create-storefront-discovery-index.cjs`, `backend/src/models/Landlord/StorefrontDiscoveryIndex.js`

**Projection migration pattern** (`20260331000009-create-storefront-discovery-index.cjs` lines 5-126):
```js
await queryInterface.createTable('storefront_discovery_index', {
  storefront_discovery_index_id: {
    type: Sequelize.BIGINT.UNSIGNED,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true
  },
  tenant_id: { type: Sequelize.UUID, allowNull: false },
  tenant_name: { type: Sequelize.STRING(255), allowNull: false },
  slug: { type: Sequelize.STRING(120), allowNull: false },
  storefront_open: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
  is_visible: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
  location_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
  location_name: { type: Sequelize.STRING(255), allowNull: true },
  latitude: { type: Sequelize.DECIMAL(10, 7), allowNull: true },
  longitude: { type: Sequelize.DECIMAL(10, 7), allowNull: true },
  source_updated_at: { type: Sequelize.DATE, allowNull: true },
  last_synced_at: { type: Sequelize.DATE, allowNull: false }
});

await queryInterface.addIndex('storefront_discovery_index', ['tenant_id'], {
  name: 'idx_storefront_discovery_index_tenant_id',
  unique: true
});
await queryInterface.addIndex('storefront_discovery_index', ['slug'], {
  name: 'idx_storefront_discovery_index_slug',
  unique: true
});
```

**Projection model reference** (`StorefrontDiscoveryIndex.js` lines 216-242):
```js
active_location_snapshot: {
  type: DataTypes.JSON,
  allowNull: true
},
item_search_snapshot: {
  type: DataTypes.JSON,
  allowNull: true
},
search_snapshot_version: {
  type: DataTypes.INTEGER.UNSIGNED,
  allowNull: false,
  defaultValue: 1
},
source_updated_at: {
  type: DataTypes.DATE,
  allowNull: true
},
last_synced_at: {
  type: DataTypes.DATE,
  allowNull: false
}
```

Planner note: this is a projection only. Canonical locations remain in `dgfy_business_*`.

---

### `apps/dgfy-migration-runner/tests/schemaCommand.test.js` (test, request-response + batch)

**Analog:** `apps/dgfy-migration-runner/tests/schemaCommand.test.js`

**ESM mock + env fixture pattern** (lines 1-75):
```js
import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const ORIGINAL_ENV = { ...process.env };

function baseEnv(overrides = {}) {
  return {
    RUNTIME_MODE: 'development',
    SOURCE_DB_HOST: 'localhost',
    TARGET_DB_HOST: 'localhost',
    TARGET_DB_NAME: 'dgfy_landlord',
    MIGRATION_ACTOR: 'operator@dgfy.ph',
    ...overrides
  };
}

jest.unstable_mockModule('../src/config/db.js', () => ({
  createSourceConnection: jest.fn(),
  createTargetConnection: mockCreateTargetConnection,
  createMetaConnection: mockCreateMetaConnection
}));

const { runSchemaMigrate } = await import('../src/commands/schema.js');
```

**Command order regression pattern** (lines 120-181):
```js
const localCallOrder = [];
jest.unstable_mockModule('../src/safety/targetGuard.js', () => ({
  assertTargetDbNameAllowed: jest.fn(() => {
    localCallOrder.push('assertTargetDbNameAllowed');
    return true;
  })
}));
jest.unstable_mockModule('../src/safety/destructiveGate.js', () => ({
  assertDestructiveAllowed: jest.fn(() => {
    localCallOrder.push('assertDestructiveAllowed');
    return true;
  })
}));

await isolatedRunSchemaMigrate({});

expect(targetGuardIdx).toBeLessThan(targetConnIdx);
expect(destructiveGateIdx).toBeLessThan(targetConnIdx);
```

Planner note: add D-17 regression tests for historical destructive migration already executed + unrelated additive pending migration, and pending destructive migration without confirmation.

---

### `apps/dgfy-migration-runner/tests/reportCommands.test.js` and `metadataBootstrap.test.js` (test, report + metadata CRUD)

**Analogs:** `apps/dgfy-migration-runner/tests/reportCommands.test.js`, `metadataBootstrap.test.js`

**Verify report test pattern** (`reportCommands.test.js` lines 103-124):
```js
test("report has summary.metadata_schema_ok and summary.target_db_reachable boolean fields", async () => {
  mockCreateTargetConnection.mockReset().mockReturnValue({
    authenticate: jest.fn().mockResolvedValue(undefined)
  });

  const report = await runVerify({});

  expect(typeof report.summary.metadata_schema_ok).toBe('boolean');
  expect(typeof report.summary.target_db_reachable).toBe('boolean');
  expect(report.summary.metadata_schema_ok).toBe(true);
  expect(report.summary.target_db_reachable).toBe(true);
});

test('a failed target DB authenticate() flips target_db_reachable to false instead of throwing', async () => {
  mockCreateTargetConnection.mockReset().mockReturnValue({
    authenticate: jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
  });
  const report = await runVerify({});
  expect(report.summary.target_db_reachable).toBe(false);
});
```

**Metadata bootstrap test pattern** (`metadataBootstrap.test.js` lines 44-107):
```js
test('first run (showAllTables returns []) calls createTable for both command_executions and schema_migrations', async () => {
  const createTable = jest.fn().mockResolvedValue();
  const metaSequelize = buildMetaSequelize({
    showAllTables: jest.fn().mockResolvedValue([]),
    createTable,
    describeTable: jest.fn()
  });

  await ensureMetadataSchema(metaSequelize);

  expect(createTable).toHaveBeenCalledTimes(2);
  expect(createTable).toHaveBeenCalledWith(COMMAND_EXECUTIONS_TABLE, expect.any(Object));
  expect(createTable).toHaveBeenCalledWith(SCHEMA_MIGRATIONS_TABLE, expect.any(Object));
});

test('rejects with MetadataSchemaError (never a silent addColumn) when command_executions is missing the actor column', async () => {
  await expect(ensureMetadataSchema(metaSequelize)).rejects.toThrow(MetadataSchemaError);
  expect(addColumn).not.toHaveBeenCalled();
  expect(createTable).not.toHaveBeenCalled();
});
```

## Shared Patterns

### Migration File Metadata
**Source:** `apps/dgfy-migration-runner/src/migrations/schema/00000000000000-runner-contract-placeholder.cjs` lines 1-9
**Apply to:** All new schema migrations
```js
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  meta: {
    destructive: false,
    rollbackDescription: 'Drops runner_contract_placeholder (Phase 1 contract-proof table only — carries no production data)',
    estimatedRisk: 'low'
  },

  async up(queryInterface, Sequelize) {
```

### Target Guard Before Mutation
**Source:** `apps/dgfy-migration-runner/src/commands/schema.js` lines 60-71
**Apply to:** Schema and verify command changes
```js
const { valid, errors, config } = validateEnv();
if (!valid) {
  throw new EnvValidationError(errors.join('; '));
}

assertTargetDbNameAllowed(config.targetDb.name, config.runtimeMode);
```

### Command Execution Audit
**Source:** `apps/dgfy-migration-runner/src/metadata/bootstrap.js` lines 118-167
**Apply to:** All commands that start metadata audit rows
```js
export async function recordCommandStart(metaSequelize, { command, mode, argsJson, actor, runtimeMode }) {
  const now = new Date();
  return metaSequelize.transaction(async (transaction) => {
    await metaSequelize.getQueryInterface().bulkInsert(COMMAND_EXECUTIONS_TABLE, [{
      command,
      mode,
      args_json: argsJson,
      actor,
      runtime_mode: runtimeMode,
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

### Current Landlord Business Registry Analog
**Source:** `backend/src/models/Landlord/Tenant.js` lines 27-43, 121-137
**Apply to:** `dgfy_core.businesses` and `business_database_registry`
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
  allowNull: false,
  defaultValue: 'claimed'
}
```

Adapt this to DGFY names: stable opaque suffix + actual `database_name` belong in `business_database_registry`, not display-name-derived database names.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| None | n/a | n/a | Existing runner, migration, verification, landlord account, membership, tenant registry, location, and discovery projection analogs cover the Phase 2 planner scope. |

## Metadata

**Analog search scope:** `apps/dgfy-migration-runner/**`, `backend/migrations/**`, `backend/src/models/**`, architecture ADRs listed in Phase 2 context.
**Files scanned:** 35+
**Pattern extraction date:** 2026-07-10
**Authoritative docs used:** `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, ADR 0001, ADR 0003, ADR 0010, ADR 0029, ADR 0032.
**Boundary check:** Phase 2 is primarily migration-runner/schema work under `apps/dgfy-migration-runner`; backend model files are analogs only unless later plans explicitly add API/model changes.

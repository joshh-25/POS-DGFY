import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { dgfyCoreContract } from '../src/schemaContracts/dgfyCoreContract.js';
import { buildMigrationsForKind } from '../src/commands/schema.js';

const ORIGINAL_ENV = { ...process.env };

function baseEnv(overrides = {}) {
  return {
    RUNTIME_MODE: 'development',
    SOURCE_DB_HOST: 'localhost',
    SOURCE_DB_PORT: '3306',
    SOURCE_DB_USER: 'source_user',
    SOURCE_DB_PASSWORD: 'source_pass',
    SOURCE_DB_NAME: 'sku_inventory_manager',
    TARGET_DB_HOST: 'localhost',
    TARGET_DB_PORT: '3306',
    TARGET_DB_USER: 'target_user',
    TARGET_DB_PASSWORD: 'target_pass',
    TARGET_DB_NAME: 'dgfy_core',
    MIGRATION_ACTOR: 'operator@dgfy.ph',
    ...overrides
  };
}

function applyEnv(overrides = {}) {
  const env = baseEnv(overrides);
  Object.keys(env).forEach((key) => {
    process.env[key] = env[key];
  });
}

function restoreEnv() {
  Object.keys(process.env).forEach((key) => {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  });
  Object.assign(process.env, ORIGINAL_ENV);
}

/**
 * Minimal fake Sequelize-connection-shaped object that fully satisfies every
 * table/column/index/unique-constraint/foreign-key in dgfyCoreContract, so
 * core_schema always reports ok:true and tests can focus purely on
 * migration_metadata/idempotency behavior.
 */
function buildFakeCoreConnection() {
  const tableNames = Object.keys(dgfyCoreContract.tables);
  const showAllTables = jest.fn().mockResolvedValue(tableNames);
  const describeTable = jest.fn((tableName) => {
    const columns = {};
    dgfyCoreContract.tables[tableName].columns.forEach((col) => {
      columns[col] = { type: 'TEXT' };
    });
    return Promise.resolve(columns);
  });
  const showIndex = jest.fn((tableName) => {
    const tableContract = dgfyCoreContract.tables[tableName];
    const uniqueSet = new Set(tableContract.uniqueConstraints || []);
    return Promise.resolve(tableContract.indexes.map((name) => ({ name, unique: uniqueSet.has(name) })));
  });
  const query = jest.fn((sql, options) => {
    if (typeof sql === 'string' && sql.includes('business_database_registry')) {
      return Promise.resolve([[]]);
    }
    const queriedTableName = options?.replacements?.[1];
    const tableContract = dgfyCoreContract.tables[queriedTableName];
    const rows = !tableContract
      ? []
      : (tableContract.foreignKeys || []).map((fk) => (
        { col: fk.column, refTable: fk.referencesTable, refColumn: fk.referencesColumn }
      ));
    return Promise.resolve([rows]);
  });

  return {
    getQueryInterface: () => ({ showAllTables, describeTable, showIndex }),
    query,
    authenticate: jest.fn().mockResolvedValue(undefined)
  };
}

const mockCreateTargetConnection = jest.fn();
const mockCreateMetaConnection = jest.fn();
const mockCreateSourceConnection = jest.fn();
const mockCreateBusinessTargetConnection = jest.fn();
const mockEnsureMetadataSchema = jest.fn().mockResolvedValue(undefined);
const mockRecordCommandStart = jest.fn().mockResolvedValue(1);
const mockRecordCommandComplete = jest.fn().mockResolvedValue(undefined);

const executedByTarget = {};
let metadataExecutedImpl = ({ targetDatabase }) => Promise.resolve(executedByTarget[targetDatabase] || []);
const MockMetaSequelizeStorage = jest.fn().mockImplementation(({ targetDatabase }) => ({
  logMigration: jest.fn().mockResolvedValue(undefined),
  unlogMigration: jest.fn().mockResolvedValue(undefined),
  executed: jest.fn(() => metadataExecutedImpl({ targetDatabase }))
}));

jest.unstable_mockModule('../src/config/db.js', () => ({
  createSourceConnection: mockCreateSourceConnection,
  createTargetConnection: mockCreateTargetConnection,
  createMetaConnection: mockCreateMetaConnection,
  createBusinessTargetConnection: mockCreateBusinessTargetConnection
}));

jest.unstable_mockModule('../src/metadata/bootstrap.js', () => ({
  META_DB_NAME: 'dgfy_migration_meta',
  COMMAND_EXECUTIONS_TABLE: 'command_executions',
  SCHEMA_MIGRATIONS_TABLE: 'schema_migrations',
  ensureMetadataSchema: mockEnsureMetadataSchema,
  recordCommandStart: mockRecordCommandStart,
  recordCommandComplete: mockRecordCommandComplete
}));

jest.unstable_mockModule('../src/metadata/storage.js', () => ({
  MetaSequelizeStorage: MockMetaSequelizeStorage
}));

const { runVerify } = await import('../src/commands/verify.js');

const CORE_MIGRATION_NAMES = buildMigrationsForKind('core', {}).map((m) => m.name);

describe('runVerify — idempotency false-clean sentinel fix (03-05 Task 1)', () => {
  let reportDir;

  beforeEach(async () => {
    reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-verify-cmd-'));
    applyEnv({ REPORT_DIR: reportDir });

    Object.keys(executedByTarget).forEach((key) => delete executedByTarget[key]);
    metadataExecutedImpl = ({ targetDatabase }) => Promise.resolve(executedByTarget[targetDatabase] || []);

    mockEnsureMetadataSchema.mockReset().mockResolvedValue(undefined);
    mockRecordCommandStart.mockClear().mockResolvedValue(1);
    mockRecordCommandComplete.mockClear();
    mockCreateMetaConnection.mockReset().mockReturnValue({ config: {}, query: jest.fn() });
    mockCreateSourceConnection.mockReset().mockReturnValue({ query: jest.fn().mockResolvedValue([[], []]) });
    mockCreateTargetConnection.mockReset().mockReturnValue(buildFakeCoreConnection());
    MockMetaSequelizeStorage.mockClear();
  });

  afterEach(async () => {
    await fs.rm(reportDir, { recursive: true, force: true });
    restoreEnv();
  });

  test('a migration_metadata check error produces idempotency.ok === false (never a false-clean result)', async () => {
    metadataExecutedImpl = () => Promise.reject(new Error('storage read failed for dgfy_core'));

    const report = await runVerify({});

    const metadataFinding = report.migration_metadata.find((m) => m.target_database === 'dgfy_core');
    expect(metadataFinding.ok).toBe(false);
    expect(metadataFinding.missing_migrations).toBeNull();

    const idempotencyFinding = report.idempotency.find((i) => i.target_database === 'dgfy_core');
    expect(idempotencyFinding.ok).toBe(false);
    expect(idempotencyFinding.pending_migrations).toBeNull();
    expect(idempotencyFinding.error).toContain('storage read failed for dgfy_core');

    expect(report.summary.migration_metadata_ok).toBe(false);
    expect(report.summary.idempotency_ok).toBe(false);
  });

  test('pending (unrecorded) migrations still produce idempotency.ok === false with the real migration list', async () => {
    executedByTarget['dgfy_core'] = [];

    const report = await runVerify({});

    const idempotencyFinding = report.idempotency.find((i) => i.target_database === 'dgfy_core');
    expect(idempotencyFinding.ok).toBe(false);
    expect(idempotencyFinding.pending_migrations).toEqual(CORE_MIGRATION_NAMES);
    expect(report.summary.idempotency_ok).toBe(false);
  });

  test('no missing migrations still produces idempotency.ok === true (no regression on the clean case)', async () => {
    executedByTarget['dgfy_core'] = CORE_MIGRATION_NAMES;

    const report = await runVerify({});

    const idempotencyFinding = report.idempotency.find((i) => i.target_database === 'dgfy_core');
    expect(idempotencyFinding.ok).toBe(true);
    expect(idempotencyFinding.pending_migrations).toEqual([]);
    expect(report.summary.idempotency_ok).toBe(true);
  });

  test('verify report is still written and command completion records success when the failure is a reported finding, not a report-write failure', async () => {
    metadataExecutedImpl = () => Promise.reject(new Error('storage read failed for dgfy_core'));

    const report = await runVerify({});

    expect(report.summary.idempotency_ok).toBe(false);
    const writtenFiles = await fs.readdir(reportDir);
    expect(writtenFiles.some((name) => name.includes('verify') && name.endsWith('.json'))).toBe(true);

    expect(mockRecordCommandComplete).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ exitStatus: 'success' })
    );
  });
});

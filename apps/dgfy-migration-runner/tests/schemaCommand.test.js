import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const ORIGINAL_ENV = { ...process.env };

function baseEnv(overrides = {}) {
  return {
    RUNTIME_MODE: 'development',
    SOURCE_DB_HOST: 'localhost',
    SOURCE_DB_PORT: '3306',
    SOURCE_DB_USER: 'source_user',
    SOURCE_DB_PASSWORD: 'source_pass',
    SOURCE_DB_NAME: 'legacy_ims',
    TARGET_DB_HOST: 'localhost',
    TARGET_DB_PORT: '3306',
    TARGET_DB_USER: 'target_user',
    TARGET_DB_PASSWORD: 'target_pass',
    TARGET_DB_NAME: 'dgfy_landlord',
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

const mockCreateTargetConnection = jest.fn();
const mockCreateMetaConnection = jest.fn();
const mockEnsureMetadataSchema = jest.fn().mockResolvedValue(undefined);
const mockRecordCommandStart = jest.fn().mockResolvedValue(1);
const mockRecordCommandComplete = jest.fn().mockResolvedValue(undefined);
const mockStorageExecuted = jest.fn().mockResolvedValue([]);
const mockStorageLogMigration = jest.fn().mockResolvedValue(undefined);
const mockStorageUnlogMigration = jest.fn().mockResolvedValue(undefined);
const MockMetaSequelizeStorage = jest.fn().mockImplementation(() => ({
  logMigration: mockStorageLogMigration,
  unlogMigration: mockStorageUnlogMigration,
  executed: mockStorageExecuted
}));

jest.unstable_mockModule('../src/config/db.js', () => ({
  createSourceConnection: jest.fn(),
  createTargetConnection: mockCreateTargetConnection,
  createMetaConnection: mockCreateMetaConnection
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

const { runSchemaMigrate } = await import('../src/commands/schema.js');

describe('runSchemaMigrate', () => {
  let reportDir;
  let fakeQueryInterface;

  beforeEach(async () => {
    reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-schema-'));
    applyEnv({ REPORT_DIR: reportDir });

    fakeQueryInterface = {
      showAllTables: jest.fn().mockResolvedValue([]),
      createTable: jest.fn().mockResolvedValue(undefined)
    };

    mockCreateTargetConnection.mockReset().mockReturnValue({
      getQueryInterface: () => fakeQueryInterface
    });
    mockCreateMetaConnection.mockReset().mockReturnValue({ config: {}, query: jest.fn() });
    mockEnsureMetadataSchema.mockClear();
    mockRecordCommandStart.mockClear().mockResolvedValue(1);
    mockRecordCommandComplete.mockClear();
    mockStorageExecuted.mockClear().mockResolvedValue([]);
    MockMetaSequelizeStorage.mockClear();
  });

  afterEach(async () => {
    await fs.rm(reportDir, { recursive: true, force: true });
    restoreEnv();
  });

  test('runs successfully without confirmDestructive because the placeholder migration is non-destructive', async () => {
    const report = await runSchemaMigrate({});

    expect(report.command).toBe('schema:migrate');
    expect(fakeQueryInterface.createTable).toHaveBeenCalledWith('runner_contract_placeholder', expect.any(Object));
  });

  test("report.command is 'schema:migrate' and migrations_executed includes the placeholder migration", async () => {
    const report = await runSchemaMigrate({});

    expect(report.command).toBe('schema:migrate');
    expect(report.migrations_executed.some((name) => name.includes('runner-contract-placeholder'))).toBe(true);
  });

  test('assertTargetDbNameAllowed and assertDestructiveAllowed are both called before createTargetConnection/createMetaConnection', async () => {
    // Isolated module registry: mock the safety gates too, so real call
    // order across all four functions can be observed directly.
    jest.resetModules();
    const localCallOrder = [];

    jest.unstable_mockModule('../src/config/db.js', () => ({
      createSourceConnection: jest.fn(),
      createTargetConnection: jest.fn(() => {
        localCallOrder.push('createTargetConnection');
        return { getQueryInterface: () => fakeQueryInterface };
      }),
      createMetaConnection: jest.fn(() => {
        localCallOrder.push('createMetaConnection');
        return { config: {}, query: jest.fn() };
      })
    }));
    jest.unstable_mockModule('../src/metadata/bootstrap.js', () => ({
      META_DB_NAME: 'dgfy_migration_meta',
      COMMAND_EXECUTIONS_TABLE: 'command_executions',
      SCHEMA_MIGRATIONS_TABLE: 'schema_migrations',
      ensureMetadataSchema: jest.fn().mockResolvedValue(undefined),
      recordCommandStart: jest.fn().mockResolvedValue(1),
      recordCommandComplete: jest.fn().mockResolvedValue(undefined)
    }));
    jest.unstable_mockModule('../src/metadata/storage.js', () => ({
      MetaSequelizeStorage: jest.fn().mockImplementation(() => ({
        logMigration: jest.fn().mockResolvedValue(undefined),
        unlogMigration: jest.fn().mockResolvedValue(undefined),
        executed: jest.fn().mockResolvedValue([])
      }))
    }));
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

    const { runSchemaMigrate: isolatedRunSchemaMigrate } = await import('../src/commands/schema.js');

    await isolatedRunSchemaMigrate({});

    const targetGuardIdx = localCallOrder.indexOf('assertTargetDbNameAllowed');
    const destructiveGateIdx = localCallOrder.indexOf('assertDestructiveAllowed');
    const targetConnIdx = localCallOrder.indexOf('createTargetConnection');
    const metaConnIdx = localCallOrder.indexOf('createMetaConnection');

    expect(targetGuardIdx).toBeGreaterThanOrEqual(0);
    expect(destructiveGateIdx).toBeGreaterThanOrEqual(0);
    expect(targetConnIdx).toBeGreaterThanOrEqual(0);
    expect(metaConnIdx).toBeGreaterThanOrEqual(0);
    expect(targetGuardIdx).toBeLessThan(targetConnIdx);
    expect(destructiveGateIdx).toBeLessThan(targetConnIdx);
    expect(targetGuardIdx).toBeLessThan(metaConnIdx);
    expect(destructiveGateIdx).toBeLessThan(metaConnIdx);

    jest.resetModules();
  });
});

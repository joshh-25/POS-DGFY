import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
// Real (unmocked) safety-gate implementations, imported statically up front
// so later tests can explicitly re-register the REAL behavior even after an
// earlier isolated test's jest.unstable_mockModule(...) stub for the same
// specifier — that stub registration outlives jest.resetModules() and would
// otherwise silently leak a permissive assertDestructiveAllowed() into any
// later test that doesn't re-mock this module itself.
import { assertDestructiveAllowed as realAssertDestructiveAllowed } from '../src/safety/destructiveGate.js';
import { assertTargetDbNameAllowed as realAssertTargetDbNameAllowed } from '../src/safety/targetGuard.js';

const PLACEHOLDER_MIGRATION_NAME = '00000000000000-runner-contract-placeholder.cjs';

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

  test('assertTargetDbNameAllowed is called before createTargetConnection/createMetaConnection, and assertDestructiveAllowed is called after meta connection + pending resolution but before umzug.up()', async () => {
    // Isolated module registry: mock the safety gates too, so real call
    // order across all functions can be observed directly.
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
    jest.unstable_mockModule('umzug', () => ({
      Umzug: jest.fn().mockImplementation(() => ({
        pending: jest.fn(async () => {
          localCallOrder.push('umzug.pending');
          return [{ name: PLACEHOLDER_MIGRATION_NAME, meta: undefined }];
        }),
        up: jest.fn(async () => {
          localCallOrder.push('umzug.up');
          return [{ name: PLACEHOLDER_MIGRATION_NAME }];
        })
      }))
    }));

    const { runSchemaMigrate: isolatedRunSchemaMigrate } = await import('../src/commands/schema.js');

    await isolatedRunSchemaMigrate({});

    const targetGuardIdx = localCallOrder.indexOf('assertTargetDbNameAllowed');
    const destructiveGateIdx = localCallOrder.indexOf('assertDestructiveAllowed');
    const targetConnIdx = localCallOrder.indexOf('createTargetConnection');
    const metaConnIdx = localCallOrder.indexOf('createMetaConnection');
    const pendingIdx = localCallOrder.indexOf('umzug.pending');
    const upIdx = localCallOrder.indexOf('umzug.up');

    expect(targetGuardIdx).toBeGreaterThanOrEqual(0);
    expect(destructiveGateIdx).toBeGreaterThanOrEqual(0);
    expect(targetConnIdx).toBeGreaterThanOrEqual(0);
    expect(metaConnIdx).toBeGreaterThanOrEqual(0);
    expect(pendingIdx).toBeGreaterThanOrEqual(0);
    expect(upIdx).toBeGreaterThanOrEqual(0);

    // Target DB name validation happens before any connection is opened.
    expect(targetGuardIdx).toBeLessThan(targetConnIdx);
    expect(targetGuardIdx).toBeLessThan(metaConnIdx);

    // D-17: destructive classification is computed AFTER metadata bootstrap
    // and Umzug pending resolution (it needs to know which migrations are
    // actually pending), but it must still run before any target mutation.
    expect(metaConnIdx).toBeLessThan(pendingIdx);
    expect(pendingIdx).toBeLessThan(destructiveGateIdx);
    expect(destructiveGateIdx).toBeLessThan(upIdx);

    jest.resetModules();
  });
});

describe('runSchemaMigrate — D-17 pending-only destructive classification', () => {
  function mockCommonDeps() {
    jest.unstable_mockModule('../src/config/db.js', () => ({
      createSourceConnection: jest.fn(),
      createTargetConnection: jest.fn(() => ({ getQueryInterface: () => ({}) })),
      createMetaConnection: jest.fn(() => ({ config: {}, query: jest.fn() }))
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
    // Re-register the REAL safety gates explicitly (see the import comment
    // at the top of this file) so an earlier isolated test's stub mock for
    // these same specifiers can never leak into these tests.
    jest.unstable_mockModule('../src/safety/destructiveGate.js', () => ({
      assertDestructiveAllowed: realAssertDestructiveAllowed
    }));
    jest.unstable_mockModule('../src/safety/targetGuard.js', () => ({
      assertTargetDbNameAllowed: realAssertTargetDbNameAllowed
    }));
  }

  let reportDir;

  beforeEach(async () => {
    jest.resetModules();
    reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-schema-d17-'));
    applyEnv({ REPORT_DIR: reportDir });
  });

  afterEach(async () => {
    await fs.rm(reportDir, { recursive: true, force: true });
    restoreEnv();
    jest.resetModules();
  });

  test('a historical executed destructive migration does not force --confirm-destructive when the only pending migration is additive', async () => {
    mockCommonDeps();
    const mockUp = jest.fn().mockResolvedValue([{ name: 'additive-new-table.cjs' }]);
    jest.unstable_mockModule('umzug', () => ({
      Umzug: jest.fn().mockImplementation(() => ({
        // Only the additive migration is pending — the historical destructive
        // migration is already executed, so it must not appear here.
        pending: jest.fn().mockResolvedValue([{ name: 'additive-new-table.cjs', meta: { destructive: false } }]),
        up: mockUp
      }))
    }));

    const { runSchemaMigrate } = await import('../src/commands/schema.js');

    const report = await runSchemaMigrate({ confirmDestructive: false });

    expect(mockUp).toHaveBeenCalled();
    expect(report.migrations_executed).toEqual(['additive-new-table.cjs']);
  });

  test('a pending destructive migration without --confirm-destructive throws before umzug.up() runs', async () => {
    mockCommonDeps();
    const mockUp = jest.fn().mockResolvedValue([{ name: 'pending-destructive.cjs' }]);
    jest.unstable_mockModule('umzug', () => ({
      Umzug: jest.fn().mockImplementation(() => ({
        pending: jest.fn().mockResolvedValue([{ name: 'pending-destructive.cjs', meta: { destructive: true } }]),
        up: mockUp
      }))
    }));

    const { runSchemaMigrate } = await import('../src/commands/schema.js');

    await expect(runSchemaMigrate({ confirmDestructive: false })).rejects.toThrow(
      /confirm-destructive/i
    );
    expect(mockUp).not.toHaveBeenCalled();
  });

  test('a pending destructive migration with --confirm-destructive executes successfully', async () => {
    mockCommonDeps();
    const mockUp = jest.fn().mockResolvedValue([{ name: 'pending-destructive.cjs' }]);
    jest.unstable_mockModule('umzug', () => ({
      Umzug: jest.fn().mockImplementation(() => ({
        pending: jest.fn().mockResolvedValue([{ name: 'pending-destructive.cjs', meta: { destructive: true } }]),
        up: mockUp
      }))
    }));

    const { runSchemaMigrate } = await import('../src/commands/schema.js');

    const report = await runSchemaMigrate({ confirmDestructive: true });

    expect(mockUp).toHaveBeenCalled();
    expect(report.migrations_executed).toEqual(['pending-destructive.cjs']);
  });
});

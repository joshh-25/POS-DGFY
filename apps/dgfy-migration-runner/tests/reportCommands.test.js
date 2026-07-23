import { jest } from '@jest/globals';
import { createRequire } from 'module';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const requireCjs = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLACEHOLDER_MIGRATION_NAME = '00000000000000-runner-contract-placeholder.cjs';
const PLACEHOLDER_MIGRATION_PATH = join(__dirname, '..', 'src', 'migrations', 'schema', PLACEHOLDER_MIGRATION_NAME);

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

jest.unstable_mockModule('../src/config/db.js', () => ({
  createSourceConnection: jest.fn(() => ({ query: jest.fn().mockResolvedValue([[], []]) })),
  createTargetConnection: mockCreateTargetConnection,
  createMetaConnection: mockCreateMetaConnection,
  createBusinessTargetConnection: jest.fn(),
  createLegacyTenantSourceConnection: jest.fn()
}));

jest.unstable_mockModule('../src/metadata/bootstrap.js', () => ({
  META_DB_NAME: 'dgfy_migration_meta',
  COMMAND_EXECUTIONS_TABLE: 'command_executions',
  SCHEMA_MIGRATIONS_TABLE: 'schema_migrations',
  LEGACY_ID_MAP_TABLE: 'legacy_id_map',
  DATA_CHECKPOINTS_TABLE: 'data_checkpoints',
  DATA_QUALITY_FINDINGS_TABLE: 'data_quality_findings',
  ensureMetadataSchema: mockEnsureMetadataSchema,
  recordCommandStart: mockRecordCommandStart,
  recordCommandComplete: mockRecordCommandComplete
}));

jest.unstable_mockModule('../src/metadata/storage.js', () => ({
  MetaSequelizeStorage: jest.fn().mockImplementation(() => ({
    logMigration: jest.fn().mockResolvedValue(undefined),
    unlogMigration: jest.fn().mockResolvedValue(undefined),
    executed: mockStorageExecuted
  }))
}));

const { runVerify } = await import('../src/commands/verify.js');
const { runStatus } = await import('../src/commands/status.js');
const { runRollbackPlan } = await import('../src/commands/rollbackPlan.js');

describe('runVerify', () => {
  let reportDir;

  beforeEach(async () => {
    reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-verify-'));
    applyEnv({ REPORT_DIR: reportDir });

    mockEnsureMetadataSchema.mockReset().mockResolvedValue(undefined);
    mockRecordCommandStart.mockClear().mockResolvedValue(1);
    mockRecordCommandComplete.mockClear();
    mockCreateMetaConnection.mockReset().mockReturnValue({ config: {}, query: jest.fn() });
  });

  afterEach(async () => {
    await fs.rm(reportDir, { recursive: true, force: true });
    restoreEnv();
  });

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

  test('D-19: the real .summary.txt file written for a successful run contains status=success, never status=unknown', async () => {
    mockCreateTargetConnection.mockReset().mockReturnValue({
      authenticate: jest.fn().mockResolvedValue(undefined)
    });

    const report = await runVerify({});

    const files = await fs.readdir(reportDir);
    const summaryFile = files.find((file) => file.endsWith('.summary.txt'));
    expect(summaryFile).toBeDefined();

    const contents = await fs.readFile(path.join(reportDir, summaryFile), 'utf8');
    expect(contents).toContain('status=success');
    expect(contents).not.toContain('status=unknown');
    expect(report.summary.metadata_schema_ok).toBe(true);
  });

  test('a failed health check still completes the command_executions row as exit_status=success (D-18: only command/reporting failures should mark failed)', async () => {
    mockCreateTargetConnection.mockReset().mockReturnValue({
      authenticate: jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    });

    await runVerify({});

    expect(mockRecordCommandComplete).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ exitStatus: 'success' })
    );
  });

  test('a report-write failure marks the command execution failed while still returning the report (never throwing)', async () => {
    mockCreateTargetConnection.mockReset().mockReturnValue({
      authenticate: jest.fn().mockResolvedValue(undefined)
    });

    // Point REPORT_DIR at an existing FILE (not a directory) so
    // writeJsonReport's fs.mkdir(dirname(filePath), { recursive: true })
    // throws EEXIST — simulating a report-write failure without touching
    // the filesystem module itself.
    const notADirectory = path.join(os.tmpdir(), `dgfy-migration-runner-verify-not-a-dir-${Date.now()}`);
    await fs.writeFile(notADirectory, 'not a directory');
    applyEnv({ REPORT_DIR: notADirectory });

    let report;
    await expect((async () => {
      report = await runVerify({});
    })()).resolves.toBeUndefined();

    expect(report.summary.metadata_schema_ok).toBe(true);
    expect(mockRecordCommandComplete).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ exitStatus: 'failed', errorMessage: expect.any(String) })
    );

    await fs.rm(notADirectory, { force: true });
  });
});

describe('runStatus', () => {
  let reportDir;

  beforeEach(async () => {
    reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-status-'));
    applyEnv({ REPORT_DIR: reportDir });

    mockEnsureMetadataSchema.mockReset().mockResolvedValue(undefined);
    mockRecordCommandStart.mockClear().mockResolvedValue(1);
    mockRecordCommandComplete.mockClear();
    mockStorageExecuted.mockClear().mockResolvedValue([]);
    mockCreateMetaConnection.mockReset().mockReturnValue({
      config: {},
      query: jest.fn().mockResolvedValue([[
        { command: 'schema:migrate', mode: 'apply', actor: 'operator@dgfy.ph', runtime_mode: 'development', started_at: new Date(), completed_at: new Date(), exit_status: 'success' }
      ], []])
    });
  });

  afterEach(async () => {
    await fs.rm(reportDir, { recursive: true, force: true });
    restoreEnv();
  });

  test('returns recent_commands and schema_migrations_executed counts', async () => {
    const report = await runStatus({});

    expect(report.command).toBe('status');
    expect(report.summary.recent_commands).toBe(1);
    expect(report.summary.schema_migrations_executed).toBe(0);
  });

  test('D-18: a failure after recordCommandStart marks command_executions failed and rethrows instead of leaving the row stuck at running', async () => {
    const queryError = new Error('ER_LOCK_WAIT_TIMEOUT');
    mockCreateMetaConnection.mockReset().mockReturnValue({
      config: {},
      query: jest.fn().mockRejectedValue(queryError)
    });

    await expect(runStatus({})).rejects.toThrow('ER_LOCK_WAIT_TIMEOUT');

    expect(mockRecordCommandComplete).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ exitStatus: 'failed', errorMessage: 'ER_LOCK_WAIT_TIMEOUT' })
    );
  });
});

describe('runRollbackPlan', () => {
  let reportDir;
  let migrationModule;
  let downSpy;

  beforeEach(async () => {
    reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-rollback-'));
    applyEnv({ REPORT_DIR: reportDir });

    mockEnsureMetadataSchema.mockReset().mockResolvedValue(undefined);
    mockRecordCommandStart.mockClear().mockResolvedValue(1);
    mockRecordCommandComplete.mockClear();
    mockCreateMetaConnection.mockReset().mockReturnValue({ config: {}, query: jest.fn() });
    mockStorageExecuted.mockClear().mockResolvedValue([PLACEHOLDER_MIGRATION_NAME]);

    // Node's CJS require cache is shared across require() calls resolving to
    // the same absolute path — rollbackPlan.js's internal requireCjs(path)
    // returns this exact same module object, so spying on `down` here proves
    // rollbackPlan.js never invokes it.
    migrationModule = requireCjs(PLACEHOLDER_MIGRATION_PATH);
    downSpy = jest.spyOn(migrationModule, 'down');
  });

  afterEach(async () => {
    await fs.rm(reportDir, { recursive: true, force: true });
    restoreEnv();
    downSpy.mockRestore();
  });

  test('never calls a migration down() while still returning a non-empty results array', async () => {
    const report = await runRollbackPlan({});

    expect(downSpy).not.toHaveBeenCalled();
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.results[0].migration).toBe(PLACEHOLDER_MIGRATION_NAME);
    expect(report.results[0].estimated_risk).toBe('low');
  });

  test('D-18: a failure after recordCommandStart marks command_executions failed and rethrows instead of leaving the row stuck at running', async () => {
    const storageError = new Error('ER_ACCESS_DENIED');
    mockStorageExecuted.mockClear().mockRejectedValue(storageError);

    await expect(runRollbackPlan({})).rejects.toThrow('ER_ACCESS_DENIED');

    expect(mockRecordCommandComplete).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ exitStatus: 'failed', errorMessage: 'ER_ACCESS_DENIED' })
    );
  });
});

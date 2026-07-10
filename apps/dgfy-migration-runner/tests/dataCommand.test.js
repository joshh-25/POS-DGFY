import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { DestructiveOperationError } from '../src/utils/errors.js';

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

const { runDataDryRun, runDataApply } = await import('../src/commands/data.js');

describe('data commands', () => {
  let reportDir;

  beforeEach(async () => {
    reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-data-'));
    applyEnv({ REPORT_DIR: reportDir });

    mockCreateTargetConnection.mockReset().mockReturnValue({ getQueryInterface: () => ({}) });
    mockCreateMetaConnection.mockReset().mockReturnValue({ config: {}, query: jest.fn() });
    mockEnsureMetadataSchema.mockClear();
    mockRecordCommandStart.mockClear().mockResolvedValue(1);
    mockRecordCommandComplete.mockClear();
  });

  afterEach(async () => {
    await fs.rm(reportDir, { recursive: true, force: true });
    restoreEnv();
  });

  test('runDataApply({confirmDestructive:false}) rejects with DestructiveOperationError and never calls createTargetConnection', async () => {
    await expect(runDataApply({ confirmDestructive: false })).rejects.toThrow(DestructiveOperationError);

    expect(mockCreateTargetConnection).not.toHaveBeenCalled();
    expect(mockCreateMetaConnection).not.toHaveBeenCalled();
  });

  test('runDataApply({confirmDestructive:true}) succeeds with summary.rows_written === 0', async () => {
    const report = await runDataApply({ confirmDestructive: true });

    expect(report.command).toBe('data:apply');
    expect(report.summary.rows_written).toBe(0);
  });

  test('runDataDryRun({}) succeeds without requiring confirmDestructive', async () => {
    const report = await runDataDryRun({});

    expect(report.command).toBe('data:dry-run');
    expect(report.mode).toBe('dry-run');
  });
});

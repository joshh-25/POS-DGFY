import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { DestructiveOperationError, EnvValidationError } from '../src/utils/errors.js';

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
    // Plan 03-03: runDataDryRun() now passes { requireMigrationManifest: true }
    // to validateEnv(), so every test in this file needs a non-blank path by
    // default. The manifest is never actually read from disk in these
    // command-level tests — loadMigrationTargetManifest() is mocked below.
    DGFY_MIGRATION_TARGET_MANIFEST: '/tmp/dgfy-migration-runner-tests/target-manifest.json',
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

function validTarget(overrides = {}) {
  return {
    legacy_tenant_id: 'tenant-1',
    legacy_tenant_db_name: 'sku_tenant_1',
    target_business_db_name: 'dgfy_business_alpha',
    expected_business_id: 'biz-uuid-1',
    expected_owner_account_id: 'acct-uuid-1',
    ...overrides
  };
}

const mockCreateTargetConnection = jest.fn();
const mockCreateMetaConnection = jest.fn();
const mockEnsureMetadataSchema = jest.fn().mockResolvedValue(undefined);
const mockRecordCommandStart = jest.fn().mockResolvedValue(1);
const mockRecordCommandComplete = jest.fn().mockResolvedValue(undefined);
const mockLoadMigrationTargetManifest = jest.fn();
const mockRunDryRunTransformations = jest.fn();
const mockRunApplyTransformations = jest.fn();

jest.unstable_mockModule('../src/config/db.js', () => ({
  createSourceConnection: jest.fn(),
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

jest.unstable_mockModule('../src/data/targetManifest.js', () => ({
  loadMigrationTargetManifest: mockLoadMigrationTargetManifest,
  validateMigrationTargetManifest: jest.fn(),
  BUSINESS_DB_NAME_PATTERN: /^dgfy_business_[a-z0-9][a-z0-9_]*$/
}));

jest.unstable_mockModule('../src/data/dryRun.js', () => ({
  DEFAULT_RUN_SCOPE: 'data-migration',
  runDryRunTransformations: mockRunDryRunTransformations,
  buildDryRunPlan: jest.fn(),
  summarizeDryRunReport: jest.fn()
}));

jest.unstable_mockModule('../src/data/apply.js', () => ({
  DEFAULT_RUN_SCOPE: 'data-migration',
  runApplyTransformations: mockRunApplyTransformations,
  applyTenantEntityBatch: jest.fn(),
  writeMappedTargetRow: jest.fn(),
  resumeFromDataCheckpoint: jest.fn(),
  assertMappedTargetIdentity: jest.fn()
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
    mockLoadMigrationTargetManifest.mockReset().mockResolvedValue({
      valid: true,
      errors: [],
      targets: [validTarget()]
    });
    mockRunDryRunTransformations.mockReset().mockResolvedValue({
      run_scope: 'data-migration',
      entries: [],
      summary: {
        planned_inserts: 0,
        planned_updates: 0,
        planned_skips: 0,
        planned_conflicts: 0,
        orphan_records: 0,
        tenant_coverage_count: 1
      },
      tenant_coverage: [{
        legacy_tenant_id: 'tenant-1',
        legacy_tenant_db_name: 'sku_tenant_1',
        target_business_db_name: 'dgfy_business_alpha',
        entities_planned: 0
      }]
    });
    mockRunApplyTransformations.mockReset().mockResolvedValue({
      run_scope: 'data-migration',
      summary: {
        rows_written: 0,
        rows_skipped: 0,
        rows_conflicted: 0,
        rows_retried: 0,
        checkpoints_marked: 0,
        tenant_coverage_count: 1
      },
      results: []
    });
  });

  afterEach(async () => {
    await fs.rm(reportDir, { recursive: true, force: true });
    restoreEnv();
  });

  test('runDataApply({confirmDestructive:false}) rejects with DestructiveOperationError before any connection factory or manifest load', async () => {
    await expect(runDataApply({ confirmDestructive: false })).rejects.toThrow(DestructiveOperationError);

    expect(mockCreateTargetConnection).not.toHaveBeenCalled();
    expect(mockCreateMetaConnection).not.toHaveBeenCalled();
    expect(mockLoadMigrationTargetManifest).not.toHaveBeenCalled();
    expect(mockRunApplyTransformations).not.toHaveBeenCalled();
  });

  test('runDataApply({confirmDestructive:true}) calls the apply service and returns written/skipped/conflicted/checkpointed/retried counts', async () => {
    mockRunApplyTransformations.mockResolvedValue({
      run_scope: 'data-migration',
      summary: {
        rows_written: 3,
        rows_skipped: 1,
        rows_conflicted: 1,
        rows_retried: 2,
        checkpoints_marked: 4,
        tenant_coverage_count: 1
      },
      results: [{
        legacy_tenant_id: 'tenant-1',
        entity_type: 'account',
        operation: 'insert',
        status: 'inserted',
        target_table: 'accounts',
        target_database: 'dgfy_core',
        dgfy_id: 'acct-uuid-1'
      }]
    });

    const report = await runDataApply({ confirmDestructive: true });

    expect(report.command).toBe('data:apply');
    expect(report.mode).toBe('apply');
    expect(report.run_scope).toBe('data-migration');
    expect(report.summary).toEqual({
      rows_written: 3,
      rows_skipped: 1,
      rows_conflicted: 1,
      rows_retried: 2,
      checkpoints_marked: 4,
      tenant_coverage_count: 1
    });
    expect(report.results).toHaveLength(1);
    expect(mockRunApplyTransformations).toHaveBeenCalledTimes(1);
    expect(mockCreateTargetConnection).toHaveBeenCalledTimes(1);
  });

  test('runDataApply({confirmDestructive:true}) rejects with EnvValidationError when DGFY_MIGRATION_TARGET_MANIFEST is missing, before any DB factory call', async () => {
    applyEnv({ DGFY_MIGRATION_TARGET_MANIFEST: '' });

    await expect(runDataApply({ confirmDestructive: true })).rejects.toThrow(EnvValidationError);

    expect(mockCreateTargetConnection).not.toHaveBeenCalled();
    expect(mockCreateMetaConnection).not.toHaveBeenCalled();
    expect(mockLoadMigrationTargetManifest).not.toHaveBeenCalled();
  });

  test('runDataApply({confirmDestructive:true}) rejects with EnvValidationError when the manifest is invalid, before any DB factory call', async () => {
    mockLoadMigrationTargetManifest.mockResolvedValue({
      valid: false,
      errors: ['Migration target manifest must not be empty'],
      targets: null
    });

    await expect(runDataApply({ confirmDestructive: true })).rejects.toThrow(EnvValidationError);

    expect(mockCreateTargetConnection).not.toHaveBeenCalled();
    expect(mockCreateMetaConnection).not.toHaveBeenCalled();
    expect(mockRunApplyTransformations).not.toHaveBeenCalled();
  });

  test('runDataApply({confirmDestructive:true}) marks the command execution failed when the apply service throws', async () => {
    mockRunApplyTransformations.mockRejectedValue(new Error('apply boom'));

    await expect(runDataApply({ confirmDestructive: true })).rejects.toThrow('apply boom');

    expect(mockRecordCommandComplete).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ exitStatus: 'failed', errorMessage: 'apply boom' })
    );
  });

  test('runDataApply report and argsJson never contain secrets, password hashes, terminal secrets, or company_token', async () => {
    mockRunApplyTransformations.mockResolvedValue({
      run_scope: 'data-migration',
      summary: {
        rows_written: 1, rows_skipped: 0, rows_conflicted: 0, rows_retried: 0,
        checkpoints_marked: 1, tenant_coverage_count: 1
      },
      results: [{
        legacy_tenant_id: 'tenant-1',
        entity_type: 'account',
        operation: 'insert',
        status: 'inserted',
        target_table: 'accounts',
        target_database: 'dgfy_core',
        dgfy_id: 'acct-uuid-1'
      }]
    });

    const report = await runDataApply({ confirmDestructive: true });
    const serializedReport = JSON.stringify(report);

    expect(serializedReport).not.toMatch(/password_hash|terminal_password_hash|company_token/i);

    const startCall = mockRecordCommandStart.mock.calls[0][1];
    expect(startCall.argsJson).not.toMatch(/password_hash|terminal_password_hash|company_token/i);
  });

  test('runDataDryRun({}) succeeds without requiring confirmDestructive and returns the real dry-run report shape', async () => {
    const report = await runDataDryRun({});

    expect(report.command).toBe('data:dry-run');
    expect(report.mode).toBe('dry-run');
    expect(report.run_scope).toBe('data-migration');
    expect(report.summary).toEqual({
      planned_inserts: 0,
      planned_updates: 0,
      planned_skips: 0,
      planned_conflicts: 0,
      orphan_records: 0,
      tenant_coverage_count: 1
    });
    expect(report.tenant_coverage).toHaveLength(1);
    expect(report.results).toEqual([]);
    expect(mockRunDryRunTransformations).toHaveBeenCalledTimes(1);
  });

  test('runDataDryRun({}) records the report paths in command_executions on success', async () => {
    await runDataDryRun({});

    expect(mockRecordCommandComplete).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({
        exitStatus: 'success',
        reportJsonPath: expect.stringContaining('data-dry-run'),
        reportSummaryPath: expect.stringContaining('data-dry-run')
      })
    );
  });

  test('runDataDryRun({}) rejects with EnvValidationError when DGFY_MIGRATION_TARGET_MANIFEST is missing, before any DB factory call', async () => {
    applyEnv({ DGFY_MIGRATION_TARGET_MANIFEST: '' });

    await expect(runDataDryRun({})).rejects.toThrow(EnvValidationError);

    expect(mockCreateTargetConnection).not.toHaveBeenCalled();
    expect(mockCreateMetaConnection).not.toHaveBeenCalled();
    expect(mockLoadMigrationTargetManifest).not.toHaveBeenCalled();
  });

  test('runDataDryRun({}) rejects with EnvValidationError when the manifest is invalid, before any DB factory call', async () => {
    mockLoadMigrationTargetManifest.mockResolvedValue({
      valid: false,
      errors: ['Migration target manifest must not be empty'],
      targets: null
    });

    await expect(runDataDryRun({})).rejects.toThrow(EnvValidationError);

    expect(mockCreateTargetConnection).not.toHaveBeenCalled();
    expect(mockCreateMetaConnection).not.toHaveBeenCalled();
  });

  test('runDataDryRun({}) marks the command execution failed when the dry-run planner throws', async () => {
    mockRunDryRunTransformations.mockRejectedValue(new Error('boom'));

    await expect(runDataDryRun({})).rejects.toThrow('boom');

    expect(mockRecordCommandComplete).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ exitStatus: 'failed', errorMessage: 'boom' })
    );
  });
});

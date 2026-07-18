import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { dgfyCoreContract } from '../src/schemaContracts/dgfyCoreContract.js';
import { dgfyBusinessContract } from '../src/schemaContracts/dgfyBusinessContract.js';
import { buildMigrationsForKind, LEGACY_FINGERPRINT_ARTIFACT_NAME } from '../src/commands/schema.js';

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
 * Builds a fake Sequelize-connection-shaped object (getQueryInterface() +
 * query()) that fully satisfies every table/column/index/unique-constraint/
 * foreign-key in `contract`. Used as the "happy path" baseline for
 * core_schema/business_schemas tests — individual tests then delete/mutate
 * specific pieces to prove a finding surfaces.
 */
function buildFakeConnectionSatisfyingContract(contract, { missingTable, tableOverrides = {}, registryRows } = {}) {
  const tableNames = Object.keys(contract.tables).filter((name) => name !== missingTable);

  const showAllTables = jest.fn().mockResolvedValue(tableNames);

  const describeTable = jest.fn((tableName) => {
    const tableContract = contract.tables[tableName];
    const override = tableOverrides[tableName]?.columns;
    const columnNames = override || tableContract.columns;
    const columns = {};
    columnNames.forEach((col) => {
      columns[col] = { type: 'TEXT' };
    });
    return Promise.resolve(columns);
  });

  const showIndex = jest.fn((tableName) => {
    const tableContract = contract.tables[tableName];
    const override = tableOverrides[tableName]?.indexes;
    const indexNames = override || tableContract.indexes;
    const uniqueSet = new Set(tableContract.uniqueConstraints || []);
    return Promise.resolve(indexNames.map((name) => ({ name, unique: uniqueSet.has(name) })));
  });

  const query = jest.fn((sql, options) => {
    // tenant_coverage's business_database_registry lookup shares this same
    // connection object (the primary target) — sniff for it explicitly so
    // one fake can serve both the FK-introspection and registry-lookup call
    // shapes verify.js issues against the primary target connection.
    if (typeof sql === 'string' && sql.includes('business_database_registry')) {
      if (registryRows === 'unavailable') {
        return Promise.reject(new Error("Table 'dgfy_core.business_database_registry' doesn't exist"));
      }
      return Promise.resolve([registryRows || []]);
    }

    // Mirrors the real information_schema query's WHERE table_name = ?
    // filtering, so an FK override on one table can never leak into another
    // table's foreign-key check via an identically-shaped FK elsewhere.
    const queriedTableName = options?.replacements?.[1];
    const tableContract = contract.tables[queriedTableName];
    const rows = tableOverrides[queriedTableName]?.foreignKeys === 'none' || !tableContract
      ? []
      : (tableContract.foreignKeys || []).map((fk) => (
        { col: fk.column, refTable: fk.referencesTable, refColumn: fk.referencesColumn }
      ));
    return Promise.resolve([rows]);
  });

  return {
    getQueryInterface: () => ({ showAllTables, describeTable, showIndex }),
    query
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
const MockMetaSequelizeStorage = jest.fn().mockImplementation(({ targetDatabase }) => ({
  logMigration: jest.fn().mockResolvedValue(undefined),
  unlogMigration: jest.fn().mockResolvedValue(undefined),
  executed: jest.fn().mockResolvedValue(executedByTarget[targetDatabase] || [])
}));

jest.unstable_mockModule('../src/config/db.js', () => ({
  createSourceConnection: mockCreateSourceConnection,
  createTargetConnection: mockCreateTargetConnection,
  createMetaConnection: mockCreateMetaConnection,
  createBusinessTargetConnection: mockCreateBusinessTargetConnection,
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
  MetaSequelizeStorage: MockMetaSequelizeStorage
}));

const { runVerify } = await import('../src/commands/verify.js');

const CORE_MIGRATION_NAMES = buildMigrationsForKind('core', {}).map((m) => m.name);
const BUSINESS_MIGRATION_NAMES = buildMigrationsForKind('business', {}).map((m) => m.name);

describe('runVerify — Phase 02 schema/metadata verification evidence', () => {
  let reportDir;

  beforeEach(async () => {
    reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-phase02-verify-'));
    applyEnv({ REPORT_DIR: reportDir });

    Object.keys(executedByTarget).forEach((key) => delete executedByTarget[key]);

    mockEnsureMetadataSchema.mockReset().mockResolvedValue(undefined);
    mockRecordCommandStart.mockClear().mockResolvedValue(1);
    mockRecordCommandComplete.mockClear();
    mockCreateMetaConnection.mockReset().mockReturnValue({ config: {}, query: jest.fn() });
    mockCreateSourceConnection.mockReset().mockReturnValue({ query: jest.fn().mockResolvedValue([[], []]) });
    MockMetaSequelizeStorage.mockClear();
  });

  afterEach(async () => {
    await fs.rm(reportDir, { recursive: true, force: true });
    restoreEnv();
  });

  describe('core_schema', () => {
    test('reports ok:true when every dgfy_core contract table/column/index/FK is present', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });

      const report = await runVerify({});

      expect(report.core_schema).toBeDefined();
      expect(report.core_schema.database).toBe('dgfy_core');
      expect(report.core_schema.ok).toBe(true);
      expect(report.summary.core_schema_ok).toBe(true);
    });

    test('reports a missing table with its missing columns/indexes when a contract table does not exist', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract, { missingTable: 'business_database_registry' }),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });

      const report = await runVerify({});

      const finding = report.core_schema.tables.find((t) => t.table === 'business_database_registry');
      expect(finding.exists).toBe(false);
      expect(finding.ok).toBe(false);
      expect(finding.missing_columns).toEqual(dgfyCoreContract.tables.business_database_registry.columns);
      expect(report.core_schema.ok).toBe(false);
      expect(report.summary.core_schema_ok).toBe(false);
    });

    test('reports a missing column on an existing table', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract, {
          tableOverrides: { accounts: { columns: ['id', 'email'] } }
        }),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });

      const report = await runVerify({});

      const finding = report.core_schema.tables.find((t) => t.table === 'accounts');
      expect(finding.exists).toBe(true);
      expect(finding.missing_columns).toEqual(
        expect.arrayContaining(dgfyCoreContract.tables.accounts.columns.filter((c) => c !== 'id' && c !== 'email'))
      );
      expect(finding.ok).toBe(false);
    });

    test('reports a missing index/unique-constraint on an existing table', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract, {
          tableOverrides: { accounts: { indexes: [] } }
        }),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });

      const report = await runVerify({});

      const finding = report.core_schema.tables.find((t) => t.table === 'accounts');
      expect(finding.missing_indexes.length).toBeGreaterThan(0);
      expect(finding.missing_unique_constraints.length).toBeGreaterThan(0);
      expect(finding.ok).toBe(false);
    });

    test('reports a missing foreign key on an existing table', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract, {
          tableOverrides: { business_memberships: { foreignKeys: 'none' } }
        }),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });

      const report = await runVerify({});

      const finding = report.core_schema.tables.find((t) => t.table === 'business_memberships');
      expect(finding.missing_foreign_keys.length).toBeGreaterThan(0);
      expect(finding.ok).toBe(false);
    });

    test('flags an out-of-scope rejected table if present in the target database', async () => {
      const fake = buildFakeConnectionSatisfyingContract(dgfyCoreContract);
      const originalShowAllTables = fake.getQueryInterface().showAllTables;
      const tablesWithRejected = [...Object.keys(dgfyCoreContract.tables), 'branches'];
      mockCreateTargetConnection.mockReset().mockReturnValue({
        getQueryInterface: () => ({
          showAllTables: jest.fn().mockResolvedValue(tablesWithRejected),
          describeTable: fake.getQueryInterface().describeTable,
          showIndex: fake.getQueryInterface().showIndex
        }),
        query: fake.query,
        authenticate: jest.fn().mockResolvedValue(undefined)
      });
      void originalShowAllTables;

      const report = await runVerify({});

      expect(report.core_schema.rejected_tables_present).toContain('branches');
      expect(report.core_schema.ok).toBe(false);
    });
  });

  describe('business_schemas', () => {
    test('reports one ok:true entry per configured dgfy_business_* target', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });
      mockCreateBusinessTargetConnection.mockReset().mockImplementation(() => buildFakeConnectionSatisfyingContract(dgfyBusinessContract));
      applyEnv({ REPORT_DIR: reportDir, DGFY_BUSINESS_DB_NAMES: 'dgfy_business_alpha,dgfy_business_beta' });

      const report = await runVerify({});

      expect(report.business_schemas).toHaveLength(2);
      expect(report.business_schemas.map((s) => s.database)).toEqual(['dgfy_business_alpha', 'dgfy_business_beta']);
      expect(report.business_schemas.every((s) => s.ok)).toBe(true);
      expect(report.summary.business_schemas_ok).toBe(true);
    });

    test('reports ok:false for a business target missing a contract table', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });
      mockCreateBusinessTargetConnection.mockReset().mockImplementation(() => (
        buildFakeConnectionSatisfyingContract(dgfyBusinessContract, { missingTable: 'locations' })
      ));
      applyEnv({ REPORT_DIR: reportDir, DGFY_BUSINESS_DB_NAMES: 'dgfy_business_alpha' });

      const report = await runVerify({});

      expect(report.business_schemas[0].ok).toBe(false);
      expect(report.summary.business_schemas_ok).toBe(false);
    });

    test('is an empty array with business_schemas_ok:true when no business targets are configured', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });

      const report = await runVerify({});

      expect(report.business_schemas).toEqual([]);
      expect(report.summary.business_schemas_ok).toBe(true);
    });
  });

  describe('migration_metadata', () => {
    test('reports the primary target ok:true when every expected core migration is recorded', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });
      executedByTarget['dgfy_core'] = CORE_MIGRATION_NAMES;

      const report = await runVerify({});

      const finding = report.migration_metadata.find((m) => m.target_database === 'dgfy_core');
      expect(finding.ok).toBe(true);
      expect(finding.missing_migrations).toEqual([]);
      expect(report.summary.migration_metadata_ok).toBe(true);
    });

    test('reports missing migration records per target database, not only by filename', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });
      mockCreateBusinessTargetConnection.mockReset().mockImplementation(() => buildFakeConnectionSatisfyingContract(dgfyBusinessContract));
      applyEnv({ REPORT_DIR: reportDir, DGFY_BUSINESS_DB_NAMES: 'dgfy_business_alpha,dgfy_business_beta' });

      // dgfy_core fully recorded; only dgfy_business_alpha recorded, beta missing entirely.
      executedByTarget['dgfy_core'] = CORE_MIGRATION_NAMES;
      executedByTarget['dgfy_business_alpha'] = BUSINESS_MIGRATION_NAMES;
      executedByTarget['dgfy_business_beta'] = [];

      const report = await runVerify({});

      const coreFinding = report.migration_metadata.find((m) => m.target_database === 'dgfy_core');
      const alphaFinding = report.migration_metadata.find((m) => m.target_database === 'dgfy_business_alpha');
      const betaFinding = report.migration_metadata.find((m) => m.target_database === 'dgfy_business_beta');

      expect(coreFinding.ok).toBe(true);
      expect(alphaFinding.ok).toBe(true);
      expect(betaFinding.ok).toBe(false);
      expect(betaFinding.missing_migrations).toEqual(BUSINESS_MIGRATION_NAMES);
      expect(report.summary.migration_metadata_ok).toBe(false);
    });

    test('CR-01 regression: a mid-loop business-target failure cannot drop or mislabel other targets\' findings', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });
      mockCreateBusinessTargetConnection.mockReset().mockImplementation(() => buildFakeConnectionSatisfyingContract(dgfyBusinessContract));
      applyEnv({ REPORT_DIR: reportDir, DGFY_BUSINESS_DB_NAMES: 'dgfy_business_alpha,dgfy_business_beta,dgfy_business_gamma' });

      executedByTarget['dgfy_core'] = CORE_MIGRATION_NAMES;
      executedByTarget['dgfy_business_alpha'] = BUSINESS_MIGRATION_NAMES;
      executedByTarget['dgfy_business_gamma'] = BUSINESS_MIGRATION_NAMES;
      // dgfy_business_beta deliberately left unset — its storage call throws instead of resolving.

      MockMetaSequelizeStorage
        .mockImplementationOnce(({ targetDatabase }) => ({
          logMigration: jest.fn().mockResolvedValue(undefined),
          unlogMigration: jest.fn().mockResolvedValue(undefined),
          executed: jest.fn().mockResolvedValue(executedByTarget[targetDatabase] || [])
        }))
        .mockImplementationOnce(({ targetDatabase }) => ({
          logMigration: jest.fn().mockResolvedValue(undefined),
          unlogMigration: jest.fn().mockResolvedValue(undefined),
          executed: jest.fn().mockResolvedValue(executedByTarget[targetDatabase] || [])
        }))
        .mockImplementationOnce(() => ({
          logMigration: jest.fn().mockResolvedValue(undefined),
          unlogMigration: jest.fn().mockResolvedValue(undefined),
          executed: jest.fn().mockRejectedValue(new Error('storage read failed for dgfy_business_beta'))
        }))
        .mockImplementationOnce(({ targetDatabase }) => ({
          logMigration: jest.fn().mockResolvedValue(undefined),
          unlogMigration: jest.fn().mockResolvedValue(undefined),
          executed: jest.fn().mockResolvedValue(executedByTarget[targetDatabase] || [])
        }));

      const report = await runVerify({});

      expect(report.migration_metadata).toHaveLength(4);

      const coreFinding = report.migration_metadata.find((m) => m.target_database === 'dgfy_core');
      const alphaFinding = report.migration_metadata.find((m) => m.target_database === 'dgfy_business_alpha');
      const betaFinding = report.migration_metadata.find((m) => m.target_database === 'dgfy_business_beta');
      const gammaFinding = report.migration_metadata.find((m) => m.target_database === 'dgfy_business_gamma');

      expect(coreFinding.ok).toBe(true);
      expect(alphaFinding.ok).toBe(true);
      expect(gammaFinding.ok).toBe(true);

      expect(betaFinding).toBeDefined();
      expect(betaFinding.target_database).toBe('dgfy_business_beta');
      expect(betaFinding.ok).toBe(false);
      expect(betaFinding.error).toContain('storage read failed for dgfy_business_beta');

      expect(report.summary.migration_metadata_ok).toBe(false);
    });
  });

  test('runVerify continues to never throw even when a schema check fails outright', async () => {
    mockCreateTargetConnection.mockReset().mockReturnValue({
      getQueryInterface: () => ({
        showAllTables: jest.fn().mockRejectedValue(new Error('ECONNRESET'))
      }),
      query: jest.fn(),
      authenticate: jest.fn().mockResolvedValue(undefined)
    });

    let report;
    await expect((async () => {
      report = await runVerify({});
    })()).resolves.toBeUndefined();

    expect(report.core_schema.ok).toBe(false);
    expect(report.summary.core_schema_ok).toBe(false);
  });

  describe('tenant_coverage', () => {
    test('reports has_expected_schema per target and registry_covered:null when business_database_registry is not seeded yet', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract, { registryRows: 'unavailable' }),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });
      mockCreateBusinessTargetConnection.mockReset().mockImplementation(() => buildFakeConnectionSatisfyingContract(dgfyBusinessContract));
      applyEnv({ REPORT_DIR: reportDir, DGFY_BUSINESS_DB_NAMES: 'dgfy_business_alpha' });

      const report = await runVerify({});

      expect(report.tenant_coverage.registry_available).toBe(false);
      expect(report.tenant_coverage.targets).toEqual([
        { database: 'dgfy_business_alpha', has_expected_schema: true, registry_covered: null }
      ]);
      expect(report.tenant_coverage.ok).toBe(true);
      expect(report.summary.tenant_coverage_ok).toBe(true);
    });

    test('flags a registry gap without failing ok when the registry is available but has no row for an explicit target', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract, { registryRows: [] }),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });
      mockCreateBusinessTargetConnection.mockReset().mockImplementation(() => buildFakeConnectionSatisfyingContract(dgfyBusinessContract));
      applyEnv({ REPORT_DIR: reportDir, DGFY_BUSINESS_DB_NAMES: 'dgfy_business_alpha' });

      const report = await runVerify({});

      expect(report.tenant_coverage.registry_available).toBe(true);
      expect(report.tenant_coverage.targets[0].registry_covered).toBe(false);
      expect(report.tenant_coverage.registry_gaps).toEqual(['dgfy_business_alpha']);
      expect(report.tenant_coverage.ok).toBe(true);
    });

    test('reports ok:false when a target is missing its expected business schema, regardless of registry state', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract, { registryRows: [{ database_name: 'dgfy_business_alpha' }] }),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });
      mockCreateBusinessTargetConnection.mockReset().mockImplementation(() => (
        buildFakeConnectionSatisfyingContract(dgfyBusinessContract, { missingTable: 'locations' })
      ));
      applyEnv({ REPORT_DIR: reportDir, DGFY_BUSINESS_DB_NAMES: 'dgfy_business_alpha' });

      const report = await runVerify({});

      expect(report.tenant_coverage.targets[0].has_expected_schema).toBe(false);
      expect(report.tenant_coverage.targets[0].registry_covered).toBe(true);
      expect(report.tenant_coverage.ok).toBe(false);
      expect(report.summary.tenant_coverage_ok).toBe(false);
    });
  });

  describe('idempotency', () => {
    test('reports ok:true with empty pending_migrations for every target when all expected migrations are recorded', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });
      mockCreateBusinessTargetConnection.mockReset().mockImplementation(() => buildFakeConnectionSatisfyingContract(dgfyBusinessContract));
      applyEnv({ REPORT_DIR: reportDir, DGFY_BUSINESS_DB_NAMES: 'dgfy_business_alpha' });

      executedByTarget['dgfy_core'] = CORE_MIGRATION_NAMES;
      executedByTarget['dgfy_business_alpha'] = BUSINESS_MIGRATION_NAMES;

      const report = await runVerify({});

      expect(report.idempotency).toEqual([
        { target_database: 'dgfy_core', ok: true, pending_migrations: [] },
        { target_database: 'dgfy_business_alpha', ok: true, pending_migrations: [] }
      ]);
      expect(report.summary.idempotency_ok).toBe(true);
    });

    test('reports ok:false with pending_migrations listing the unrecorded migration names for a target', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });
      executedByTarget['dgfy_core'] = [];

      const report = await runVerify({});

      const coreIdempotency = report.idempotency.find((i) => i.target_database === 'dgfy_core');
      expect(coreIdempotency.ok).toBe(false);
      expect(coreIdempotency.pending_migrations).toEqual(CORE_MIGRATION_NAMES);
      expect(report.summary.idempotency_ok).toBe(false);
    });
  });

  describe('legacy_non_mutation', () => {
    test('reports ok:false and baseline_found:false when no pre-migration baseline artifact exists yet', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });

      const report = await runVerify({});

      expect(report.legacy_non_mutation.baseline_found).toBe(false);
      expect(report.legacy_non_mutation.ok).toBe(false);
      expect(report.summary.legacy_non_mutation_ok).toBe(false);
    });

    test('reports ok:true when the current legacy fingerprint matches the saved baseline exactly', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });

      const fingerprint = {
        columns: [{ table_name: 'items', column_name: 'id', column_type: 'int', is_nullable: 'NO', column_default: null }],
        indexes: [{ table_name: 'items', index_name: 'PRIMARY', non_unique: 0, column_name: 'id', seq_in_index: 1 }],
        constraints: [{ table_name: 'items', constraint_name: 'PRIMARY', constraint_type: 'PRIMARY KEY' }]
      };
      await fs.writeFile(
        path.join(reportDir, LEGACY_FINGERPRINT_ARTIFACT_NAME),
        JSON.stringify({ captured_at: new Date().toISOString(), legacy_database: 'sku_inventory_manager', fingerprint }),
        'utf8'
      );

      mockCreateSourceConnection.mockReset().mockReturnValue({
        query: jest.fn()
          .mockResolvedValueOnce([fingerprint.columns])
          .mockResolvedValueOnce([fingerprint.indexes])
          .mockResolvedValueOnce([fingerprint.constraints])
      });

      const report = await runVerify({});

      expect(report.legacy_non_mutation.baseline_found).toBe(true);
      expect(report.legacy_non_mutation.ok).toBe(true);
      expect(report.summary.legacy_non_mutation_ok).toBe(true);
    });

    test('reports ok:false when the current legacy fingerprint differs from the saved baseline (a column was added)', async () => {
      mockCreateTargetConnection.mockReset().mockReturnValue({
        ...buildFakeConnectionSatisfyingContract(dgfyCoreContract),
        authenticate: jest.fn().mockResolvedValue(undefined)
      });

      const baselineFingerprint = {
        columns: [{ table_name: 'items', column_name: 'id', column_type: 'int', is_nullable: 'NO', column_default: null }],
        indexes: [],
        constraints: []
      };
      await fs.writeFile(
        path.join(reportDir, LEGACY_FINGERPRINT_ARTIFACT_NAME),
        JSON.stringify({ captured_at: new Date().toISOString(), legacy_database: 'sku_inventory_manager', fingerprint: baselineFingerprint }),
        'utf8'
      );

      const mutatedColumns = [
        ...baselineFingerprint.columns,
        { table_name: 'items', column_name: 'unexpected_new_column', column_type: 'varchar(255)', is_nullable: 'YES', column_default: null }
      ];
      mockCreateSourceConnection.mockReset().mockReturnValue({
        query: jest.fn()
          .mockResolvedValueOnce([mutatedColumns])
          .mockResolvedValueOnce([[]])
          .mockResolvedValueOnce([[]])
      });

      const report = await runVerify({});

      expect(report.legacy_non_mutation.baseline_found).toBe(true);
      expect(report.legacy_non_mutation.ok).toBe(false);
      expect(report.summary.legacy_non_mutation_ok).toBe(false);
    });
  });
});

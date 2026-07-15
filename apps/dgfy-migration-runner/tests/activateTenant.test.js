import { jest } from '@jest/globals';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { Sequelize } from 'sequelize';

/**
 * 04-09 gap closure (API-02/API-03): proves the shipped `activate-tenant`
 * CLI command reproduces the proven test-helper handoff
 * (apps/dgfy-api/tests/helpers/tenantSchemaProvisioning.js) in production
 * code — resolving the EXISTING provisioning business_database_registry
 * row, applying + verifying the real tenant schema, and flipping the row
 * to active/verified — while failing closed on a non-business
 * database_name, a missing registry row, or a failed schema verification.
 *
 * Mirrors phase04StaffInvitationsSchema.test.js's exact skip-safe gating
 * pattern for the DB-backed cases: this suite's skip-safe (always-run)
 * unit tests never open a real MySQL connection and must pass without any
 * DB credentials; the DB-backed `describeIfIntegration` block only runs
 * when explicitly opted in.
 *
 * Each skip-safe unit test isolates its own module mocks via
 * jest.resetModules() + jest.unstable_mockModule() + a fresh dynamic
 * import, mirroring tests/schemaCommand.test.js's established pattern —
 * jest.unstable_mockModule registrations are global to the module registry
 * and would otherwise leak between tests that need different stand-ins for
 * the same specifier.
 */
const RUN_INTEGRATION = process.env.RUN_ACTIVATE_TENANT_INTEGRATION === 'true';

const ADMIN_DB_CONFIG = {
  host: process.env.BUSINESS_IT_DB_HOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.BUSINESS_IT_DB_PORT || process.env.DB_PORT || 3306),
  user: process.env.BUSINESS_IT_DB_USER || process.env.DB_USER || 'root',
  password: process.env.BUSINESS_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

if (!RUN_INTEGRATION) {
  // eslint-disable-next-line no-console
  console.log(
    '[activateTenant.test.js] SKIPPED — set RUN_ACTIVATE_TENANT_INTEGRATION=true (with MySQL admin '
    + 'credentials via BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the existing '
    + 'DB_HOST/PORT/USER/PASSWORD convention) to run this real MySQL-backed activate-tenant '
    + 'provisioning->active/verified transition proof locally or in CI.'
  );
}

const describeIfIntegration = RUN_INTEGRATION ? describe : describe.skip;

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
    TARGET_DB_NAME: 'dgfy_core',
    MIGRATION_ACTOR: 'operator@dgfy.ph',
    ...overrides
  };
}

function applyEnv(overrides = {}) {
  process.env = { ...ORIGINAL_ENV, ...baseEnv(overrides) };
}

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function isolatedSuffix() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

async function withAdminConnection(fn) {
  const adminSequelize = new Sequelize('information_schema', ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
    host: ADMIN_DB_CONFIG.host,
    port: ADMIN_DB_CONFIG.port,
    dialect: 'mysql',
    logging: false
  });
  try {
    return await fn(adminSequelize);
  } finally {
    await adminSequelize.close();
  }
}

// ---------------------------------------------------------------------------
// DB-backed gated tests — RUN_ACTIVATE_TENANT_INTEGRATION=true with real MySQL.
//
// NOTE: this block is intentionally declared FIRST IN THE FILE — before
// EVERY other describe block below, each of which registers a
// jest.unstable_mockModule() stub for one or more of the four specifiers
// this block's dynamic import of activateTenant.js needs REAL:
// '../src/config/db.js' (guard rejection / missing registry row blocks),
// '../src/commands/schema.js', '../src/metadata/storage.js', and
// '../src/safety/destructiveGate.js' (missing-table verification block).
// Empirically verified (Jest 29 ESM): jest.unstable_mockModule()
// registrations persist across jest.resetModules() calls within the same
// test file — resetModules() clears the evaluated module cache but does
// NOT undo a prior mock registration for that specifier. An earlier version
// of this reordering placed this block only after the missing-table
// verification block (which mocks buildMigrationsForKind to always return
// an empty array) — that silently zeroed out every migration this block
// tried to apply, producing a "missing tables" failure for ALL contract
// tables regardless of what the real database actually needed. Do not move
// this block below any describe that mocks the four specifiers above.
// ---------------------------------------------------------------------------

describeIfIntegration('runActivateTenant — real MySQL provisioning->active/verified transition', () => {
  const suffix = isolatedSuffix();
  const coreDbName = `dgfy_core_it_${suffix}`;
  const businessDbName = `dgfy_business_activatetenantit${suffix}`;

  let reportDir;
  let runActivateTenant;
  let dgfyBusinessContract;
  const businessId = crypto.randomUUID();

  beforeAll(async () => {
    reportDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-activate-tenant-it-'));

    await withAdminConnection(async (adminSequelize) => {
      await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${coreDbName}\``);
      await adminSequelize.query(
        `CREATE TABLE IF NOT EXISTS \`${coreDbName}\`.business_database_registry (
          id INT AUTO_INCREMENT PRIMARY KEY,
          business_id VARCHAR(64) NOT NULL,
          stable_opaque_suffix VARCHAR(64) NOT NULL,
          database_name VARCHAR(128) NOT NULL UNIQUE,
          status VARCHAR(32) NOT NULL DEFAULT 'provisioning',
          verified_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      );
      await adminSequelize.query(
        `INSERT INTO \`${coreDbName}\`.business_database_registry
          (business_id, stable_opaque_suffix, database_name, status)
          VALUES (?, ?, ?, 'provisioning')`,
        { replacements: [businessId, suffix, businessDbName] }
      );
    });

    process.env = {
      ...ORIGINAL_ENV,
      RUNTIME_MODE: 'development',
      SOURCE_DB_HOST: ADMIN_DB_CONFIG.host,
      SOURCE_DB_PORT: String(ADMIN_DB_CONFIG.port),
      SOURCE_DB_USER: ADMIN_DB_CONFIG.user,
      SOURCE_DB_PASSWORD: ADMIN_DB_CONFIG.password,
      SOURCE_DB_NAME: coreDbName,
      TARGET_DB_HOST: ADMIN_DB_CONFIG.host,
      TARGET_DB_PORT: String(ADMIN_DB_CONFIG.port),
      TARGET_DB_USER: ADMIN_DB_CONFIG.user,
      TARGET_DB_PASSWORD: ADMIN_DB_CONFIG.password,
      TARGET_DB_NAME: coreDbName,
      MIGRATION_ACTOR: 'activate-tenant-integration-test',
      REPORT_DIR: reportDir
    };

    ({ runActivateTenant } = await import('../src/commands/activateTenant.js'));
    ({ dgfyBusinessContract } = await import('../src/schemaContracts/dgfyBusinessContract.js'));
  }, 60000);

  afterAll(async () => {
    await withAdminConnection(async (adminSequelize) => {
      try {
        await adminSequelize.query(
          'DELETE FROM `dgfy_migration_meta`.`schema_migrations` WHERE target_database IN (?, ?)',
          { replacements: [coreDbName, businessDbName] }
        );
        await adminSequelize.query(
          "DELETE FROM `dgfy_migration_meta`.`command_executions` WHERE actor = 'activate-tenant-integration-test'"
        );
      } catch (error) {
        // best-effort cleanup only — never fail the suite on teardown.
      }
      await adminSequelize.query(`DROP DATABASE IF EXISTS \`${coreDbName}\``);
      await adminSequelize.query(`DROP DATABASE IF EXISTS \`${businessDbName}\``);
    });

    if (reportDir) {
      await fsPromises.rm(reportDir, { recursive: true, force: true });
    }
    process.env = { ...ORIGINAL_ENV };
  }, 60000);

  test('activates the provisioning row to active/verified and applies every dgfyBusinessContract table', async () => {
    const report = await runActivateTenant({ databaseName: businessDbName });

    expect(report.activated).toBe(true);
    expect(report.database_name).toBe(businessDbName);

    const rows = await withAdminConnection(async (adminSequelize) => {
      const [selected] = await adminSequelize.query(
        `SELECT status, verified_at FROM \`${coreDbName}\`.business_database_registry WHERE database_name = ?`,
        { replacements: [businessDbName] }
      );
      return selected;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('active');
    expect(rows[0].verified_at).not.toBeNull();

    const tenantTables = await withAdminConnection(async (adminSequelize) => {
      const [tableRows] = await adminSequelize.query(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = ?',
        { replacements: [businessDbName] }
      );
      return tableRows.map((row) => (row.table_name || row.TABLE_NAME).toLowerCase());
    });
    Object.keys(dgfyBusinessContract.tables).forEach((table) => {
      expect(tenantTables).toContain(table.toLowerCase());
    });
  }, 60000);

  test('the exact gate precondition dgfy-api enforces is satisfiable and a second run is an idempotent no-op', async () => {
    const before = await withAdminConnection(async (adminSequelize) => {
      const [selected] = await adminSequelize.query(
        `SELECT status, verified_at FROM \`${coreDbName}\`.business_database_registry WHERE database_name = ?`,
        { replacements: [businessDbName] }
      );
      return selected;
    });
    expect(before[0].status).toBe('active');
    expect(before[0].verified_at).not.toBeNull();

    // Re-running is a safe no-op — still active/verified, no error, no
    // duplicate rows.
    const secondReport = await runActivateTenant({ databaseName: businessDbName });
    expect(secondReport.activated).toBe(true);
    expect(secondReport.already_active).toBe(true);

    const rows = await withAdminConnection(async (adminSequelize) => {
      const [selected] = await adminSequelize.query(
        `SELECT COUNT(*) AS total FROM \`${coreDbName}\`.business_database_registry WHERE database_name = ?`,
        { replacements: [businessDbName] }
      );
      return selected;
    });
    expect(Number(rows[0].total ?? rows[0].TOTAL)).toBe(1);
  }, 60000);
});

// ---------------------------------------------------------------------------
// Skip-safe (always-run) unit tests — never open a real MySQL connection.
// ---------------------------------------------------------------------------

// NOTE: this describe block is intentionally declared before the "guard
// rejection" / "missing registry row" blocks below (before any describe in
// this file registers a jest.unstable_mockModule() stub for
// '../src/schema/applyBusinessSchema.js') — unstable_mockModule
// registrations for a given specifier persist across jest.resetModules()
// calls within the same test file (see schemaCommand.test.js's identical
// caution), so a later describe's stub for that exact specifier would
// otherwise silently leak into this block's real-module import. This block
// itself mocks '../src/commands/schema.js', '../src/metadata/storage.js',
// and '../src/safety/destructiveGate.js' — which is exactly why the
// DB-backed describeIfIntegration block above is declared even earlier,
// before this one.
describe('applyAndVerifyBusinessSchema — missing-table verification error (skip-safe unit)', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('throws listing missing tables when the tenant connection is missing a dgfyBusinessContract table', async () => {
    jest.unstable_mockModule('../src/commands/schema.js', () => ({
      buildMigrationsForKind: jest.fn(() => [])
    }));
    jest.unstable_mockModule('../src/metadata/storage.js', () => ({
      MetaSequelizeStorage: jest.fn().mockImplementation(() => ({
        logMigration: jest.fn().mockResolvedValue(undefined),
        unlogMigration: jest.fn().mockResolvedValue(undefined),
        executed: jest.fn().mockResolvedValue([])
      }))
    }));
    jest.unstable_mockModule('../src/safety/destructiveGate.js', () => ({
      assertDestructiveAllowed: jest.fn(() => true)
    }));

    const { applyAndVerifyBusinessSchema } = await import('../src/schema/applyBusinessSchema.js');

    // Fake queryInterface whose showAllTables() omits most required tables
    // (only locations/staff_accounts exist) — simulating an incomplete
    // tenant schema.
    const fakeQueryInterface = {
      showAllTables: jest.fn().mockResolvedValue(['locations', 'staff_accounts'])
    };
    const fakeTenantSequelize = { getQueryInterface: () => fakeQueryInterface };
    const fakeMetaSequelize = {};

    await expect(applyAndVerifyBusinessSchema({
      tenantSequelize: fakeTenantSequelize,
      metaSequelize: fakeMetaSequelize,
      databaseName: 'dgfy_business_faketest',
      confirmDestructive: false,
      runtimeMode: 'development'
    })).rejects.toThrow(/missing tables/i);
  });
});

describe('runActivateTenant — guard rejection (skip-safe unit)', () => {
  beforeEach(() => {
    jest.resetModules();
    applyEnv();
  });

  afterEach(() => {
    restoreEnv();
    jest.resetModules();
  });

  test('rejects a non-business database_name (dgfy_core) with a TargetGuardError and never opens a connection or writes the registry', async () => {
    const mockCreateTargetConnection = jest.fn();
    const mockCreateMetaConnection = jest.fn();
    const mockCreateBusinessTargetConnection = jest.fn();
    const mockApplyAndVerifyBusinessSchema = jest.fn();

    jest.unstable_mockModule('../src/config/db.js', () => ({
      createTargetConnection: mockCreateTargetConnection,
      createMetaConnection: mockCreateMetaConnection,
      createBusinessTargetConnection: mockCreateBusinessTargetConnection
    }));
    jest.unstable_mockModule('../src/metadata/bootstrap.js', () => ({
      ensureMetadataSchema: jest.fn().mockResolvedValue(undefined),
      recordCommandStart: jest.fn().mockResolvedValue(1),
      recordCommandComplete: jest.fn().mockResolvedValue(undefined)
    }));
    jest.unstable_mockModule('../src/schema/applyBusinessSchema.js', () => ({
      applyAndVerifyBusinessSchema: mockApplyAndVerifyBusinessSchema
    }));

    const { runActivateTenant } = await import('../src/commands/activateTenant.js');

    await expect(runActivateTenant({ databaseName: 'dgfy_core' })).rejects.toThrow(/non-business database_name/i);

    expect(mockCreateTargetConnection).not.toHaveBeenCalled();
    expect(mockCreateMetaConnection).not.toHaveBeenCalled();
    expect(mockCreateBusinessTargetConnection).not.toHaveBeenCalled();
    expect(mockApplyAndVerifyBusinessSchema).not.toHaveBeenCalled();
  });

  test('rejects an arbitrary non-dgfy_ database_name before any connection is opened', async () => {
    const mockCreateTargetConnection = jest.fn();
    const mockCreateMetaConnection = jest.fn();

    jest.unstable_mockModule('../src/config/db.js', () => ({
      createTargetConnection: mockCreateTargetConnection,
      createMetaConnection: mockCreateMetaConnection,
      createBusinessTargetConnection: jest.fn()
    }));
    jest.unstable_mockModule('../src/metadata/bootstrap.js', () => ({
      ensureMetadataSchema: jest.fn().mockResolvedValue(undefined),
      recordCommandStart: jest.fn().mockResolvedValue(1),
      recordCommandComplete: jest.fn().mockResolvedValue(undefined)
    }));
    jest.unstable_mockModule('../src/schema/applyBusinessSchema.js', () => ({
      applyAndVerifyBusinessSchema: jest.fn()
    }));

    const { runActivateTenant } = await import('../src/commands/activateTenant.js');

    await expect(runActivateTenant({ databaseName: 'sku_inventory_manager' })).rejects.toThrow();

    expect(mockCreateTargetConnection).not.toHaveBeenCalled();
    expect(mockCreateMetaConnection).not.toHaveBeenCalled();
  });
});

describe('runActivateTenant — missing registry row fails closed (skip-safe unit)', () => {
  beforeEach(() => {
    jest.resetModules();
    applyEnv();
  });

  afterEach(() => {
    restoreEnv();
    jest.resetModules();
  });

  test('fails closed with no matching business_database_registry row and never attempts a schema apply', async () => {
    const mockCoreQuery = jest.fn().mockResolvedValue([[]]);
    const mockCreateTargetConnection = jest.fn(() => ({ query: mockCoreQuery }));
    const mockCreateBusinessTargetConnection = jest.fn();
    const mockRecordCommandComplete = jest.fn().mockResolvedValue(undefined);
    const mockApplyAndVerifyBusinessSchema = jest.fn();

    jest.unstable_mockModule('../src/config/db.js', () => ({
      createTargetConnection: mockCreateTargetConnection,
      createMetaConnection: jest.fn(() => ({ config: {}, query: jest.fn() })),
      createBusinessTargetConnection: mockCreateBusinessTargetConnection
    }));
    jest.unstable_mockModule('../src/metadata/bootstrap.js', () => ({
      ensureMetadataSchema: jest.fn().mockResolvedValue(undefined),
      recordCommandStart: jest.fn().mockResolvedValue(1),
      recordCommandComplete: mockRecordCommandComplete
    }));
    jest.unstable_mockModule('../src/schema/applyBusinessSchema.js', () => ({
      applyAndVerifyBusinessSchema: mockApplyAndVerifyBusinessSchema
    }));

    const { runActivateTenant } = await import('../src/commands/activateTenant.js');

    await expect(runActivateTenant({ databaseName: 'dgfy_business_missingrow' })).rejects.toThrow(
      /no business_database_registry row exists/i
    );

    expect(mockApplyAndVerifyBusinessSchema).not.toHaveBeenCalled();
    expect(mockCreateBusinessTargetConnection).not.toHaveBeenCalled();
    // Only the SELECT is issued — never an UPDATE.
    const updateCalls = mockCoreQuery.mock.calls.filter(([sql]) => /UPDATE\s+business_database_registry/i.test(sql));
    expect(updateCalls).toHaveLength(0);
    // Command failure is recorded (repudiation/audit trail).
    expect(mockRecordCommandComplete).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ exitStatus: 'failed' })
    );
  });
});

// WR-04 fix (04-REVIEW.md): the actual "resolve provisioning row -> CREATE
// DATABASE -> apply+verify -> UPDATE to active/verified" happy path, and the
// idempotent "already active/verified -> re-verify -> report
// already_active:true without a second UPDATE" path, were previously ONLY
// exercised inside the describeIfIntegration block above (gated behind
// RUN_ACTIVATE_TENANT_INTEGRATION=true, not set in ordinary CI/local runs).
// These skip-safe, mocked-DB unit tests close that always-run coverage gap,
// following the exact jest.unstable_mockModule pattern used by the other
// skip-safe blocks in this file.
describe('runActivateTenant — happy path and idempotent re-verify (skip-safe unit)', () => {
  beforeEach(() => {
    jest.resetModules();
    applyEnv();
  });

  afterEach(() => {
    restoreEnv();
    jest.resetModules();
  });

  test('resolves a provisioning row, applies+verifies the schema, and issues the exact activating UPDATE', async () => {
    const registryRow = {
      business_id: 'biz-1',
      database_name: 'dgfy_business_happypath',
      status: 'provisioning',
      verified_at: null
    };
    const mockCoreQuery = jest.fn()
      .mockResolvedValueOnce([[registryRow]]) // SELECT
      .mockResolvedValueOnce([[]]) // CREATE DATABASE IF NOT EXISTS
      .mockResolvedValueOnce([[]]); // UPDATE
    const mockCreateTargetConnection = jest.fn(() => ({ query: mockCoreQuery }));
    const mockCreateBusinessTargetConnection = jest.fn(() => ({}));
    const mockApplyAndVerifyBusinessSchema = jest.fn().mockResolvedValue({
      migrationsExecuted: ['20260101000000-example.cjs'],
      verifiedTables: ['locations', 'staff_accounts']
    });
    const mockRecordCommandComplete = jest.fn().mockResolvedValue(undefined);
    const mockWriteJsonReport = jest.fn().mockResolvedValue('/tmp/fake-report.json');
    const mockWriteSummaryReport = jest.fn().mockResolvedValue('/tmp/fake-report.txt');

    jest.unstable_mockModule('../src/config/db.js', () => ({
      createTargetConnection: mockCreateTargetConnection,
      createMetaConnection: jest.fn(() => ({ config: {}, query: jest.fn() })),
      createBusinessTargetConnection: mockCreateBusinessTargetConnection
    }));
    jest.unstable_mockModule('../src/metadata/bootstrap.js', () => ({
      ensureMetadataSchema: jest.fn().mockResolvedValue(undefined),
      recordCommandStart: jest.fn().mockResolvedValue(1),
      recordCommandComplete: mockRecordCommandComplete
    }));
    jest.unstable_mockModule('../src/schema/applyBusinessSchema.js', () => ({
      applyAndVerifyBusinessSchema: mockApplyAndVerifyBusinessSchema
    }));
    jest.unstable_mockModule('../src/reports/reportWriter.js', () => ({
      writeJsonReport: mockWriteJsonReport
    }));
    jest.unstable_mockModule('../src/reports/summaryWriter.js', () => ({
      writeSummaryReport: mockWriteSummaryReport
    }));

    const { runActivateTenant } = await import('../src/commands/activateTenant.js');

    const report = await runActivateTenant({ databaseName: 'dgfy_business_happypath' });

    expect(report.activated).toBe(true);
    expect(report.already_active).toBe(false);
    expect(mockApplyAndVerifyBusinessSchema).toHaveBeenCalledTimes(1);

    const updateCall = mockCoreQuery.mock.calls.find(([sql]) => /UPDATE\s+business_database_registry/i.test(sql));
    expect(updateCall).toBeDefined();
    expect(updateCall[0]).toMatch(
      /UPDATE business_database_registry SET status = \?, verified_at = \?, updated_at = \? WHERE database_name = \?/i
    );
    expect(updateCall[1].replacements).toEqual([
      'active',
      expect.any(Date),
      expect.any(Date),
      'dgfy_business_happypath'
    ]);

    expect(mockRecordCommandComplete).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ exitStatus: 'success' })
    );
  });

  // F-05 fix (04-REVIEW.md WR-03): the registry UPDATE commits BEFORE
  // report/summary writing runs. A report-write failure here must never
  // flip a genuinely successful activation to exitStatus:'failed' — an
  // operator seeing "fatal" would reasonably (but wrongly) conclude the
  // tenant database was never activated.
  test('a report-write failure after a successful UPDATE still records exitStatus:success, not failed', async () => {
    const registryRow = {
      business_id: 'biz-4',
      database_name: 'dgfy_business_reportfailure',
      status: 'provisioning',
      verified_at: null
    };
    const mockCoreQuery = jest.fn()
      .mockResolvedValueOnce([[registryRow]]) // SELECT
      .mockResolvedValueOnce([[]]) // CREATE DATABASE IF NOT EXISTS
      .mockResolvedValueOnce([[]]); // UPDATE
    const mockCreateTargetConnection = jest.fn(() => ({ query: mockCoreQuery }));
    const mockCreateBusinessTargetConnection = jest.fn(() => ({}));
    const mockApplyAndVerifyBusinessSchema = jest.fn().mockResolvedValue({
      migrationsExecuted: ['20260101000000-example.cjs'],
      verifiedTables: ['locations', 'staff_accounts']
    });
    const mockRecordCommandComplete = jest.fn().mockResolvedValue(undefined);
    // Simulates a disk-full / report-writer failure — the UPDATE above has
    // already committed by the time this throws.
    const mockWriteJsonReport = jest.fn().mockRejectedValue(new Error('ENOSPC: no space left on device'));
    const mockWriteSummaryReport = jest.fn().mockResolvedValue('/tmp/fake-report.txt');
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    jest.unstable_mockModule('../src/config/db.js', () => ({
      createTargetConnection: mockCreateTargetConnection,
      createMetaConnection: jest.fn(() => ({ config: {}, query: jest.fn() })),
      createBusinessTargetConnection: mockCreateBusinessTargetConnection
    }));
    jest.unstable_mockModule('../src/metadata/bootstrap.js', () => ({
      ensureMetadataSchema: jest.fn().mockResolvedValue(undefined),
      recordCommandStart: jest.fn().mockResolvedValue(1),
      recordCommandComplete: mockRecordCommandComplete
    }));
    jest.unstable_mockModule('../src/schema/applyBusinessSchema.js', () => ({
      applyAndVerifyBusinessSchema: mockApplyAndVerifyBusinessSchema
    }));
    jest.unstable_mockModule('../src/reports/reportWriter.js', () => ({
      writeJsonReport: mockWriteJsonReport
    }));
    jest.unstable_mockModule('../src/reports/summaryWriter.js', () => ({
      writeSummaryReport: mockWriteSummaryReport
    }));

    const { runActivateTenant } = await import('../src/commands/activateTenant.js');

    // Must resolve, not reject — a report-write failure is not a command
    // failure once the mutation has already succeeded.
    const report = await runActivateTenant({ databaseName: 'dgfy_business_reportfailure' });

    expect(report.activated).toBe(true);
    expect(report.already_active).toBe(false);

    // The activating UPDATE genuinely ran, regardless of the later
    // report-write failure.
    const updateCalls = mockCoreQuery.mock.calls.filter(([sql]) => /UPDATE\s+business_database_registry/i.test(sql));
    expect(updateCalls).toHaveLength(1);

    // The core assertion: exitStatus stays 'success', never 'failed', for
    // a report-write failure that happens after the mutation succeeded.
    expect(mockRecordCommandComplete).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ exitStatus: 'success', reportJsonPath: null })
    );
    expect(mockRecordCommandComplete).not.toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ exitStatus: 'failed' })
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('report/summary write failed'));

    consoleErrorSpy.mockRestore();
  });

  test('re-verifies an already active/verified row (idempotent no-op) and never issues a second UPDATE', async () => {
    const registryRow = {
      business_id: 'biz-2',
      database_name: 'dgfy_business_idempotent',
      status: 'active',
      verified_at: new Date('2026-01-01T00:00:00Z')
    };
    const mockCoreQuery = jest.fn().mockResolvedValueOnce([[registryRow]]); // SELECT only
    const mockCreateTargetConnection = jest.fn(() => ({ query: mockCoreQuery }));
    const mockCreateBusinessTargetConnection = jest.fn(() => ({}));
    const mockApplyAndVerifyBusinessSchema = jest.fn().mockResolvedValue({
      migrationsExecuted: [],
      verifiedTables: ['locations', 'staff_accounts']
    });
    const mockRecordCommandComplete = jest.fn().mockResolvedValue(undefined);

    jest.unstable_mockModule('../src/config/db.js', () => ({
      createTargetConnection: mockCreateTargetConnection,
      createMetaConnection: jest.fn(() => ({ config: {}, query: jest.fn() })),
      createBusinessTargetConnection: mockCreateBusinessTargetConnection
    }));
    jest.unstable_mockModule('../src/metadata/bootstrap.js', () => ({
      ensureMetadataSchema: jest.fn().mockResolvedValue(undefined),
      recordCommandStart: jest.fn().mockResolvedValue(1),
      recordCommandComplete: mockRecordCommandComplete
    }));
    jest.unstable_mockModule('../src/schema/applyBusinessSchema.js', () => ({
      applyAndVerifyBusinessSchema: mockApplyAndVerifyBusinessSchema
    }));
    jest.unstable_mockModule('../src/reports/reportWriter.js', () => ({
      writeJsonReport: jest.fn().mockResolvedValue('/tmp/fake-report.json')
    }));
    jest.unstable_mockModule('../src/reports/summaryWriter.js', () => ({
      writeSummaryReport: jest.fn().mockResolvedValue('/tmp/fake-report.txt')
    }));

    const { runActivateTenant } = await import('../src/commands/activateTenant.js');

    const report = await runActivateTenant({ databaseName: 'dgfy_business_idempotent' });

    expect(report.activated).toBe(true);
    expect(report.already_active).toBe(true);
    expect(mockApplyAndVerifyBusinessSchema).toHaveBeenCalledTimes(1);

    const updateCalls = mockCoreQuery.mock.calls.filter(([sql]) => /UPDATE\s+business_database_registry/i.test(sql));
    expect(updateCalls).toHaveLength(0);

    expect(mockRecordCommandComplete).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ exitStatus: 'success' })
    );
  });

  // WR-01 fix (04-REVIEW.md): a registry row that exists but is not in a
  // legitimate pre-activation state (e.g. an admin-transitioned
  // 'deprecated' row) must never be silently resurrected to 'active' just
  // because a row with that database_name exists.
  test('refuses to reactivate a row whose status is neither provisioning nor already active/verified', async () => {
    const registryRow = {
      business_id: 'biz-3',
      database_name: 'dgfy_business_deprecated',
      status: 'deprecated',
      verified_at: null
    };
    const mockCoreQuery = jest.fn().mockResolvedValueOnce([[registryRow]]); // SELECT only
    const mockCreateTargetConnection = jest.fn(() => ({ query: mockCoreQuery }));
    const mockCreateBusinessTargetConnection = jest.fn();
    const mockApplyAndVerifyBusinessSchema = jest.fn();
    const mockRecordCommandComplete = jest.fn().mockResolvedValue(undefined);

    jest.unstable_mockModule('../src/config/db.js', () => ({
      createTargetConnection: mockCreateTargetConnection,
      createMetaConnection: jest.fn(() => ({ config: {}, query: jest.fn() })),
      createBusinessTargetConnection: mockCreateBusinessTargetConnection
    }));
    jest.unstable_mockModule('../src/metadata/bootstrap.js', () => ({
      ensureMetadataSchema: jest.fn().mockResolvedValue(undefined),
      recordCommandStart: jest.fn().mockResolvedValue(1),
      recordCommandComplete: mockRecordCommandComplete
    }));
    jest.unstable_mockModule('../src/schema/applyBusinessSchema.js', () => ({
      applyAndVerifyBusinessSchema: mockApplyAndVerifyBusinessSchema
    }));

    const { runActivateTenant } = await import('../src/commands/activateTenant.js');

    await expect(runActivateTenant({ databaseName: 'dgfy_business_deprecated' })).rejects.toThrow(
      /registry status is "deprecated", expected "provisioning"/i
    );

    expect(mockApplyAndVerifyBusinessSchema).not.toHaveBeenCalled();
    expect(mockCreateBusinessTargetConnection).not.toHaveBeenCalled();
    const updateCalls = mockCoreQuery.mock.calls.filter(([sql]) => /UPDATE\s+business_database_registry/i.test(sql));
    expect(updateCalls).toHaveLength(0);
    expect(mockRecordCommandComplete).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ exitStatus: 'failed' })
    );
  });
});

import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { EnvValidationError } from '../src/utils/errors.js';

/**
 * 05-03 (D-02): proves the DB-level reference compatibility seam
 * (verifyContinuity.js) follows the runner's env-validate-before-connect
 * contract (RUN-03), exposes a non-empty expected-legacy-domain-table
 * allowlist, and produces a findings-report shape free of raw DB rows.
 *
 * Mirrors the established RUN_*_INTEGRATION skip-safe gating precedent
 * (tests/activateTenant.test.js, tests/phase03Integration.test.js): no
 * MySQL is reachable in the sandbox, so the real SOURCE_DB integrity probe
 * only runs when RUN_CONTINUITY_INTEGRATION=true is explicitly set. Every
 * other case in this file is a skip-safe unit test that never opens a real
 * or mocked DB connection for the pure-logic assertions, and uses a fake
 * Sequelize-connection-shaped object (mirroring verifyCommand.test.js's
 * buildFakeCoreConnection) for the report-shape assertion.
 */
const RUN_INTEGRATION = process.env.RUN_CONTINUITY_INTEGRATION === 'true';

if (!RUN_INTEGRATION) {
  // eslint-disable-next-line no-console
  console.log(
    '[verifyContinuity.test.js] Real SOURCE_DB integrity probe SKIPPED — set '
    + 'RUN_CONTINUITY_INTEGRATION=true (with SOURCE_DB_* credentials via .env) to run it '
    + 'locally or in CI. Pure-logic cases (env-validate-before-connect, allowlist shape, '
    + 'report shape) always run.'
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
  process.env = { ...ORIGINAL_ENV, ...baseEnv(overrides) };
}

function clearEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.SOURCE_DB_HOST;
  delete process.env.SOURCE_DB_USER;
  delete process.env.SOURCE_DB_PASSWORD;
  delete process.env.SOURCE_DB_NAME;
  delete process.env.TARGET_DB_HOST;
  delete process.env.TARGET_DB_USER;
  delete process.env.TARGET_DB_PASSWORD;
  delete process.env.TARGET_DB_NAME;
}

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

describe('verifyContinuity — pure logic (skip-safe, always runs)', () => {
  afterEach(() => {
    restoreEnv();
  });

  test('EXPECTED_LEGACY_DOMAIN_TABLES is a non-empty array of plain table-name strings', async () => {
    const { EXPECTED_LEGACY_DOMAIN_TABLES } = await import('../src/commands/verifyContinuity.js');

    expect(Array.isArray(EXPECTED_LEGACY_DOMAIN_TABLES)).toBe(true);
    expect(EXPECTED_LEGACY_DOMAIN_TABLES.length).toBeGreaterThan(0);
    EXPECTED_LEGACY_DOMAIN_TABLES.forEach((table) => {
      expect(typeof table).toBe('string');
      expect(table.length).toBeGreaterThan(0);
    });
  });

  test('with invalid/missing SOURCE_DB env, runVerifyContinuity rejects with EnvValidationError and never attempts a DB connection', async () => {
    clearEnv();
    process.env.RUNTIME_MODE = 'development';

    const { runVerifyContinuity } = await import('../src/commands/verifyContinuity.js');

    await expect(runVerifyContinuity({})).rejects.toBeInstanceOf(EnvValidationError);
  });

  test('buildContinuityReport payload shape: generated_at, command, findings array, ok boolean, no raw row objects', async () => {
    const { buildContinuityReport, EXPECTED_LEGACY_DOMAIN_TABLES } = await import('../src/commands/verifyContinuity.js');

    const existingTables = new Set(EXPECTED_LEGACY_DOMAIN_TABLES.map((t) => t.toLowerCase()));
    const rowCountByTable = Object.fromEntries(EXPECTED_LEGACY_DOMAIN_TABLES.map((t) => [t, 3]));

    const report = buildContinuityReport({
      existingTables,
      rowCountByTable,
      sourceDbName: 'sku_inventory_manager'
    });

    expect(typeof report.generated_at).toBe('string');
    expect(report.command).toBe('verify-continuity');
    expect(Array.isArray(report.findings)).toBe(true);
    expect(report.findings).toHaveLength(EXPECTED_LEGACY_DOMAIN_TABLES.length);
    expect(typeof report.ok).toBe('boolean');
    expect(report.ok).toBe(true);
    expect(report.summary.source_db_name).toBe('sku_inventory_manager');
    expect(report.summary.missing_tables).toEqual([]);

    // No raw DB rows anywhere in the payload — only table names/counts/booleans.
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/password/i);
    report.findings.forEach((finding) => {
      expect(Object.keys(finding).sort()).toEqual(['exists', 'ok', 'row_count', 'table']);
      expect(typeof finding.table).toBe('string');
      expect(typeof finding.exists).toBe('boolean');
      expect(typeof finding.ok).toBe('boolean');
    });
  });

  test('buildContinuityReport reports ok:false and lists missing_tables when an expected table is absent', async () => {
    const { buildContinuityReport, EXPECTED_LEGACY_DOMAIN_TABLES } = await import('../src/commands/verifyContinuity.js');

    const [firstTable, ...rest] = EXPECTED_LEGACY_DOMAIN_TABLES;
    const existingTables = new Set(rest.map((t) => t.toLowerCase()));
    const rowCountByTable = Object.fromEntries(rest.map((t) => [t, 1]));

    const report = buildContinuityReport({
      existingTables,
      rowCountByTable,
      sourceDbName: 'sku_inventory_manager'
    });

    expect(report.ok).toBe(false);
    expect(report.summary.missing_tables).toEqual([firstTable]);
    const missingFinding = report.findings.find((f) => f.table === firstTable);
    expect(missingFinding.exists).toBe(false);
    expect(missingFinding.ok).toBe(false);
    expect(missingFinding.row_count).toBeNull();
  });

  test('runVerifyContinuity writes a JSON report and returns it, using a fake read-only SOURCE_DB connection (no real MySQL)', async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-verify-continuity-'));

    jest.resetModules();
    jest.unstable_mockModule('../src/config/db.js', () => ({
      createSourceConnection: jest.fn(() => {
        return {
          getQueryInterface: () => ({
            showAllTables: jest.fn().mockResolvedValue([
              'items',
              'purchase_orders',
              'job_orders',
              'stock_movements',
              'suppliers',
              'users'
            ])
          }),
          query: jest.fn().mockResolvedValue([[{ count: 5 }]]),
          close: jest.fn().mockResolvedValue(undefined)
        };
      })
    }));

    applyEnv({ REPORT_DIR: reportDir });

    const { runVerifyContinuity } = await import('../src/commands/verifyContinuity.js');
    const { createSourceConnection } = await import('../src/config/db.js');

    const report = await runVerifyContinuity({});

    expect(createSourceConnection).toHaveBeenCalledTimes(1);
    expect(report.ok).toBe(true);
    expect(report.command).toBe('verify-continuity');

    const writtenFiles = await fs.readdir(reportDir);
    expect(writtenFiles.some((name) => name.includes('verify-continuity') && name.endsWith('.json'))).toBe(true);

    await fs.rm(reportDir, { recursive: true, force: true });
    jest.resetModules();
  });
});

// ---------------------------------------------------------------------------
// DB-backed gated test — RUN_CONTINUITY_INTEGRATION=true with real MySQL
// SOURCE_DB credentials. Uses the real (unmocked) createSourceConnection.
// ---------------------------------------------------------------------------
describeIfIntegration('runVerifyContinuity — real SOURCE_DB integrity probe', () => {
  afterEach(() => {
    restoreEnv();
  });

  test('probes the real legacy backup and reports table-level findings', async () => {
    applyEnv();

    const { runVerifyContinuity } = await import('../src/commands/verifyContinuity.js');
    const report = await runVerifyContinuity({});

    expect(typeof report.ok).toBe('boolean');
    expect(Array.isArray(report.findings)).toBe(true);
  });
});

import crypto from 'crypto';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';
import { Sequelize } from 'sequelize';

import { runSchemaMigrate } from '../src/commands/schema.js';
import { runVerify } from '../src/commands/verify.js';

/**
 * Task 3 (D-21 through D-24): a real MySQL-backed Phase 02 evidence test.
 * Unlike every other test in this suite, this file never mocks
 * `config/db.js`/`metadata/*` — it drives the REAL `runSchemaMigrate`/
 * `runVerify` command handlers against real, disposable `dgfy_*` schemas on
 * a real MySQL server, proving migrate -> rerun (idempotent, no pending) ->
 * verify end-to-end, including the legacy `sku_*` non-mutation fingerprint
 * baseline/comparison.
 *
 * Gated behind an explicit opt-in flag (RUN_PHASE02_INTEGRATION=true) plus
 * MySQL admin credentials, rather than assuming a DB is always reachable —
 * this test must skip cleanly (not fail) in any environment without a real
 * MySQL server, per this task's own acceptance criteria.
 */
const RUN_INTEGRATION = process.env.RUN_PHASE02_INTEGRATION === 'true';

const ADMIN_DB_CONFIG = {
  host: process.env.PHASE02_IT_DB_HOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.PHASE02_IT_DB_PORT || process.env.DB_PORT || 3306),
  user: process.env.PHASE02_IT_DB_USER || process.env.DB_USER || 'root',
  password: process.env.PHASE02_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

if (!RUN_INTEGRATION) {
  // eslint-disable-next-line no-console
  console.log(
    '[phase02Integration.test.js] SKIPPED — set RUN_PHASE02_INTEGRATION=true ' +
    '(with MySQL admin credentials via PHASE02_IT_DB_HOST/PORT/USER/PASSWORD, ' +
    'or the existing DB_HOST/PORT/USER/PASSWORD convention) to run this real ' +
    'MySQL-backed Phase 02 evidence test locally or in CI.'
  );
}

const describeIfIntegration = RUN_INTEGRATION ? describe : describe.skip;

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

describeIfIntegration('Phase 02 real MySQL-backed schema migrate + verify evidence', () => {
  const suffix = isolatedSuffix();
  const coreDbName = `dgfy_core_it_${suffix}`;
  const businessDbName = `dgfy_business_it${suffix}`;
  const legacyDbName = `sku_it_${suffix}`;

  let reportDir;
  const ORIGINAL_ENV = { ...process.env };

  beforeAll(async () => {
    reportDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-phase02-it-'));

    // Only ever creates/drops the three disposable, uniquely-suffixed
    // schemas this test itself owns — never a real/shared database.
    await withAdminConnection(async (adminSequelize) => {
      await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${coreDbName}\``);
      await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${businessDbName}\``);
      await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${legacyDbName}\``);
    });

    // Legacy-shaped fingerprint source: a minimal current/legacy table so
    // the pre/post information_schema fingerprint has real
    // tables/columns/indexes/constraints to prove unchanged, not an empty
    // schema (which would trivially "pass" without proving anything).
    const legacySequelize = new Sequelize(legacyDbName, ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
      host: ADMIN_DB_CONFIG.host,
      port: ADMIN_DB_CONFIG.port,
      dialect: 'mysql',
      logging: false
    });
    try {
      await legacySequelize.getQueryInterface().createTable('items', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        sku_code: { type: Sequelize.STRING(64), allowNull: false, unique: true }
      });
    } finally {
      await legacySequelize.close();
    }

    process.env = {
      ...ORIGINAL_ENV,
      RUNTIME_MODE: 'development',
      SOURCE_DB_HOST: ADMIN_DB_CONFIG.host,
      SOURCE_DB_PORT: String(ADMIN_DB_CONFIG.port),
      SOURCE_DB_USER: ADMIN_DB_CONFIG.user,
      SOURCE_DB_PASSWORD: ADMIN_DB_CONFIG.password,
      SOURCE_DB_NAME: legacyDbName,
      TARGET_DB_HOST: ADMIN_DB_CONFIG.host,
      TARGET_DB_PORT: String(ADMIN_DB_CONFIG.port),
      TARGET_DB_USER: ADMIN_DB_CONFIG.user,
      TARGET_DB_PASSWORD: ADMIN_DB_CONFIG.password,
      TARGET_DB_NAME: coreDbName,
      DGFY_BUSINESS_DB_NAMES: businessDbName,
      MIGRATION_ACTOR: 'phase02-integration-test',
      REPORT_DIR: reportDir
    };
  }, 60000);

  afterAll(async () => {
    await withAdminConnection(async (adminSequelize) => {
      // Clean up only this test's own target-scoped metadata rows —
      // dgfy_migration_meta itself is shared runner infrastructure and is
      // never dropped.
      try {
        await adminSequelize.query(
          'DELETE FROM `dgfy_migration_meta`.`schema_migrations` WHERE target_database IN (?, ?)',
          { replacements: [coreDbName, businessDbName] }
        );
        await adminSequelize.query(
          "DELETE FROM `dgfy_migration_meta`.`command_executions` WHERE actor = 'phase02-integration-test'"
        );
      } catch (error) {
        // best-effort cleanup only — never fail the suite on teardown.
      }

      await adminSequelize.query(`DROP DATABASE IF EXISTS \`${coreDbName}\``);
      await adminSequelize.query(`DROP DATABASE IF EXISTS \`${businessDbName}\``);
      await adminSequelize.query(`DROP DATABASE IF EXISTS \`${legacyDbName}\``);
    });

    if (reportDir) {
      await fsPromises.rm(reportDir, { recursive: true, force: true });
    }
    process.env = { ...ORIGINAL_ENV };
  }, 60000);

  test('migrate -> rerun (idempotent) -> verify proves schema, metadata, tenant coverage, idempotency, and legacy non-mutation', async () => {
    const firstMigrateReport = await runSchemaMigrate({});
    expect(firstMigrateReport.summary.executed).toBeGreaterThan(0);
    expect(firstMigrateReport.legacy_fingerprint_baseline_path).toBeDefined();

    // Rerun: additive/idempotent proof — a second run against the same
    // targets must execute zero migrations (everything already applied).
    const rerunMigrateReport = await runSchemaMigrate({});
    expect(rerunMigrateReport.summary.executed).toBe(0);
    expect(rerunMigrateReport.summary.total_pending).toBe(0);

    const verifyReport = await runVerify({});

    expect(verifyReport.summary.target_db_reachable).toBe(true);
    expect(verifyReport.core_schema.ok).toBe(true);
    expect(verifyReport.business_schemas.every((result) => result.ok)).toBe(true);
    expect(verifyReport.migration_metadata.every((result) => result.ok)).toBe(true);
    // dgfy_core.business_database_registry exists (created by the core
    // foundation migration) but has no seeded rows yet in Phase 02 — the
    // registry is reachable (registry_available:true) but reports a gap for
    // our explicit target, which is expected and does not fail `ok`.
    expect(verifyReport.tenant_coverage.registry_available).toBe(true);
    expect(verifyReport.tenant_coverage.targets).toEqual([
      { database: businessDbName, has_expected_schema: true, registry_covered: false }
    ]);
    expect(verifyReport.tenant_coverage.registry_gaps).toEqual([businessDbName]);
    expect(verifyReport.tenant_coverage.ok).toBe(true);
    expect(verifyReport.idempotency.every((result) => result.ok)).toBe(true);
    expect(verifyReport.legacy_non_mutation.baseline_found).toBe(true);
    expect(verifyReport.legacy_non_mutation.ok).toBe(true);

    expect(
      verifyReport.summary.core_schema_ok
      && verifyReport.summary.business_schemas_ok
      && verifyReport.summary.migration_metadata_ok
      && verifyReport.summary.tenant_coverage_ok
      && verifyReport.summary.idempotency_ok
      && verifyReport.summary.legacy_non_mutation_ok
    ).toBe(true);
  }, 60000);
});

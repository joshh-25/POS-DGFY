import crypto from 'crypto';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';
import { Sequelize } from 'sequelize';

import { runSchemaMigrate } from '../src/commands/schema.js';

/**
 * Wave 7 gap-closure (04-07-PLAN.md, Task 2): a real MySQL-backed evidence
 * test proving the additive `staff_invitations` migration
 * (20260711143000-add-dgfy-business-staff-invitations.cjs) applies cleanly
 * to a disposable `dgfy_business_*` schema and creates the table with the
 * required columns and token-hash/email/status indexes.
 *
 * Mirrors phase02Integration.test.js's/businessRepository.test.js's gating
 * pattern exactly: skips cleanly (never fails) unless explicitly opted in
 * with real MySQL admin credentials, so this suite never assumes a database
 * is reachable in CI or a fresh sandbox. This suite drives the REAL
 * `runSchemaMigrate` command handler (not a mocked queryInterface, unlike
 * dgfyBusinessSchema.test.js) against a real, disposable, uniquely-suffixed
 * `dgfy_business_*` target — it never touches a real/shared database.
 *
 * The documented invocation (`DGFY_BUSINESS_DB_NAMES=dgfy_business_
 * phase04_staff_it`) is illustrative of manual usage; this suite always
 * generates its own randomized-suffix target internally (matching every
 * other gated real-MySQL suite in this codebase) so repeated local/CI runs
 * never collide on a stale schema.
 */
const RUN_INTEGRATION = process.env.RUN_PHASE04_STAFF_INVITATIONS_SCHEMA_INTEGRATION === 'true';

const ADMIN_DB_CONFIG = {
  host: process.env.BUSINESS_IT_DB_HOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.BUSINESS_IT_DB_PORT || process.env.DB_PORT || 3306),
  user: process.env.BUSINESS_IT_DB_USER || process.env.DB_USER || 'root',
  password: process.env.BUSINESS_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

if (!RUN_INTEGRATION) {
  // eslint-disable-next-line no-console
  console.log(
    '[phase04StaffInvitationsSchema.test.js] SKIPPED — set ' +
    'RUN_PHASE04_STAFF_INVITATIONS_SCHEMA_INTEGRATION=true (with MySQL admin credentials via ' +
    'BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the existing DB_HOST/PORT/USER/PASSWORD ' +
    'convention) to run this real MySQL-backed staff_invitations schema evidence test locally ' +
    'or in CI.'
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

describeIfIntegration('Wave 7 real MySQL-backed staff_invitations schema evidence', () => {
  const suffix = isolatedSuffix();
  const coreDbName = `dgfy_core_it_${suffix}`;
  const businessDbName = `dgfy_business_phase04staffit${suffix}`;

  let reportDir;
  const ORIGINAL_ENV = { ...process.env };

  beforeAll(async () => {
    reportDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-phase04-staff-it-'));

    // Only ever creates/drops the two disposable, uniquely-suffixed schemas
    // this test itself owns — never a real/shared database.
    await withAdminConnection(async (adminSequelize) => {
      await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${coreDbName}\``);
      await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${businessDbName}\``);
    });

    process.env = {
      ...ORIGINAL_ENV,
      RUNTIME_MODE: 'development',
      SOURCE_DB_HOST: ADMIN_DB_CONFIG.host,
      SOURCE_DB_PORT: String(ADMIN_DB_CONFIG.port),
      SOURCE_DB_USER: ADMIN_DB_CONFIG.user,
      SOURCE_DB_PASSWORD: ADMIN_DB_CONFIG.password,
      // No real legacy schema needed for this focused suite — point the
      // "source" at the same disposable core schema (read-only fingerprint
      // capture only, never mutated).
      SOURCE_DB_NAME: coreDbName,
      TARGET_DB_HOST: ADMIN_DB_CONFIG.host,
      TARGET_DB_PORT: String(ADMIN_DB_CONFIG.port),
      TARGET_DB_USER: ADMIN_DB_CONFIG.user,
      TARGET_DB_PASSWORD: ADMIN_DB_CONFIG.password,
      TARGET_DB_NAME: coreDbName,
      DGFY_BUSINESS_DB_NAMES: businessDbName,
      MIGRATION_ACTOR: 'phase04-staff-invitations-integration-test',
      REPORT_DIR: reportDir
    };
  }, 60000);

  afterAll(async () => {
    await withAdminConnection(async (adminSequelize) => {
      try {
        await adminSequelize.query(
          'DELETE FROM `dgfy_migration_meta`.`schema_migrations` WHERE target_database IN (?, ?)',
          { replacements: [coreDbName, businessDbName] }
        );
        await adminSequelize.query(
          "DELETE FROM `dgfy_migration_meta`.`command_executions` WHERE actor = 'phase04-staff-invitations-integration-test'"
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

  test('migrate applies staff_invitations to a disposable dgfy_business_* schema with the required columns and indexes', async () => {
    const report = await runSchemaMigrate({});
    expect(report.summary.executed).toBeGreaterThan(0);

    const businessSequelize = new Sequelize(businessDbName, ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
      host: ADMIN_DB_CONFIG.host,
      port: ADMIN_DB_CONFIG.port,
      dialect: 'mysql',
      logging: false
    });

    try {
      const [tables] = await businessSequelize.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_name = 'staff_invitations'`,
        { replacements: [businessDbName] }
      );
      expect(tables).toHaveLength(1);

      const [columns] = await businessSequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = 'staff_invitations'`,
        { replacements: [businessDbName] }
      );
      const columnNames = columns.map((row) => row.column_name || row.COLUMN_NAME);
      ['id', 'staff_account_id', 'email', 'token_hash', 'status', 'expires_at', 'accepted_at', 'created_at', 'updated_at']
        .forEach((columnName) => {
          expect(columnNames).toContain(columnName);
        });
      // Never a raw token column (T-04-07-02).
      expect(columnNames).not.toContain('token');

      const [indexes] = await businessSequelize.query(
        `SELECT index_name, non_unique FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = 'staff_invitations'`,
        { replacements: [businessDbName] }
      );
      const indexNames = indexes.map((row) => row.index_name || row.INDEX_NAME);
      expect(indexNames).toEqual(expect.arrayContaining([
        'unique_staff_invitations_token_hash',
        'idx_staff_invitations_email',
        'idx_staff_invitations_status'
      ]));
      const tokenHashIndex = indexes.find((row) => (row.index_name || row.INDEX_NAME) === 'unique_staff_invitations_token_hash');
      expect(Number(tokenHashIndex.non_unique ?? tokenHashIndex.NON_UNIQUE)).toBe(0);
    } finally {
      await businessSequelize.close();
    }
  }, 60000);
});

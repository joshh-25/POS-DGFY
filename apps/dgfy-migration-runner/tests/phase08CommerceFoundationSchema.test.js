import crypto from 'crypto';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';
import { Sequelize } from 'sequelize';

import { runSchemaMigrate } from '../src/commands/schema.js';

/**
 * 08-13-PLAN.md gap-closure (Task 2): a real MySQL-backed evidence test
 * proving the full commerce-foundation migration chain
 * (20260712100000-create-commerce-foundation.cjs +
 * 20260712140000-harden-compliance-mode-state-uniqueness.cjs) applies
 * cleanly to a disposable `dgfy_business_*` schema, now that both
 * migrations' shifts.terminal_id/cashier_account_id and
 * compliance_mode_state.branch_id foreign keys have been switched from
 * CASCADE to RESTRICT (08-13's fix). Before that fix, `runSchemaMigrate({})`
 * below throws with MySQL error 1215 the moment the
 * active_terminal_cashier_key STORED generated-column ALTER runs, and this
 * test never reaches its assertions.
 *
 * Mirrors phase04StaffInvitationsSchema.test.js's gating pattern exactly:
 * skips cleanly (never fails, never hangs) unless explicitly opted in with
 * real MySQL admin credentials, so this suite never assumes a database is
 * reachable in CI or a fresh sandbox. This suite drives the REAL
 * `runSchemaMigrate` command handler against a real, disposable,
 * uniquely-suffixed `dgfy_business_*` target — it never touches a
 * real/shared database.
 */
const RUN_INTEGRATION = process.env.RUN_PHASE08_COMMERCE_FOUNDATION_SCHEMA_INTEGRATION === 'true';

const ADMIN_DB_CONFIG = {
  host: process.env.BUSINESS_IT_DB_HOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.BUSINESS_IT_DB_PORT || process.env.DB_PORT || 3306),
  user: process.env.BUSINESS_IT_DB_USER || process.env.DB_USER || 'root',
  password: process.env.BUSINESS_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

if (!RUN_INTEGRATION) {
  // eslint-disable-next-line no-console
  console.log(
    '[phase08CommerceFoundationSchema.test.js] SKIPPED — set ' +
    'RUN_PHASE08_COMMERCE_FOUNDATION_SCHEMA_INTEGRATION=true (with MySQL admin credentials via ' +
    'BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the existing DB_HOST/PORT/USER/PASSWORD ' +
    'convention) to run this real MySQL-backed commerce-foundation schema evidence test locally ' +
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

describeIfIntegration('08-13 real MySQL-backed commerce-foundation schema evidence', () => {
  const suffix = isolatedSuffix();
  const coreDbName = `dgfy_core_it_${suffix}`;
  const businessDbName = `dgfy_business_phase08commerceit${suffix}`;

  let reportDir;
  const ORIGINAL_ENV = { ...process.env };

  beforeAll(async () => {
    reportDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-phase08-commerce-it-'));

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
      MIGRATION_ACTOR: 'phase08-commerce-foundation-schema-integration-test',
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
          "DELETE FROM `dgfy_migration_meta`.`command_executions` WHERE actor = 'phase08-commerce-foundation-schema-integration-test'"
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

  test('migrate applies the full commerce-foundation chain (20260712100000 + 20260712140000) to a disposable dgfy_business_* schema without MySQL error 1215, and both DB-level uniqueness invariants materialize', async () => {
    const report = await runSchemaMigrate({});
    // This alone proves the fix: before 08-13's RESTRICT change, this call
    // throws with MySQL error 1215 and the test never reaches the
    // assertions below.
    expect(report.summary.executed).toBeGreaterThan(0);

    const businessSequelize = new Sequelize(businessDbName, ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
      host: ADMIN_DB_CONFIG.host,
      port: ADMIN_DB_CONFIG.port,
      dialect: 'mysql',
      logging: false
    });

    try {
      // 1. shifts.active_terminal_cashier_key + its unique index exist.
      const [shiftsColumns] = await businessSequelize.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = ? AND table_name = 'shifts' AND column_name = 'active_terminal_cashier_key'`,
        { replacements: [businessDbName] }
      );
      expect(shiftsColumns).toHaveLength(1);

      const [shiftsIndexes] = await businessSequelize.query(
        `SELECT index_name, non_unique FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = 'shifts' AND index_name = 'uq_shifts_active_terminal_cashier'`,
        { replacements: [businessDbName] }
      );
      expect(shiftsIndexes).toHaveLength(1);
      expect(Number(shiftsIndexes[0].non_unique ?? shiftsIndexes[0].NON_UNIQUE)).toBe(0);

      // 2. compliance_mode_state.branch_scope_key + its unique index exist.
      const [complianceColumns] = await businessSequelize.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = ? AND table_name = 'compliance_mode_state' AND column_name = 'branch_scope_key'`,
        { replacements: [businessDbName] }
      );
      expect(complianceColumns).toHaveLength(1);

      const [complianceIndexes] = await businessSequelize.query(
        `SELECT index_name, non_unique FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = 'compliance_mode_state'
           AND index_name = 'unique_compliance_mode_state_business_branch_scope'`,
        { replacements: [businessDbName] }
      );
      expect(complianceIndexes).toHaveLength(1);
      expect(Number(complianceIndexes[0].non_unique ?? complianceIndexes[0].NON_UNIQUE)).toBe(0);

      // 3. All three base-column FKs report RESTRICT/RESTRICT — never CASCADE.
      const [fkRules] = await businessSequelize.query(
        `SELECT kcu.table_name, kcu.column_name, rc.update_rule, rc.delete_rule
         FROM information_schema.referential_constraints rc
         JOIN information_schema.key_column_usage kcu
           ON rc.constraint_name = kcu.constraint_name
          AND rc.constraint_schema = kcu.constraint_schema
         WHERE rc.constraint_schema = ?
           AND kcu.table_name IN ('shifts', 'compliance_mode_state')
           AND kcu.column_name IN ('terminal_id', 'cashier_account_id', 'branch_id')`,
        { replacements: [businessDbName] }
      );
      expect(fkRules.length).toBe(3);
      fkRules.forEach((row) => {
        const updateRule = row.update_rule || row.UPDATE_RULE;
        const deleteRule = row.delete_rule || row.DELETE_RULE;
        expect(updateRule).toBe('RESTRICT');
        expect(deleteRule).toBe('RESTRICT');
      });

      // 4. All four append-only triggers exist — confirms up() ran to
      //    completion, not just past the shifts/compliance_mode_state
      //    ALTERs.
      const [triggers] = await businessSequelize.query(
        `SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = ?`,
        { replacements: [businessDbName] }
      );
      const triggerNames = triggers.map((row) => row.trigger_name || row.TRIGGER_NAME);
      expect(triggerNames).toEqual(expect.arrayContaining([
        'trg_inventory_movements_append_only_update',
        'trg_inventory_movements_append_only_delete',
        'trg_cash_drawer_events_append_only_update',
        'trg_cash_drawer_events_append_only_delete'
      ]));
    } finally {
      await businessSequelize.close();
    }
  }, 60000);
});

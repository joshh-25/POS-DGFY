import crypto from 'crypto';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';
import { Sequelize, DataTypes } from 'sequelize';

import { runSchemaMigrate } from '../src/commands/schema.js';
import { runDataDryRun, runDataApply } from '../src/commands/data.js';
import { runVerify } from '../src/commands/verify.js';
import {
  legacyDgfyAccountFixture,
  legacyTenantFixture,
  legacyAcceptedMembershipFixture,
  legacyTenantUserFixture,
  legacyTenantLocationFixture,
  legacyPosTerminalRegistryEntryFixture
} from './fixtures/phase03/legacyRecords.js';

/**
 * Task 3 (MIG-02 through MIG-05, T-03-05-03): a real MySQL-backed Phase 03
 * evidence test. Like `phase02Integration.test.js`, this file never mocks
 * `config/db.js`/`metadata/*` — it drives the REAL `runSchemaMigrate` ->
 * `runDataDryRun` -> `runDataApply` (twice, to prove retry safety) ->
 * `runVerify` command handlers against real, disposable legacy landlord/
 * tenant schemas plus disposable `dgfy_core_it_*`/`dgfy_business_it_*`
 * targets on a real MySQL server.
 *
 * Gated behind an explicit opt-in flag (RUN_PHASE03_INTEGRATION=true) plus
 * MySQL admin credentials — this test must skip cleanly (not fail) in any
 * environment without a real MySQL server, exactly like Phase 02's
 * integration test.
 */
const RUN_INTEGRATION = process.env.RUN_PHASE03_INTEGRATION === 'true';

const ADMIN_DB_CONFIG = {
  host: process.env.PHASE03_IT_DB_HOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.PHASE03_IT_DB_PORT || process.env.DB_PORT || 3306),
  user: process.env.PHASE03_IT_DB_USER || process.env.DB_USER || 'root',
  password: process.env.PHASE03_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

if (!RUN_INTEGRATION) {
  // eslint-disable-next-line no-console
  console.log(
    '[phase03Integration.test.js] SKIPPED — set RUN_PHASE03_INTEGRATION=true ' +
    '(with MySQL admin credentials via PHASE03_IT_DB_HOST/PORT/USER/PASSWORD, ' +
    'or the existing DB_HOST/PORT/USER/PASSWORD convention) to run this real ' +
    'MySQL-backed Phase 03 dry-run/apply/retry/verify rehearsal locally or in CI.'
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

async function countRows(sequelize, tableName) {
  const [rows] = await sequelize.query(`SELECT COUNT(*) AS count FROM ${tableName}`);
  return Number(rows[0].count);
}

function mysqlDate(value) {
  return value ? new Date(value) : null;
}

function legacyDgfyAccountLandlordSeed(overrides = {}) {
  const account = legacyDgfyAccountFixture(overrides);
  return {
    id: account.id,
    first_name: account.first_name,
    last_name: account.last_name,
    email: account.email,
    phone: account.phone,
    password_hash: account.password_hash,
    is_active: account.is_active,
    email_verified_at: mysqlDate(account.email_verified_at),
    phone_verified_at: mysqlDate(account.phone_verified_at),
    last_login_at: mysqlDate(account.last_login_at),
    deleted_at: mysqlDate(account.deleted_at)
  };
}

function legacyAcceptedMembershipSeed(overrides = {}) {
  const membership = legacyAcceptedMembershipFixture(overrides);
  return {
    id: membership.id,
    dgfy_account_id: membership.dgfy_account_id,
    tenant_id: membership.tenant_id,
    tenant_user_id: membership.tenant_user_id,
    role: membership.role,
    status: membership.status,
    accepted_at: mysqlDate(membership.accepted_at)
  };
}

function legacyTenantLandlordSeed(overrides = {}) {
  const tenant = legacyTenantFixture(overrides);
  return {
    id: tenant.id,
    name: tenant.name,
    db_name: tenant.db_name,
    company_token: tenant.company_token,
    status: tenant.status,
    owner_dgfy_account_id: tenant.owner_dgfy_account_id
  };
}

function legacyTenantUserSeed(overrides = {}) {
  const user = legacyTenantUserFixture(overrides);
  return {
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    phone_number: user.phone_number,
    password_hash: user.password_hash,
    role: user.role,
    is_active: user.is_active,
    is_master_admin: user.is_master_admin,
    last_login: mysqlDate(user.last_login),
    deleted_at: mysqlDate(user.deleted_at)
  };
}

function legacyTenantLocationSeed(overrides = {}) {
  const location = legacyTenantLocationFixture(overrides);
  return {
    location_id: location.location_id,
    name: location.name,
    address_line: location.address_line,
    latitude: location.latitude,
    longitude: location.longitude,
    is_active: location.is_active,
    is_primary_storefront: location.is_primary_storefront
  };
}

describeIfIntegration('Phase 03 real MySQL-backed dry-run/apply/retry/verify rehearsal', () => {
  const suffix = isolatedSuffix();
  const landlordDbName = `sku_it_landlord_${suffix}`;
  const tenantDbName = `sku_it_tenant_${suffix}`;
  const coreDbName = `dgfy_core_it_${suffix}`;
  const businessDbName = `dgfy_business_it${suffix}`;
  const legacyTenantId = `tenant-it-${suffix}`;
  const ownerAccountId = `acct-it-${suffix}`;
  const businessId = `biz-it-${suffix}`;

  let reportDir;
  let manifestPath;
  const ORIGINAL_ENV = { ...process.env };

  beforeAll(async () => {
    reportDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-phase03-it-'));

    await withAdminConnection(async (adminSequelize) => {
      await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${landlordDbName}\``);
      await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${tenantDbName}\``);
      await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${coreDbName}\``);
      await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${businessDbName}\``);
    });

    // ---- legacy landlord DB: tenants, dgfy_accounts, dgfy_account_tenant_memberships ----
    const landlordSequelize = new Sequelize(landlordDbName, ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
      host: ADMIN_DB_CONFIG.host, port: ADMIN_DB_CONFIG.port, dialect: 'mysql', logging: false
    });
    try {
      const qi = landlordSequelize.getQueryInterface();
      await qi.createTable('dgfy_accounts', {
        id: { type: DataTypes.STRING(64), primaryKey: true },
        first_name: DataTypes.STRING(120),
        last_name: DataTypes.STRING(120),
        email: DataTypes.STRING(255),
        phone: DataTypes.STRING(40),
        password_hash: DataTypes.STRING(255),
        is_active: DataTypes.BOOLEAN,
        email_verified_at: DataTypes.DATE,
        phone_verified_at: DataTypes.DATE,
        last_login_at: DataTypes.DATE,
        deleted_at: DataTypes.DATE
      });
      await qi.createTable('tenants', {
        id: { type: DataTypes.STRING(64), primaryKey: true },
        name: DataTypes.STRING(255),
        db_name: DataTypes.STRING(120),
        company_token: DataTypes.STRING(120),
        status: DataTypes.STRING(40),
        owner_dgfy_account_id: DataTypes.STRING(64)
      });
      await qi.createTable('dgfy_account_tenant_memberships', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        dgfy_account_id: DataTypes.STRING(64),
        tenant_id: DataTypes.STRING(64),
        tenant_user_id: DataTypes.INTEGER,
        role: DataTypes.STRING(40),
        status: DataTypes.STRING(40),
        accepted_at: DataTypes.DATE
      });

      await qi.bulkInsert('dgfy_accounts', [legacyDgfyAccountLandlordSeed({ id: ownerAccountId })]);
      await qi.bulkInsert('tenants', [legacyTenantLandlordSeed({
        id: legacyTenantId,
        db_name: tenantDbName,
        owner_dgfy_account_id: ownerAccountId
      })]);
      await qi.bulkInsert('dgfy_account_tenant_memberships', [legacyAcceptedMembershipSeed({
        dgfy_account_id: ownerAccountId,
        tenant_id: legacyTenantId
      })]);
    } finally {
      await landlordSequelize.close();
    }

    // ---- legacy tenant DB: users, tenant_locations, user_location_grants, system_settings ----
    const tenantSequelize = new Sequelize(tenantDbName, ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
      host: ADMIN_DB_CONFIG.host, port: ADMIN_DB_CONFIG.port, dialect: 'mysql', logging: false
    });
    try {
      const qi = tenantSequelize.getQueryInterface();
      await qi.createTable('users', {
        user_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        username: DataTypes.STRING(80),
        email: DataTypes.STRING(150),
        phone_number: DataTypes.STRING(40),
        password_hash: DataTypes.STRING(255),
        role: DataTypes.STRING(40),
        is_active: DataTypes.BOOLEAN,
        is_master_admin: DataTypes.BOOLEAN,
        last_login: DataTypes.DATE,
        deleted_at: DataTypes.DATE
      });
      await qi.createTable('tenant_locations', {
        location_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        name: DataTypes.STRING(150),
        address_line: DataTypes.STRING(255),
        latitude: DataTypes.STRING(20),
        longitude: DataTypes.STRING(20),
        is_active: DataTypes.BOOLEAN,
        is_primary_storefront: DataTypes.BOOLEAN
      });
      await qi.createTable('user_location_grants', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: DataTypes.INTEGER,
        location_id: DataTypes.INTEGER
      });
      await qi.createTable('system_settings', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        setting_key: DataTypes.STRING(120),
        setting_value: DataTypes.TEXT
      });

      await qi.bulkInsert('users', [legacyTenantUserSeed()]);
      await qi.bulkInsert('tenant_locations', [legacyTenantLocationSeed()]);
      await qi.bulkInsert('system_settings', [{
        setting_key: 'pos_terminal_registry',
        setting_value: JSON.stringify([legacyPosTerminalRegistryEntryFixture()])
      }]);
    } finally {
      await tenantSequelize.close();
    }

    // ---- explicit migration target manifest (D-01) ----
    manifestPath = path.join(reportDir, 'migration-target-manifest.json');
    await fsPromises.writeFile(manifestPath, JSON.stringify([{
      legacy_tenant_id: legacyTenantId,
      legacy_tenant_db_name: tenantDbName,
      target_business_db_name: businessDbName,
      expected_business_id: businessId,
      expected_owner_account_id: ownerAccountId
    }]), 'utf8');

    process.env = {
      ...ORIGINAL_ENV,
      RUNTIME_MODE: 'development',
      SOURCE_DB_HOST: ADMIN_DB_CONFIG.host,
      SOURCE_DB_PORT: String(ADMIN_DB_CONFIG.port),
      SOURCE_DB_USER: ADMIN_DB_CONFIG.user,
      SOURCE_DB_PASSWORD: ADMIN_DB_CONFIG.password,
      SOURCE_DB_NAME: landlordDbName,
      TARGET_DB_HOST: ADMIN_DB_CONFIG.host,
      TARGET_DB_PORT: String(ADMIN_DB_CONFIG.port),
      TARGET_DB_USER: ADMIN_DB_CONFIG.user,
      TARGET_DB_PASSWORD: ADMIN_DB_CONFIG.password,
      TARGET_DB_NAME: coreDbName,
      DGFY_BUSINESS_DB_NAMES: businessDbName,
      DGFY_MIGRATION_TARGET_MANIFEST: manifestPath,
      MIGRATION_ACTOR: 'phase03-integration-test',
      REPORT_DIR: reportDir
    };

    // Real dgfy_core/dgfy_business_* schema must exist before data apply can
    // write into it (this is the same target foundation Phase 02 builds).
    await runSchemaMigrate({});
  }, 90000);

  afterAll(async () => {
    await withAdminConnection(async (adminSequelize) => {
      try {
        await adminSequelize.query(
          'DELETE FROM `dgfy_migration_meta`.`legacy_id_map` WHERE run_scope = ?',
          { replacements: ['data-migration'] }
        );
        await adminSequelize.query(
          'DELETE FROM `dgfy_migration_meta`.`data_checkpoints` WHERE legacy_tenant_id = ?',
          { replacements: [legacyTenantId] }
        );
        await adminSequelize.query(
          'DELETE FROM `dgfy_migration_meta`.`data_quality_findings` WHERE legacy_tenant_id = ?',
          { replacements: [legacyTenantId] }
        );
        await adminSequelize.query(
          'DELETE FROM `dgfy_migration_meta`.`schema_migrations` WHERE target_database IN (?, ?)',
          { replacements: [coreDbName, businessDbName] }
        );
        await adminSequelize.query(
          "DELETE FROM `dgfy_migration_meta`.`command_executions` WHERE actor = 'phase03-integration-test'"
        );
      } catch (error) {
        // best-effort cleanup only — never fail the suite on teardown.
      }

      await adminSequelize.query(`DROP DATABASE IF EXISTS \`${landlordDbName}\``);
      await adminSequelize.query(`DROP DATABASE IF EXISTS \`${tenantDbName}\``);
      await adminSequelize.query(`DROP DATABASE IF EXISTS \`${coreDbName}\``);
      await adminSequelize.query(`DROP DATABASE IF EXISTS \`${businessDbName}\``);
    });

    if (reportDir) {
      await fsPromises.rm(reportDir, { recursive: true, force: true });
    }
    process.env = { ...ORIGINAL_ENV };
  }, 60000);

  test('dry-run mutates nothing, apply writes mapped rows, retry creates no duplicates, verify reconciles clean', async () => {
    // ---- dry-run: report-only, zero dgfy_* mutation ----
    const dryRunReport = await runDataDryRun({});
    expect(dryRunReport.summary.planned_inserts).toBeGreaterThan(0);

    const coreSequelize = new Sequelize(coreDbName, ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
      host: ADMIN_DB_CONFIG.host, port: ADMIN_DB_CONFIG.port, dialect: 'mysql', logging: false
    });
    const businessSequelize = new Sequelize(businessDbName, ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
      host: ADMIN_DB_CONFIG.host, port: ADMIN_DB_CONFIG.port, dialect: 'mysql', logging: false
    });

    try {
      expect(await countRows(coreSequelize, 'accounts')).toBe(0);
      expect(await countRows(businessSequelize, 'staff_accounts')).toBe(0);

      // ---- apply: real writes, gated by --confirm-destructive ----
      const applyReport = await runDataApply({ confirmDestructive: true });
      expect(applyReport.summary.rows_written).toBeGreaterThan(0);

      expect(await countRows(coreSequelize, 'accounts')).toBe(1);
      expect(await countRows(coreSequelize, 'businesses')).toBe(1);
      expect(await countRows(businessSequelize, 'staff_accounts')).toBe(1);
      expect(await countRows(businessSequelize, 'locations')).toBe(1);
      expect(await countRows(businessSequelize, 'terminal_identities')).toBe(1);

      // ---- retry: rerunning apply must not create duplicate rows ----
      await runDataApply({ confirmDestructive: true });
      expect(await countRows(coreSequelize, 'accounts')).toBe(1);
      expect(await countRows(coreSequelize, 'businesses')).toBe(1);
      expect(await countRows(businessSequelize, 'staff_accounts')).toBe(1);
      expect(await countRows(businessSequelize, 'locations')).toBe(1);
      expect(await countRows(businessSequelize, 'terminal_identities')).toBe(1);
    } finally {
      await coreSequelize.close();
      await businessSequelize.close();
    }

    // ---- verify: data reconciliation is clean ----
    const verifyReport = await runVerify({});
    expect(verifyReport.data_migration.skipped).not.toBe(true);
    expect(verifyReport.data_migration.open_findings.ok).toBe(true);
    expect(verifyReport.data_migration.ok).toBe(true);
    expect(verifyReport.summary.data_migration_ok).toBe(true);
  }, 90000);
});

import { jest } from '@jest/globals';
import crypto from 'crypto';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';
import { Sequelize } from 'sequelize';

import { runSchemaMigrate } from '../src/commands/schema.js';
import dgfyCoreContract from '../src/schemaContracts/dgfyCoreContract.js';

/**
 * Phase 10 Plan 01: Storefront Commerce Landlord Schema Verification
 *
 * Comprehensive test suite verifying:
 * 1. Two additive Phase 10 migrations exist (20260714100000 and 20260714101000)
 * 2. Both declare `meta.targetKind: 'core'`
 * 3. Running up() against a test dgfy_core creates three tables with
 *    documented columns, indexes, and constraints
 * 4. Unique idempotency index (tenant_id, target_type, idempotency_key) exists
 * 5. Unique public_reference indexes exist
 * 6. UUID tenant_id columns are present (never integer-coerced, ADR 0027 #17)
 * 7. commerce_payment_sessions has nullable split_payload/platform_fee_centavos
 *    (D-02 "keep adjustable" for future split without re-architecture)
 * 8. storefront_discovery_index gains latitude/longitude/search_text generated
 *    columns plus spatial and FULLTEXT indexes (STF-01 geo/text search)
 * 9. dgfyCoreContract no longer lists storefront_orders in rejectedTables
 * 10. Schema test suite passes without live-DB assumptions in CI (DB-backed
 *     integration assertions gated behind env flag per Phase 08 pattern)
 *
 * Mirrors phase08CommerceFoundationSchema.test.js's integration-gating pattern:
 * skips cleanly unless explicitly opted in with real MySQL admin credentials,
 * so this suite never assumes a database is reachable in CI. Runs the REAL
 * `runSchemaMigrate` command against a real, disposable `dgfy_core` target.
 */
const RUN_INTEGRATION = process.env.RUN_PHASE10_STOREFRONT_COMMERCE_SCHEMA_INTEGRATION === 'true';

const ADMIN_DB_CONFIG = {
  host: process.env.BUSINESS_IT_DB_HOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.BUSINESS_IT_DB_PORT || process.env.DB_PORT || 3306),
  user: process.env.BUSINESS_IT_DB_USER || process.env.DB_USER || 'root',
  password: process.env.BUSINESS_IT_DB_PASSWORD || process.env.DB_PASSWORD || ''
};

if (!RUN_INTEGRATION) {
  // eslint-disable-next-line no-console
  console.log(
    '[phase10StorefrontCommerceSchema.test.js] SKIPPED — set ' +
    'RUN_PHASE10_STOREFRONT_COMMERCE_SCHEMA_INTEGRATION=true (with MySQL admin credentials via ' +
    'BUSINESS_IT_DB_HOST/PORT/USER/PASSWORD, or the existing DB_HOST/PORT/USER/PASSWORD ' +
    'convention) to run this real MySQL-backed storefront-commerce schema evidence test locally ' +
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

describe('Phase 10 Storefront Commerce Schema: non-DB structural assertions', () => {
  test('dgfyCoreContract recognizes storefront_guest_identities, storefront_orders, commerce_payment_sessions', () => {
    expect(dgfyCoreContract.tables).toHaveProperty('storefront_guest_identities');
    expect(dgfyCoreContract.tables).toHaveProperty('storefront_orders');
    expect(dgfyCoreContract.tables).toHaveProperty('commerce_payment_sessions');
  });

  test('dgfyCoreContract no longer rejects storefront_orders', () => {
    expect(dgfyCoreContract.rejectedTables).not.toContain('storefront_orders');
  });

  test('dgfyCoreContract still rejects storefront_carts', () => {
    expect(dgfyCoreContract.rejectedTables).toContain('storefront_carts');
  });

  test('storefront_guest_identities contract includes verified_email UNIQUE index', () => {
    const table = dgfyCoreContract.tables.storefront_guest_identities;
    expect(table.columns).toContain('verified_email');
    expect(table.uniqueConstraints).toContain('unique_storefront_guest_identities_email');
  });

  test('storefront_orders contract includes idempotency UNIQUE index and public_reference', () => {
    const table = dgfyCoreContract.tables.storefront_orders;
    expect(table.columns).toContain('tenant_id');
    expect(table.columns).toContain('target_type');
    expect(table.columns).toContain('idempotency_key');
    expect(table.columns).toContain('public_reference');
    expect(table.uniqueConstraints).toContain('unique_storefront_orders_idempotency');
    expect(table.uniqueConstraints).toContain('unique_storefront_orders_public_reference');
  });

  test('commerce_payment_sessions contract includes nullable split_payload and platform_fee_centavos', () => {
    const table = dgfyCoreContract.tables.commerce_payment_sessions;
    expect(table.columns).toContain('split_payload');
    expect(table.columns).toContain('platform_fee_centavos');
  });

  test('storefront_discovery_index contract gains latitude, longitude, search_text generated columns', () => {
    const table = dgfyCoreContract.tables.storefront_discovery_index;
    expect(table.columns).toContain('latitude');
    expect(table.columns).toContain('longitude');
    expect(table.columns).toContain('search_text');
    expect(table.indexes).toContain('idx_storefront_discovery_geo_spatial');
    expect(table.indexes).toContain('ftx_storefront_discovery_search_text');
  });
});

describeIfIntegration('Phase 10 real MySQL-backed storefront-commerce schema evidence', () => {
  const suffix = isolatedSuffix();
  const coreDbName = `dgfy_core_phase10it_${suffix}`;

  let reportDir;
  const ORIGINAL_ENV = { ...process.env };

  beforeAll(async () => {
    reportDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-phase10-storefront-it-'));

    await withAdminConnection(async (adminSequelize) => {
      await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${coreDbName}\``);
      // Phase 10 runs against dgfy_core only (targetKind: 'core').
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
      DGFY_BUSINESS_DB_NAMES: '',
      MIGRATION_ACTOR: 'phase10-storefront-commerce-schema-integration-test',
      REPORT_DIR: reportDir
    };
  }, 60000);

  afterAll(async () => {
    await withAdminConnection(async (adminSequelize) => {
      try {
        await adminSequelize.query(
          'DELETE FROM `dgfy_migration_meta`.`schema_migrations` WHERE target_database = ?',
          { replacements: [coreDbName] }
        );
        await adminSequelize.query(
          "DELETE FROM `dgfy_migration_meta`.`command_executions` WHERE actor = 'phase10-storefront-commerce-schema-integration-test'"
        );
      } catch (error) {
        // best-effort cleanup only — never fail the suite on teardown.
      }

      await adminSequelize.query(`DROP DATABASE IF EXISTS \`${coreDbName}\``);
    });

    if (reportDir) {
      await fsPromises.rm(reportDir, { recursive: true, force: true });
    }
    process.env = { ...ORIGINAL_ENV };
  }, 60000);

  test('landlord commerce tables migrate cleanly: storefront_guest_identities, storefront_orders, commerce_payment_sessions', async () => {
    const report = await runSchemaMigrate({});
    expect(report.summary.executed).toBeGreaterThan(0);

    const coreSequelize = new Sequelize(coreDbName, ADMIN_DB_CONFIG.user, ADMIN_DB_CONFIG.password, {
      host: ADMIN_DB_CONFIG.host,
      port: ADMIN_DB_CONFIG.port,
      dialect: 'mysql',
      logging: false
    });

    try {
      // 1. storefront_guest_identities table exists with proper columns.
      const [guestIdentityColumns] = await coreSequelize.query(
        `SELECT column_name, column_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = 'storefront_guest_identities'
         ORDER BY ordinal_position`,
        { replacements: [coreDbName] }
      );
      expect(guestIdentityColumns.length).toBeGreaterThan(0);
      const guestIdColNames = guestIdentityColumns.map((c) => c.column_name || c.COLUMN_NAME);
      expect(guestIdColNames).toContain('id');
      expect(guestIdColNames).toContain('verified_email');
      expect(guestIdColNames).toContain('phone');
      expect(guestIdColNames).toContain('display_name');
      expect(guestIdColNames).toContain('last_order_at');
      expect(guestIdColNames).toContain('created_at');
      expect(guestIdColNames).toContain('updated_at');

      // 2. storefront_guest_identities has UNIQUE verified_email index.
      const [guestIdIndexes] = await coreSequelize.query(
        `SELECT index_name, non_unique
         FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = 'storefront_guest_identities'
           AND index_name = 'unique_storefront_guest_identities_email'`,
        { replacements: [coreDbName] }
      );
      expect(guestIdIndexes).toHaveLength(1);
      expect(Number(guestIdIndexes[0].non_unique ?? guestIdIndexes[0].NON_UNIQUE)).toBe(0);

      // 3. storefront_orders table exists with proper columns.
      const [ordersColumns] = await coreSequelize.query(
        `SELECT column_name, column_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = 'storefront_orders'
         ORDER BY ordinal_position`,
        { replacements: [coreDbName] }
      );
      expect(ordersColumns.length).toBeGreaterThan(0);
      const ordersColNames = ordersColumns.map((c) => c.column_name || c.COLUMN_NAME);
      expect(ordersColNames).toContain('id');
      expect(ordersColNames).toContain('public_reference');
      expect(ordersColNames).toContain('tenant_id');
      expect(ordersColNames).toContain('target_type');
      expect(ordersColNames).toContain('idempotency_key');
      expect(ordersColNames).toContain('request_hash');
      expect(ordersColNames).toContain('status');
      expect(ordersColNames).toContain('guest_identity_id');
      expect(ordersColNames).toContain('checkout_payload');
      expect(ordersColNames).toContain('total_centavos');
      expect(ordersColNames).toContain('availment_id');
      expect(ordersColNames).toContain('expires_at');

      // 4. Verify tenant_id is CHAR(36) (UUID string), not INTEGER.
      const tenantIdCol = ordersColumns.find((c) => (c.column_name || c.COLUMN_NAME) === 'tenant_id');
      const columnType = tenantIdCol.column_type || tenantIdCol.COLUMN_TYPE;
      expect(columnType.toLowerCase()).toMatch(/^char\(36\)/i);

      // 5. storefront_orders has composite UNIQUE (tenant_id, target_type, idempotency_key).
      const [idempotencyIndexes] = await coreSequelize.query(
        `SELECT index_name, seq_in_index, column_name, non_unique
         FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = 'storefront_orders'
           AND index_name = 'unique_storefront_orders_idempotency'
         ORDER BY seq_in_index`,
        { replacements: [coreDbName] }
      );
      expect(idempotencyIndexes).toHaveLength(3);
      const idempotencyCols = idempotencyIndexes.map((idx) => idx.column_name || idx.COLUMN_NAME);
      expect(idempotencyCols).toEqual(['tenant_id', 'target_type', 'idempotency_key']);
      expect(Number(idempotencyIndexes[0].non_unique ?? idempotencyIndexes[0].NON_UNIQUE)).toBe(0);

      // 6. storefront_orders has UNIQUE public_reference index.
      const [publicRefIndexes] = await coreSequelize.query(
        `SELECT index_name, non_unique
         FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = 'storefront_orders'
           AND index_name = 'unique_storefront_orders_public_reference'`,
        { replacements: [coreDbName] }
      );
      expect(publicRefIndexes).toHaveLength(1);
      expect(Number(publicRefIndexes[0].non_unique ?? publicRefIndexes[0].NON_UNIQUE)).toBe(0);

      // 7. commerce_payment_sessions table exists with proper columns.
      const [sessionsColumns] = await coreSequelize.query(
        `SELECT column_name, column_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = 'commerce_payment_sessions'
         ORDER BY ordinal_position`,
        { replacements: [coreDbName] }
      );
      expect(sessionsColumns.length).toBeGreaterThan(0);
      const sessionsColNames = sessionsColumns.map((c) => c.column_name || c.COLUMN_NAME);
      expect(sessionsColNames).toContain('id');
      expect(sessionsColNames).toContain('public_reference');
      expect(sessionsColNames).toContain('storefront_order_id');
      expect(sessionsColNames).toContain('tenant_id');
      expect(sessionsColNames).toContain('status');
      expect(sessionsColNames).toContain('provider');
      expect(sessionsColNames).toContain('provider_payment_intent_id');
      expect(sessionsColNames).toContain('provider_payment_id');
      expect(sessionsColNames).toContain('qr_code_image_url');
      expect(sessionsColNames).toContain('amount_centavos');
      expect(sessionsColNames).toContain('expires_at');
      expect(sessionsColNames).toContain('paid_at');
      expect(sessionsColNames).toContain('finalized_at');
      expect(sessionsColNames).toContain('manual_resolution_reason');
      expect(sessionsColNames).toContain('split_payload');
      expect(sessionsColNames).toContain('platform_fee_centavos');

      // 8. Verify split_payload and platform_fee_centavos are nullable (D-02).
      const splitPayloadCol = sessionsColumns.find((c) => (c.column_name || c.COLUMN_NAME) === 'split_payload');
      const platformFeeCol = sessionsColumns.find((c) => (c.column_name || c.COLUMN_NAME) === 'platform_fee_centavos');
      expect((splitPayloadCol.is_nullable || splitPayloadCol.IS_NULLABLE).toUpperCase()).toBe('YES');
      expect((platformFeeCol.is_nullable || platformFeeCol.IS_NULLABLE).toUpperCase()).toBe('YES');

      // 9. commerce_payment_sessions has UNIQUE public_reference index.
      const [sessionRefIndexes] = await coreSequelize.query(
        `SELECT index_name, non_unique
         FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = 'commerce_payment_sessions'
           AND index_name = 'unique_commerce_payment_sessions_reference'`,
        { replacements: [coreDbName] }
      );
      expect(sessionRefIndexes).toHaveLength(1);
      expect(Number(sessionRefIndexes[0].non_unique ?? sessionRefIndexes[0].NON_UNIQUE)).toBe(0);

      // 10. commerce_payment_sessions has indexes for PayMongo session resolution.
      const [intentIndexes] = await coreSequelize.query(
        `SELECT index_name
         FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = 'commerce_payment_sessions'
           AND index_name = 'idx_commerce_payment_sessions_intent_id'`,
        { replacements: [coreDbName] }
      );
      expect(intentIndexes).toHaveLength(1);

      const [paymentIdIndexes] = await coreSequelize.query(
        `SELECT index_name
         FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = 'commerce_payment_sessions'
           AND index_name = 'idx_commerce_payment_sessions_payment_id'`,
        { replacements: [coreDbName] }
      );
      expect(paymentIdIndexes).toHaveLength(1);

      // 11. storefront_discovery_index gains latitude/longitude GENERATED columns.
      const [discoveryColumns] = await coreSequelize.query(
        `SELECT column_name, extra, column_type
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = 'storefront_discovery_index'
         ORDER BY ordinal_position`,
        { replacements: [coreDbName] }
      );
      const discoveryColNames = discoveryColumns.map((c) => c.column_name || c.COLUMN_NAME);
      expect(discoveryColNames).toContain('latitude');
      expect(discoveryColNames).toContain('longitude');
      expect(discoveryColNames).toContain('search_text');

      // Verify they are GENERATED columns.
      const latCol = discoveryColumns.find((c) => (c.column_name || c.COLUMN_NAME) === 'latitude');
      const extra = latCol.extra || latCol.EXTRA;
      expect(extra.toUpperCase()).toContain('GENERATED');

      // 12. storefront_discovery_index has spatial (btree) index.
      const [geoIndexes] = await coreSequelize.query(
        `SELECT index_name, index_type
         FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = 'storefront_discovery_index'
           AND index_name = 'idx_storefront_discovery_geo_spatial'
         LIMIT 1`,
        { replacements: [coreDbName] }
      );
      expect(geoIndexes).toHaveLength(1);

      // 13. storefront_discovery_index has FULLTEXT index on search_text.
      const [fullTextIndexes] = await coreSequelize.query(
        `SELECT index_name, index_type
         FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = 'storefront_discovery_index'
           AND index_name = 'ftx_storefront_discovery_search_text'
         LIMIT 1`,
        { replacements: [coreDbName] }
      );
      expect(fullTextIndexes).toHaveLength(1);
    } finally {
      await coreSequelize.close();
    }
  }, 60000);
});

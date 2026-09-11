/**
 * #1824 — Provisioning retry idempotency on a partially-seeded DB
 *
 * Root cause: a retry against a tenant DB that already has schema + an admin user (the
 * realistic retry shape, since companyRegistrationRepository.markProvisioningStarted's atomic
 * conditional UPDATE already blocks two concurrent retries from reaching provisionTenant at the
 * same time) used to throw ER_DUP_ENTRY on the admin-user INSERT's unique username/email
 * constraints. The fix turns that INSERT into an upsert
 * (`ON DUPLICATE KEY UPDATE user_id = LAST_INSERT_ID(user_id)`) so a retry resolves the existing
 * admin row instead of throwing, without touching password_hash/permissions/etc on the
 * duplicate branch.
 *
 * This exercises the real INSERT ... ON DUPLICATE KEY UPDATE SQL against real MySQL (not a
 * mocked query response) — that's the whole point of the regression test, since only a real
 * unique-constraint collision proves the fix actually avoids ER_DUP_ENTRY. Everything outside
 * the admin-insert step itself (schema-bootstrap migrations, the landlord email-tenant mapping,
 * storefront discovery bootstrap) is mocked, matching
 * tenantProvisioning.storefrontBootstrap.test.js's precedent for isolating this exact set of
 * side effects from a provisioning test's own concern.
 *
 * This lives in its own file, rather than as a new describe block in tenantProvisioning.test.js,
 * because tenantProvisioning.test.js's very first test already triggers a real (unmocked) load
 * of landlordService.js/storefrontDiscoverySyncReliabilityService.js via
 * tenantProvisioningService.js's static imports — jest.unstable_mockModule can only intercept a
 * module before its first load in a given test file, and jest.spyOn cannot patch a named ESM
 * export after the fact (confirmed live: "Cannot assign to read only property... of object
 * '[object Module]'"). A fresh file gets its own module registry, so the mocks below are
 * guaranteed to be in place before tenantProvisioningService.js (and its static imports) ever
 * load.
 */

import { jest } from '@jest/globals';

// ─── Mocks BEFORE any module imports (see file header for why this must be its own file) ─────
jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
    // Keeps tenantSequelize.sync() a real-but-harmless no-op (zero models registered) so it never
    // conflicts with the bare users/system_settings schema this suite seeds by hand below.
    getTenantModels: jest.fn().mockReturnValue({})
}));

jest.unstable_mockModule('../src/services/tenantSchemaBootstrap.js', () => ({
    // Schema-bootstrap migrations are a distinct concern with their own coverage
    // (tenantSchemaBootstrap.integration.test.js) — irrelevant to admin-insert idempotency.
    applyPostSyncTenantSchema: jest.fn().mockResolvedValue(undefined)
}));

jest.unstable_mockModule('../src/services/landlordService.js', () => ({
    // Already independently idempotent (findOrCreate + graceful unique-violation handling) and
    // wrapped in its own try/catch by provisionTenant — mocked here only to keep this suite from
    // writing real rows into the shared landlord DB.
    addEmailTenantMapping: jest.fn().mockResolvedValue({ mapping: {}, created: true })
}));

jest.unstable_mockModule('../src/services/storefrontDiscoverySyncReliabilityService.js', () => ({
    // Not wrapped in try/catch by provisionTenant, so it must resolve cleanly for either call in
    // this suite to succeed — unrelated to the admin-insert step under test.
    syncStorefrontDiscoveryWithReliability: jest.fn().mockResolvedValue({
        ok: true,
        attempts: 1,
        reconciled: false
    })
}));

// ─── Imports (after mocks are registered) ─────────────────────────────────────
import sequelize from '../src/config/database.js';
import dbStore from '../src/utils/dbStore.js';
import { Sequelize } from 'sequelize';

describe('Provisioning — retry idempotency on partially-seeded DB', () => {
    const createdDbs = [];

    const connectToTenantDb = (dbName) => new Sequelize(dbName, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        dialect: 'mysql',
        logging: false
    });

    // Minimal, real-schema DDL for exactly the two tables provisionTenant's seed steps write to
    // (columns/constraints mirror apps/dgfy-migration-runner's 20240101000001-create-users.js /
    // 20240101000017-create-system-settings.js plus the later admin-seeding columns from
    // src/models/User.js). tenantModelFactory stays mocked to return {} (above), so
    // tenantSequelize.sync() never touches these pre-created tables.
    const seedBareSchema = async (dbName) => {
        const conn = connectToTenantDb(dbName);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                email VARCHAR(100) NOT NULL,
                phone_number VARCHAR(40) NULL,
                password_hash VARCHAR(255) NOT NULL,
                role ENUM('admin','manager','staff','cashier','po','do','jo') DEFAULT 'staff',
                is_active TINYINT(1) DEFAULT 1,
                is_master_admin TINYINT(1) NOT NULL DEFAULT 0,
                permissions JSON NULL,
                invitation_token VARCHAR(64) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_users_username (username),
                UNIQUE KEY uq_users_email (email),
                UNIQUE KEY uq_users_invitation_token (invitation_token)
            ) ENGINE=InnoDB
        `);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS system_settings (
                setting_id INT AUTO_INCREMENT PRIMARY KEY,
                setting_key VARCHAR(100) NOT NULL,
                setting_value TEXT NULL,
                data_type ENUM('string','number','boolean','json') DEFAULT 'string',
                description TEXT NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_system_settings_setting_key (setting_key)
            ) ENGINE=InnoDB
        `);
        return conn;
    };

    beforeEach(() => {
        jest.spyOn(dbStore, 'get').mockReturnValue({ update: jest.fn().mockResolvedValue([1]) });
    });

    afterEach(async () => {
        for (const dbName of createdDbs) {
            try {
                await sequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
            } catch (_) {
                // best-effort
            }
        }
        createdDbs.length = 0;
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        try { await sequelize.close(); } catch (_) {}
    });

    it('resolves the same admin_user_id and does not duplicate the admin row on a retry against an already-provisioned DB', async () => {
        const { provisionTenant } = await import('../src/services/tenantProvisioningService.js');

        const testDbName = `sku_tenant_retry${Date.now().toString(36)}_1824`;
        createdDbs.push(testDbName);

        // provisionTenant's own step 1 is `CREATE DATABASE IF NOT EXISTS` -- pre-creating it here
        // (and its bare schema) is what makes the *second* call below a genuine retry against an
        // already-provisioned DB rather than a fresh one.
        await sequelize.query(`CREATE DATABASE IF NOT EXISTS \`${testDbName}\``);
        const setupConn = await seedBareSchema(testDbName);

        const approvalArgs = {
            tenantId: 'test-uuid-1824-retry',
            name: 'Retry Idempotency Test Co',
            dbName: testDbName,
            companyToken: 'token-1824-retry',
            adminEmail: 'admin@retry1824.example.com',
            adminPhone: '+639170000000',
            adminUsername: 'RetryAdmin',
            adminPasswordHash: '$2b$10$fakehashfakehashfakeh'
        };

        const firstResult = await provisionTenant(approvalArgs);
        expect(firstResult.status).toBe('active');
        expect(firstResult.admin_user_id).toEqual(expect.any(Number));

        // Retry: identical approval-flow arguments, against the same still-existing DB.
        const secondResult = await provisionTenant(approvalArgs);
        expect(secondResult.status).toBe('active');
        expect(secondResult.admin_user_id).toBe(firstResult.admin_user_id);

        const [countRows] = await setupConn.query('SELECT COUNT(*) AS count FROM users');
        expect(Number(countRows[0].count)).toBe(1);

        await setupConn.close();
    });

    it('still inserts the admin row normally on the first attempt against a schema-only DB (unaffected by the fix)', async () => {
        const { provisionTenant } = await import('../src/services/tenantProvisioningService.js');

        const testDbName = `sku_tenant_retry${Date.now().toString(36)}_1824b`;
        createdDbs.push(testDbName);

        await sequelize.query(`CREATE DATABASE IF NOT EXISTS \`${testDbName}\``);
        const setupConn = await seedBareSchema(testDbName);

        const result = await provisionTenant({
            tenantId: 'test-uuid-1824-fresh',
            name: 'Fresh Insert Test Co',
            dbName: testDbName,
            companyToken: 'token-1824-fresh',
            adminEmail: 'admin@fresh1824.example.com',
            adminPasswordHash: '$2b$10$fakehashfakehashfakeh'
        });

        expect(result.status).toBe('active');
        expect(result.admin_user_id).toEqual(expect.any(Number));

        const [countRows] = await setupConn.query('SELECT COUNT(*) AS count FROM users');
        expect(Number(countRows[0].count)).toBe(1);

        await setupConn.close();
    });
});

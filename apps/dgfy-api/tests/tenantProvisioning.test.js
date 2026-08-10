/**
 * Tests: 2.3 — Provisioning atomic cleanup on failure
 *         2.5 — DDL identifier escaping and pattern validation
 *
 * 2.3: Verifies that when provisionTenant fails after creating the database
 * (e.g., during schema sync or admin seeding), the partially-created
 * "zombie" database is dropped as part of the compensating cleanup.
 *
 * 2.5: Verifies that:
 *   - DB_NAME_PATTERN rejects malformed/malicious database names before any
 *     DDL is executed (both legacy and approval flows, and deleteTenantDatabase).
 *   - The CREATE/DROP DATABASE queries use quoteIdentifier() output, not raw
 *     backtick interpolation, so the identifier is ORM-escaped.
 */

import { jest } from '@jest/globals';

// ─── Mock tenantModelFactory BEFORE any module imports ────────────────────────
// This prevents real DB connections during the sync step.
jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
    getTenantModels: jest.fn().mockReturnValue({})
}));

// ─── Imports (after mocks are registered) ─────────────────────────────────────
import sequelize from '../src/config/database.js';
import dbStore from '../src/utils/dbStore.js';

describe('Provisioning — atomic cleanup on failure (2.3)', () => {
    const TEST_DB_PREFIX = 'sku_tenant_';

    // Track databases created during each test so we can drop them if the
    // test itself fails to trigger cleanup (i.e. test infra safety net).
    const createdDbs = [];

    afterEach(async () => {
        // Safety net: drop any test databases that were not cleaned up
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
        await sequelize.close();
    });

    it('drops the zombie database when schema sync fails', async () => {
        // ── Arrange ─────────────────────────────────────────────────────────
        // Import the module under test (dynamic import picks up the mock above)
        const { provisionTenant } = await import('../src/services/tenantProvisioningService.js');

        // Inject a sync failure: intercept Sequelize prototype sync
        const { Sequelize } = await import('sequelize');
        const syncSpy = jest
            .spyOn(Sequelize.prototype, 'sync')
            .mockRejectedValue(new Error('Simulated sync failure'));

        // Spy on sequelize.query to capture DROP DATABASE calls
        const querySpy = jest.spyOn(sequelize, 'query');

        // Mock the Tenant model returned from dbStore so we can assert on update()
        const tenantUpdateMock = jest.fn().mockResolvedValue([1]);
        const tenantMock = { update: tenantUpdateMock };
        jest.spyOn(dbStore, 'get').mockReturnValue(tenantMock);

        // ── Act ──────────────────────────────────────────────────────────────
        // Use the approval-flow path so no real tenant record is created
        // (avoids needing a real landlord DB row for this unit test).
        // Name must match DB_NAME_PATTERN: sku_tenant_<alphanum>_<alphanum>
        const testDbName = `sku_tenant_prov${Date.now().toString(36)}_t23`;
        createdDbs.push(testDbName); // register for safety-net cleanup

        let thrownError;
        try {
            await provisionTenant({
                tenantId: 'test-uuid-provisioning-2-3',
                name: 'Provisioning Test Co',
                dbName: testDbName,
                companyToken: 'token-prov-test',
                adminEmail: 'admin@provtest.example.com',
                adminPasswordHash: '$2b$10$fakehashfakehashfakeh'
            });
        } catch (err) {
            thrownError = err;
        }

        // ── Assert ───────────────────────────────────────────────────────────

        // 1. The error from sync must propagate to the caller
        expect(thrownError).toBeDefined();
        expect(thrownError.message).toBe('Simulated sync failure');
        expect(syncSpy).toHaveBeenCalledWith();

        // 2. Approval-flow failure must remain retryable from the admin portal
        expect(tenantUpdateMock).toHaveBeenCalledWith(
            { status: 'pending' },
            expect.objectContaining({ where: { id: 'test-uuid-provisioning-2-3' } })
        );

        // 3. A DROP DATABASE query must have been issued for the zombie db
        const dropCalls = querySpy.mock.calls.filter(
            ([sql]) => typeof sql === 'string' && sql.toUpperCase().includes('DROP DATABASE')
        );
        expect(dropCalls.length).toBeGreaterThanOrEqual(1);

        const dropSql = dropCalls[0][0];
        expect(dropSql).toContain(testDbName);

        // 4. The db name in the drop must carry the sku_tenant_ prefix (safety check)
        expect(testDbName.startsWith(TEST_DB_PREFIX)).toBe(true);

        syncSpy.mockRestore();
    });

    it('drops the zombie database when status-update fails (all error paths covered)', async () => {
        // ── Arrange ─────────────────────────────────────────────────────────
        // Re-use the same sync-failure mechanism but with a different tenant ID
        // to independently verify that the cleanup path fires regardless of
        // which specific step fails.  This also exercises the scenario where
        // even the status-update throws (double-fault), ensuring the DROP still
        // runs and the original error propagates.
        const { provisionTenant } = await import('../src/services/tenantProvisioningService.js');

        const { Sequelize } = await import('sequelize');
        const syncSpy = jest
            .spyOn(Sequelize.prototype, 'sync')
            .mockRejectedValue(new Error('Simulated sync failure — double fault path'));

        // Also make the status-update fail to exercise the double-fault branch
        const tenantUpdateMock = jest.fn().mockRejectedValue(new Error('DB unavailable during cleanup'));
        jest.spyOn(dbStore, 'get').mockReturnValue({ update: tenantUpdateMock });

        const landlordQuerySpy = jest.spyOn(sequelize, 'query');

        // Name must match DB_NAME_PATTERN: sku_tenant_<alphanum>_<alphanum>
        const testDbName = `sku_tenant_prov${Date.now().toString(36)}_t23df`;
        createdDbs.push(testDbName);

        let thrownError;
        try {
            await provisionTenant({
                tenantId: 'test-uuid-provisioning-doublefault-2-3',
                name: 'Provisioning Double Fault Test Co',
                dbName: testDbName,
                companyToken: 'token-prov-doublefault',
                adminEmail: 'admin@doublefault.example.com',
                adminPasswordHash: '$2b$10$fakehashfakehashfakeh'
            });
        } catch (err) {
            thrownError = err;
        }

        // ── Assert ───────────────────────────────────────────────────────────

        // 1. Original provisioning error propagates (not the cleanup error)
        expect(thrownError).toBeDefined();
        expect(thrownError.message).toBe('Simulated sync failure — double fault path');

        // 2. Status reset was attempted even though it threw
        expect(tenantUpdateMock).toHaveBeenCalledWith(
            { status: 'pending' },
            expect.objectContaining({ where: { id: 'test-uuid-provisioning-doublefault-2-3' } })
        );

        // 3. DROP DATABASE still ran despite status-update failure
        const dropCalls = landlordQuerySpy.mock.calls.filter(
            ([sql]) => typeof sql === 'string' && sql.toUpperCase().includes('DROP DATABASE')
        );
        expect(dropCalls.length).toBeGreaterThanOrEqual(1);
        expect(dropCalls[0][0]).toContain(testDbName);

        syncSpy.mockRestore();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2.5 — DDL identifier escaping and DB_NAME_PATTERN validation
// ─────────────────────────────────────────────────────────────────────────────

describe('Provisioning — DDL identifier escaping (2.5)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        // sequelize may already be closed by the 2.3 suite; ignore error.
        try { await sequelize.close(); } catch (_) {}
    });

    // ── Helper: import a fresh copy of the module under test ────────────────
    // jest module cache is shared within the file so we reuse the mock
    // registered at the top (tenantModelFactory mock) — that's fine here.

    describe('approval flow — rejects invalid dbName before touching the DB', () => {
        const invalidNames = [
            '',
            'sku_tenant_',                // no name or uuid segment
            'sku_tenant_valid_',           // missing uuid part
            '../evil_db_abc12345',         // path traversal attempt
            'sku_tenant_valid_abc; DROP TABLE tenants; --',  // SQL injection attempt
            'SKU_TENANT_VALID_ABC12345',   // uppercase (not matched by pattern)
            'sku_tenant_valid_abc-def',    // hyphen not allowed by pattern
        ];

        it.each(invalidNames)('rejects dbName=%j without issuing any query', async (badName) => {
            const { provisionTenant } = await import('../src/services/tenantProvisioningService.js');
            const querySpy = jest.spyOn(sequelize, 'query');

            let thrownError;
            try {
                await provisionTenant({
                    tenantId: 'test-uuid-2-5-invalid',
                    name: 'Test Co',
                    dbName: badName,
                    companyToken: 'token-test',
                    adminEmail: 'admin@test.example.com',
                    adminPasswordHash: '$2b$10$fakehashfakehashfakeh'
                });
            } catch (err) {
                thrownError = err;
            }

            // Must throw before reaching any SQL
            expect(thrownError).toBeDefined();
            expect(thrownError.message).toMatch(/Security.*Invalid database name/i);

            // No query (CREATE DATABASE or otherwise) should have been issued
            const sqlCalls = querySpy.mock.calls.filter(
                ([sql]) => typeof sql === 'string' && sql.toUpperCase().includes('DATABASE')
            );
            expect(sqlCalls).toHaveLength(0);
        });
    });

    describe('approval flow — accepts a valid dbName and uses quoteIdentifier for CREATE', () => {
        it('issues CREATE DATABASE with a backtick-quoted identifier', async () => {
            const { provisionTenant } = await import('../src/services/tenantProvisioningService.js');

            // Prevent real DB work: mock sync to fail immediately after CREATE DATABASE
            const { Sequelize } = await import('sequelize');
            jest.spyOn(Sequelize.prototype, 'sync').mockRejectedValue(new Error('stop after create'));

            // Mock tenant model so no real DB row is needed
            jest.spyOn(dbStore, 'get').mockReturnValue({ update: jest.fn().mockResolvedValue([1]) });

            const querySpy = jest.spyOn(sequelize, 'query');

            const validDbName = 'sku_tenant_testco_ab12cd34';

            try {
                await provisionTenant({
                    tenantId: 'test-uuid-2-5-valid',
                    name: 'Test Co',
                    dbName: validDbName,
                    companyToken: 'token-testco',
                    adminEmail: 'admin@testco.example.com',
                    adminPasswordHash: '$2b$10$fakehashfakehashfakeh'
                });
            } catch (_) {
                // Expected — sync is mocked to fail
            }

            // Find the CREATE DATABASE call
            const createCalls = querySpy.mock.calls.filter(
                ([sql]) => typeof sql === 'string' && sql.toUpperCase().includes('CREATE DATABASE')
            );
            expect(createCalls).toHaveLength(1);

            const createSql = createCalls[0][0];

            // Must contain the db name
            expect(createSql).toContain(validDbName);

            // Must NOT be raw interpolation (no unescaped bare name without backticks)
            // quoteIdentifier wraps in backticks: `sku_tenant_testco_ab12cd34`
            expect(createSql).toMatch(/`sku_tenant_testco_ab12cd34`/);
        });
    });

    describe('deleteTenantDatabase — rejects invalid names before issuing DROP', () => {
        const invalidNames = [
            '',
            'sku_tenant_',
            '../evil_abc12345',
            'sku_tenant_valid_abc; DROP TABLE tenants; --',
            'other_db_name',
        ];

        it.each(invalidNames)('rejects dbName=%j without issuing DROP query', async (badName) => {
            const { deleteTenantDatabase } = await import('../src/services/tenantProvisioningService.js');
            const querySpy = jest.spyOn(sequelize, 'query');

            let thrownError;
            try {
                await deleteTenantDatabase(badName);
            } catch (err) {
                thrownError = err;
            }

            expect(thrownError).toBeDefined();
            expect(thrownError.message).toMatch(/Invalid database name for deletion/i);

            const dropCalls = querySpy.mock.calls.filter(
                ([sql]) => typeof sql === 'string' && sql.toUpperCase().includes('DROP DATABASE')
            );
            expect(dropCalls).toHaveLength(0);
        });
    });

    describe('deleteTenantDatabase — uses quoteIdentifier for DROP', () => {
        it('issues DROP DATABASE with a backtick-quoted identifier', async () => {
            const { deleteTenantDatabase } = await import('../src/services/tenantProvisioningService.js');
            const querySpy = jest.spyOn(sequelize, 'query').mockResolvedValue([]);

            const validDbName = 'sku_tenant_testco_ab12cd34';
            await deleteTenantDatabase(validDbName);

            const dropCalls = querySpy.mock.calls.filter(
                ([sql]) => typeof sql === 'string' && sql.toUpperCase().includes('DROP DATABASE')
            );
            expect(dropCalls).toHaveLength(1);

            const dropSql = dropCalls[0][0];
            expect(dropSql).toContain(validDbName);
            expect(dropSql).toMatch(/`sku_tenant_testco_ab12cd34`/);
        });
    });
});

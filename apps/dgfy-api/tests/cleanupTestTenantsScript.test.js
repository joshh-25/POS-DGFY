import {
    TEST_TENANT_DB_PREFIX,
    isSafeTestTenantDbName,
    buildTestTenantCleanupPlan
} from '../scripts/cleanup-test-tenants.js';

describe('cleanup-test-tenants safety helpers', () => {
    it('accepts only safe test tenant database names', () => {
        expect(isSafeTestTenantDbName(`${TEST_TENANT_DB_PREFIX}alpha_01`)).toBe(true);
        expect(isSafeTestTenantDbName('production_main')).toBe(false);
        expect(isSafeTestTenantDbName('test_tenant_alpha;DROP DATABASE prod')).toBe(false);
        expect(isSafeTestTenantDbName('')).toBe(false);
    });

    it('builds cleanup plan for stale tenant rows and orphan test databases only', () => {
        const plan = buildTestTenantCleanupPlan({
            tenants: [
                { id: 't1', name: 'Test A', db_name: 'test_tenant_a' },
                { id: 't2', name: 'Prod A', db_name: 'production_main' },
                { id: 't3', name: 'Test B', db_name: 'test_tenant_b' }
            ],
            databases: [
                'test_tenant_b',
                'test_tenant_orphan',
                'production_main'
            ]
        });

        expect(plan.staleTenantRows).toEqual([
            expect.objectContaining({ id: 't1', db_name: 'test_tenant_a' })
        ]);
        expect(plan.orphanDatabases).toEqual(['test_tenant_orphan']);
    });
});

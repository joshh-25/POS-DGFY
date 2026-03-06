import {
    getSchemaIndexHealthService,
    applySchemaIndexHealthStatus
} from '../src/services/schemaIndexHealthService.js';

describe('Health schema index audit helpers', () => {
    it('returns schemaIndexes payload in the expected shape', () => {
        const payload = getSchemaIndexHealthService({
            status: 'degraded',
            message: 'Required index contract has missing indexes.',
            enabled: true,
            last_checked_at: '2026-03-03T00:00:00.000Z',
            tenants_checked: 2,
            missing_count: 1,
            missing: [{ database: 'tenant_a', table: 'items', columns: 'folder_id', type: 'single' }]
        });

        expect(payload).toEqual({
            status: 'degraded',
            message: 'Required index contract has missing indexes.',
            enabled: true,
            last_checked_at: '2026-03-03T00:00:00.000Z',
            tenants_checked: 2,
            missing_count: 1,
            missing: [{ database: 'tenant_a', table: 'items', columns: 'folder_id', type: 'single' }]
        });
    });

    it('flips health.success to false when schema index status is degraded', () => {
        const health = { success: true };
        const result = applySchemaIndexHealthStatus(health, {
            enabled: true,
            status: 'degraded'
        });

        expect(result.success).toBe(false);
    });
});

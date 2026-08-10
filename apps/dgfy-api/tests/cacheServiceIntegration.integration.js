import test from 'node:test';
import assert from 'node:assert';
import cacheService from '../src/services/cacheService.js';
import dbStore from '../src/utils/dbStore.js';
import { initializeRedis, getRedisClient, closeRedis } from '../src/config/redis.js';

test('Cache Service Integration - Real-world Scoping', async (t) => {
    // Setup
    process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
    await initializeRedis();
    const client = getRedisClient();

    if (!client) {
        console.warn('Skipping integration tests: Redis is not available.');
        return;
    }

    await cacheService.clear('tenant:*');
    await cacheService.clear('system:*');

    t.after(async () => {
        await cacheService.clear('tenant:*');
        await cacheService.clear('system:*');
        await closeRedis();
    });

    await t.test('should scope keys to the active tenant', async () => {
        await dbStore.run({ tenantId: 1, tenantName: 'Tenant A' }, async () => {
            const success = await cacheService.set('user_123', 'tenant_1_data');
            assert.strictEqual(success, true);

            const val = await cacheService.get('user_123');
            assert.strictEqual(val, 'tenant_1_data');

            const rawVal = await client.get('tenant:1:user_123');
            assert.strictEqual(rawVal, 'tenant_1_data');
        });

        await dbStore.run({ tenantId: 2, tenantName: 'Tenant B' }, async () => {
            await cacheService.set('user_123', 'tenant_2_data');

            const val = await cacheService.get('user_123');
            assert.strictEqual(val, 'tenant_2_data');

            const rawVal = await client.get('tenant:2:user_123');
            assert.strictEqual(rawVal, 'tenant_2_data');
        });

        await dbStore.run({ tenantId: 1 }, async () => {
            const val = await cacheService.get('user_123');
            assert.strictEqual(val, 'tenant_1_data');
        });
    });

    await t.test('should fall back to system scope when no tenant context', async () => {
        await cacheService.set('global_config', 'system_level_value');
        const val = await cacheService.get('global_config');
        assert.strictEqual(val, 'system_level_value');

        const rawVal = await client.get('system:global_config');
        assert.strictEqual(rawVal, 'system_level_value');
    });

    await t.test('clear() should ONLY affect keys in the current scope', async () => {
        await dbStore.run({ tenantId: 1 }, async () => {
            await cacheService.set('session:abc', 't1_abc');
            await cacheService.set('session:def', 't1_def');
            await cacheService.set('other_data', 't1_other');
        });

        await dbStore.run({ tenantId: 2 }, async () => {
            await cacheService.set('session:abc', 't2_abc');
        });

        await cacheService.set('session:xyz', 'sys_xyz');

        let deletedCount = 0;
        await dbStore.run({ tenantId: 1 }, async () => {
            deletedCount = await cacheService.clear('session:*');
        });

        assert.strictEqual(deletedCount, 2);

        await dbStore.run({ tenantId: 1 }, async () => {
            assert.strictEqual(await cacheService.get('session:abc'), null);
            assert.strictEqual(await cacheService.get('session:def'), null);
            assert.strictEqual(await cacheService.get('other_data'), 't1_other');
        });

        await dbStore.run({ tenantId: 2 }, async () => {
            assert.strictEqual(await cacheService.get('session:abc'), 't2_abc');
        });

        assert.strictEqual(await cacheService.get('session:xyz'), 'sys_xyz');
    });
});

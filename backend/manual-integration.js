import cacheService from './src/services/cacheService.js';
import dbStore from './src/utils/dbStore.js';
import { initializeRedis, getRedisClient, closeRedis } from './src/config/redis.js';

async function run() {
    console.log('Connecting to Redis...');
    process.env.REDIS_URL = 'redis://localhost:6379';
    await initializeRedis();
    const client = getRedisClient();

    if (!client) {
        console.error('Redis connection failed.');
        process.exit(1);
    }

    console.log('Client connected:', !!client);
    console.log('Cache available:', cacheService.isAvailable());

    await cacheService.clear('tenant:*');
    await cacheService.clear('system:*');

    console.log('\n--- Testing Tenant Scoping ---');
    await dbStore.run({ tenantId: 999, tenantName: 'Test Tenant' }, async () => {
        await cacheService.set('test_key', 'test_value');
        console.log('GET test_key ->', await cacheService.get('test_key'));

        const raw = await client.get('tenant:999:test_key');
        console.log('RAW REDIS tenant:999:test_key ->', raw);
        if (raw !== 'test_value') throw new Error('Scoping failed!');
    });

    console.log('\n--- Testing System Fallback ---');
    await cacheService.set('global_key', 'global_val');
    console.log('GET global_key ->', await cacheService.get('global_key'));
    const rawGlobal = await client.get('system:global_key');
    console.log('RAW REDIS system:global_key ->', rawGlobal);
    if (rawGlobal !== 'global_val') throw new Error('System scoping failed!');

    console.log('\n--- Testing Scoped Clear ---');
    await dbStore.run({ tenantId: 999 }, async () => {
        const deleted = await cacheService.clear('*');
        console.log('Deleted keys from tenant 999:', deleted);

        const check = await cacheService.get('test_key');
        console.log('GET test_key after clear ->', check);
        if (check !== null) throw new Error('Clear failed!');
    });

    const checkGlobal = await cacheService.get('global_key');
    console.log('GET global_key after clear ->', checkGlobal);
    if (checkGlobal !== 'global_val') throw new Error('Clear deleted wrong keys!');

    console.log('\n✅ ALL INTEGRATION TESTS PASSED!');
    await closeRedis();
    process.exit(0);
}

run().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});

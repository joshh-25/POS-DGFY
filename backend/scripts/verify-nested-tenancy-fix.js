
import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
// Mock dbStore before importing service
dbStore.getStore = () => ({ tenantId: 'tenant_123' });

// We need to mock the redis config to intercept calls
// Since ES modules are tricky with mocking, we will use a different approach for this isolated test
// We'll manually import the service and monkey-patch the redis client if possible, 
// or simpler: just create a test that IMPORTS the service and uses a modified dbStore to check the key.

// Actually, since we modified the service to use `getRedisClient`, we can try to mock that module.
// But doing that in a standalone script without Jest is hard.

// Alternative: Create a script that uses the actual service but we intercept the Cache Key generation if checking the code,
// OR we just use unit test logic.

// Let's try a simpler approach: 
// We will rely on the fact that I changed the code.
// I will create a test that imports the service, mocks `dbStore` usage, and mocks `getRedisClient`.

import * as redisConfig from '../src/config/redis.js';

// Mock Redis Client
const mockRedis = {
    get: async (key) => {
        console.log(`[MockRedis] GET called with key: ${key}`);
        return null;
    },
    setEx: async (key, ttl, value) => {
        console.log(`[MockRedis] SETEX called with key: ${key}`);
    },
    del: async (key) => {
        console.log(`[MockRedis] DEL called with key: ${key}`);
    }
};

// Override getRedisClient
redisConfig.getRedisClient = () => mockRedis;
redisConfig.isRedisConnected = () => true;

// Now import the service (it will use the mocked redisConfig)
import { validateComposition, buildDependencyGraph } from '../src/services/compositionValidationService.js';

async function runTest() {
    console.log('--- Verifying Redis Key Scoping ---');

    // Test Case 1: Tenant A
    console.log('\nTesting with Tenant: tenant_A');
    dbStore.getStore = () => ({ tenantId: 'tenant_A' }); // Mock Context

    await buildDependencyGraph(); // Should trigger redis.get with tenant_A key

    // Test Case 2: Tenant B
    console.log('\nTesting with Tenant: tenant_B');
    dbStore.getStore = () => ({ tenantId: 'tenant_B' }); // Mock Context

    await buildDependencyGraph(); // Should trigger redis.get with tenant_B key

    // Test Case 3: No Tenant (Global Fallback)
    console.log('\nTesting with No Tenant (Global)');
    dbStore.getStore = () => undefined; // Mock Context

    await buildDependencyGraph(); // Should trigger redis.get with global key

    console.log('\n--- Verification Complete ---');
}

runTest().catch(console.error);

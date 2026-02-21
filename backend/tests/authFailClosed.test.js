import { jest } from '@jest/globals';
import request from 'supertest';

// Define the mock factory
const mockCacheService = {
    getCritical: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    isRedisConnected: jest.fn(() => true),
    initializeRedis: jest.fn(() => Promise.resolve(true)),
    getRedisClient: jest.fn(),
    isAvailable: jest.fn(() => true),
    del: jest.fn(),
    clear: jest.fn(),
    getMultiple: jest.fn(),
    setMultiple: jest.fn()
};

// Mock the module before importing app
jest.unstable_mockModule('../src/services/cacheService.js', () => mockCacheService);

// Import dependencies AFTER mocking
// We use dynamic imports because we need the mock to apply first
const { default: app } = await import('../src/server.js');
const { default: sequelize } = await import('../src/config/database.js');

describe('Auth Fail-Closed (Redis Down)', () => {
    beforeAll(async () => {
        // We need database connection because app might try to use it
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize.close();
    });

    test('should return 500 when Redis is disconnected (Fail-Closed)', async () => {
        // Setup: Simulate Redis being disconnected
        mockCacheService.isAvailable.mockReturnValue(false);
        // We also mock getCritical to throw, just in case logic slips through
        mockCacheService.getCritical.mockRejectedValue(new Error('Redis connection failed'));

        // Ensure REDIS_URL is set so the check runs (simulating enabled but broken Redis)
        const originalRedisUrl = process.env.REDIS_URL;
        process.env.REDIS_URL = 'redis://localhost:6379';

        // We can use any token string because blacklist check happens before verification
        const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.signature';

        try {
            const response = await request(app)
                .get('/api/v1/users/me') // Use a protected route
                .set('Authorization', `Bearer ${token}`);

            // Expect 500 Internal Server Error (or whatever the global error handler returns)
            // The key is that it should NOT be 401 (or 200/404 if it bypassed checks)
            // If it was fail-open (returning false), it would likely hit 401 (Invalid token) later
            // or something else. But here we want the *Redis error* to propagate.

            // If the global error handler catches it, it usually returns 500.
            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
        } finally {
            // Restore env var
            process.env.REDIS_URL = originalRedisUrl;
        }
    });
});

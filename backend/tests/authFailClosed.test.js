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
jest.unstable_mockModule('../src/services/cacheService.js', () => ({
    default: mockCacheService,
    ...mockCacheService
}));

// Import dependencies AFTER mocking
// We use dynamic imports because we need the mock to apply first
const { default: app } = await import('../src/server.js');
const { default: sequelize } = await import('../src/config/database.js');

describe('Auth Redis Failure Policy', () => {
    beforeAll(async () => {
        // We need database connection because app might try to use it
        await sequelize.authenticate();
    });

    afterAll(async () => {
        await sequelize.close();
    });

    test('should fail open by default (non-production) when Redis is disconnected', async () => {
        // Setup: Simulate Redis being disconnected
        mockCacheService.isAvailable.mockReturnValue(false);
        // We also mock getCritical to throw, just in case logic slips through
        mockCacheService.getCritical.mockRejectedValue(new Error('Redis connection failed'));

        // Ensure REDIS_URL is set so the check runs (simulating enabled but broken Redis)
        const originalRedisUrl = process.env.REDIS_URL;
        const originalNodeEnv = process.env.NODE_ENV;
        const originalFailureMode = process.env.AUTH_BLACKLIST_FAILURE_MODE;
        process.env.REDIS_URL = 'redis://localhost:6379';
        process.env.NODE_ENV = 'test';
        delete process.env.AUTH_BLACKLIST_FAILURE_MODE;

        // We can use any token string because blacklist check happens before verification
        const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.signature';

        try {
            const response = await request(app)
                .get('/api/v1/users/me') // Use a protected route
                .set('Authorization', `Bearer ${token}`);

            // Fail-open allows auth flow to continue, and this fake token is rejected as invalid JWT.
            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        } finally {
            // Restore env vars
            process.env.REDIS_URL = originalRedisUrl;
            process.env.NODE_ENV = originalNodeEnv;
            process.env.AUTH_BLACKLIST_FAILURE_MODE = originalFailureMode;
        }
    });

    test('should return 503 when fail-closed mode is explicitly enabled and Redis is disconnected', async () => {
        mockCacheService.isAvailable.mockReturnValue(false);
        mockCacheService.getCritical.mockRejectedValue(new Error('Redis connection failed'));

        const originalRedisUrl = process.env.REDIS_URL;
        const originalFailureMode = process.env.AUTH_BLACKLIST_FAILURE_MODE;
        process.env.REDIS_URL = 'redis://localhost:6379';
        process.env.AUTH_BLACKLIST_FAILURE_MODE = 'fail_closed';

        const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.signature';

        try {
            const response = await request(app)
                .get('/api/v1/users/me')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(503);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Service unavailable');
        } finally {
            process.env.REDIS_URL = originalRedisUrl;
            process.env.AUTH_BLACKLIST_FAILURE_MODE = originalFailureMode;
        }
    });

    test('should return 503 in fail-closed mode when REDIS_URL is missing', async () => {
        mockCacheService.isAvailable.mockReturnValue(false);

        const originalRedisUrl = process.env.REDIS_URL;
        const originalFailureMode = process.env.AUTH_BLACKLIST_FAILURE_MODE;
        delete process.env.REDIS_URL;
        process.env.AUTH_BLACKLIST_FAILURE_MODE = 'fail_closed';

        const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.signature';

        try {
            const response = await request(app)
                .get('/api/v1/users/me')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(503);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Service unavailable');
        } finally {
            if (originalRedisUrl === undefined) {
                delete process.env.REDIS_URL;
            } else {
                process.env.REDIS_URL = originalRedisUrl;
            }
            if (originalFailureMode === undefined) {
                delete process.env.AUTH_BLACKLIST_FAILURE_MODE;
            } else {
                process.env.AUTH_BLACKLIST_FAILURE_MODE = originalFailureMode;
            }
        }
    });
});

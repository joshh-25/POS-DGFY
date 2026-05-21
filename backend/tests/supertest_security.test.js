import request from 'supertest';
import { jest } from '@jest/globals';
import { createTestTenant, destroyTestTenant } from './helpers/testTenantHelper.js';

jest.setTimeout(120000);

// Define mocks
const mockVerifyToken = jest.fn();
const mockIsTokenBlacklisted = jest.fn().mockResolvedValue(false);

// Manual mock of ALL exports to avoid requireActual/ESM issues
jest.unstable_mockModule('../src/services/authService.js', () => ({
    verifyToken: mockVerifyToken,
    isTokenBlacklisted: mockIsTokenBlacklisted,
    // Stubs for other exports used by dependencies
    hashPassword: jest.fn().mockResolvedValue('hashed'),
    comparePassword: jest.fn().mockResolvedValue(true),
    generateToken: jest.fn().mockReturnValue('token'),
    generateRefreshToken: jest.fn().mockReturnValue('refresh'),
    verifyRefreshToken: jest.fn(),
    registerUser: jest.fn(),
    loginUser: jest.fn(),
    refreshUserToken: jest.fn(),
    blacklistToken: jest.fn(),
}));

// Helper placeholders
let app;
let sequelize;
let User;
let initializeRedis;
let closeRedis;
let getRedisClient;
let isRedisConnected;

describe('Security & Infrastructure Integration Tests', () => {
    let testUser;
    let testTenantContext;
    let companyToken;

    process.env.NODE_ENV = 'test';

    beforeAll(async () => {
        // Import dependencies
        const redisConfig = await import('../src/config/redis.js');
        initializeRedis = redisConfig.initializeRedis;
        closeRedis = redisConfig.closeRedis;
        getRedisClient = redisConfig.getRedisClient;
        isRedisConnected = redisConfig.isRedisConnected;

        const dbModels = await import('../src/models/index.js');
        sequelize = dbModels.sequelize;
        User = dbModels.User;

        // 1. Redis
        await initializeRedis();
        // Since we are running manually, ensure we wait a bit or check connection
        if (!isRedisConnected()) {
            // Try connecting explicitly if initialize didn't throw but failed silently (though it throws)
            const client = getRedisClient();
            if (client) await client.connect().catch(() => { });
        }

        // 2. DB
        await sequelize.authenticate();
        testTenantContext = await createTestTenant('security');
        companyToken = testTenantContext.token;

        // 3. User
        const timestamp = Date.now();
        testUser = await testTenantContext.models.User.create({
            username: `sec_admin_${timestamp}`,
            password_hash: 'hash_placeholder',
            email: `sec_${timestamp}@check.com`,
            phone_number: '+63 917 000 3000',
            role: 'admin',
            is_active: true
        });

        // 4. Config Mock
        mockVerifyToken.mockReturnValue({
            user_id: testUser.user_id,
            tenant_id: testTenantContext.tenant.id,
            role: 'admin',
            type: 'access'
        });

        // 5. Server
        const serverModule = await import('../src/server.js');
        app = serverModule.default;
    });

    afterAll(async () => {
        if (testUser) {
            await testTenantContext?.models?.User?.destroy({ where: { user_id: testUser.user_id } }).catch(() => { });
        }
        if (testTenantContext) {
            await destroyTestTenant(testTenantContext);
        }
        await closeRedis();
        await sequelize.close();
    });

    describe('Finding 7.3: Analytics Operator Injection', () => {
        it('should sanitize query params and prevent 500/injection', async () => {
            if (!app) throw new Error('App not initialized');

            const res = await request(app)
                .get('/api/v1/analytics/anomalies')
                .set('x-company-token', companyToken)
                .set('Authorization', 'Bearer valid_mock_token')
                .query({ 'category[$ne]': 'null' });

            expect(res.status).not.toBe(500);
            expect(res.status).not.toBe(401);
        });

        it('should allow valid string category', async () => {
            if (!app) return;
            const res = await request(app)
                .get('/api/v1/analytics/anomalies')
                .set('x-company-token', companyToken)
                .set('Authorization', 'Bearer valid_mock_token')
                .query({ category: 'Electronics' });

            expect(res.status).toBe(200);
        });
    });

    describe('Finding 7.2: Report Date Range Validation', () => {
        it('should handle large date ranges without crashing', async () => {
            if (!app) return;
            const res = await request(app)
                .get('/api/v1/reports/expiry')
                .set('x-company-token', companyToken)
                .set('Authorization', 'Bearer valid_mock_token')
                .query({
                    startDate: '2020-01-01',
                    endDate: '2025-01-01'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('Finding 8.2: Distributed Locking', () => {
        it('should correctly acquire and release locks in Redis', async () => {
            const client = getRedisClient();
            const lockKey = 'test:distributed:lock';
            const ttl = 5;

            await client.del(lockKey);

            const acquired = await client.set(lockKey, 'LOCKED', { NX: true, EX: ttl });
            expect(acquired).toBe('OK');

            const val = await client.get(lockKey);
            expect(val).toBe('LOCKED');

            const duplicate = await client.set(lockKey, 'LOCKED', { NX: true, EX: ttl });
            expect(duplicate).toBeNull();

            await client.del(lockKey);

            const reAcquire = await client.set(lockKey, 'LOCKED', { NX: true, EX: ttl });
            expect(reAcquire).toBe('OK');
        });
    });
});

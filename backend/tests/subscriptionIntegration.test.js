import { jest } from '@jest/globals';

// 1. Mock axios FIRST
const mockAxiosGet = jest.fn();
const mockAxiosPost = jest.fn();
jest.unstable_mockModule('axios', () => ({
    default: {
        get: mockAxiosGet,
        post: mockAxiosPost,
        create: jest.fn().mockReturnThis(),
        interceptors: {
            request: { use: jest.fn(), eject: jest.fn() },
            response: { use: jest.fn(), eject: jest.fn() }
        }
    }
}));

// 2. Mock TenantConnector to always return the main sequelize instance
// This is the most reliable way to handle multi-tenancy in a single-DB test environment
jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
    default: {
        getConnection: jest.fn().mockImplementation(async () => {
            const { sequelize } = await import('../src/models/index.js');
            return sequelize;
        }),
        getPoolStats: jest.fn().mockReturnValue({ utilizationPercent: 0 }),
        startPeriodicCleanup: jest.fn(),
        closeAll: jest.fn()
    }
}));

// 3. Disable internal mocks
process.env.MOCK_PAYPAL = 'false';
process.env.NODE_ENV = 'test';

// 4. Load App and Models
import request from 'supertest';
const { default: app } = await import('../src/server.js');
const { sequelize, Tenant, User } = await import('../src/models/index.js');
const { Op } = await import('sequelize');

describe('Subscription Integration — Proof of User Engagement Impact', () => {
    let authToken;
    let testTenant;
    let testUser;
    const testSuffix = Date.now();

    beforeAll(async () => {
        await sequelize.authenticate();

        // 5. Cleanup
        await User.destroy({ where: { username: { [Op.like]: 'proof_admin_%' } } });
        await Tenant.destroy({ where: { name: { [Op.like]: '%Proof of Concept%' } } });
        await Tenant.destroy({ where: { name: ['Paid Premium Co', 'Unpaid Premium Co'] } });
        await User.destroy({ where: { email: ['unpaid@premium.test', 'paid@premium.test'] } });

        // 6. Setup test tenant (Use unique db_name but the mock will handle it)
        testTenant = await Tenant.create({
            id: `proof-${testSuffix}`,
            name: `Proof of Concept ${testSuffix}`,
            domain: `proof-${testSuffix}`,
            db_name: `db-${testSuffix}`, // Connector Mock will redirect this to Landlord DB
            company_token: `token-${testSuffix}`,
            status: 'active',
            admin_email: `admin@${testSuffix}.test`,
            plan: 'standard',
            subscription_status: 'inactive'
        });

        testUser = await User.create({
            username: `proof_admin_${testSuffix}`,
            email: `admin@${testSuffix}.test`,
            password_hash: '$2y$10$abcdefghijklmnopqrstuv',
            role: 'admin',
            is_active: true,
            is_master_admin: true
        });

        const authMod = await import('../src/services/authService.js');
        authToken = authMod.generateToken(testUser);

        mockAxiosPost.mockResolvedValue({
            data: { access_token: 'fake_jwt', expires_in: 3600 }
        });
    });

    afterAll(async () => {
        if (testUser) await User.destroy({ where: { user_id: testUser.user_id } });
        if (testTenant) await Tenant.destroy({ where: { id: testTenant.id } });
        await Tenant.destroy({ where: { name: ['Paid Premium Co', 'Unpaid Premium Co'] } });
        await User.destroy({ where: { email: ['unpaid@premium.test', 'paid@premium.test'] } });
        await sequelize.close();
    });

    describe('GATE 1: upgradeToPremium', () => {

        it('should correctly block UNPAID upgrades (Engagement: Blocked)', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { status: 'APPROVAL_PENDING', id: 'SUB-ERR' }
            });

            const response = await request(app)
                .post('/api/v1/payments/upgrade')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-company-token', testTenant.company_token)
                .send({ subscriptionId: 'SUB-ERR' });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Subscription is not active');

            const refreshed = await Tenant.findByPk(testTenant.id);
            expect(refreshed.plan).toBe('standard');
        });

        it('should correctly allow ACTIVE upgrades (Engagement: Rewarded)', async () => {
            mockAxiosGet.mockResolvedValue({
                data: {
                    status: 'ACTIVE',
                    id: 'SUB-OK',
                    billing_info: { next_billing_time: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }
                }
            });

            const response = await request(app)
                .post('/api/v1/payments/upgrade')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-company-token', testTenant.company_token)
                .send({ subscriptionId: 'SUB-OK' });

            expect(response.status).toBe(200);

            const refreshed = await Tenant.findByPk(testTenant.id);
            expect(refreshed.plan).toBe('premium');
        });
    });

    describe('GATE 2: registerCompanyRequest', () => {

        it('should block Premium Registration on UNPAID status', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { status: 'APPROVAL_PENDING', id: 'SUB-REG-ERR' }
            });

            const response = await request(app)
                .post('/api/v1/admin/tenants/register')
                .send({
                    name: 'Unpaid Premium Co',
                    adminEmail: 'unpaid@premium.test',
                    adminPassword: 'Password123!',
                    plan: 'premium',
                    subscriptionId: 'SUB-REG-ERR'
                });

            expect(response.status).toBe(400);

            const t = await Tenant.findOne({ where: { name: 'Unpaid Premium Co' } });
            expect(t).toBeNull();
        });

        it('should allow Premium Registration on ACTIVE status', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { status: 'ACTIVE', id: 'SUB-REG-OK' }
            });

            const response = await request(app)
                .post('/api/v1/admin/tenants/register')
                .send({
                    name: 'Paid Premium Co',
                    adminEmail: 'paid@premium.test',
                    adminPassword: 'Password123!',
                    plan: 'premium',
                    subscriptionId: 'SUB-REG-OK'
                });

            expect(response.status).toBe(201);

            const t = await Tenant.findOne({ where: { name: 'Paid Premium Co' } });
            expect(t).not.toBeNull();
            expect(t.plan).toBe('premium');
        });
    });
});

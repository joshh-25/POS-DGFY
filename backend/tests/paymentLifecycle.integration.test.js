import { jest } from '@jest/globals';
import request from 'supertest';
import { Op } from 'sequelize';

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

jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
    default: {
        getConnection: jest.fn().mockImplementation(async () => {
            const { sequelize } = await import('../src/models/index.js');
            sequelize._tenantModelsInitialized = true;
            return sequelize;
        }),
        getPoolStats: jest.fn().mockReturnValue({ utilizationPercent: 0 }),
        startPeriodicCleanup: jest.fn(),
        closeAll: jest.fn()
    }
}));

jest.unstable_mockModule('../src/controllers/aiController.js', () => ({
    chat: jest.fn(),
    confirmAction: jest.fn(),
    cancelAction: jest.fn(),
    getConversations: jest.fn(),
    getConversation: jest.fn(),
    deleteConversation: jest.fn(),
    downloadExport: jest.fn(),
    getDiagnostics: jest.fn()
}));

process.env.MOCK_PAYPAL = 'false';
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = '';
process.env.PAYPAL_CLIENT_ID = 'test-client-id';
process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
process.env.PAYPAL_MODE = 'sandbox';
process.env.PAYPAL_STANDARD_PLAN_ID = 'P-STANDARD';
process.env.PAYPAL_PREMIUM_PLAN_ID = 'P-PREMIUM';

const SUB_MIGRATE_STANDARD_ID = 'SUB-MIGRATE-STANDARD';
const SUB_REACTIVATE_STANDARD_ID = 'SUB-REACTIVATE-STANDARD';

const ENGAGEMENT_EVENT_SAFE_ATTRIBUTES = [
    'event_type',
    'tenant_id',
    'subscription_id',
    'correlation_id',
    'source'
];

const { default: app } = await import('../src/server.js');
const { generateToken } = await import('../src/services/authService.js');
const {
    sequelize,
    Tenant,
    User,
    UserTenantMapping,
    EngagementEvent
} = await import('../src/models/index.js');

describe('Payment lifecycle integration (migrate + reactivate)', () => {
    const testSuffix = Date.now();
    const companyToken = `token-pay-lifecycle-${testSuffix}`;
    let tenant;
    let user;
    let authToken;

    beforeAll(async () => {
        await sequelize.authenticate();
        await Tenant.sync();
        await User.sync();
        await UserTenantMapping.sync();
        await EngagementEvent.sync();

        mockAxiosPost.mockResolvedValue({
            data: { access_token: 'fake_jwt', expires_in: 3600 }
        });
        mockAxiosGet.mockImplementation((url) => {
            if (url.includes(SUB_MIGRATE_STANDARD_ID)) {
                return Promise.resolve({
                    data: {
                        id: SUB_MIGRATE_STANDARD_ID,
                        status: 'ACTIVE',
                        plan: { plan_id: 'P-STANDARD' },
                        billing_info: {
                            next_billing_time: '2026-04-12T00:00:00.000Z'
                        }
                    }
                });
            }

            if (url.includes(SUB_REACTIVATE_STANDARD_ID)) {
                return Promise.resolve({
                    data: {
                        id: SUB_REACTIVATE_STANDARD_ID,
                        status: 'ACTIVE',
                        plan_id: 'P-STANDARD'
                    }
                });
            }

            return Promise.resolve({
                data: { id: 'UNKNOWN', status: 'APPROVAL_PENDING' }
            });
        });

        await EngagementEvent.destroy({
            where: {
                subscription_id: {
                    [Op.in]: [SUB_MIGRATE_STANDARD_ID, SUB_REACTIVATE_STANDARD_ID]
                }
            }
        });
        await UserTenantMapping.destroy({
            where: { email: `payments-lifecycle-${testSuffix}@test.local` }
        });
        await User.destroy({
            where: { email: `payments-lifecycle-${testSuffix}@test.local` }
        });
        await Tenant.destroy({
            where: { name: `Payments Lifecycle ${testSuffix}` }
        });

        tenant = await Tenant.create({
            id: `tenant-pay-lifecycle-${testSuffix}`,
            name: `Payments Lifecycle ${testSuffix}`,
            db_name: process.env.DB_NAME || 'sku_inventory_manager_test',
            company_token: companyToken,
            admin_email: `payments-lifecycle-${testSuffix}@test.local`,
            status: 'active',
            plan: 'standard',
            payment_method: 'manual',
            subscription_status: 'active'
        });

        user = await User.create({
            username: `payments_lifecycle_${testSuffix}`,
            email: `payments-lifecycle-${testSuffix}@test.local`,
            password_hash: '$2y$10$abcdefghijklmnopqrstuv',
            role: 'admin',
            is_active: true,
            is_master_admin: true
        });
        authToken = generateToken(user);
    });

    afterAll(async () => {
        await EngagementEvent.destroy({
            where: {
                tenant_id: tenant?.id || null,
                subscription_id: {
                    [Op.in]: [SUB_MIGRATE_STANDARD_ID, SUB_REACTIVATE_STANDARD_ID]
                }
            }
        });
        if (tenant) {
            await UserTenantMapping.destroy({ where: { tenant_id: tenant.id } });
            await Tenant.destroy({ where: { id: tenant.id } });
        }
        if (user) {
            await User.destroy({ where: { user_id: user.user_id } });
        }
        await sequelize.close();
    });

    it('migrates a manual active tenant to PayPal with persisted telemetry pair', async () => {
        const reqId = `req-migrate-integration-${testSuffix}`;
        await tenant.update({
            status: 'active',
            plan: 'standard',
            payment_method: 'manual',
            subscription_status: 'active',
            paypal_subscription_id: null
        });

        const response = await request(app)
            .post('/api/v1/payments/migrate-to-paypal')
            .set('Authorization', `Bearer ${authToken}`)
            .set('x-company-token', companyToken)
            .set('x-request-id', reqId)
            .send({ subscriptionId: SUB_MIGRATE_STANDARD_ID });

        expect(response.status).toBe(200);

        const refreshed = await Tenant.findByPk(tenant.id);
        expect(refreshed.payment_method).toBe('paypal');
        expect(refreshed.paypal_subscription_id).toBe(SUB_MIGRATE_STANDARD_ID);

        const events = await EngagementEvent.findAll({
            attributes: ENGAGEMENT_EVENT_SAFE_ATTRIBUTES,
            where: {
                tenant_id: tenant.id,
                subscription_id: SUB_MIGRATE_STANDARD_ID,
                correlation_id: reqId
            }
        });
        expect(events.map((event) => event.event_type).sort()).toEqual([
            'paypal_migration_attempted',
            'paypal_migration_succeeded'
        ]);
        expect(events.every((event) => event.source === 'payments.migrate')).toBe(true);
    });

    it('reactivates an inactive tenant via public route with persisted telemetry pair', async () => {
        const reqId = `req-reactivate-integration-${testSuffix}`;
        await tenant.update({
            status: 'inactive',
            plan: 'standard',
            payment_method: 'manual',
            subscription_status: 'inactive',
            paypal_subscription_id: null
        });

        const response = await request(app)
            .post('/api/v1/payments/reactivate-with-paypal')
            .set('x-company-token', companyToken)
            .set('x-request-id', reqId)
            .send({ subscriptionId: SUB_REACTIVATE_STANDARD_ID });

        expect(response.status).toBe(200);

        const refreshed = await Tenant.findByPk(tenant.id);
        expect(refreshed.status).toBe('active');
        expect(refreshed.subscription_status).toBe('active');
        expect(refreshed.payment_method).toBe('paypal');
        expect(refreshed.plan).toBe('standard');
        expect(refreshed.paypal_subscription_id).toBe(SUB_REACTIVATE_STANDARD_ID);

        const events = await EngagementEvent.findAll({
            attributes: ENGAGEMENT_EVENT_SAFE_ATTRIBUTES,
            where: {
                tenant_id: tenant.id,
                subscription_id: SUB_REACTIVATE_STANDARD_ID,
                correlation_id: reqId
            }
        });
        expect(events.map((event) => event.event_type).sort()).toEqual([
            'paypal_reactivation_attempted',
            'paypal_reactivation_succeeded'
        ]);
        expect(events.every((event) => event.source === 'payments.reactivate_with_paypal')).toBe(true);
    });
});

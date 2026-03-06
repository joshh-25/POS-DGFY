import { jest } from '@jest/globals';
import request from 'supertest';
import { Op } from 'sequelize';

// Avoid heavy AI controller dependencies when importing the full app.
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

process.env.NODE_ENV = 'test';
process.env.MOCK_PAYPAL = 'false';
process.env.PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';

const STRICT = process.env.CANARY_STRICT === 'true';
const ENGAGEMENT_EVENT_SAFE_ATTRIBUTES = [
    'event_type',
    'tenant_id',
    'subscription_id',
    'correlation_id',
    'source',
    'metadata',
    'idempotency_key',
    'event_time'
];
const REQUIRED_ENV = [
    'PAYPAL_CLIENT_ID',
    'PAYPAL_CLIENT_SECRET',
    'PAYPAL_WEBHOOK_ID',
    'PAYPAL_SANDBOX_ACTIVE_SUBSCRIPTION_ID'
];

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0 && STRICT) {
    throw new Error(`Canary strict mode: missing required env vars: ${missingEnv.join(', ')}`);
}

if (missingEnv.length > 0 && !STRICT) {
    // eslint-disable-next-line no-console
    console.warn(`[PayPalCanary] Skipping live canary (missing env): ${missingEnv.join(', ')}`);
}

const runDescribe = missingEnv.length === 0 ? describe : describe.skip;

jest.setTimeout(180000);

const { default: app } = await import('../src/server.js');
const { paypalService } = await import('../src/services/paypalService.js');
const { generateToken } = await import('../src/services/authService.js');
const {
    sequelize,
    Tenant,
    User,
    UserTenantMapping,
    EngagementEvent
} = await import('../src/models/index.js');

runDescribe('PayPal Sandbox Canary - Live Subscription Pipeline', () => {
    const testSuffix = Date.now();
    const activeSubscriptionId = process.env.PAYPAL_SANDBOX_ACTIVE_SUBSCRIPTION_ID;
    const nonActiveSubscriptionId = process.env.PAYPAL_SANDBOX_NONACTIVE_SUBSCRIPTION_ID || `I-CANARY-INVALID-${testSuffix}`;

    let tenant;
    let user;
    let token;

    beforeAll(async () => {
        await sequelize.authenticate();
        await sequelize.sync({ alter: true });

        await EngagementEvent.destroy({
            where: {
                subscription_id: {
                    [Op.in]: [activeSubscriptionId, nonActiveSubscriptionId]
                }
            }
        });

        await UserTenantMapping.destroy({
            where: {
                email: {
                    [Op.in]: [`canary-admin-${testSuffix}@sandbox.test`]
                }
            }
        });

        await User.destroy({
            where: {
                email: `canary-admin-${testSuffix}@sandbox.test`
            }
        });

        await Tenant.destroy({
            where: {
                name: `PayPal Canary ${testSuffix}`
            }
        });

        tenant = await Tenant.create({
            name: `PayPal Canary ${testSuffix}`,
            db_name: process.env.DB_NAME || 'sku_inventory_manager_test',
            company_token: `canary-token-${testSuffix}`,
            status: 'active',
            plan: 'standard',
            subscription_status: 'inactive',
            admin_email: `canary-admin-${testSuffix}@sandbox.test`
        });

        user = await User.create({
            username: `canary_admin_${testSuffix}`,
            email: `canary-admin-${testSuffix}@sandbox.test`,
            password_hash: '$2y$10$abcdefghijklmnopqrstuv',
            role: 'admin',
            is_active: true,
            is_master_admin: true
        });

        token = generateToken(user);
    });

    afterAll(async () => {
        if (tenant) {
            await EngagementEvent.destroy({
                where: {
                    subscription_id: {
                        [Op.in]: [activeSubscriptionId, nonActiveSubscriptionId]
                    },
                    tenant_id: tenant.id
                }
            });
        }

        if (tenant) {
            await UserTenantMapping.destroy({
                where: { tenant_id: tenant.id }
            });
        }

        if (user) {
            await User.destroy({ where: { user_id: user.user_id } });
        }

        if (tenant) {
            await Tenant.destroy({ where: { id: tenant.id } });
        }

        await sequelize.close();
    });

    it('verifies ACTIVE sandbox subscription and upgrades tenant', async () => {
        const reqId = `canary-active-${testSuffix}`;
        const liveStatus = await paypalService.verifySubscription(activeSubscriptionId);
        expect(liveStatus).toBeTruthy();
        expect(liveStatus.status).toBe('ACTIVE');

        const response = await request(app)
            .post('/api/v1/payments/upgrade')
            .set('Authorization', `Bearer ${token}`)
            .set('x-company-token', tenant.company_token)
            .set('x-request-id', reqId)
            .send({ subscriptionId: activeSubscriptionId });

        expect(response.status).toBe(200);

        const refreshed = await Tenant.findByPk(tenant.id);
        expect(refreshed.plan).toBe('premium');
        expect(refreshed.subscription_status).toBe('active');
        expect(refreshed.paypal_subscription_id).toBe(activeSubscriptionId);

        const events = await EngagementEvent.findAll({
            attributes: ENGAGEMENT_EVENT_SAFE_ATTRIBUTES,
            where: {
                tenant_id: tenant.id,
                subscription_id: activeSubscriptionId,
                correlation_id: reqId
            }
        });
        const eventTypes = events.map((e) => e.event_type).sort();
        expect(eventTypes).toEqual(['premium_upgrade_attempted', 'premium_upgrade_succeeded']);
        expect(events.every((e) => e.source === 'payments.upgrade')).toBe(true);
        expect(events.every((e) => e.correlation_id === reqId)).toBe(true);
    });

    it('rejects non-active/invalid subscription and records blocked event', async () => {
        const reqId = `canary-blocked-${testSuffix}`;
        const liveStatus = await paypalService.verifySubscription(nonActiveSubscriptionId);
        if (liveStatus && liveStatus.status === 'ACTIVE') {
            throw new Error(
                `Expected non-active canary ID but got ACTIVE (${nonActiveSubscriptionId}). Update PAYPAL_SANDBOX_NONACTIVE_SUBSCRIPTION_ID.`
            );
        }

        const response = await request(app)
            .post('/api/v1/payments/upgrade')
            .set('Authorization', `Bearer ${token}`)
            .set('x-company-token', tenant.company_token)
            .set('x-request-id', reqId)
            .send({ subscriptionId: nonActiveSubscriptionId });

        expect(response.status).toBe(400);

        const events = await EngagementEvent.findAll({
            attributes: ENGAGEMENT_EVENT_SAFE_ATTRIBUTES,
            where: {
                tenant_id: tenant.id,
                subscription_id: nonActiveSubscriptionId,
                correlation_id: reqId
            }
        });
        const eventTypes = events.map((e) => e.event_type).sort();
        expect(eventTypes).toEqual(['premium_upgrade_attempted', 'premium_upgrade_blocked_unpaid']);
        expect(events.every((e) => e.source === 'payments.upgrade')).toBe(true);
        expect(events.every((e) => e.correlation_id === reqId)).toBe(true);
    });
});

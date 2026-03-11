import { jest } from '@jest/globals';
import request from 'supertest';
import { Op } from 'sequelize';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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

const resolvePayPalPlanId = (subDetails = {}) => (
    subDetails?.plan_id
    || subDetails?.plan?.id
    || subDetails?.plan?.plan_id
    || subDetails?.billing_info?.plan_id
    || subDetails?.billing_info?.last_payment?.plan_id
    || null
);

const resolveSkuPlanFromSubscription = (subDetails = {}) => {
    const standardPlanId = process.env.PAYPAL_STANDARD_PLAN_ID;
    const premiumPlanId = process.env.PAYPAL_PREMIUM_PLAN_ID || process.env.PAYPAL_PLAN_ID;
    const paypalPlanId = resolvePayPalPlanId(subDetails);

    if (premiumPlanId && paypalPlanId === premiumPlanId) {
        return 'premium';
    }

    if (standardPlanId && paypalPlanId === standardPlanId) {
        return 'standard';
    }

    return null;
};

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
            db_name: process.env.NODE_ENV === 'test'
                ? 'sku_test'
                : (process.env.DB_NAME || 'sku_inventory_manager_test'),
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

        await tenant.update({
            status: 'active',
            plan: 'standard',
            payment_method: 'manual',
            subscription_status: 'active',
            paypal_subscription_id: null
        });

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
        let liveStatus = null;
        try {
            liveStatus = await paypalService.verifySubscription(nonActiveSubscriptionId);
        } catch (_error) {
            // Expected for invalid/non-active IDs in sandbox; continue with route assertion.
            liveStatus = null;
        }
        if (liveStatus?.status === 'ACTIVE') {
            throw new Error(
                `Expected non-active canary ID but got ACTIVE (${nonActiveSubscriptionId}). Update PAYPAL_SANDBOX_NONACTIVE_SUBSCRIPTION_ID.`
            );
        }

        await tenant.update({
            status: 'active',
            plan: 'standard',
            payment_method: 'manual',
            subscription_status: 'active',
            paypal_subscription_id: null
        });

        const response = await request(app)
            .post('/api/v1/payments/upgrade')
            .set('Authorization', `Bearer ${token}`)
            .set('x-company-token', tenant.company_token)
            .set('x-request-id', reqId)
            .send({ subscriptionId: nonActiveSubscriptionId });

        expect([400, 503]).toContain(response.status);

        const events = await EngagementEvent.findAll({
            attributes: ENGAGEMENT_EVENT_SAFE_ATTRIBUTES,
            where: {
                tenant_id: tenant.id,
                subscription_id: nonActiveSubscriptionId,
                correlation_id: reqId
            }
        });
        const eventTypes = events.map((e) => e.event_type).sort();
        if (response.status === 400) {
            expect(eventTypes).toEqual(['premium_upgrade_attempted', 'premium_upgrade_blocked_unpaid']);
        } else {
            expect(eventTypes).toEqual(['premium_upgrade_attempted', 'premium_upgrade_failed']);
        }
        expect(events.every((e) => e.source === 'payments.upgrade')).toBe(true);
        expect(events.every((e) => e.correlation_id === reqId)).toBe(true);
    });

    it('migrates manual billing to PayPal and records migrate telemetry pair', async () => {
        const reqId = `canary-migrate-${testSuffix}`;
        const liveStatus = await paypalService.verifySubscription(activeSubscriptionId);
        expect(liveStatus).toBeTruthy();
        expect(liveStatus.status).toBe('ACTIVE');

        const resolvedPlan = resolveSkuPlanFromSubscription(liveStatus);
        if (!resolvedPlan) {
            // eslint-disable-next-line no-console
            console.warn('[PayPalCanary] Skipping migrate assertion: sandbox subscription plan_id does not match configured SKU plans.');
            return;
        }

        await Tenant.update({
            status: 'active',
            plan: resolvedPlan,
            payment_method: 'manual',
            subscription_status: 'active',
            paypal_subscription_id: null
        }, {
            where: { id: tenant.id }
        });
        await tenant.reload();

        const response = await request(app)
            .post('/api/v1/payments/migrate-to-paypal')
            .set('Authorization', `Bearer ${token}`)
            .set('x-company-token', tenant.company_token)
            .set('x-request-id', reqId)
            .send({ subscriptionId: activeSubscriptionId });

        expect(response.status).toBe(200);

        const refreshed = await Tenant.findByPk(tenant.id);
        expect(refreshed.payment_method).toBe('paypal');
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
        expect(eventTypes).toEqual(['paypal_migration_attempted', 'paypal_migration_succeeded']);
        expect(events.every((e) => e.source === 'payments.migrate')).toBe(true);
        expect(events.every((e) => e.correlation_id === reqId)).toBe(true);
    });

    it('reactivates inactive tenant via public PayPal endpoint and records reactivation telemetry pair', async () => {
        const reqId = `canary-reactivate-${testSuffix}`;
        const liveStatus = await paypalService.verifySubscription(activeSubscriptionId);
        expect(liveStatus).toBeTruthy();
        expect(liveStatus.status).toBe('ACTIVE');

        const resolvedPlan = resolveSkuPlanFromSubscription(liveStatus);
        if (!resolvedPlan) {
            // eslint-disable-next-line no-console
            console.warn('[PayPalCanary] Skipping reactivation assertion: sandbox subscription plan_id does not match configured SKU plans.');
            return;
        }

        await tenant.update({
            status: 'inactive',
            plan: 'standard',
            payment_method: 'manual',
            subscription_status: 'inactive',
            paypal_subscription_id: null
        });

        const response = await request(app)
            .post('/api/v1/payments/reactivate-with-paypal')
            .set('x-company-token', tenant.company_token)
            .set('x-request-id', reqId)
            .send({ subscriptionId: activeSubscriptionId });

        expect(response.status).toBe(200);

        const refreshed = await Tenant.findByPk(tenant.id);
        expect(refreshed.status).toBe('active');
        expect(refreshed.subscription_status).toBe('active');
        expect(refreshed.payment_method).toBe('paypal');
        expect(refreshed.plan).toBe(resolvedPlan);
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
        expect(eventTypes).toEqual(['paypal_reactivation_attempted', 'paypal_reactivation_succeeded']);
        expect(events.every((e) => e.source === 'payments.reactivate_with_paypal')).toBe(true);
        expect(events.every((e) => e.correlation_id === reqId)).toBe(true);
    });
});

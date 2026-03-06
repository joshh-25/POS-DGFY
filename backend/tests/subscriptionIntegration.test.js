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

// 3. Mock AI Controller to avoid loading heavy dependencies in Jest
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

// 4. Mock provisioning and email side effects to keep this suite focused
const mockProvisionTenant = jest.fn();
jest.unstable_mockModule('../src/services/tenantProvisioningService.js', () => ({
    provisionTenant: mockProvisionTenant,
    deleteTenantDatabase: jest.fn()
}));

jest.unstable_mockModule('../src/services/emailService.js', () => ({
    isEmailConfigured: jest.fn().mockReturnValue(false),
    sendCompanyApprovedEmail: jest.fn(),
    sendCompanyRejectedEmail: jest.fn()
}));

// 5. Disable internal service mocks
process.env.MOCK_PAYPAL = 'false';
process.env.NODE_ENV = 'test';

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

// 6. Load App and Models
import request from 'supertest';
const { default: app } = await import('../src/server.js');
const { sequelize, Tenant, User, UserTenantMapping, EngagementEvent } = await import('../src/models/index.js');
const { Op } = await import('sequelize');

describe('Subscription Integration - Access Gates and Persisted State', () => {
    let authToken;
    let testTenant;
    let testUser;
    const testSuffix = Date.now();
    const SUB_ERR_ID = `SUB-ERR-${testSuffix}`;
    const SUB_OK_ID = `SUB-OK-${testSuffix}`;
    const SUB_REG_ERR_ID = `SUB-REG-ERR-${testSuffix}`;
    const SUB_REG_OK_ID = `SUB-REG-OK-${testSuffix}`;

    beforeAll(async () => {
        await sequelize.authenticate();
        await EngagementEvent.sync();

        await UserTenantMapping.destroy({
            where: {
                email: {
                    [Op.in]: [`admin@${testSuffix}.test`, 'unpaid@premium.test', 'paid@premium.test']
                }
            }
        });

        await User.destroy({ where: { username: { [Op.like]: 'proof_admin_%' } } });
        await EngagementEvent.destroy({
            where: {
                subscription_id: {
                    [Op.in]: [SUB_ERR_ID, SUB_OK_ID, SUB_REG_ERR_ID, SUB_REG_OK_ID]
                }
            }
        });
        await Tenant.destroy({ where: { name: { [Op.like]: '%Proof of Concept%' } } });
        await Tenant.destroy({ where: { name: ['Paid Premium Co', 'Unpaid Premium Co'] } });
        await Tenant.destroy({ where: { name: { [Op.like]: `Retry Missing Subscription Co ${testSuffix}%` } } });
        await User.destroy({ where: { email: ['unpaid@premium.test', 'paid@premium.test'] } });

        testTenant = await Tenant.create({
            id: `proof-${testSuffix}`,
            name: `Proof of Concept ${testSuffix}`,
            domain: `proof-${testSuffix}`,
            db_name: `db-${testSuffix}`,
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

        mockProvisionTenant.mockResolvedValue({
            id: 'mock-tenant-id',
            status: 'active'
        });
    });

    beforeEach(() => {
        mockAxiosGet.mockReset();
        mockProvisionTenant.mockClear();
    });

    afterAll(async () => {
        await EngagementEvent.destroy({
            where: {
                subscription_id: {
                    [Op.in]: [SUB_ERR_ID, SUB_OK_ID, SUB_REG_ERR_ID, SUB_REG_OK_ID]
                }
            }
        });
        await UserTenantMapping.destroy({
            where: {
                email: {
                    [Op.in]: [`admin@${testSuffix}.test`, 'unpaid@premium.test', 'paid@premium.test']
                }
            }
        });

        if (testUser) await User.destroy({ where: { user_id: testUser.user_id } });
        if (testTenant) await Tenant.destroy({ where: { id: testTenant.id } });
        await Tenant.destroy({ where: { name: ['Paid Premium Co', 'Unpaid Premium Co'] } });
        await Tenant.destroy({ where: { name: { [Op.like]: `Retry Missing Subscription Co ${testSuffix}%` } } });

        await User.destroy({ where: { email: ['unpaid@premium.test', 'paid@premium.test'] } });
        await sequelize.close();
    });

    describe('GATE 1: upgradeToPremium (Access Control)', () => {
        it('blocks unpaid upgrades and preserves non-premium state', async () => {
            const reqId = `upgrade-unpaid-${testSuffix}`;
            mockAxiosGet.mockResolvedValue({
                data: { status: 'APPROVAL_PENDING', id: SUB_ERR_ID }
            });

            const response = await request(app)
                .post('/api/v1/payments/upgrade')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-company-token', testTenant.company_token)
                .set('x-request-id', reqId)
                .send({ subscriptionId: SUB_ERR_ID });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Subscription is not active');

            const refreshed = await Tenant.findByPk(testTenant.id);
            expect(refreshed.plan).toBe('standard');
            expect(refreshed.subscription_status).toBe('inactive');
            expect(refreshed.paypal_subscription_id).toBeNull();

            const events = await EngagementEvent.findAll({
                attributes: ENGAGEMENT_EVENT_SAFE_ATTRIBUTES,
                where: {
                    subscription_id: SUB_ERR_ID,
                    tenant_id: testTenant.id,
                    correlation_id: reqId
                }
            });
            const eventTypes = events.map(e => e.event_type).sort();
            expect(eventTypes).toEqual(['premium_upgrade_attempted', 'premium_upgrade_blocked_unpaid']);
            expect(events.every(e => e.source === 'payments.upgrade')).toBe(true);
            expect(events.every(e => e.correlation_id === reqId)).toBe(true);
        });

        it('allows ACTIVE upgrades and persists billing state fields', async () => {
            const reqId = `upgrade-active-${testSuffix}`;
            const nextBillingIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            mockAxiosGet.mockResolvedValue({
                data: {
                    status: 'ACTIVE',
                    id: SUB_OK_ID,
                    billing_info: { next_billing_time: nextBillingIso }
                }
            });

            const response = await request(app)
                .post('/api/v1/payments/upgrade')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-company-token', testTenant.company_token)
                .set('x-request-id', reqId)
                .send({ subscriptionId: SUB_OK_ID });

            expect(response.status).toBe(200);

            const refreshed = await Tenant.findByPk(testTenant.id);
            expect(refreshed.plan).toBe('premium');
            expect(refreshed.subscription_status).toBe('active');
            expect(refreshed.paypal_subscription_id).toBe(SUB_OK_ID);
            const actualMs = new Date(refreshed.current_period_end).getTime();
            const expectedMs = new Date(nextBillingIso).getTime();
            expect(Math.abs(actualMs - expectedMs)).toBeLessThan(1000);
            expect(refreshed.billing_cycle_anchor).toBe(new Date(nextBillingIso).getDate());

            const events = await EngagementEvent.findAll({
                attributes: ENGAGEMENT_EVENT_SAFE_ATTRIBUTES,
                where: {
                    subscription_id: SUB_OK_ID,
                    tenant_id: testTenant.id,
                    correlation_id: reqId
                }
            });
            const eventTypes = events.map(e => e.event_type).sort();
            expect(eventTypes).toEqual(['premium_upgrade_attempted', 'premium_upgrade_succeeded']);
            expect(events.every(e => e.source === 'payments.upgrade')).toBe(true);
            expect(events.every(e => e.correlation_id === reqId)).toBe(true);
        });

        it('does not move current_period_end backward on ACTIVE upgrade when PayPal timestamp is older', async () => {
            const existingFutureEnd = new Date(Date.now() + 75 * 24 * 60 * 60 * 1000);
            await Tenant.update(
                {
                    plan: 'premium',
                    subscription_status: 'active',
                    paypal_subscription_id: SUB_OK_ID,
                    current_period_end: existingFutureEnd
                },
                { where: { id: testTenant.id } }
            );

            const olderPayPalBillingIso = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
            mockAxiosGet.mockResolvedValue({
                data: {
                    status: 'ACTIVE',
                    id: SUB_OK_ID,
                    billing_info: { next_billing_time: olderPayPalBillingIso }
                }
            });

            const response = await request(app)
                .post('/api/v1/payments/upgrade')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-company-token', testTenant.company_token)
                .send({ subscriptionId: SUB_OK_ID });

            expect(response.status).toBe(200);

            const refreshed = await Tenant.findByPk(testTenant.id);
            const refreshedMs = new Date(refreshed.current_period_end).getTime();
            const existingMs = existingFutureEnd.getTime();
            expect(refreshedMs + 1000).toBeGreaterThanOrEqual(existingMs);
        });

        it('dedupes engagement events for retried unpaid upgrade with same x-request-id', async () => {
            const reqId = `upgrade-retry-${testSuffix}`;
            mockAxiosGet.mockResolvedValue({
                data: { status: 'APPROVAL_PENDING', id: SUB_ERR_ID }
            });

            const first = await request(app)
                .post('/api/v1/payments/upgrade')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-company-token', testTenant.company_token)
                .set('x-request-id', reqId)
                .send({ subscriptionId: SUB_ERR_ID });

            const second = await request(app)
                .post('/api/v1/payments/upgrade')
                .set('Authorization', `Bearer ${authToken}`)
                .set('x-company-token', testTenant.company_token)
                .set('x-request-id', reqId)
                .send({ subscriptionId: SUB_ERR_ID });

            expect(first.status).toBe(400);
            expect(second.status).toBe(400);

            const events = await EngagementEvent.findAll({
                attributes: ENGAGEMENT_EVENT_SAFE_ATTRIBUTES,
                where: {
                    tenant_id: testTenant.id,
                    subscription_id: SUB_ERR_ID,
                    correlation_id: reqId
                }
            });

            const types = events.map(e => e.event_type).sort();
            expect(types).toEqual(['premium_upgrade_attempted', 'premium_upgrade_blocked_unpaid']);
        });
    });

    describe('GATE 2: registerCompanyRequest', () => {
        it('blocks premium registration when subscription is not ACTIVE', async () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
            const reqId = `register-unpaid-${testSuffix}`;
            try {
                mockAxiosGet.mockResolvedValue({
                    data: { status: 'APPROVAL_PENDING', id: SUB_REG_ERR_ID }
                });

                const response = await request(app)
                    .post('/api/v1/admin/tenants/register')
                    .set('x-request-id', reqId)
                    .send({
                        name: 'Unpaid Premium Co',
                        adminEmail: 'unpaid@premium.test',
                        adminPassword: 'Password123!',
                        plan: 'premium',
                        subscriptionId: SUB_REG_ERR_ID
                    });

                expect(response.status).toBe(400);

                const t = await Tenant.findOne({ where: { name: 'Unpaid Premium Co' } });
                expect(t).toBeNull();
                expect(mockProvisionTenant).not.toHaveBeenCalled();

                const events = await EngagementEvent.findAll({
                    attributes: ENGAGEMENT_EVENT_SAFE_ATTRIBUTES,
                    where: {
                        subscription_id: SUB_REG_ERR_ID,
                        correlation_id: reqId
                    }
                });
                const eventTypes = events.map(e => e.event_type).sort();
                expect(eventTypes).toEqual(['company_registration_attempted', 'company_registration_blocked_unpaid']);
                expect(events.every(e => e.source === 'admin.tenants.register')).toBe(true);
                expect(events.every(e => e.correlation_id === reqId)).toBe(true);
            } finally {
                errorSpy.mockRestore();
            }
        });

        it('dedupes engagement events for retried premium registration with missing subscription', async () => {
            const reqId = `register-retry-missing-sub-${testSuffix}`;

            const body = {
                name: `Retry Missing Subscription Co ${testSuffix}`,
                adminEmail: `retry-missing-sub-${testSuffix}@premium.test`,
                adminPassword: 'Password123!',
                plan: 'premium'
            };

            const first = await request(app)
                .post('/api/v1/admin/tenants/register')
                .set('x-request-id', reqId)
                .send(body);

            const second = await request(app)
                .post('/api/v1/admin/tenants/register')
                .set('x-request-id', reqId)
                .send(body);

            expect(first.status).toBe(400);
            expect(second.status).toBe(400);

            const events = await EngagementEvent.findAll({
                attributes: ENGAGEMENT_EVENT_SAFE_ATTRIBUTES,
                where: {
                    source: 'admin.tenants.register',
                    correlation_id: reqId
                }
            });

            const eventTypes = events.map(e => e.event_type).sort();
            expect(eventTypes).toEqual([
                'company_registration_attempted',
                'company_registration_blocked_missing_subscription'
            ]);
        });

        it('allows premium registration for ACTIVE subscription and calls provisioning', async () => {
            const reqId = `register-active-${testSuffix}`;
            const nextBillingIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
            mockAxiosGet.mockResolvedValue({
                data: {
                    status: 'ACTIVE',
                    id: SUB_REG_OK_ID,
                    billing_info: { next_billing_time: nextBillingIso }
                }
            });

            const response = await request(app)
                .post('/api/v1/admin/tenants/register')
                .set('x-request-id', reqId)
                .send({
                    name: 'Paid Premium Co',
                    adminEmail: 'paid@premium.test',
                    adminPassword: 'Password123!',
                    plan: 'premium',
                    subscriptionId: SUB_REG_OK_ID
                });

            expect(response.status).toBe(201);

            const t = await Tenant.findOne({ where: { name: 'Paid Premium Co' } });
            expect(t).not.toBeNull();
            expect(t.plan).toBe('premium');
            expect(t.subscription_status).toBe('active');
            expect(t.paypal_subscription_id).toBe(SUB_REG_OK_ID);
            const periodEndMs = new Date(t.current_period_end).getTime();
            expect(Math.abs(periodEndMs - new Date(nextBillingIso).getTime())).toBeLessThan(1000);
            expect(t.billing_cycle_anchor).toBe(new Date(nextBillingIso).getDate());
            expect(mockProvisionTenant).toHaveBeenCalledTimes(1);

            const events = await EngagementEvent.findAll({
                attributes: ENGAGEMENT_EVENT_SAFE_ATTRIBUTES,
                where: {
                    subscription_id: SUB_REG_OK_ID,
                    correlation_id: reqId
                }
            });
            const eventTypes = events.map(e => e.event_type).sort();
            expect(eventTypes).toEqual(['company_registration_attempted', 'company_registration_succeeded']);
            expect(events.every(e => e.source === 'admin.tenants.register')).toBe(true);
            expect(events.every(e => e.correlation_id === reqId)).toBe(true);

            const successEvent = events.find(
                e => e.event_type === 'company_registration_succeeded' && e.tenant_id === t.id
            );
            expect(successEvent).toBeDefined();
        });
    });

});

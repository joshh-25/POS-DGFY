import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

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

const mockProvisionTenant = jest.fn();
const mockDeleteTenantDatabase = jest.fn();
jest.unstable_mockModule('../src/services/tenantProvisioningService.js', () => ({
    provisionTenant: mockProvisionTenant,
    deleteTenantDatabase: mockDeleteTenantDatabase
}));

jest.unstable_mockModule('../src/services/emailService.js', () => ({
    isEmailConfigured: jest.fn().mockReturnValue(false),
    sendCompanyApprovedEmail: jest.fn(),
    sendCompanyRejectedEmail: jest.fn()
}));

process.env.MOCK_PAYPAL = 'false';
process.env.NODE_ENV = 'test';
process.env.PAYPAL_CLIENT_ID = 'test-client-id';
process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
process.env.PAYPAL_MODE = 'sandbox';

import request from 'supertest';
const { default: app } = await import('../src/server.js');
const { sequelize, Tenant, SystemSetting } = await import('../src/models/index.js');
const { Op } = await import('sequelize');

describe('Admin Tenant Lifecycle Integration - Parity', () => {
    let adminApiToken;
    const testSuffix = Date.now();
    const ADMIN_TEST_TENANT_PREFIX = `Admin Gate Test ${testSuffix}`;
    const PRICING_KEYS = ['premium_plan_price', 'standard_plan_price', 'paypal_product_id'];
    const pricingBackup = new Map();

    const createAdminTestTenant = async (overrides = {}) => {
        const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        const payload = {
            name: overrides.name || `${ADMIN_TEST_TENANT_PREFIX} ${suffix}`,
            domain: overrides.domain || `admin-gate-${suffix}`,
            db_name: overrides.db_name || `sku_tenant_admingate_${suffix.replace(/[^a-z0-9]/g, '')}`,
            company_token: overrides.company_token || `token-admin-gate-${suffix}`,
            status: overrides.status || 'pending',
            admin_email: overrides.admin_email || `tenant-${suffix}@example.test`,
            admin_password_hash: overrides.admin_password_hash || '$2y$10$abcdefghijklmnopqrstuv',
            plan: overrides.plan || 'premium',
            subscription_status: overrides.subscription_status || 'inactive',
            settings: overrides.settings || {}
        };

        if (overrides.id) {
            payload.id = overrides.id;
        }

        return Tenant.create(payload);
    };

    beforeAll(async () => {
        await sequelize.authenticate();
        adminApiToken = jwt.sign(
            { username: `admin_lifecycle_${testSuffix}`, role: 'admin', type: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        mockAxiosPost.mockResolvedValue({
            data: { access_token: 'fake_jwt', expires_in: 3600 }
        });
        mockProvisionTenant.mockResolvedValue({
            id: 'mock-tenant-id',
            status: 'active'
        });
        mockDeleteTenantDatabase.mockResolvedValue(true);

        for (const key of PRICING_KEYS) {
            const existing = await SystemSetting.findOne({ where: { setting_key: key } });
            pricingBackup.set(key, existing ? existing.setting_value : null);
            if (!existing) {
                await SystemSetting.create({
                    setting_key: key,
                    setting_value: '',
                    data_type: 'string'
                });
            }
        }
    });

    beforeEach(() => {
        mockAxiosGet.mockReset();
        mockProvisionTenant.mockClear();
        mockDeleteTenantDatabase.mockClear();
    });

    afterAll(async () => {
        await Tenant.destroy({ where: { name: { [Op.like]: `${ADMIN_TEST_TENANT_PREFIX}%` } } });

        for (const key of PRICING_KEYS) {
            const backupValue = pricingBackup.get(key);
            if (backupValue === null || backupValue === undefined) {
                await SystemSetting.destroy({ where: { setting_key: key } });
            } else {
                await SystemSetting.update(
                    { setting_value: backupValue },
                    { where: { setting_key: key } }
                );
            }
        }
    });

    it('lists tenants with status filter', async () => {
        const pendingTenant = await createAdminTestTenant({ status: 'pending' });
        const activeTenant = await createAdminTestTenant({ status: 'active' });

        const response = await request(app)
            .get('/api/v1/admin/tenants?status=pending')
            .set('Authorization', `Bearer ${adminApiToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        const ids = response.body.data.map((tenant) => tenant.id);
        expect(ids).toContain(pendingTenant.id);
        expect(ids).not.toContain(activeTenant.id);
    });

    it('gets and updates pricing settings', async () => {
        const getResponse = await request(app)
            .get('/api/v1/admin/tenants/pricing')
            .set('Authorization', `Bearer ${adminApiToken}`);

        expect(getResponse.status).toBe(200);
        expect(getResponse.body.success).toBe(true);
        expect(getResponse.body.data).toHaveProperty('premium_plan_price');
        expect(getResponse.body.data).toHaveProperty('standard_plan_price');
        expect(getResponse.body.data).toHaveProperty('paypal_product_id');

        const updateResponse = await request(app)
            .put('/api/v1/admin/tenants/pricing')
            .set('Authorization', `Bearer ${adminApiToken}`)
            .send({
                premium_plan_price: '4999',
                standard_plan_price: '0',
                paypal_product_id: `prod-${testSuffix}`
            });

        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.message).toBe('Pricing settings updated successfully');

        const rows = await SystemSetting.findAll({ where: { setting_key: PRICING_KEYS } });
        const byKey = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
        expect(byKey.premium_plan_price).toBe('4999');
        expect(byKey.standard_plan_price).toBe('0');
        expect(byKey.paypal_product_id).toBe(`prod-${testSuffix}`);
    });

    it('auto-accepts standard public registration when auto_standard mode is enabled', async () => {
        const previousMode = process.env.TENANT_REGISTRATION_APPROVAL_MODE;
        process.env.TENANT_REGISTRATION_APPROVAL_MODE = 'auto_standard';

        try {
            const response = await request(app)
                .post('/api/v1/admin/tenants/register')
                .send({
                    name: `${ADMIN_TEST_TENANT_PREFIX} Auto Register`,
                    adminEmail: `auto-register-${testSuffix}@example.test`,
                    adminPassword: 'StrongPass1!',
                    plan: 'premium',
                    complianceMode: 'non_compliant',
                    workflowMode: 'food_manufacturing'
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Company registered and activated successfully. You can sign in now.');
            expect(response.body.data.status).toBe('active');
            expect(response.body.data.email_sent).toBe(false);
            expect(response.body.data.company_token).toMatch(/^token-admingatetest/);
            expect(mockProvisionTenant).toHaveBeenCalledWith(expect.objectContaining({
                name: `${ADMIN_TEST_TENANT_PREFIX} Auto Register`,
                adminEmail: `auto-register-${testSuffix}@example.test`,
                workflowMode: 'food_manufacturing'
            }));
        } finally {
            if (previousMode === undefined) {
                delete process.env.TENANT_REGISTRATION_APPROVAL_MODE;
            } else {
                process.env.TENANT_REGISTRATION_APPROVAL_MODE = previousMode;
            }
        }
    });

    it('approves pending tenant and calls provisioning with stored admin data', async () => {
        const tenant = await createAdminTestTenant({ status: 'pending' });

        const response = await request(app)
            .post(`/api/v1/admin/tenants/${tenant.id}/approve`)
            .set('Authorization', `Bearer ${adminApiToken}`)
            .send({});

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Tenant approved and provisioned successfully');
        expect(mockProvisionTenant).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: tenant.id,
            name: tenant.name,
            dbName: tenant.db_name,
            companyToken: tenant.company_token,
            adminEmail: tenant.admin_email,
            adminPasswordHash: tenant.admin_password_hash
        }));
        expect(response.body.data.email_sent).toBe(false);
    });

    it('rejects pending tenant and persists rejection metadata', async () => {
        const tenant = await createAdminTestTenant({ status: 'pending', settings: {} });
        const reason = 'Missing business documents';

        const response = await request(app)
            .post(`/api/v1/admin/tenants/${tenant.id}/reject`)
            .set('Authorization', `Bearer ${adminApiToken}`)
            .send({ reason });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Tenant registration rejected');
        expect(response.body.data.status).toBe('rejected');

        const refreshed = await Tenant.findByPk(tenant.id);
        expect(refreshed.status).toBe('rejected');
        const parsedSettings = typeof refreshed.settings === 'string'
            ? JSON.parse(refreshed.settings)
            : refreshed.settings;
        expect(parsedSettings.rejection_reason).toBe(reason);
    });

    it('updates non-pending tenant status directly when plan change is not requested', async () => {
        const tenant = await createAdminTestTenant({ status: 'active', plan: 'standard' });

        const response = await request(app)
            .put(`/api/v1/admin/tenants/${tenant.id}`)
            .set('Authorization', `Bearer ${adminApiToken}`)
            .send({ status: 'inactive' });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Tenant updated successfully');

        const refreshed = await Tenant.findByPk(tenant.id);
        expect(refreshed.status).toBe('inactive');
        expect(refreshed.plan).toBe('standard');
    });

    it('updates pending tenant to active via provisioning path without changing plan', async () => {
        const tenant = await createAdminTestTenant({ status: 'pending', plan: 'standard' });

        const response = await request(app)
            .put(`/api/v1/admin/tenants/${tenant.id}`)
            .set('Authorization', `Bearer ${adminApiToken}`)
            .send({ status: 'active' });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Tenant approved and provisioned successfully.');
        expect(mockProvisionTenant).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: tenant.id,
            name: tenant.name,
            dbName: tenant.db_name,
            companyToken: tenant.company_token,
            adminEmail: tenant.admin_email,
            adminPasswordHash: tenant.admin_password_hash
        }));

        const refreshed = await Tenant.findByPk(tenant.id);
        expect(refreshed.plan).toBe('premium');
    });

    it('keeps active tenant premium when admin update requests a standard plan', async () => {
        const tenant = await createAdminTestTenant({ status: 'active', plan: 'standard' });

        const response = await request(app)
            .put(`/api/v1/admin/tenants/${tenant.id}`)
            .set('Authorization', `Bearer ${adminApiToken}`)
            .send({ plan: 'standard' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Tenant updated successfully');
        expect(mockProvisionTenant).not.toHaveBeenCalled();

        const refreshed = await Tenant.findByPk(tenant.id);
        expect(refreshed.plan).toBe('premium');
    });

    it('deletes tenant and calls DB drop helper', async () => {
        const tenant = await createAdminTestTenant({ status: 'inactive' });

        const response = await request(app)
            .delete(`/api/v1/admin/tenants/${tenant.id}`)
            .set('Authorization', `Bearer ${adminApiToken}`);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Tenant and database permanently deleted');
        expect(mockDeleteTenantDatabase).toHaveBeenCalledWith(tenant.db_name);

        const deleted = await Tenant.findByPk(tenant.id);
        expect(deleted).toBeNull();
    });
});

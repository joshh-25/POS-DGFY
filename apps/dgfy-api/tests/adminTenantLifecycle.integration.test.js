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
    sendEmail: jest.fn(),
    sendAffiliateInviteEmail: jest.fn(),
    sendCompanyApprovedEmail: jest.fn(),
    sendCompanyRejectedEmail: jest.fn(),
    sendCompanySubmissionReceivedEmail: jest.fn(),
    sendResubmissionConfirmationEmail: jest.fn()
}));

process.env.MOCK_PAYPAL = 'false';
process.env.NODE_ENV = 'test';
process.env.PAYPAL_CLIENT_ID = 'test-client-id';
process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
process.env.PAYPAL_MODE = 'sandbox';

import request from 'supertest';
const { default: app } = await import('../src/server.js');
const {
    sequelize,
    Tenant,
    SystemSetting,
    DgfyAccount,
    DgfyAccountTenantMembership,
    DgfyLegalAcknowledgement,
    CompanyRegistrationApplication,
    CompanyRegistrationAttempt,
    CompanyRegistrationEvent,
    CompanyRegistrationEmailDelivery,
    UserTenantMapping,
    PlatformAdminUser,
    PlatformAdminSession
} = await import('../src/models/index.js');
const { generateDgfyToken } = await import('../src/modules/dgfy/usecases/dgfyAuthUseCases.js');
const { DGFY_LEGAL_TERM_VERSIONS } = await import('../src/modules/shared/utils/dgfyLegalTerms.js');
const { ensureLandlordTenantSchemaReady } = await import('./helpers/landlordSchemaReadiness.js');
const { DataTypes, Op } = await import('sequelize');

describe('Admin Tenant Lifecycle Integration - Parity', () => {
    let adminApiToken;
    let platformAdminUser;
    let platformAdminSession;
    let dgfyAccount;
    let dgfyToken;
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
            owner_dgfy_account_id: overrides.owner_dgfy_account_id || dgfyAccount.id,
            plan: overrides.plan || 'premium',
            subscription_status: overrides.subscription_status || 'inactive',
            settings: overrides.settings || {}
        };

        if (overrides.id) {
            payload.id = overrides.id;
        }

        const tenant = await Tenant.create(payload);
        if (tenant.status === 'pending') {
            const application = await CompanyRegistrationApplication.create({
                tenant_id: tenant.id,
                dgfy_account_id: dgfyAccount.id,
                registration_email_snapshot: dgfyAccount.email,
                current_attempt_no: 1,
                review_status: 'pending',
                provisioning_status: 'not_started',
                optimistic_version: 1
            });
            await CompanyRegistrationAttempt.create({
                application_id: application.id,
                attempt_no: 1,
                submission_snapshot: {
                    company_name: tenant.name,
                    workflow_mode: 'food_manufacturing'
                },
                legal_terms_snapshot: {},
                decision: 'pending'
            });
        }
        return tenant;
    };

    beforeAll(async () => {
        await sequelize.authenticate();
        await ensureLandlordTenantSchemaReady();
        platformAdminUser = await PlatformAdminUser.create({
            username: `admin_lifecycle_${testSuffix}`,
            username_normalized: `admin_lifecycle_${testSuffix}`,
            password_hash: '$2a$12$8cIJyb0nC8.ZyZbmXRb5FO3R8T.n5V4s2EbMiA.mCCi.l/47tmKzK',
            is_master: true,
            auth_source: 'bootstrap_env',
            status: 'active',
            auth_version: 1
        });
        platformAdminSession = await PlatformAdminSession.create({
            admin_user_id: platformAdminUser.id,
            auth_version: platformAdminUser.auth_version,
            issued_at: new Date(),
            expires_at: new Date(Date.now() + 60 * 60 * 1000)
        });
        adminApiToken = jwt.sign(
            {
                admin_id: platformAdminUser.id,
                session_id: platformAdminSession.id,
                auth_version: platformAdminUser.auth_version,
                type: 'platform_admin'
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        const queryInterface = sequelize.getQueryInterface();
        const dgfyAccountColumnsBeforeSync = await queryInterface.describeTable('dgfy_accounts');
        if (!dgfyAccountColumnsBeforeSync.deleted_at) {
            await queryInterface.addColumn('dgfy_accounts', 'deleted_at', {
                type: DataTypes.DATE,
                allowNull: true
            });
        }
        if (!dgfyAccountColumnsBeforeSync.deleted_by) {
            await queryInterface.addColumn('dgfy_accounts', 'deleted_by', {
                type: DataTypes.STRING(120),
                allowNull: true
            });
        }
        if (!dgfyAccountColumnsBeforeSync.deletion_reason) {
            await queryInterface.addColumn('dgfy_accounts', 'deletion_reason', {
                type: DataTypes.STRING(500),
                allowNull: true
            });
        }
        await DgfyAccount.sync();
        await DgfyAccountTenantMembership.sync();
        await DgfyLegalAcknowledgement.sync();
        const dgfyAccountColumns = await queryInterface.describeTable('dgfy_accounts');
        if (!dgfyAccountColumns.email_verified_at) {
            await queryInterface.addColumn('dgfy_accounts', 'email_verified_at', {
                type: DataTypes.DATE,
                allowNull: true
            });
        }
        dgfyAccount = await DgfyAccount.create({
            first_name: 'Admin',
            last_name: 'Lifecycle',
            username: `admin_lifecycle_${testSuffix}`,
            email: `admin-lifecycle-${testSuffix}@example.test`,
            phone: `+63917${String(testSuffix).slice(-7).padStart(7, '0')}`,
            password_hash: '$2y$10$abcdefghijklmnopqrstuv',
            is_active: true,
            email_verified_at: new Date()
        });
        dgfyToken = generateDgfyToken(dgfyAccount);

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
        const testTenants = await Tenant.findAll({
            where: { name: { [Op.like]: `${ADMIN_TEST_TENANT_PREFIX}%` } },
            attributes: ['id']
        });
        const tenantIds = testTenants.map((tenant) => tenant.id);
        if (tenantIds.length > 0) {
            await DgfyAccountTenantMembership.destroy({ where: { tenant_id: { [Op.in]: tenantIds } } });
            await UserTenantMapping.destroy({ where: { tenant_id: { [Op.in]: tenantIds } } });
            await DgfyLegalAcknowledgement.destroy({ where: { tenant_id: { [Op.in]: tenantIds } } });
            const applications = await CompanyRegistrationApplication.findAll({
                where: { tenant_id: { [Op.in]: tenantIds } },
                attributes: ['id']
            });
            const applicationIds = applications.map((application) => application.id);
            if (applicationIds.length > 0) {
                await CompanyRegistrationEvent.destroy({ where: { application_id: { [Op.in]: applicationIds } } });
                await CompanyRegistrationAttempt.destroy({ where: { application_id: { [Op.in]: applicationIds } } });
                await CompanyRegistrationEmailDelivery.destroy({ where: { application_id: { [Op.in]: applicationIds } } });
                await CompanyRegistrationApplication.destroy({ where: { id: { [Op.in]: applicationIds } } });
            }
        }
        await Tenant.destroy({ where: { name: { [Op.like]: `${ADMIN_TEST_TENANT_PREFIX}%` } } });
        if (dgfyAccount) {
            await DgfyAccount.destroy({ where: { id: dgfyAccount.id } });
        }
        if (platformAdminSession) await PlatformAdminSession.destroy({ where: { id: platformAdminSession.id } });
        if (platformAdminUser) await PlatformAdminUser.destroy({ where: { id: platformAdminUser.id } });

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

    it('keeps public registration pending when a legacy auto_standard value is configured', async () => {
        const previousMode = process.env.TENANT_REGISTRATION_APPROVAL_MODE;
        process.env.TENANT_REGISTRATION_APPROVAL_MODE = 'auto_standard';

        try {
            const csrfToken = `csrf-admin-lifecycle-${testSuffix}`;
            const response = await request(app)
                .post('/api/v1/admin/tenants/register')
                .set('Authorization', `Bearer ${dgfyToken}`)
                .set('Cookie', `sku_dgfy_session=${dgfyToken}; sku_csrf_token=${csrfToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    name: `${ADMIN_TEST_TENANT_PREFIX} Auto Register`,
                    plan: 'premium',
                    complianceMode: 'non_compliant',
                    workflowMode: 'food_manufacturing',
                    accepted_company_terms: true,
                    company_terms_version: DGFY_LEGAL_TERM_VERSIONS.companyTerms,
                    marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('submitted for review');
            expect(response.body.data.status).toBe('pending');
            expect(response.body.data.application_id).toEqual(expect.any(String));
            expect(response.body.data).not.toHaveProperty('company_token');
            expect(mockProvisionTenant).not.toHaveBeenCalled();
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

        expect(response.status).toBe(422);
        expect(response.body.message).toBe('Pending public registrations may only be activated by the dedicated approval workflow.');
        expect(mockProvisionTenant).not.toHaveBeenCalled();

        const refreshed = await Tenant.findByPk(tenant.id);
        expect(refreshed.status).toBe('pending');
        expect(refreshed.plan).toBe('standard');
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

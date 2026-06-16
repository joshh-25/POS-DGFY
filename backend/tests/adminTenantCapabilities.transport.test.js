import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockUpdateTenantCapabilities = jest.fn((req, res) => {
    res.status(200).json({
        success: true,
        data: {
            tenant_id: req.params?.id || null,
            validated: req.validatedData
        }
    });
});
const mockListTenantCapabilityAuditLogs = jest.fn((req, res) => {
    res.status(200).json({
        success: true,
        data: {
            tenant_id: req.params?.id || null,
            query: req.validatedQuery
        }
    });
});

const noopHandler = jest.fn((req, res) => res.status(200).json({ success: true }));

jest.unstable_mockModule('../src/controllers/adminTenantController.js', () => ({
    registerCompanyRequest: noopHandler,
    listTenants: noopHandler,
    approveTenant: noopHandler,
    rejectTenant: noopHandler,
    provisionNewTenant: noopHandler,
    getPricingSettings: noopHandler,
    updatePricingSettings: noopHandler,
    updateTenant: noopHandler,
    updateTenantCapabilities: mockUpdateTenantCapabilities,
    listTenantCapabilityAuditLogs: mockListTenantCapabilityAuditLogs,
    getTenantPosMetadata: noopHandler,
    listTenantPosMetadataAuditLogs: noopHandler,
    updateTenantPosMetadata: noopHandler,
    deleteTenant: noopHandler,
    setupPayPalRecurring: noopHandler,
    adminChangePlan: noopHandler,
    adminReactivateTenant: noopHandler,
    adminListComplianceArtifacts: noopHandler,
    adminListCompliancePeripherals: noopHandler,
    adminGetComplianceChecklist: noopHandler,
    adminListComplianceAuditLogs: noopHandler,
    adminListComplianceSecurityIncidents: noopHandler,
    adminUpdateComplianceArtifactVerification: noopHandler,
    adminUpdateCompliancePeripheralVerification: noopHandler,
    adminUpdateComplianceFinalReviewDocumentReview: noopHandler,
    adminAcknowledgeComplianceSecurityIncident: noopHandler,
    adminResolveComplianceSecurityIncident: noopHandler,
    adminSelectComplianceMode: noopHandler,
    adminUpgradeComplianceMode: noopHandler,
    adminForceNonCompliant: noopHandler,
    resubmitRegistration: noopHandler
}));

jest.unstable_mockModule('../src/middleware/auth.js', () => ({
    authenticateAdmin: (req, _res, next) => {
        req.admin = { id: 1, username: 'platform_admin' };
        next();
    }
}));

jest.unstable_mockModule('../src/middleware/dgfyAuth.js', () => ({
    authenticateDgfyAccount: (_req, _res, next) => next()
}));

jest.unstable_mockModule('../src/middleware/rateLimiter.js', () => ({
    tenantRegistrationLimiter: (_req, _res, next) => next()
}));

let app;

beforeAll(async () => {
    const router = (await import('../src/routes/adminTenants.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/v1/admin/tenants', router);
});

describe('tenant capability admin transport contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects malformed capability patches before calling the handler', async () => {
        const response = await request(app)
            .patch('/api/v1/admin/tenants/tenant-1/capabilities')
            .send({
                reason: 'x',
                ims_enabled: 'false',
                storefront_visible: true
            });

        expect(response.status).toBe(422);
        expect(response.body).toEqual(expect.objectContaining({
            success: false,
            message: 'Validation failed'
        }));
        expect(response.body.errors.map((error) => error.field)).toEqual(expect.arrayContaining([
            'reason',
            'ims_enabled'
        ]));
        expect(mockUpdateTenantCapabilities).not.toHaveBeenCalled();
    });

    it('passes strict capability payloads to the update handler', async () => {
        const response = await request(app)
            .patch('/api/v1/admin/tenants/tenant-1/capabilities')
            .send({
                reason: 'Tenant asked to pause online ordering during setup',
                ims_enabled: true,
                pos_enabled: false,
                storefront_visible: true,
                customer_access_mode: 'inquiry',
                platform_max_customer_access_mode: 'transaction',
                customer_access_registration_stage: 'registered'
            });

        expect(response.status).toBe(200);
        expect(mockUpdateTenantCapabilities).toHaveBeenCalledTimes(1);
        expect(mockUpdateTenantCapabilities.mock.calls[0][0]).toEqual(expect.objectContaining({
            params: expect.objectContaining({ id: 'tenant-1' }),
            validatedData: {
                reason: 'Tenant asked to pause online ordering during setup',
                ims_enabled: true,
                pos_enabled: false,
                storefront_visible: true,
                customer_access_mode: 'inquiry',
                platform_max_customer_access_mode: 'transaction',
                customer_access_registration_stage: 'registered'
            }
        }));
    });

    it('rejects unsupported registration readiness stages', async () => {
        const response = await request(app)
            .patch('/api/v1/admin/tenants/tenant-1/capabilities')
            .send({
                reason: 'Platform reviewed storefront readiness',
                customer_access_registration_stage: 'verified'
            });

        expect(response.status).toBe(422);
        expect(response.body.errors.map((error) => error.field)).toEqual(expect.arrayContaining([
            'customer_access_registration_stage'
        ]));
        expect(mockUpdateTenantCapabilities).not.toHaveBeenCalled();
    });

    it('normalizes audit log limit before calling the handler', async () => {
        const response = await request(app)
            .get('/api/v1/admin/tenants/tenant-1/capabilities/audit-logs?limit=35');

        expect(response.status).toBe(200);
        expect(mockListTenantCapabilityAuditLogs).toHaveBeenCalledTimes(1);
        expect(mockListTenantCapabilityAuditLogs.mock.calls[0][0].validatedQuery).toEqual({ limit: 35 });
    });
});

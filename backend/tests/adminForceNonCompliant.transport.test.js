import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockAdminForceNonCompliant = jest.fn((req, res) => {
    res.status(200).json({
        success: true,
        data: {
            tenantId: req.params?.id || null,
            reason: req.validatedData?.reason || null
        }
    });
});
const mockAdminSelectComplianceMode = jest.fn((req, res) => {
    res.status(200).json({
        success: true,
        data: {
            tenantId: req.params?.id || null,
            mode_choice: req.validatedData?.mode_choice || null,
            reason: req.validatedData?.reason || null
        }
    });
});
const mockAdminUpgradeComplianceMode = jest.fn((req, res) => {
    res.status(200).json({
        success: true,
        data: {
            tenantId: req.params?.id || null,
            reason: req.validatedData?.reason || null
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
    updateTenantCapabilities: noopHandler,
    listTenantCapabilityAuditLogs: noopHandler,
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
    adminSelectComplianceMode: mockAdminSelectComplianceMode,
    adminUpgradeComplianceMode: mockAdminUpgradeComplianceMode,
    adminForceNonCompliant: mockAdminForceNonCompliant,
    resubmitRegistration: noopHandler
}));

jest.unstable_mockModule('../src/middleware/auth.js', () => ({
    authenticateAdmin: (req, _res, next) => {
        req.admin = { id: 1, username: 'platform_admin' };
        next();
    }
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

describe('POST /api/v1/admin/tenants/:id/force-non-compliant transport contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 422 when reason is missing', async () => {
        const response = await request(app)
            .post('/api/v1/admin/tenants/tenant-1/force-non-compliant')
            .send({});

        expect(response.status).toBe(422);
        expect(response.body).toEqual(expect.objectContaining({
            success: false,
            message: 'Validation failed'
        }));
        expect(mockAdminForceNonCompliant).not.toHaveBeenCalled();
    });

    it('passes validated payload to handler on success', async () => {
        const response = await request(app)
            .post('/api/v1/admin/tenants/tenant-1/force-non-compliant')
            .send({
                reason: 'Emergency rollback due to faulty certification package',
                context: { source: 'admin_tenant_manager' }
            });

        expect(response.status).toBe(200);
        expect(mockAdminForceNonCompliant).toHaveBeenCalledTimes(1);
        expect(mockAdminForceNonCompliant.mock.calls[0][0]).toEqual(expect.objectContaining({
            params: expect.objectContaining({ id: 'tenant-1' }),
            validatedData: expect.objectContaining({
                reason: 'Emergency rollback due to faulty certification package',
                context: { source: 'admin_tenant_manager' }
            })
        }));
    });
});

describe('POST /api/v1/admin/tenants/:id/compliance/mode/select transport contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 422 when mode choice is missing', async () => {
        const response = await request(app)
            .post('/api/v1/admin/tenants/tenant-1/compliance/mode/select')
            .send({ reason: 'Set access mode' });

        expect(response.status).toBe(422);
        expect(mockAdminSelectComplianceMode).not.toHaveBeenCalled();
    });

    it('returns 422 when reason is too short', async () => {
        const response = await request(app)
            .post('/api/v1/admin/tenants/tenant-1/compliance/mode/select')
            .send({ mode_choice: 'non_compliant', reason: 'no' });

        expect(response.status).toBe(422);
        expect(mockAdminSelectComplianceMode).not.toHaveBeenCalled();
    });

    it('passes validated mode selection payload to handler on success', async () => {
        const response = await request(app)
            .post('/api/v1/admin/tenants/tenant-1/compliance/mode/select')
            .send({
                mode_choice: 'compliant',
                reason: 'Tenant requested compliant pending mode',
                context: { source: 'test' }
            });

        expect(response.status).toBe(200);
        expect(mockAdminSelectComplianceMode).toHaveBeenCalledTimes(1);
        expect(mockAdminSelectComplianceMode.mock.calls[0][0]).toEqual(expect.objectContaining({
            params: expect.objectContaining({ id: 'tenant-1' }),
            validatedData: expect.objectContaining({
                mode_choice: 'compliant',
                reason: 'Tenant requested compliant pending mode',
                context: { source: 'test' }
            })
        }));
    });
});

describe('POST /api/v1/admin/tenants/:id/compliance/mode/upgrade transport contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 422 when reason is missing', async () => {
        const response = await request(app)
            .post('/api/v1/admin/tenants/tenant-1/compliance/mode/upgrade')
            .send({});

        expect(response.status).toBe(422);
        expect(mockAdminUpgradeComplianceMode).not.toHaveBeenCalled();
    });

    it('passes validated upgrade payload to handler on success', async () => {
        const response = await request(app)
            .post('/api/v1/admin/tenants/tenant-1/compliance/mode/upgrade')
            .send({
                reason: 'Tenant is preparing compliance documents',
                context: { source: 'test' }
            });

        expect(response.status).toBe(200);
        expect(mockAdminUpgradeComplianceMode).toHaveBeenCalledTimes(1);
        expect(mockAdminUpgradeComplianceMode.mock.calls[0][0]).toEqual(expect.objectContaining({
            params: expect.objectContaining({ id: 'tenant-1' }),
            validatedData: expect.objectContaining({
                reason: 'Tenant is preparing compliance documents',
                context: { source: 'test' }
            })
        }));
    });
});

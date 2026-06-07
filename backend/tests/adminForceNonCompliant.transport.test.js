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

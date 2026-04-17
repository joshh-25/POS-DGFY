import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockActivateCompliantModeUseCase = jest.fn();
const mockUpdateComplianceProfileUseCase = jest.fn();
const noopUseCase = jest.fn().mockResolvedValue({ success: true, data: {} });

const mockAuthenticate = jest.fn((req, res, next) => {
    req.user = { user_id: 9, is_master_admin: true };
    req.tenant = { id: 'tenant-activation-test' };
    next();
});

const mockCheckPermission = jest.fn(() => (req, res, next) => next());

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
    getComplianceProfileUseCase: noopUseCase,
    selectComplianceModeUseCase: noopUseCase,
    upgradeToCompliantUseCase: noopUseCase,
    getComplianceChecklistUseCase: noopUseCase,
    activateCompliantModeUseCase: mockActivateCompliantModeUseCase,
    updateComplianceProfileUseCase: mockUpdateComplianceProfileUseCase,
    listComplianceArtifactsUseCase: noopUseCase,
    createComplianceArtifactUseCase: noopUseCase,
    updateComplianceArtifactUseCase: noopUseCase,
    updateComplianceArtifactVerificationUseCase: noopUseCase,
    listFinalReviewDocumentsUseCase: noopUseCase,
    upsertFinalReviewDocumentUseCase: noopUseCase,
    uploadFinalReviewDocumentUseCase: noopUseCase,
    reviewFinalReviewDocumentUseCase: noopUseCase,
    upsertFinalReviewSignoffUseCase: noopUseCase,
    listCompliancePeripheralsUseCase: noopUseCase,
    createCompliancePeripheralUseCase: noopUseCase,
    updateCompliancePeripheralUseCase: noopUseCase,
    updateCompliancePeripheralVerificationUseCase: noopUseCase,
    listComplianceAuditLogsUseCase: noopUseCase,
    compliancePreflightUseCase: noopUseCase
}));

jest.unstable_mockModule('../src/middleware/auth.js', () => ({
    authenticate: mockAuthenticate,
    checkPermission: mockCheckPermission
}));

let app;

beforeAll(async () => {
    const complianceRouter = (await import('../src/routes/compliance.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/v1/compliance', complianceRouter);
});

describe('/api/v1/compliance activation and profile validation contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockActivateCompliantModeUseCase.mockResolvedValue({
            success: true,
            data: { mode_state: 'compliant_active' }
        });
        mockUpdateComplianceProfileUseCase.mockResolvedValue({
            success: true,
            data: { profile: {} }
        });
    });

    it('rejects activate request without confirmation text', async () => {
        const response = await request(app)
            .post('/api/v1/compliance/activate')
            .send({});

        expect(response.status).toBe(422);
        expect(response.body).toEqual(expect.objectContaining({
            success: false,
            message: 'Validation failed'
        }));
        expect(mockActivateCompliantModeUseCase).not.toHaveBeenCalled();
    });

    it('passes valid activate confirmation text to usecase', async () => {
        const response = await request(app)
            .post('/api/v1/compliance/activate')
            .send({ confirmation_text: 'ACTIVATE COMPLIANT' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({
            success: true,
            message: 'Compliant mode activated'
        }));
        expect(mockActivateCompliantModeUseCase).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-activation-test',
            confirmationText: 'ACTIVATE COMPLIANT'
        }));
    });

    it('rejects unknown nested compliance profile keys', async () => {
        const response = await request(app)
            .put('/api/v1/compliance/profile')
            .send({
                bir: {
                    software_accreditation_number: 'BIR-ACC-001',
                    invalid_field: 'must fail'
                }
            });

        expect(response.status).toBe(422);
        expect(response.body).toEqual(expect.objectContaining({
            success: false,
            message: 'Validation failed'
        }));
        expect(mockUpdateComplianceProfileUseCase).not.toHaveBeenCalled();
    });

    it('accepts valid nested compliance profile patch', async () => {
        const response = await request(app)
            .put('/api/v1/compliance/profile')
            .send({
                bir: {
                    software_accreditation_number: 'BIR-ACC-001',
                    software_accreditation_valid_until: '2026-12-31'
                },
                readiness: {
                    tests_passed: true
                }
            });

        expect(response.status).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({
            success: true,
            message: 'Compliance profile updated'
        }));
        expect(mockUpdateComplianceProfileUseCase).toHaveBeenCalled();
    });
});

import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockRevertToNonCompliantModeUseCase = jest.fn();
const noopUseCase = jest.fn().mockResolvedValue({ success: true, data: {} });

const mockAuthenticate = jest.fn((req, res, next) => {
    req.user = { user_id: 9, is_master_admin: true };
    req.tenant = { id: 'tenant-revert-test' };
    next();
});

const mockCheckPermission = jest.fn(() => (req, res, next) => next());

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
    getComplianceProfileUseCase: noopUseCase,
    selectComplianceModeUseCase: noopUseCase,
    upgradeToCompliantUseCase: noopUseCase,
    revertToNonCompliantModeUseCase: mockRevertToNonCompliantModeUseCase,
    getComplianceChecklistUseCase: noopUseCase,
    activateCompliantModeUseCase: noopUseCase,
    updateComplianceProfileUseCase: noopUseCase,
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

describe('/api/v1/compliance/mode/revert-to-non-compliant transport contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRevertToNonCompliantModeUseCase.mockResolvedValue({
            success: true,
            data: { mode_state: 'non_compliant_active' }
        });
    });

    it('rejects revert request without required reason', async () => {
        const response = await request(app)
            .post('/api/v1/compliance/mode/revert-to-non-compliant')
            .send({});

        expect(response.status).toBe(422);
        expect(response.body).toEqual(expect.objectContaining({
            success: false,
            message: 'Validation failed'
        }));
        expect(mockRevertToNonCompliantModeUseCase).not.toHaveBeenCalled();
    });

    it('passes valid revert payload to usecase', async () => {
        const response = await request(app)
            .post('/api/v1/compliance/mode/revert-to-non-compliant')
            .send({
                reason: 'Selected compliant by mistake',
                context: { source: 'settings_panel' }
            });

        expect(response.status).toBe(200);
        expect(mockRevertToNonCompliantModeUseCase).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-revert-test',
            reason: 'Selected compliant by mistake',
            context: { source: 'settings_panel' }
        }));
    });
});

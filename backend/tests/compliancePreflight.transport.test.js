import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockCompliancePreflightUseCase = jest.fn();
const noopUseCase = jest.fn().mockResolvedValue({ success: true, data: {} });

const mockAuthenticate = jest.fn((req, res, next) => {
    req.user = { user_id: 7 };
    req.tenant = { id: 'tenant-1' };
    next();
});

const mockCheckPermission = jest.fn(() => (req, res, next) => next());

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
    getComplianceProfileUseCase: noopUseCase,
    selectComplianceModeUseCase: noopUseCase,
    upgradeToCompliantUseCase: noopUseCase,
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
    compliancePreflightUseCase: mockCompliancePreflightUseCase
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

const declarationPayload = {
    declaration_id: '2026-04-07-preflight-transport-contract',
    classification: 'major',
    summary: 'Transport contract hardening coverage',
    affected_surfaces: ['payments'],
    reason_codes_impacted: ['IMPACT_DECLARATION_REQUIRED'],
    policy_version: '2026.04.07',
    verification_evidence: ['npm run check:compliance'],
    rollback_note: 'Revert transport contract hardening.'
};

describe('/api/v1/compliance/preflight transport contract', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns breach when impact declaration is missing', async () => {
        mockCompliancePreflightUseCase.mockResolvedValueOnce({
            success: true,
            data: {
                result: 'breach',
                can_proceed: false,
                reason_code: 'IMPACT_DECLARATION_REQUIRED',
                decisions: [],
                required_actions: [],
                declaration_id: null,
                actor: '7'
            }
        });

        const response = await request(app)
            .post('/api/v1/compliance/preflight')
            .send({});

        expect(response.status).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({
            success: true,
            message: 'Compliance preflight failed',
            data: expect.objectContaining({
                result: 'breach',
                can_proceed: false,
                reason_code: 'IMPACT_DECLARATION_REQUIRED'
            })
        }));
    });

    it('returns 422 when declaration surfaces do not match requested surfaces', async () => {
        mockCompliancePreflightUseCase.mockResolvedValueOnce({
            success: false,
            error: {
                code: 'VALIDATION_FAILED',
                message: 'impact_declaration.affected_surfaces must include requested surface: payments',
                details: null,
                statusCode: 422
            }
        });

        const response = await request(app)
            .post('/api/v1/compliance/preflight')
            .send({
                surfaces: ['payments'],
                impact_declaration: {
                    ...declarationPayload,
                    affected_surfaces: ['pos']
                }
            });

        expect(response.status).toBe(422);
        expect(response.body).toEqual(expect.objectContaining({
            success: false,
            message: 'impact_declaration.affected_surfaces must include requested surface: payments',
            error_code: 'VALIDATION_FAILED'
        }));
    });

    it('returns review_required and can_proceed=false for setup-required outcome', async () => {
        mockCompliancePreflightUseCase.mockResolvedValueOnce({
            success: true,
            data: {
                result: 'review_required',
                can_proceed: false,
                reason_code: 'COMPLIANCE_PROFILE_INCOMPLETE',
                decisions: [],
                required_actions: ['Complete required controls.'],
                declaration_id: declarationPayload.declaration_id,
                actor: '7'
            }
        });

        const response = await request(app)
            .post('/api/v1/compliance/preflight')
            .send({
                surfaces: ['payments'],
                impact_declaration: declarationPayload
            });

        expect(response.status).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({
            success: true,
            message: 'Compliance preflight failed',
            data: expect.objectContaining({
                result: 'review_required',
                can_proceed: false,
                reason_code: 'COMPLIANCE_PROFILE_INCOMPLETE'
            })
        }));
    });

    it('returns no_breach and can_proceed=true for fully allowed outcome', async () => {
        mockCompliancePreflightUseCase.mockResolvedValueOnce({
            success: true,
            data: {
                result: 'no_breach',
                can_proceed: true,
                reason_code: 'ALLOWED',
                decisions: [],
                required_actions: [],
                declaration_id: declarationPayload.declaration_id,
                actor: '7'
            }
        });

        const response = await request(app)
            .post('/api/v1/compliance/preflight')
            .send({
                surfaces: ['payments'],
                impact_declaration: declarationPayload
            });

        expect(response.status).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({
            success: true,
            message: 'Compliance preflight passed',
            data: expect.objectContaining({
                result: 'no_breach',
                can_proceed: true,
                reason_code: 'ALLOWED'
            })
        }));
    });

    it('returns 422 and does not invoke usecase when payload fails validator contract', async () => {
        const response = await request(app)
            .post('/api/v1/compliance/preflight')
            .send({
                surfaces: ['unsupported_surface']
            });

        expect(response.status).toBe(422);
        expect(response.body).toEqual(expect.objectContaining({
            success: false,
            message: 'Validation failed',
            errors: expect.any(Array)
        }));
        expect(mockCompliancePreflightUseCase).not.toHaveBeenCalled();
    });
});

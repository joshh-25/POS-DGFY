import { jest } from '@jest/globals';
import { buildCompliancePreflightUseCase } from '../src/modules/compliance/usecases/complianceUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import {
    COMPLIANCE_DECISION,
    COMPLIANCE_REASON_CODE
} from '../src/modules/compliance/policy/complianceConstants.js';

const allowDecision = {
    decision: COMPLIANCE_DECISION.ALLOW,
    reason_code: COMPLIANCE_REASON_CODE.ALLOWED,
    obligations: []
};

const setupRequiredDecision = {
    decision: COMPLIANCE_DECISION.REQUIRES_SETUP,
    reason_code: COMPLIANCE_REASON_CODE.COMPLIANCE_PROFILE_INCOMPLETE,
    obligations: ['Complete required BIR/NPC profile and settings fields.']
};

const baseDeclaration = {
    declaration_id: '2026-04-07-preflight-contract',
    classification: 'major',
    summary: 'Preflight contract verification',
    affected_surfaces: ['pos', 'payments', 'compliance'],
    reason_codes_impacted: ['IMPACT_DECLARATION_REQUIRED', 'COMPLIANCE_PROFILE_INCOMPLETE'],
    policy_version: '2026.04.07',
    verification_evidence: ['npm run check:compliance'],
    rollback_note: 'Revert compliance preflight workflow changes if contract behavior regresses.'
};

describe('compliance preflight usecase', () => {
    it('returns breach when impact declaration is missing', async () => {
        const evaluateComplianceOperationUseCase = jest.fn().mockResolvedValue({
            success: true,
            data: { decision: allowDecision }
        });
        const useCase = buildCompliancePreflightUseCase({ evaluateComplianceOperationUseCase });

        const result = await useCase({
            tenantId: 'tenant-1',
            payload: {},
            actorUser: { user_id: 7 }
        });

        expect(result.success).toBe(true);
        expect(result.data.result).toBe('breach');
        expect(result.data.can_proceed).toBe(false);
        expect(result.data.reason_code).toBe(COMPLIANCE_REASON_CODE.IMPACT_DECLARATION_REQUIRED);
        expect(evaluateComplianceOperationUseCase).toHaveBeenCalledTimes(1);
    });

    it('returns validation failure when declaration surfaces do not cover requested surfaces', async () => {
        const evaluateComplianceOperationUseCase = jest.fn();
        const useCase = buildCompliancePreflightUseCase({ evaluateComplianceOperationUseCase });

        const result = await useCase({
            tenantId: 'tenant-1',
            payload: {
                surfaces: ['payments'],
                impact_declaration: {
                    ...baseDeclaration,
                    affected_surfaces: ['pos']
                }
            },
            actorUser: { user_id: 7 }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.message).toContain('affected_surfaces');
        expect(evaluateComplianceOperationUseCase).not.toHaveBeenCalled();
    });

    it('returns review_required when an evaluated decision requires setup', async () => {
        const evaluateComplianceOperationUseCase = jest.fn()
            .mockResolvedValueOnce({ success: true, data: { decision: allowDecision } })
            .mockResolvedValueOnce({ success: true, data: { decision: setupRequiredDecision } });
        const useCase = buildCompliancePreflightUseCase({ evaluateComplianceOperationUseCase });

        const result = await useCase({
            tenantId: 'tenant-1',
            payload: {
                surfaces: ['pos'],
                impact_declaration: baseDeclaration
            },
            actorUser: { user_id: 8 }
        });

        expect(result.success).toBe(true);
        expect(result.data.result).toBe('review_required');
        expect(result.data.can_proceed).toBe(false);
        expect(result.data.reason_code).toBe(COMPLIANCE_REASON_CODE.COMPLIANCE_PROFILE_INCOMPLETE);
        expect(result.data.required_actions).toEqual(setupRequiredDecision.obligations);
    });

    it('returns no_breach when all evaluated decisions allow and declaration is present', async () => {
        const evaluateComplianceOperationUseCase = jest.fn().mockResolvedValue({
            success: true,
            data: { decision: allowDecision }
        });
        const useCase = buildCompliancePreflightUseCase({ evaluateComplianceOperationUseCase });

        const result = await useCase({
            tenantId: 'tenant-1',
            payload: {
                surfaces: ['payments'],
                impact_declaration: {
                    ...baseDeclaration,
                    affected_surfaces: ['payments']
                }
            },
            actorUser: { user_id: 18 }
        });

        expect(result.success).toBe(true);
        expect(result.data.result).toBe('no_breach');
        expect(result.data.can_proceed).toBe(true);
        expect(result.data.reason_code).toBe(COMPLIANCE_REASON_CODE.ALLOWED);
        expect(result.data.declaration_id).toBe(baseDeclaration.declaration_id);
        expect(result.data.actor).toBe('18');
    });
});

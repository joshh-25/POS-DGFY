import { jest } from '@jest/globals';
import { buildAssertComplianceOperationAllowedUseCase } from '../src/modules/compliance/usecases/complianceUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import {
    COMPLIANCE_DECISION,
    COMPLIANCE_OPERATION,
    COMPLIANCE_REASON_CODE
} from '../src/modules/compliance/policy/complianceConstants.js';

const deniedDecision = {
    decision: COMPLIANCE_DECISION.DENY,
    reason_code: COMPLIANCE_REASON_CODE.BSP_PAYMENT_CONTROL_REQUIRED,
    checklist: [{ id: 'bsp_payment_review', satisfied: false }],
    obligations: ['Complete payment control review.']
};

const buildUseCaseWith = ({ createAuditLog, createAuditFailureLog, logger }) => {
    const evaluateComplianceOperationUseCase = jest.fn().mockResolvedValue({
        success: true,
        data: {
            tenant: { id: 'tenant-1' },
            decision: deniedDecision
        }
    });

    const useCase = buildAssertComplianceOperationAllowedUseCase({
        evaluateComplianceOperationUseCase,
        complianceRepository: {
            createAuditLog,
            createAuditFailureLog
        },
        logger
    });

    return { useCase, evaluateComplianceOperationUseCase };
};

describe('compliance audit fallback durability', () => {
    it('persists fallback record when primary audit write fails and preserves decision output', async () => {
        const createAuditLog = jest.fn().mockRejectedValue(new Error('fk constraint failed'));
        const createAuditFailureLog = jest.fn().mockResolvedValue({ tenant_compliance_audit_failure_id: 1 });
        const logger = { warn: jest.fn(), error: jest.fn() };
        const { useCase } = buildUseCaseWith({ createAuditLog, createAuditFailureLog, logger });

        const result = await useCase({
            tenantId: 'tenant-1',
            operation: COMPLIANCE_OPERATION.PAYMENT_CAPABILITY_ENABLE,
            context: { payment_control_reviewed: false },
            actorUser: { user_id: 19 }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
        expect(result.error.details.compliance.reason_code).toBe(COMPLIANCE_REASON_CODE.BSP_PAYMENT_CONTROL_REQUIRED);
        expect(createAuditLog).toHaveBeenCalledTimes(1);
        expect(createAuditFailureLog).toHaveBeenCalledWith(expect.objectContaining({
            tenant_id: 'tenant-1',
            event_type: 'blocked_operation',
            operation: COMPLIANCE_OPERATION.PAYMENT_CAPABILITY_ENABLE,
            primary_error_message: 'fk constraint failed',
            fallback_context: expect.objectContaining({
                path: 'buildAssertComplianceOperationAllowedUseCase',
                stage: 'blocked_operation'
            })
        }));
        expect(logger.warn).toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('emits high-severity log when both primary and fallback audit writes fail', async () => {
        const createAuditLog = jest.fn().mockRejectedValue(new Error('primary insert failed'));
        const createAuditFailureLog = jest.fn().mockRejectedValue(new Error('fallback insert failed'));
        const logger = { warn: jest.fn(), error: jest.fn() };
        const { useCase } = buildUseCaseWith({ createAuditLog, createAuditFailureLog, logger });

        const result = await useCase({
            tenantId: 'tenant-1',
            operation: COMPLIANCE_OPERATION.PAYMENT_CAPABILITY_ENABLE,
            context: { payment_control_reviewed: false },
            actorUser: { user_id: 21 }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
        expect(result.error.details.compliance.reason_code).toBe(COMPLIANCE_REASON_CODE.BSP_PAYMENT_CONTROL_REQUIRED);
        expect(createAuditLog).toHaveBeenCalledTimes(1);
        expect(createAuditFailureLog).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
            '[Compliance] Failed to persist compliance audit log and fallback record',
            expect.objectContaining({
                event_type: 'blocked_operation',
                primary_error: expect.objectContaining({ message: 'primary insert failed' }),
                fallback_error: expect.objectContaining({ message: 'fallback insert failed' })
            })
        );
    });
});

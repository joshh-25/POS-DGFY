import { jest } from '@jest/globals';
import { buildActivateCompliantModeUseCase } from '../src/modules/compliance/usecases/complianceUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('activate compliant mode usecase', () => {
    const baseRepository = () => ({
        findTenantById: jest.fn().mockResolvedValue({
            id: 'tenant-1',
            compliance_mode_state: 'compliant_pending'
        }),
        beginTransaction: jest.fn().mockResolvedValue({
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            finished: false
        }),
        updateTenantById: jest.fn().mockResolvedValue({
            compliance_mode_state: 'compliant_active',
            compliance_activated_at: '2026-04-08T00:00:00.000Z',
            compliance_policy_version: '2026.04.07'
        }),
        createAuditLog: jest.fn().mockResolvedValue({ id: 1 }),
        createAuditFailureLog: jest.fn().mockResolvedValue({ id: 2 })
    });

    it('returns VALIDATION_FAILED when confirmation text is invalid', async () => {
        const useCase = buildActivateCompliantModeUseCase({
            complianceRepository: baseRepository(),
            getComplianceChecklistUseCase: jest.fn(),
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            actorUser: { user_id: 2, is_master_admin: true },
            confirmationText: 'WRONG TEXT'
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(422);
    });

    it('activates when confirmation text and checklist are valid', async () => {
        const complianceRepository = baseRepository();
        const getChecklist = jest.fn().mockResolvedValue({
            success: true,
            data: { ready_for_compliant_activation: true }
        });
        const useCase = buildActivateCompliantModeUseCase({
            complianceRepository,
            getComplianceChecklistUseCase: getChecklist,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            actorUser: { user_id: 2, is_master_admin: true },
            confirmationText: 'ACTIVATE COMPLIANT'
        });

        expect(result.success).toBe(true);
        expect(complianceRepository.updateTenantById).toHaveBeenCalled();
    });
});

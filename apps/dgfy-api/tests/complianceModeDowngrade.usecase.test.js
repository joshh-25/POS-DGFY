import { jest } from '@jest/globals';
import {
    buildSelectComplianceModeUseCase,
    buildUpgradeToCompliantUseCase,
    buildForceNonCompliantModeUseCase,
    buildRevertToNonCompliantModeUseCase
} from '../src/modules/compliance/usecases/complianceUseCases.js';

const baseTransaction = () => ({
    commit: jest.fn().mockImplementation(async function commit() {
        this.finished = true;
    }),
    rollback: jest.fn().mockImplementation(async function rollback() {
        this.finished = true;
    }),
    finished: false
});

const baseRepository = (tenantOverride = {}) => ({
    findTenantById: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        compliance_mode_state: 'compliant_pending',
        compliance_mode_choice_required: false,
        compliance_cycle_version: 2,
        compliance_revert_last_cycle_version: 1,
        ...tenantOverride
    }),
    beginTransaction: jest.fn().mockResolvedValue(baseTransaction()),
    updateTenantById: jest.fn().mockImplementation(async (_tenantId, payload) => ({
        compliance_mode_state: payload.compliance_mode_state,
        compliance_mode_choice_required: payload.compliance_mode_choice_required,
        compliance_mode_override_at: payload.compliance_mode_override_at || null,
        compliance_mode_override_by: payload.compliance_mode_override_by || null,
        compliance_mode_revert_at: payload.compliance_mode_revert_at || null,
        compliance_mode_revert_by: payload.compliance_mode_revert_by || null
    })),
    createAuditLog: jest.fn().mockResolvedValue({ id: 10 }),
    createAuditFailureLog: jest.fn().mockResolvedValue({ id: 20 })
});

describe('compliance mode downgrade escape hatch usecases', () => {
    it('platform admin selects non-compliant mode for legacy tenant with primary audit requirement', async () => {
        const repository = baseRepository({
            compliance_mode_state: null,
            compliance_mode_choice_required: true,
            compliance_cycle_version: 0
        });
        const useCase = buildSelectComplianceModeUseCase({
            complianceRepository: repository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            modeChoice: 'non_compliant',
            reason: 'Give tenant operational POS access',
            context: { source: 'admin_test' },
            requirePrimaryAudit: true,
            actorUser: { is_platform_admin: true, username: 'platform_admin' }
        });

        expect(result.success).toBe(true);
        expect(repository.updateTenantById).toHaveBeenCalledWith(
            'tenant-1',
            expect.objectContaining({
                compliance_mode_state: 'non_compliant_active',
                compliance_mode_choice_required: false
            }),
            expect.any(Object)
        );
        expect(repository.createAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: 'mode_selection',
                metadata: expect.objectContaining({
                    mode_choice: 'non_compliant',
                    mode_state: 'non_compliant_active',
                    reason: 'Give tenant operational POS access'
                })
            }),
            expect.any(Object)
        );
    });

    it('platform admin selects compliant mode for legacy tenant and lands in compliant pending', async () => {
        const repository = baseRepository({
            compliance_mode_state: null,
            compliance_mode_choice_required: true,
            compliance_cycle_version: 0
        });
        const useCase = buildSelectComplianceModeUseCase({
            complianceRepository: repository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            modeChoice: 'compliant',
            reason: 'Tenant requested compliant onboarding',
            requirePrimaryAudit: true,
            actorUser: { is_platform_admin: true, username: 'platform_admin' }
        });

        expect(result.success).toBe(true);
        expect(repository.updateTenantById).toHaveBeenCalledWith(
            'tenant-1',
            expect.objectContaining({
                compliance_mode_state: 'compliant_pending',
                compliance_mode_choice_required: false,
                compliance_cycle_version: 1
            }),
            expect.any(Object)
        );
    });

    it('platform admin upgrades non-compliant tenant to compliant pending', async () => {
        const repository = baseRepository({
            compliance_mode_state: 'non_compliant_active',
            compliance_mode_choice_required: false,
            compliance_cycle_version: 2
        });
        const useCase = buildUpgradeToCompliantUseCase({
            complianceRepository: repository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            reason: 'Tenant is preparing compliance documents',
            requirePrimaryAudit: true,
            actorUser: { is_platform_admin: true, username: 'platform_admin' }
        });

        expect(result.success).toBe(true);
        expect(result.data.mode_state).toBe('compliant_pending');
        expect(repository.updateTenantById).toHaveBeenCalledWith(
            'tenant-1',
            expect.objectContaining({
                compliance_mode_state: 'compliant_pending',
                compliance_cycle_version: 3
            }),
            expect.any(Object)
        );
        expect(repository.updateTenantById).not.toHaveBeenCalledWith(
            'tenant-1',
            expect.objectContaining({ compliance_mode_state: 'compliant_active' }),
            expect.any(Object)
        );
    });

    it('admin compliant upgrade fails closed when primary audit persistence falls back', async () => {
        const transaction = baseTransaction();
        const repository = baseRepository({
            compliance_mode_state: 'non_compliant_active',
            compliance_cycle_version: 2
        });
        repository.beginTransaction = jest.fn().mockResolvedValue(transaction);
        repository.createAuditLog = jest.fn().mockRejectedValue(new Error('audit write failed'));
        repository.createAuditFailureLog = jest.fn().mockResolvedValue({ id: 23 });
        const useCase = buildUpgradeToCompliantUseCase({
            complianceRepository: repository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            reason: 'Need compliant pending access',
            requirePrimaryAudit: true,
            actorUser: { is_platform_admin: true, username: 'platform_admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(500);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it('platform force succeeds from compliant state', async () => {
        const repository = baseRepository({ compliance_mode_state: 'compliant_active' });
        const useCase = buildForceNonCompliantModeUseCase({
            complianceRepository: repository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            reason: 'Emergency rollback due to bad rollout',
            actorUser: { is_platform_admin: true, username: 'platform_admin' }
        });

        expect(result.success).toBe(true);
        expect(repository.updateTenantById).toHaveBeenCalledWith(
            'tenant-1',
            expect.objectContaining({
                compliance_mode_state: 'non_compliant_active',
                compliance_mode_choice_required: false
            }),
            expect.any(Object)
        );
    });

    it('platform force returns conflict when already non-compliant', async () => {
        const repository = baseRepository({ compliance_mode_state: 'non_compliant_active' });
        const useCase = buildForceNonCompliantModeUseCase({
            complianceRepository: repository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            reason: 'Force non-compliant',
            actorUser: { is_platform_admin: true, username: 'platform_admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
    });

    it('tenant revert succeeds once within cycle', async () => {
        const repository = baseRepository({
            compliance_mode_state: 'compliant_pending',
            compliance_cycle_version: 3,
            compliance_revert_last_cycle_version: 2
        });
        const useCase = buildRevertToNonCompliantModeUseCase({
            complianceRepository: repository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            reason: 'Selected compliant by mistake',
            actorUser: { user_id: 7, is_master_admin: true }
        });

        expect(result.success).toBe(true);
        expect(repository.updateTenantById).toHaveBeenCalledWith(
            'tenant-1',
            expect.objectContaining({
                compliance_mode_state: 'non_compliant_active',
                compliance_revert_last_cycle_version: 3
            }),
            expect.any(Object)
        );
    });

    it('tenant revert fails when already used in current cycle', async () => {
        const repository = baseRepository({
            compliance_mode_state: 'compliant_active',
            compliance_cycle_version: 4,
            compliance_revert_last_cycle_version: 4
        });
        const useCase = buildRevertToNonCompliantModeUseCase({
            complianceRepository: repository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            reason: 'Need rollback',
            actorUser: { user_id: 7, is_master_admin: true }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
    });

    it('tenant revert denies non-master-admin actor', async () => {
        const repository = baseRepository();
        const useCase = buildRevertToNonCompliantModeUseCase({
            complianceRepository: repository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            reason: 'Need rollback',
            actorUser: { user_id: 2, is_master_admin: false }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
    });

    it('force operation fails closed when primary audit persistence falls back', async () => {
        const transaction = baseTransaction();
        const repository = baseRepository({ compliance_mode_state: 'compliant_active' });
        repository.beginTransaction = jest.fn().mockResolvedValue(transaction);
        repository.createAuditLog = jest.fn().mockRejectedValue(new Error('audit write failed'));
        repository.createAuditFailureLog = jest.fn().mockResolvedValue({ id: 21 });

        const useCase = buildForceNonCompliantModeUseCase({
            complianceRepository: repository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            reason: 'Emergency rollback due to bad rollout',
            actorUser: { is_platform_admin: true, username: 'platform_admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(500);
        expect(repository.createAuditFailureLog).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it('revert operation fails closed when primary audit persistence falls back', async () => {
        const transaction = baseTransaction();
        const repository = baseRepository({
            compliance_mode_state: 'compliant_pending',
            compliance_cycle_version: 3,
            compliance_revert_last_cycle_version: 2
        });
        repository.beginTransaction = jest.fn().mockResolvedValue(transaction);
        repository.createAuditLog = jest.fn().mockRejectedValue(new Error('audit write failed'));
        repository.createAuditFailureLog = jest.fn().mockResolvedValue({ id: 22 });

        const useCase = buildRevertToNonCompliantModeUseCase({
            complianceRepository: repository,
            logger: { warn: jest.fn(), error: jest.fn() }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            reason: 'Selected compliant by mistake',
            actorUser: { user_id: 7, is_master_admin: true }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(500);
        expect(repository.createAuditFailureLog).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });
});

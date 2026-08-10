import { jest } from '@jest/globals';
import {
    buildSelectComplianceModeUseCase,
    buildUpdateComplianceArtifactVerificationUseCase
} from '../src/modules/compliance/usecases/complianceUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('compliance usecase authorization', () => {
    it('returns AUTHORIZATION_FAILED for mode selection when actor is not master-admin level', async () => {
        const useCase = buildSelectComplianceModeUseCase({
            complianceRepository: {
                findTenantById: jest.fn()
            }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            modeChoice: 'non_compliant',
            actorUser: { user_id: 5, is_master_admin: false, is_platform_admin: false }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
        expect(result.error.statusCode).toBe(403);
    });

    it('returns AUTHORIZATION_FAILED for artifact verification when actor is not master-admin level', async () => {
        const useCase = buildUpdateComplianceArtifactVerificationUseCase({
            complianceRepository: {
                updateArtifactById: jest.fn()
            }
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            artifactId: 10,
            payload: { action: 'verify' },
            actorUser: { user_id: 9, is_master_admin: false, is_platform_admin: false }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
        expect(result.error.statusCode).toBe(403);
    });
});

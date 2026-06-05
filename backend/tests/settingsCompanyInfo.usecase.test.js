import { jest } from '@jest/globals';
import { buildGetCompanyInfoUseCase } from '../src/modules/settings/usecases/getCompanyInfoUseCase.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('buildGetCompanyInfoUseCase', () => {
    it('returns tenant payload when tenant exists', async () => {
        const tenantRepository = {
            findById: jest.fn().mockResolvedValue({
                name: 'Tenant A',
                company_token: 'token-a'
            })
        };

        const useCase = buildGetCompanyInfoUseCase({
            tenantRepository
        });

        const result = await useCase({ tenantId: 'tenant-1' });
        expect(result.success).toBe(true);
        expect(result.data).toEqual({
            company_name: 'Tenant A',
            company_token: 'token-a'
        });
        expect(result.data.registration_link).toBeUndefined();
    });

    it('returns failure result when tenant context is missing', async () => {
        const useCase = buildGetCompanyInfoUseCase({
            tenantRepository: { findById: jest.fn() }
        });

        const result = await useCase({ tenantId: null });
        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.TENANT_CONTEXT_MISSING);
    });
});

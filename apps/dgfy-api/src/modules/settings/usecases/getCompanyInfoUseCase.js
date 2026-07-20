import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const buildGetCompanyInfoUseCase = ({ tenantRepository }) => {
    return async ({ tenantId }) => {
        if (!tenantId) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_CONTEXT_MISSING,
                'No tenant context found'
            ));
        }

        const tenant = await tenantRepository.findById(tenantId);
        if (!tenant) {
            return fail(new DomainError(
                DomainErrorCode.TENANT_NOT_FOUND,
                'Tenant not found'
            ));
        }

        return ok({
            company_name: tenant.name,
            company_token: tenant.company_token
        });
    };
};

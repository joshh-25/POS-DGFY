import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const buildListTenantsUseCase = ({ tenantAdminRepository, logger }) => {
    return async ({ status }) => {
        try {
            const where = {};
            if (status && status !== 'all') {
                where.status = status;
            }

            const tenants = await tenantAdminRepository.listTenants(where);
            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    data: tenants
                }
            });
        } catch (error) {
            logger?.error?.('List tenants error:', error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message,
                { statusCode: 500 }
            ));
        }
    };
};

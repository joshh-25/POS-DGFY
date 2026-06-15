import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { readTenantPosMetadataSettings } from './tenantPosMetadataSettings.js';

export const buildGetTenantPosMetadataUseCase = ({
    tenantAdminRepository,
    tenantConnector,
    logger
}) => {
    return async ({ id }) => {
        try {
            const tenant = await tenantAdminRepository.findTenantById(id);
            if (!tenant) {
                return fail(new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'Tenant not found', { statusCode: 404 }));
            }
            const payload = await readTenantPosMetadataSettings({ tenant, tenantConnector });
            return ok({
                tenant_id: tenant.id,
                tenant_name: tenant.name,
                ...payload
            });
        } catch (error) {
            logger?.error?.('Get tenant POS metadata error:', error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to load tenant POS metadata',
                { statusCode: 500 }
            ));
        }
    };
};

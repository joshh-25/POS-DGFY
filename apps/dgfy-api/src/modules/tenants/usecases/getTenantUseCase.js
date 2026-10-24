import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { presentAdminTenant, toPlainAdminTenant } from './tenantAdminPresentation.js';

export const buildGetTenantUseCase = ({ tenantAdminRepository, tenantConnector, readTenantCapabilities, logger }) => {
    return async ({ id }) => {
        try {
            const tenant = await tenantAdminRepository.findAdminTenantById(id);
            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            const plainTenant = toPlainAdminTenant(tenant);
            let capabilities = null;
            if (plainTenant.status === 'active' && tenantConnector && readTenantCapabilities) {
                try {
                    capabilities = await readTenantCapabilities({ tenant: plainTenant, tenantConnector });
                } catch (capabilityError) {
                    logger?.warn?.('[GetTenant] Failed to load tenant capability settings', {
                        tenantId: plainTenant.id || null,
                        error: capabilityError.message
                    });
                    capabilities = { unavailable: true };
                }
            }

            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    data: presentAdminTenant(plainTenant, capabilities)
                }
            });
        } catch (error) {
            logger?.error?.('Get tenant error:', error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message,
                { statusCode: 500 }
            ));
        }
    };
};

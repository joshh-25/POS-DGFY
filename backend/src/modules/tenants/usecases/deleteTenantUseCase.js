import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const buildDeleteTenantUseCase = ({
    tenantAdminRepository,
    deleteTenantDatabase,
    removeStorefrontDiscoveryIndexForTenant,
    syncStorefrontDiscoveryIndexForTenant,
    logger
}) => {
    return async ({ id }) => {
        try {
            const tenant = await tenantAdminRepository.findTenantById(id);
            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            if (typeof removeStorefrontDiscoveryIndexForTenant === 'function') {
                try {
                    await removeStorefrontDiscoveryIndexForTenant({ tenantId: tenant.id });
                } catch (indexError) {
                    logger?.error?.(`Failed to remove storefront discovery index row for tenant ${tenant.id}:`, indexError);
                    return fail(new DomainError(
                        DomainErrorCode.INTERNAL_ERROR,
                        `Failed to remove storefront discovery index row: ${indexError.message}`,
                        { statusCode: 500 }
                    ));
                }
            }

            if (tenant.db_name) {
                try {
                    await deleteTenantDatabase(tenant.db_name);
                } catch (dbError) {
                    if (/Unknown database/i.test(dbError?.message || '')) {
                        logger?.warn?.(`Tenant database already absent for ${tenant.id} (${tenant.db_name}); continuing cleanup.`);
                    } else {
                        logger?.error?.(`Failed to delete database for tenant ${tenant.id}:`, dbError);
                        if (typeof syncStorefrontDiscoveryIndexForTenant === 'function') {
                            try {
                                await syncStorefrontDiscoveryIndexForTenant({ tenantId: tenant.id });
                            } catch (restoreError) {
                                logger?.warn?.(`Failed to restore storefront discovery index row for tenant ${tenant.id} after database deletion failure: ${restoreError.message}`);
                            }
                        }
                        return fail(new DomainError(
                            DomainErrorCode.INTERNAL_ERROR,
                            `Failed to delete database: ${dbError.message}`,
                            { statusCode: 500 }
                        ));
                    }
                }
            }

            await tenantAdminRepository.removeTenantDependencies(tenant.id);
            await tenantAdminRepository.destroyTenant(tenant);

            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    message: 'Tenant and database permanently deleted'
                }
            });
        } catch (error) {
            logger?.error?.('Delete tenant error:', error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message,
                { statusCode: 500 }
            ));
        }
    };
};

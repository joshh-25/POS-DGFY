import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const buildRegistrationInvoiceConflict = (applicationId, invoiceCount) => fail(new DomainError(
    DomainErrorCode.CONFLICT,
    `Tenant cannot be deleted because registration application ${applicationId} has ${invoiceCount} platform invoice(s). Invoices are never deleted by tenant deletion.`,
    { statusCode: 409 }
));

export const buildDeleteTenantUseCase = ({
    tenantAdminRepository,
    deleteTenantDatabase,
    removeStorefrontDiscoveryIndexForTenant,
    syncStorefrontDiscoveryIndexForTenant,
    logger
}) => {
    return async ({ id, forceDeleteRegistrationHistory = false, actor = {}, metadata = {} }) => {
        try {
            const tenant = await tenantAdminRepository.findTenantById(id);
            if (!tenant) {
                return fail(new DomainError(
                    DomainErrorCode.TENANT_NOT_FOUND,
                    'Tenant not found',
                    { statusCode: 404 }
                ));
            }

            const registrationApplication = await tenantAdminRepository.findCompanyRegistrationApplicationForTenant(tenant.id);
            if (registrationApplication) {
                const invoiceCount = await tenantAdminRepository.countPlatformInvoicesForRegistrationApplication(registrationApplication.id);
                if (invoiceCount > 0) {
                    return buildRegistrationInvoiceConflict(registrationApplication.id, invoiceCount);
                }

                if (!forceDeleteRegistrationHistory) {
                    return fail(new DomainError(
                        DomainErrorCode.CONFLICT,
                        `Tenant cannot be deleted because registration application ${registrationApplication.id} has review status "${registrationApplication.review_status}". Pass forceDeleteRegistrationHistory=true to delete its registration history.`,
                        { statusCode: 409 }
                    ));
                }

                const historyDeletion = await tenantAdminRepository.removeCompanyRegistrationApplicationAndHistory(registrationApplication.id);
                if (historyDeletion?.invoiceCount > 0) {
                    return buildRegistrationInvoiceConflict(registrationApplication.id, historyDeletion.invoiceCount);
                }

                await tenantAdminRepository.createTenantAdminAuditLog({
                    tenant_id: tenant.id,
                    action: 'force_delete_registration_history',
                    actor_username: String(actor?.username || 'platform_admin').slice(0, 120),
                    reason: 'Tenant deletion explicitly requested with forceDeleteRegistrationHistory=true',
                    request_id: metadata?.request_id || null,
                    ip_address: metadata?.ip_address || null,
                    user_agent: metadata?.user_agent || null,
                    before_snapshot: null,
                    after_snapshot: null,
                    metadata: {
                        registration_application_id: registrationApplication.id,
                        review_status: registrationApplication.review_status,
                        force_delete_registration_history: true
                    }
                });
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

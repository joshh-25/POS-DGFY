import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { presentAdminTenant, toPlainAdminTenant } from './tenantAdminPresentation.js';

const mapWithConcurrency = async (items = [], limit = 5, mapper) => {
    const results = new Array(items.length);
    let cursor = 0;
    const workerCount = Math.min(Math.max(Number(limit) || 1, 1), items.length || 1);
    const workers = Array.from({ length: workerCount }, async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await mapper(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
};

export const buildListTenantsUseCase = ({ tenantAdminRepository, tenantConnector, readTenantCapabilities, logger }) => {
    return async ({ status }) => {
        try {
            const where = {};
            if (status && status !== 'all') {
                where.status = status;
            }

            const tenants = await tenantAdminRepository.listTenants(where);
            const enrichedTenants = Array.isArray(tenants)
                ? await mapWithConcurrency(tenants, 5, async (tenant) => {
                    let capabilities = null;
                    const plainTenant = toPlainAdminTenant(tenant);
                    if (plainTenant.status === 'active' && tenantConnector && readTenantCapabilities) {
                        try {
                            capabilities = await readTenantCapabilities({ tenant: plainTenant, tenantConnector });
                        } catch (capabilityError) {
                            logger?.warn?.('[ListTenants] Failed to load tenant capability settings', {
                                tenantId: plainTenant.id || null,
                                error: capabilityError.message
                            });
                            capabilities = { unavailable: true };
                        }
                    }
                    return presentAdminTenant(plainTenant, capabilities);
                })
                : [];

            return ok({
                statusCode: 200,
                payload: {
                    success: true,
                    data: enrichedTenants
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

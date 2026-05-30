/**
 * Tenant admin repository contract for landlord-facing tenant lifecycle flows.
 *
 * Expected shape:
 * - transaction(callback)
 * - findTenantByName(name)
 * - createTenant(payload)
 * - findTenantById(tenantId)
 * - listTenants(where)
 * - updateTenant(tenant, payload)
 * - removeTenantDependencies(tenantId)
 * - destroyTenant(tenant)
 * - findSystemSettings(keys)
 * - updateSystemSetting(key, value)
 */
export const TenantAdminRepositoryContract = Object.freeze([
    'transaction',
    'findTenantByName',
    'createTenant',
    'findTenantById',
    'listTenants',
    'updateTenant',
    'removeTenantDependencies',
    'destroyTenant',
    'findSystemSettings',
    'updateSystemSetting'
]);

export const assertTenantAdminRepositoryContract = (repository) => {
    TenantAdminRepositoryContract.forEach((method) => {
        if (typeof repository?.[method] !== 'function') {
            throw new Error(`TenantAdminRepository missing required method: ${method}`);
        }
    });
};

/**
 * Tenant repository contract.
 *
 * Expected shape:
 * - findById(tenantId, options)
 * - findByName(name, options)
 */
export const TenantRepositoryContract = Object.freeze([
    'findById',
    'findByName'
]);

export const assertTenantRepositoryContract = (repository) => {
    TenantRepositoryContract.forEach((method) => {
        if (typeof repository?.[method] !== 'function') {
            throw new Error(`TenantRepository missing required method: ${method}`);
        }
    });
};

export const TenantLocationRepositoryContract = Object.freeze([
    'listLocations',
    'findById',
    'findByName',
    'beginTransaction',
    'findActivePrimary',
    'findPrimaryFallbackCandidate',
    'clearPrimaryFlags',
    'setPrimaryFlagById',
    'create',
    'updateById',
    'deactivateById',
    'countOperationalReferences',
    'deleteById'
]);

export const assertTenantLocationRepositoryContract = (repository) => {
    TenantLocationRepositoryContract.forEach((method) => {
        if (typeof repository?.[method] !== 'function') {
            throw new Error(`TenantLocationRepository missing required method: ${method}`);
        }
    });
};

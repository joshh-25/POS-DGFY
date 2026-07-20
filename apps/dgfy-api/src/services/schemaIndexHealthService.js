export const getSchemaIndexHealthService = (state = {}) => ({
    status: state.status || 'unknown',
    message: state.message || 'Schema index audit has not run yet.',
    enabled: state.enabled === true,
    last_checked_at: state.last_checked_at || null,
    tenants_checked: state.tenants_checked || 0,
    missing_count: state.missing_count || 0,
    missing: Array.isArray(state.missing) ? state.missing : []
});

export const applySchemaIndexHealthStatus = (health, state = {}) => {
    if (state.enabled === true && state.status === 'degraded') {
        health.success = false;
    }
    return health;
};

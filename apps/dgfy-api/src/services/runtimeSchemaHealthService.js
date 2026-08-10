export const getRuntimeSchemaHealthService = (state = {}) => ({
    status: state.status || 'unknown',
    message: state.message || 'Runtime schema audit has not run yet.',
    enabled: state.enabled === true,
    preflight_required: state.preflight_required === true,
    last_checked_at: state.last_checked_at || null,
    missing_migration_count: state.missing_migration_count || 0,
    missing_column_count: state.missing_column_count || 0,
    warning_count: state.warning_count || 0,
    missing_migrations: Array.isArray(state.missing_migrations) ? state.missing_migrations : [],
    missing_columns: Array.isArray(state.missing_columns) ? state.missing_columns : []
});

export const applyRuntimeSchemaHealthStatus = (health, state = {}) => {
    if (state.enabled === true && state.status === 'degraded') {
        health.success = false;
    }
    return health;
};

export default {
    getRuntimeSchemaHealthService,
    applyRuntimeSchemaHealthStatus
};

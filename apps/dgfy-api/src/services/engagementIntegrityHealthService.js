export const getBillingFunnelTelemetryHealthService = (state = {}) => ({
    status: state.status || 'unknown',
    message: state.message || 'Billing funnel telemetry audit has not run yet.',
    enabled: state.enabled === true,
    last_checked_at: state.last_checked_at || null,
    lookback_hours: state.lookback_hours || 0,
    attempt_grace_minutes: state.attempt_grace_minutes || 0,
    rows_scanned: state.rows_scanned || 0,
    recent_write_failures: state.recent_write_failures || 0,
    recent_skips: state.recent_skips || 0,
    recent_table_missing_skips: state.recent_table_missing_skips || 0,
    recent_model_unavailable_skips: state.recent_model_unavailable_skips || 0,
    recent_missing_event_type_skips: state.recent_missing_event_type_skips || 0,
    missing_correlation_count: state.missing_correlation_count || 0,
    missing_outcome_count: state.missing_outcome_count || 0,
    orphan_attempt_count: state.orphan_attempt_count || 0,
    duplicate_event_count: state.duplicate_event_count || 0,
    payment_without_telemetry_count: state.payment_without_telemetry_count || 0,
    tenant_state_mismatch_count: state.tenant_state_mismatch_count || 0,
    webhook_without_telemetry_count: state.webhook_without_telemetry_count || 0,
    route_outcome_mismatch_count: state.route_outcome_mismatch_count || 0,
    issues: Array.isArray(state.issues) ? state.issues : []
});

export const applyBillingFunnelTelemetryHealthStatus = (health, state = {}) => {
    if (state.enabled === true && state.status === 'degraded') {
        health.success = false;
    }
    return health;
};

export default {
    getBillingFunnelTelemetryHealthService,
    applyBillingFunnelTelemetryHealthStatus
};

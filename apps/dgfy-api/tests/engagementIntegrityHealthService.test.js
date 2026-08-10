import {
    getBillingFunnelTelemetryHealthService,
    applyBillingFunnelTelemetryHealthStatus
} from '../src/services/engagementIntegrityHealthService.js';

describe('engagementIntegrityHealthService', () => {
    it('returns billing funnel telemetry payload in the expected shape', () => {
        const payload = getBillingFunnelTelemetryHealthService({
            status: 'degraded',
            message: 'Billing funnel telemetry integrity issues detected.',
            enabled: true,
            last_checked_at: '2026-03-06T09:00:00.000Z',
            lookback_hours: 24,
            attempt_grace_minutes: 15,
            rows_scanned: 8,
            recent_write_failures: 1,
            recent_skips: 2,
            recent_table_missing_skips: 1,
            recent_model_unavailable_skips: 0,
            recent_missing_event_type_skips: 0,
            missing_correlation_count: 1,
            missing_outcome_count: 1,
            orphan_attempt_count: 1,
            duplicate_event_count: 1,
            payment_without_telemetry_count: 1,
            tenant_state_mismatch_count: 2,
            webhook_without_telemetry_count: 1,
            route_outcome_mismatch_count: 1,
            issues: [{ type: 'orphan_attempt', event_type: 'premium_upgrade_attempted' }]
        });

        expect(payload).toEqual({
            status: 'degraded',
            message: 'Billing funnel telemetry integrity issues detected.',
            enabled: true,
            last_checked_at: '2026-03-06T09:00:00.000Z',
            lookback_hours: 24,
            attempt_grace_minutes: 15,
            rows_scanned: 8,
            recent_write_failures: 1,
            recent_skips: 2,
            recent_table_missing_skips: 1,
            recent_model_unavailable_skips: 0,
            recent_missing_event_type_skips: 0,
            missing_correlation_count: 1,
            missing_outcome_count: 1,
            orphan_attempt_count: 1,
            duplicate_event_count: 1,
            payment_without_telemetry_count: 1,
            tenant_state_mismatch_count: 2,
            webhook_without_telemetry_count: 1,
            route_outcome_mismatch_count: 1,
            issues: [{ type: 'orphan_attempt', event_type: 'premium_upgrade_attempted' }]
        });
    });

    it('flips health.success to false when billing funnel telemetry status is degraded', () => {
        const health = { success: true };
        const result = applyBillingFunnelTelemetryHealthStatus(health, {
            enabled: true,
            status: 'degraded'
        });

        expect(result.success).toBe(false);
    });
});

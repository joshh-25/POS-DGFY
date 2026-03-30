import { buildHealthResponse } from '../src/services/healthService.js';

describe('healthService', () => {
    it('returns schema index payload and degrades health to 503 when indexes are degraded', async () => {
        const runtimeSchemaAuditState = {
            enabled: true,
            preflight_required: true,
            status: 'degraded',
            message: 'Runtime schema readiness checks failed.',
            last_checked_at: '2026-03-03T00:00:00.000Z',
            missing_migration_count: 1,
            missing_column_count: 1,
            warning_count: 0,
            missing_migrations: ['20260328000001-add-pos-order-method-fees.cjs'],
            missing_columns: [{ table: 'items', column: 'vat_type' }]
        };
        const schemaIndexAuditState = {
            enabled: true,
            status: 'degraded',
            message: 'Required index contract has missing indexes.',
            last_checked_at: '2026-03-03T00:00:00.000Z',
            tenants_checked: 2,
            missing_count: 1,
            missing: [{ database: 'tenant_a', table: 'items', columns: 'folder_id', type: 'single' }]
        };
        const billingFunnelAuditState = {
            enabled: true,
            status: 'degraded',
            message: 'Billing funnel telemetry integrity issues detected.',
            last_checked_at: '2026-03-03T00:30:00.000Z',
            lookback_hours: 24,
            attempt_grace_minutes: 15,
            rows_scanned: 12,
            recent_write_failures: 1,
            recent_skips: 1,
            recent_table_missing_skips: 0,
            recent_model_unavailable_skips: 0,
            recent_missing_event_type_skips: 0,
            missing_correlation_count: 1,
            missing_outcome_count: 0,
            orphan_attempt_count: 1,
            duplicate_event_count: 0,
            payment_without_telemetry_count: 1,
            tenant_state_mismatch_count: 1,
            webhook_without_telemetry_count: 1,
            route_outcome_mismatch_count: 1,
            issues: [{ type: 'orphan_attempt', event_type: 'premium_upgrade_attempted', correlation_id: 'req-1' }]
        };

        const { health, statusCode } = await buildHealthResponse({
            testConnectionFn: async () => true,
            isRedisConnectedFn: () => true,
            getTenantPoolStatsFn: () => ({
                total: 2,
                pending: 0,
                capacity: 20,
                utilizationPercent: 10
            }),
            runtimeSchemaAuditState,
            schemaIndexAuditState,
            billingFunnelAuditState,
            environment: 'test',
            timestamp: '2026-03-03T01:00:00.000Z',
            uptimeSeconds: 42
        });

        expect(statusCode).toBe(503);
        expect(health.success).toBe(false);
        expect(health.services.runtimeSchema).toEqual({
            status: 'degraded',
            message: 'Runtime schema readiness checks failed.',
            enabled: true,
            preflight_required: true,
            last_checked_at: '2026-03-03T00:00:00.000Z',
            missing_migration_count: 1,
            missing_column_count: 1,
            warning_count: 0,
            missing_migrations: ['20260328000001-add-pos-order-method-fees.cjs'],
            missing_columns: [{ table: 'items', column: 'vat_type' }]
        });
        expect(health.services.schemaIndexes).toEqual({
            status: 'degraded',
            message: 'Required index contract has missing indexes.',
            enabled: true,
            last_checked_at: '2026-03-03T00:00:00.000Z',
            tenants_checked: 2,
            missing_count: 1,
            missing: [{ database: 'tenant_a', table: 'items', columns: 'folder_id', type: 'single' }]
        });
        expect(health.services.billingFunnelTelemetry).toEqual({
            status: 'degraded',
            message: 'Billing funnel telemetry integrity issues detected.',
            enabled: true,
            last_checked_at: '2026-03-03T00:30:00.000Z',
            lookback_hours: 24,
            attempt_grace_minutes: 15,
            rows_scanned: 12,
            recent_write_failures: 1,
            recent_skips: 1,
            recent_table_missing_skips: 0,
            recent_model_unavailable_skips: 0,
            recent_missing_event_type_skips: 0,
            missing_correlation_count: 1,
            missing_outcome_count: 0,
            orphan_attempt_count: 1,
            duplicate_event_count: 0,
            payment_without_telemetry_count: 1,
            tenant_state_mismatch_count: 1,
            webhook_without_telemetry_count: 1,
            route_outcome_mismatch_count: 1,
            issues: [{ type: 'orphan_attempt', event_type: 'premium_upgrade_attempted', correlation_id: 'req-1' }]
        });
    });

    it('returns 200 when database is healthy and schema index status is healthy', async () => {
        const { health, statusCode } = await buildHealthResponse({
            testConnectionFn: async () => true,
            isRedisConnectedFn: () => false,
            getTenantPoolStatsFn: () => ({
                total: 1,
                pending: 0,
                capacity: 20,
                utilizationPercent: 5
            }),
            runtimeSchemaAuditState: {
                enabled: true,
                preflight_required: true,
                status: 'healthy',
                message: 'Runtime schema readiness checks passed.',
                last_checked_at: '2026-03-03T00:00:00.000Z',
                missing_migration_count: 0,
                missing_column_count: 0,
                warning_count: 0,
                missing_migrations: [],
                missing_columns: []
            },
            schemaIndexAuditState: {
                enabled: true,
                status: 'healthy',
                message: 'Required index contract satisfied.',
                last_checked_at: '2026-03-03T00:00:00.000Z',
                tenants_checked: 1,
                missing_count: 0,
                missing: []
            },
            billingFunnelAuditState: {
                enabled: true,
                status: 'healthy',
                message: 'Billing funnel telemetry integrity checks passed.',
                last_checked_at: '2026-03-03T00:30:00.000Z',
                lookback_hours: 24,
                attempt_grace_minutes: 15,
                rows_scanned: 5,
                recent_write_failures: 0,
                recent_skips: 0,
                recent_table_missing_skips: 0,
                recent_model_unavailable_skips: 0,
                recent_missing_event_type_skips: 0,
                missing_correlation_count: 0,
                missing_outcome_count: 0,
                orphan_attempt_count: 0,
                duplicate_event_count: 0,
                payment_without_telemetry_count: 0,
                tenant_state_mismatch_count: 0,
                webhook_without_telemetry_count: 0,
                route_outcome_mismatch_count: 0,
                issues: []
            },
            environment: 'test'
        });

        expect(statusCode).toBe(200);
        expect(health.success).toBe(true);
        expect(health.services.database.status).toBe('connected');
        expect(health.services.redis.status).toBe('disconnected');
        expect(health.services.runtimeSchema.status).toBe('healthy');
        expect(health.services.schemaIndexes.status).toBe('healthy');
        expect(health.services.billingFunnelTelemetry.status).toBe('healthy');
    });
});

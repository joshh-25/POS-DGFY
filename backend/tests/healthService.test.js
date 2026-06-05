import { buildHealthResponse } from '../src/services/healthService.js';

const originalEnv = { ...process.env };

describe('healthService', () => {
    afterEach(() => {
        process.env = { ...originalEnv };
    });

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
        process.env = {
            ...originalEnv,
            HOSTING_PROFILE: 'shared',
            REDIS_URL: '',
            AUTH_BLACKLIST_FAILURE_MODE: 'fail_open',
            TEMP_FILE_STORAGE: 'local'
        };

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

    it('exposes shared-hosting capability status without failing health for absent Redis', async () => {
        process.env = {
            ...originalEnv,
            NODE_ENV: 'production',
            HOSTING_PROFILE: 'shared',
            REDIS_URL: '',
            AUTH_BLACKLIST_FAILURE_MODE: 'fail_open',
            TEMP_FILE_STORAGE: 'local'
        };

        const { health, statusCode } = await buildHealthResponse({
            testConnectionFn: async () => true,
            isRedisConnectedFn: () => false,
            getTenantPoolStatsFn: () => ({
                total: 1,
                pending: 0,
                capacity: 20,
                utilizationPercent: 5
            }),
            getRateLimiterStoreModeFn: () => 'memory',
            environment: 'production'
        });

        expect(statusCode).toBe(200);
        expect(health.capabilities).toEqual({
            hostingProfile: 'shared',
            redis: {
                configured: false,
                connected: false,
                required: false,
                status: 'optional_unavailable'
            },
            tokenBlacklist: {
                mode: 'fail_open',
                requiresRedis: false,
                status: 'healthy',
                message: 'Token blacklist policy is satisfiable by the current runtime.'
            },
            tempFileStorage: {
                mode: 'local'
            },
            rateLimitStore: {
                mode: 'memory'
            },
            schedulerLock: {
                mode: 'single_instance'
            }
        });
    });

    it('degrades health when VPS profile requires Redis but Redis is unavailable', async () => {
        process.env = {
            ...originalEnv,
            NODE_ENV: 'production',
            HOSTING_PROFILE: 'vps',
            REDIS_URL: 'redis://127.0.0.1:6379',
            AUTH_BLACKLIST_FAILURE_MODE: 'fail_closed',
            TEMP_FILE_STORAGE: 'auto'
        };

        const { health, statusCode } = await buildHealthResponse({
            testConnectionFn: async () => true,
            isRedisConnectedFn: () => false,
            getTenantPoolStatsFn: () => ({
                total: 1,
                pending: 0,
                capacity: 20,
                utilizationPercent: 5
            }),
            getRateLimiterStoreModeFn: () => 'memory_fallback',
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
            environment: 'production'
        });

        expect(statusCode).toBe(503);
        expect(health.success).toBe(false);
        expect(health.services.redis).toEqual(expect.objectContaining({
            status: 'degraded',
            configured: true,
            connected: false,
            required: true
        }));
        expect(health.capabilities.redis).toEqual({
            configured: true,
            connected: false,
            required: true,
            status: 'degraded'
        });
        expect(health.capabilities.tokenBlacklist).toEqual({
            mode: 'fail_closed',
            requiresRedis: true,
            status: 'degraded',
            message: 'Token blacklist is fail-closed but Redis is not configured and connected; authenticated APIs will return 503.'
        });
    });

    it('degrades health when fail-closed token blacklist cannot use Redis even on a shared profile', async () => {
        process.env = {
            ...originalEnv,
            NODE_ENV: 'production',
            HOSTING_PROFILE: 'shared',
            REDIS_URL: '',
            AUTH_BLACKLIST_FAILURE_MODE: 'fail_closed',
            TEMP_FILE_STORAGE: 'local'
        };

        const { health, statusCode } = await buildHealthResponse({
            testConnectionFn: async () => true,
            isRedisConnectedFn: () => false,
            getTenantPoolStatsFn: () => ({
                total: 1,
                pending: 0,
                capacity: 20,
                utilizationPercent: 5
            }),
            getRateLimiterStoreModeFn: () => 'memory',
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
            environment: 'production'
        });

        expect(statusCode).toBe(503);
        expect(health.success).toBe(false);
        expect(health.capabilities.tokenBlacklist.status).toBe('degraded');
    });
});

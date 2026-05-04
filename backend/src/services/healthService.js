import { getSchemaIndexHealthService, applySchemaIndexHealthStatus } from './schemaIndexHealthService.js';
import {
    getBillingFunnelTelemetryHealthService,
    applyBillingFunnelTelemetryHealthStatus
} from './engagementIntegrityHealthService.js';
import {
    getRuntimeSchemaHealthService,
    applyRuntimeSchemaHealthStatus
} from './runtimeSchemaHealthService.js';
import {
    getHostingProfile,
    getTokenBlacklistFailureMode,
    isRedisConfigured,
    resolveSchedulerLockMode,
    resolveTempFileStorageMode
} from '../config/hostingProfile.js';

const buildUptime = (seconds) => `${Math.floor(seconds)}s`;

export const buildHealthResponse = async ({
    testConnectionFn,
    isRedisConnectedFn,
    getTenantPoolStatsFn,
    getRateLimiterStoreModeFn,
    runtimeSchemaAuditState = {},
    schemaIndexAuditState = {},
    billingFunnelAuditState = {},
    environment = process.env.NODE_ENV || 'development',
    timestamp = new Date().toISOString(),
    uptimeSeconds = process.uptime()
} = {}) => {
    const hostingProfile = getHostingProfile();
    const redisConfigured = isRedisConfigured();
    const redisRequired = hostingProfile === 'vps';
    const health = {
        success: true,
        message: 'Server is running',
        timestamp,
        uptime: buildUptime(uptimeSeconds),
        environment,
        services: {
            database: {
                status: 'unknown',
                message: 'Checking...'
            },
            redis: {
                status: 'unknown',
                message: 'Checking...',
                available: false
            },
            runtimeSchema: getRuntimeSchemaHealthService(runtimeSchemaAuditState),
            schemaIndexes: getSchemaIndexHealthService(schemaIndexAuditState),
            billingFunnelTelemetry: getBillingFunnelTelemetryHealthService(billingFunnelAuditState)
        }
    };

    // Check database connection
    try {
        const dbConnected = await testConnectionFn();
        health.services.database = {
            status: dbConnected ? 'connected' : 'disconnected',
            message: dbConnected ? 'Database connection healthy' : 'Database connection failed'
        };
        if (!dbConnected) {
            health.success = false;
        }
    } catch (error) {
        health.services.database = {
            status: 'error',
            message: error.message
        };
        health.success = false;
    }

    let redisConnected = false;

    // Check Redis connection
    try {
        redisConnected = isRedisConnectedFn();
        health.services.redis = {
            status: redisConnected ? 'connected' : (redisRequired ? 'degraded' : 'disconnected'),
            message: redisConnected
                ? 'Redis connection healthy'
                : (redisRequired ? 'Redis is required for this hosting profile but is not connected' : 'Redis not available (optional)'),
            available: redisConnected,
            configured: redisConfigured,
            connected: redisConnected,
            required: redisRequired
        };
        if (redisRequired && !redisConnected) {
            health.success = false;
        }
    } catch (error) {
        health.services.redis = {
            status: 'error',
            message: error.message,
            available: false,
            configured: redisConfigured,
            connected: false,
            required: redisRequired
        };
        if (redisRequired) {
            health.success = false;
        }
    }

    const rateLimitStoreMode = typeof getRateLimiterStoreModeFn === 'function'
        ? getRateLimiterStoreModeFn()
        : (redisConnected ? 'redis' : (redisConfigured ? 'memory_fallback' : 'memory'));

    health.capabilities = {
        hostingProfile,
        redis: {
            configured: redisConfigured,
            connected: redisConnected,
            required: redisRequired,
            status: redisConnected ? 'available' : (redisRequired ? 'degraded' : 'optional_unavailable')
        },
        tokenBlacklist: {
            mode: getTokenBlacklistFailureMode()
        },
        tempFileStorage: {
            mode: resolveTempFileStorageMode({ cacheAvailable: redisConnected })
        },
        rateLimitStore: {
            mode: rateLimitStoreMode
        },
        schedulerLock: {
            mode: resolveSchedulerLockMode({ redisConnected })
        }
    };

    // Tenant connection pool stats
    try {
        const poolStats = getTenantPoolStatsFn();
        health.services.tenantPool = {
            status: poolStats.utilizationPercent > 90 ? 'warning' : 'healthy',
            active: poolStats.total,
            pending: poolStats.pending,
            capacity: poolStats.capacity,
            utilization: `${poolStats.utilizationPercent}%`
        };
    } catch (error) {
        health.services.tenantPool = {
            status: 'error',
            message: error.message
        };
    }

    applyRuntimeSchemaHealthStatus(health, runtimeSchemaAuditState);
    applySchemaIndexHealthStatus(health, schemaIndexAuditState);
    applyBillingFunnelTelemetryHealthStatus(health, billingFunnelAuditState);

    return {
        health,
        statusCode: health.success ? 200 : 503
    };
};

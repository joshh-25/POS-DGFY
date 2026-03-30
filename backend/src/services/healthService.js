import { getSchemaIndexHealthService, applySchemaIndexHealthStatus } from './schemaIndexHealthService.js';
import {
    getBillingFunnelTelemetryHealthService,
    applyBillingFunnelTelemetryHealthStatus
} from './engagementIntegrityHealthService.js';
import {
    getRuntimeSchemaHealthService,
    applyRuntimeSchemaHealthStatus
} from './runtimeSchemaHealthService.js';

const buildUptime = (seconds) => `${Math.floor(seconds)}s`;

export const buildHealthResponse = async ({
    testConnectionFn,
    isRedisConnectedFn,
    getTenantPoolStatsFn,
    runtimeSchemaAuditState = {},
    schemaIndexAuditState = {},
    billingFunnelAuditState = {},
    environment = process.env.NODE_ENV || 'development',
    timestamp = new Date().toISOString(),
    uptimeSeconds = process.uptime()
} = {}) => {
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

    // Check Redis connection
    try {
        const redisConnected = isRedisConnectedFn();
        health.services.redis = {
            status: redisConnected ? 'connected' : 'disconnected',
            message: redisConnected ? 'Redis connection healthy' : 'Redis not available (optional)',
            available: redisConnected
        };
        // Redis is optional, so don't mark health as failed if it's not connected
    } catch (error) {
        health.services.redis = {
            status: 'error',
            message: error.message,
            available: false
        };
    }

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

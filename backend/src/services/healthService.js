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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metricsEnabled } from './metricsService.js';
import { isStructuredRequestLoggingEnabled } from './observabilityUtils.js';

const buildUptime = (seconds) => `${Math.floor(seconds)}s`;

const currentFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFilePath), '../../..');
const defaultDeployStatePath = path.join(repoRoot, '.deploy-state', 'last_deployed_commit');

const runtimeShaPattern = /^[a-f0-9]{7,40}$/i;

const normalizeRuntimeSha = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return runtimeShaPattern.test(normalized) ? normalized : null;
};

const readDeployStateSha = (deployStatePath) => {
    try {
        return normalizeRuntimeSha(fs.readFileSync(deployStatePath, 'utf8'));
    } catch (_error) {
        return null;
    }
};

export const resolveRuntimeShaInfo = ({
    explicitRuntimeSha,
    deployStatePath = defaultDeployStatePath,
    environment = process.env.NODE_ENV || 'development'
} = {}) => {
    const explicitSha = normalizeRuntimeSha(explicitRuntimeSha);
    if (explicitSha) {
        return { runtimeSha: explicitSha, source: 'argument', present: true };
    }

    const envCandidates = [
        ['RELEASE_TARGET_SHA', process.env.RELEASE_TARGET_SHA],
        ['DEPLOYED_COMMIT', process.env.DEPLOYED_COMMIT],
        ['RELEASE_SHA', process.env.RELEASE_SHA],
        ['GIT_SHA', process.env.GIT_SHA],
        ['GIT_COMMIT', process.env.GIT_COMMIT],
        ['COMMIT_SHA', process.env.COMMIT_SHA],
        ['SOURCE_VERSION', process.env.SOURCE_VERSION],
        ['RENDER_GIT_COMMIT', process.env.RENDER_GIT_COMMIT],
        ['VERCEL_GIT_COMMIT_SHA', process.env.VERCEL_GIT_COMMIT_SHA]
    ];

    for (const [source, value] of envCandidates) {
        const sha = normalizeRuntimeSha(value);
        if (sha) {
            return { runtimeSha: sha, source: `env:${source}`, present: true };
        }
    }

    if (environment === 'production' || process.env.RUNTIME_SHA_DEPLOY_STATE_FALLBACK === '1') {
        const deployStateSha = readDeployStateSha(deployStatePath);
        if (deployStateSha) {
            return { runtimeSha: deployStateSha, source: 'deploy_state:last_deployed_commit', present: true };
        }
    }

    return { runtimeSha: null, source: null, present: false };
};

export const buildHealthResponse = async ({
    testConnectionFn,
    isRedisConnectedFn,
    getTenantPoolStatsFn,
    getRateLimiterStoreModeFn,
    runtimeSchemaAuditState = {},
    schemaIndexAuditState = {},
    billingFunnelAuditState = {},
    environment = process.env.NODE_ENV || 'development',
    runtimeSha,
    deployStatePath = defaultDeployStatePath,
    timestamp = new Date().toISOString(),
    uptimeSeconds = process.uptime()
} = {}) => {
    const hostingProfile = getHostingProfile();
    const redisConfigured = isRedisConfigured();
    const redisRequired = hostingProfile === 'vps';
    const runtimeShaInfo = resolveRuntimeShaInfo({
        explicitRuntimeSha: runtimeSha,
        deployStatePath,
        environment
    });
    const runtimeShaMissingInProduction = environment === 'production' && !runtimeShaInfo.present;
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
            billingFunnelTelemetry: getBillingFunnelTelemetryHealthService(billingFunnelAuditState),
            observability: {
                status: runtimeShaMissingInProduction ? 'warning' : 'healthy',
                trace_context_enabled: true,
                request_id_header: 'x-request-id',
                trace_id_header: 'x-trace-id',
                structured_request_logging_enabled: isStructuredRequestLoggingEnabled(),
                metrics_enabled: metricsEnabled(),
                runtime_sha: runtimeShaInfo.runtimeSha,
                runtime_sha_present: runtimeShaInfo.present,
                runtime_sha_source: runtimeShaInfo.source,
                telemetry_audit_status: billingFunnelAuditState?.status || 'unknown',
                telemetry_audit_last_checked_at: billingFunnelAuditState?.last_checked_at || null
            }
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

    const tokenBlacklistMode = getTokenBlacklistFailureMode();
    const tokenBlacklistRequiresRedis = tokenBlacklistMode === 'fail_closed';
    const tokenBlacklistHealthy = !tokenBlacklistRequiresRedis || (redisConfigured && redisConnected);

    health.capabilities = {
        hostingProfile,
        redis: {
            configured: redisConfigured,
            connected: redisConnected,
            required: redisRequired,
            status: redisConnected ? 'available' : (redisRequired ? 'degraded' : 'optional_unavailable')
        },
        tokenBlacklist: {
            mode: tokenBlacklistMode,
            requiresRedis: tokenBlacklistRequiresRedis,
            status: tokenBlacklistHealthy ? 'healthy' : 'degraded',
            message: tokenBlacklistHealthy
                ? 'Token blacklist policy is satisfiable by the current runtime.'
                : 'Token blacklist is fail-closed but Redis is not configured and connected; authenticated APIs will return 503.'
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

    if (!tokenBlacklistHealthy) {
        health.success = false;
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

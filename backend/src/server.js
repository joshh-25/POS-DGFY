// Load environment variables FIRST - before any other imports
// This ensures JWT_SECRET and other env vars are available when authService.js loads
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from the backend directory (parent of src)
dotenv.config({ path: join(__dirname, '..', '.env') });

import paymentRoutes from './routes/payments.js';
import commercePaymentRoutes from './routes/commercePayments.js';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import express from 'express'; // Added missing express import if it was implicit before? No, it's used at line 35.
// Let's just fix the order.

import { testConnection } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { requestContext } from './middleware/requestContext.js';
import requestOutcomeLogger from './middleware/requestOutcomeLogger.js';
import { metricsMiddleware } from './middleware/metricsMiddleware.js';
import csrfProtection from './middleware/csrfProtection.js';
import logger from './config/logger.js';
import { generalLimiter, getRateLimiterStoreMode } from './middleware/rateLimiter.js';
import { initializeRedis, closeRedis, isRedisConnected } from './config/redis.js';
import { initCleanupJob } from './services/cleanupService.js';
import { initBillingScheduler } from './schedulers/billingScheduler.js';
import sequelize from './config/database.js';
import './models/index.js'; // Initialize model associations
import { tenantHandler } from './middleware/tenantHandler.js';
import tenantConnector from './utils/TenantConnector.js';
import { auditRequiredIndexes } from './services/schemaIndexAuditService.js';
import { auditBillingFunnelIntegrity } from './services/engagementIntegrityAuditService.js';
import { buildHealthResponse } from './services/healthService.js';
import { metricsEnabled, renderPrometheusMetrics } from './services/metricsService.js';
import { auditRuntimeSchemaReadiness } from './services/runtimeSchemaAuditService.js';
import {
  startStorefrontDiscoveryIndexReconciliationScheduler,
  stopStorefrontDiscoveryIndexReconciliationScheduler
} from './services/storefrontDiscoveryIndexService.js';
import {
  startGeoInventoryWorker,
  stopGeoInventoryWorker
} from './workers/geoInventoryWorker.js';
import * as aiController from './controllers/aiController.js';
import { paymentsEnabled } from './config/paymentsFeature.js';
import productionEnvValidation from './config/productionEnvValidation.cjs';

const { formatValidationFailure, validateProductionEnv } = productionEnvValidation;

const app = express();

// Fix 7.3: Use Node's built-in querystring parser instead of qs.
// Prevents Sequelize operator injection via nested query objects
// (e.g. ?status[$ne]=active being parsed as { status: { $ne: 'active' } }).
// With 'simple', all req.query values are always flat strings or arrays.
app.set('query parser', 'simple');

const PORT = process.env.PORT || 5000;
const parsePositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const schemaIndexAuditEnabled = process.env.SCHEMA_INDEX_AUDIT_ENABLED !== undefined
  ? process.env.SCHEMA_INDEX_AUDIT_ENABLED === 'true'
  : process.env.NODE_ENV === 'production';
const runtimeSchemaAuditEnabled = process.env.RUNTIME_SCHEMA_AUDIT_ENABLED !== undefined
  ? process.env.RUNTIME_SCHEMA_AUDIT_ENABLED === 'true'
  : true;
const runtimeSchemaPreflightRequired = process.env.RUNTIME_SCHEMA_PREFLIGHT_REQUIRED !== 'false';

const schemaIndexAuditIntervalMinutes = parsePositiveInt(process.env.SCHEMA_INDEX_AUDIT_INTERVAL_MINUTES, 360);
const runtimeSchemaAuditIntervalMinutes = parsePositiveInt(process.env.RUNTIME_SCHEMA_AUDIT_INTERVAL_MINUTES, 30);
const schemaIndexAuditTimeoutMs = parsePositiveInt(process.env.SCHEMA_INDEX_AUDIT_TIMEOUT_MS, 5000);
const billingFunnelAuditEnabled = process.env.BILLING_FUNNEL_AUDIT_ENABLED !== undefined
  ? process.env.BILLING_FUNNEL_AUDIT_ENABLED === 'true'
  : process.env.NODE_ENV === 'production';
const billingFunnelAuditIntervalMinutes = parsePositiveInt(process.env.BILLING_FUNNEL_AUDIT_INTERVAL_MINUTES, 60);

let schemaIndexAuditInterval = null;
let runtimeSchemaAuditInterval = null;
let billingFunnelAuditInterval = null;
let runtimeSchemaAuditState = {
  enabled: runtimeSchemaAuditEnabled,
  preflight_required: runtimeSchemaPreflightRequired,
  status: 'unknown',
  message: runtimeSchemaAuditEnabled ? 'Runtime schema audit has not run yet.' : 'Runtime schema audit is disabled.',
  last_checked_at: null,
  missing_migration_count: 0,
  missing_column_count: 0,
  warning_count: 0,
  missing_migrations: [],
  missing_columns: [],
  warnings: []
};
let schemaIndexAuditState = {
  enabled: schemaIndexAuditEnabled,
  status: 'unknown',
  message: schemaIndexAuditEnabled ? 'Schema index audit has not run yet.' : 'Schema index audit is disabled.',
  last_checked_at: null,
  tenants_checked: 0,
  missing_count: 0,
  missing: []
};
let billingFunnelAuditState = {
  enabled: billingFunnelAuditEnabled,
  status: 'unknown',
  message: billingFunnelAuditEnabled ? 'Billing funnel telemetry audit has not run yet.' : 'Billing funnel telemetry audit is disabled.',
  last_checked_at: null,
  lookback_hours: 0,
  attempt_grace_minutes: 0,
  rows_scanned: 0,
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
};

// Trust proxy - required when running behind nginx/apache/cloudflare reverse proxy
// This allows Express to correctly extract the REAL client IP from X-Forwarded-For headers.
// If not trusted, rate-limiters will block the load balancer's IP instead of the hacker's IP.
const isProduction = process.env.NODE_ENV === 'production';
const trustProxyRequested = process.env.TRUST_PROXY === 'true';
const enforceHttpsRequested = process.env.ENFORCE_HTTPS === 'true';
const disableHttpsEnforcement = process.env.ENFORCE_HTTPS === 'false';
const enforceHttps = (isProduction || enforceHttpsRequested) && !disableHttpsEnforcement;

if (isProduction || trustProxyRequested) {
  // Trust all proxies in production context unless strictly bounded by known subnets
  app.set('trust proxy', 1); // Trust the first proxy in front of Express
  logger.info(`🛡️ Trust proxy enabled (1 hop) (Production: ${isProduction}, Override: ${trustProxyRequested})`);
} else {
  app.set('trust proxy', false);
}

// Environment validation for Production
if (isProduction) {
  const validation = validateProductionEnv({ env: process.env });
  if (validation.shouldFail) {
    logger.error(formatValidationFailure(validation));
    process.exit(1);
  }

  const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];
  const missing = requiredEnv.filter(env => !process.env[env]);
  if (missing.length > 0) {
    logger.error(`❌ CRITICAL: Missing required production environment variables: ${missing.join(', ')}`);
    // We don't exit immediately here to allow the server to potentially show a health check failure
  }
}

// CORS configuration - must be applied before helmet
const normalizeCorsOrigin = (value) => {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  if (raw === 'dgfypos://app' || raw === 'dgfypos://app/') return 'dgfypos://app';
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
};

const configuredCorsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((entry) => normalizeCorsOrigin(entry))
  .filter(Boolean);

const matchesWildcardOrigin = (origin, wildcardPattern) => {
  if (!origin || !wildcardPattern.startsWith('*.')) return false;
  try {
    const parsed = new URL(origin);
    const suffix = wildcardPattern.slice(1).toLowerCase();
    return parsed.hostname.toLowerCase().endsWith(suffix);
  } catch {
    return false;
  }
};

const isExplicitOriginAllowed = (origin) => {
  if (!origin) return true;
  const normalizedOrigin = normalizeCorsOrigin(origin);
  return configuredCorsOrigins.some((allowedOrigin) => {
    if (allowedOrigin.startsWith('*.')) {
      return matchesWildcardOrigin(normalizedOrigin, allowedOrigin);
    }
    return allowedOrigin === normalizedOrigin;
  });
};

const isDevelopmentOriginAllowed = (origin) => {
  const normalizedOrigin = normalizeCorsOrigin(origin);
  if (!normalizedOrigin) return true;
  if (normalizedOrigin === 'dgfypos://app') return true;

  const developmentOriginPatterns = [
    /^http:\/\/localhost:517[0-9]$/,
    /^http:\/\/127\.0\.0\.1:517[0-9]$/,
    /^http:\/\/localhost:518[0-9]$/,
    /^http:\/\/127\.0\.0\.1:518[0-9]$/,
    /^http:\/\/localhost:417[0-9]$/,
    /^http:\/\/127\.0\.0\.1:417[0-9]$/,
    /^http:\/\/localhost:5000$/,
    /^http:\/\/127\.0\.0\.1:5000$/,
    /^http:\/\/localhost:5001$/,
    /^http:\/\/127\.0\.0\.1:5001$/,
    /^http:\/\/\d{1,3}(?:\.\d{1,3}){3}:517[0-9]$/,
    /^http:\/\/\d{1,3}(?:\.\d{1,3}){3}:518[0-9]$/,
    /^http:\/\/\d{1,3}(?:\.\d{1,3}){3}:417[0-9]$/,
    /^https?:\/\/(?:skupervisor|pos|store)\.localhost:517[0-9]$/,
    /^https?:\/\/(?:skupervisor|pos|store)\.localhost:518[0-9]$/,
    /^https?:\/\/(?:skupervisor|pos|store)\.localhost:417[0-9]$/,
    /^https?:\/\/(?:skupervisor|pos|store)\.local(?:host)?(?::\d{2,5})?$/
  ];

  if (developmentOriginPatterns.some((pattern) => pattern.test(normalizedOrigin))) {
    return true;
  }

  try {
    const parsed = new URL(normalizedOrigin);
    const host = parsed.hostname.toLowerCase();
    const knownSurface = host === 'skupervisor.surebizcorp.com'
      || host === 'pos.surebizcorp.com'
      || host === 'surebizcorp.com'
      || host === 'store.surebizcorp.com'
      || host === 'skupervisor.dgfy.ph'
      || host === 'pos.dgfy.ph'
      || host === 'dgfy.ph'
      || host === 'store.dgfy.ph';
    return Boolean(knownSurface);
  } catch {
    return false;
  }
};

const resolveCorsAllowed = (origin) => {
  const normalizedOrigin = normalizeCorsOrigin(origin);
  if (configuredCorsOrigins.length > 0 && isExplicitOriginAllowed(normalizedOrigin)) {
    return true;
  }
  if (!isProduction) {
    return isDevelopmentOriginAllowed(normalizedOrigin);
  }
  return configuredCorsOrigins.length === 0 && isDevelopmentOriginAllowed(normalizedOrigin);
};

const corsOptionsDelegate = (req, callback) => {
  const origin = req.headers.origin || null;
  const allowed = resolveCorsAllowed(origin);

  if (!allowed) {
    const correlationId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || `cors-${crypto.randomUUID()}`;
    logger.warn('[CORS] Blocked request from disallowed origin', {
      origin,
      method: req.method,
      path: req.originalUrl || req.url || '',
      request_id: correlationId
    });
    const error = new Error('Not allowed by CORS');
    error.statusCode = 403;
    error.status = 403;
    error.code = 'CORS_NOT_ALLOWED';
    callback(error);
    return;
  }

  callback(null, {
    origin: true,
    credentials: true,
    optionsSuccessStatus: 200,
    exposedHeaders: ['Content-Disposition', 'Content-Length', 'x-request-id', 'x-trace-id']
  });
};
app.use(cors(corsOptionsDelegate));

const isRequestHttps = (req) => {
  if (req.secure === true) return true;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return forwardedProto.split(',').map((entry) => entry.trim()).includes('https');
};

app.use((req, res, next) => {
  if (!enforceHttps) return next();

  const normalizedPath = String(req.path || req.originalUrl || '').toLowerCase();
  const isHealthPath = normalizedPath === '/health'
    || normalizedPath.endsWith('/health')
    || normalizedPath.endsWith('/healthz')
    || normalizedPath.endsWith('/ready');
  if (isHealthPath) {
    return next();
  }

  if (isRequestHttps(req)) {
    return next();
  }

  return res.status(426).json({
    success: false,
    message: 'HTTPS is required for this environment',
    error_code: 'HTTPS_REQUIRED',
    errors: {
      remediation: 'Route traffic through TLS termination and forward X-Forwarded-Proto=https.'
    },
    timestamp: new Date().toISOString()
  });
});

// Security middleware - applied after CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: enforceHttps
    ? {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: true
    }
    : false
}));

// Attach per-request context metadata (request ID, trace root values).
app.use(requestContext);
app.use(requestOutcomeLogger);

// Gzip compression — reduces JSON response sizes by 60-80%
app.use(compression());

// Body parsing middleware
// Increased limit to 10mb to support bulk CSV imports (up to 1000 items)
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Capture basic HTTP metrics before route handlers mutate response status.
app.use(metricsMiddleware);

// Logging middleware - use Winston stream for Morgan
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev', { stream: logger.stream }));
} else {
  app.use(morgan('combined', { stream: logger.stream }));
}

// Rate limiting - apply general limiter to all routes
app.use('/api', generalLimiter);

const runRuntimeSchemaAudit = async () => {
  if (!runtimeSchemaAuditEnabled) return;

  try {
    const result = await auditRuntimeSchemaReadiness({
      sequelizeInstance: sequelize
    });

    runtimeSchemaAuditState = {
      enabled: true,
      preflight_required: runtimeSchemaPreflightRequired,
      status: result.status,
      message: result.status === 'healthy'
        ? 'Runtime schema readiness checks passed.'
        : 'Runtime schema readiness checks failed.',
      last_checked_at: result.checkedAt,
      missing_migration_count: result.missingMigrations.length,
      missing_column_count: result.missingColumns.length,
      warning_count: result.warningCount,
      missing_migrations: result.missingMigrations,
      missing_columns: result.missingColumns,
      warnings: result.warnings
    };

    if (result.status === 'degraded') {
      logger.error(`[RuntimeSchemaAudit] Degraded (missing_migrations=${result.missingMigrations.length}, missing_columns=${result.missingColumns.length}).`);
      result.issues.forEach((issue) => {
        logger.error(`[RuntimeSchemaAudit] ${issue.message}`);
      });
    } else {
      logger.info(`[RuntimeSchemaAudit] Healthy (warnings=${result.warningCount}).`);
      result.warnings.forEach((warning) => {
        logger.warn(`[RuntimeSchemaAudit] ${warning.message}`);
      });
    }
  } catch (error) {
    runtimeSchemaAuditState = {
      enabled: true,
      preflight_required: runtimeSchemaPreflightRequired,
      status: 'degraded',
      message: `Runtime schema audit failed: ${error.message}`,
      last_checked_at: new Date().toISOString(),
      missing_migration_count: 0,
      missing_column_count: 0,
      warning_count: 0,
      missing_migrations: [],
      missing_columns: [],
      warnings: []
    };
    logger.error('[RuntimeSchemaAudit] Failed to run audit:', error.message);
  }
};

const scheduleRuntimeSchemaAudit = () => {
  if (!runtimeSchemaAuditEnabled) {
    runtimeSchemaAuditState = {
      ...runtimeSchemaAuditState,
      enabled: false,
      preflight_required: runtimeSchemaPreflightRequired,
      status: 'unknown',
      message: 'Runtime schema audit is disabled.'
    };
    return;
  }

  runRuntimeSchemaAudit().catch((error) => {
    logger.error('[RuntimeSchemaAudit] Startup audit failed:', error.message);
  });

  const intervalMs = runtimeSchemaAuditIntervalMinutes * 60 * 1000;
  runtimeSchemaAuditInterval = setInterval(() => {
    runRuntimeSchemaAudit().catch((error) => {
      logger.error('[RuntimeSchemaAudit] Scheduled audit failed:', error.message);
    });
  }, intervalMs);

  if (typeof runtimeSchemaAuditInterval.unref === 'function') {
    runtimeSchemaAuditInterval.unref();
  }
};

const runSchemaIndexAudit = async () => {
  if (!schemaIndexAuditEnabled) return;

  try {
    const result = await auditRequiredIndexes({
      sequelizeInstance: sequelize,
      timeoutMs: schemaIndexAuditTimeoutMs
    });

    schemaIndexAuditState = {
      enabled: true,
      status: result.status,
      message: result.status === 'healthy'
        ? 'Required index contract satisfied.'
        : 'Required index contract has missing indexes.',
      last_checked_at: result.checkedAt,
      tenants_checked: result.tenantsChecked,
      missing_count: result.missingCount,
      missing: result.missingForHealth
    };

    if (result.status === 'degraded') {
      logger.error(
        `[SchemaIndexAudit] Degraded (${result.missingCount} missing indexes across ${result.tenantsChecked} tenant DBs).`
      );
    } else {
      logger.info(`[SchemaIndexAudit] Healthy (${result.tenantsChecked} tenant DBs checked).`);
    }
  } catch (error) {
    schemaIndexAuditState = {
      enabled: true,
      status: 'degraded',
      message: `Schema index audit failed: ${error.message}`,
      last_checked_at: new Date().toISOString(),
      tenants_checked: 0,
      missing_count: 0,
      missing: []
    };
    logger.error('[SchemaIndexAudit] Failed to run audit:', error.message);
  }
};

const scheduleSchemaIndexAudit = () => {
  if (!schemaIndexAuditEnabled) {
    schemaIndexAuditState = {
      ...schemaIndexAuditState,
      enabled: false,
      status: 'unknown',
      message: 'Schema index audit is disabled.'
    };
    return;
  }

  runSchemaIndexAudit().catch((error) => {
    logger.error('[SchemaIndexAudit] Startup audit failed:', error.message);
  });

  const intervalMs = schemaIndexAuditIntervalMinutes * 60 * 1000;
  schemaIndexAuditInterval = setInterval(() => {
    runSchemaIndexAudit().catch((error) => {
      logger.error('[SchemaIndexAudit] Scheduled audit failed:', error.message);
    });
  }, intervalMs);

  if (typeof schemaIndexAuditInterval.unref === 'function') {
    schemaIndexAuditInterval.unref();
  }
};

const runBillingFunnelAudit = async () => {
  if (!billingFunnelAuditEnabled) return;

  try {
    const result = await auditBillingFunnelIntegrity();

    billingFunnelAuditState = {
      enabled: true,
      status: result.status,
      message: result.status === 'healthy'
        ? 'Billing funnel telemetry integrity checks passed.'
        : 'Billing funnel telemetry integrity issues detected.',
      last_checked_at: result.checkedAt,
      lookback_hours: result.lookbackHours,
      attempt_grace_minutes: result.attemptGraceMinutes,
      rows_scanned: result.rowsScanned,
      recent_write_failures: result.recentWriteFailures,
      recent_skips: result.recentSkips,
      recent_table_missing_skips: result.recentTableMissingSkips,
      recent_model_unavailable_skips: result.recentModelUnavailableSkips,
      recent_missing_event_type_skips: result.recentMissingEventTypeSkips,
      missing_correlation_count: result.missingCorrelationCount,
      missing_outcome_count: result.missingOutcomeCount,
      orphan_attempt_count: result.orphanAttemptCount,
      duplicate_event_count: result.duplicateEventCount,
      payment_without_telemetry_count: result.paymentWithoutTelemetryCount,
      tenant_state_mismatch_count: result.tenantStateMismatchCount,
      webhook_without_telemetry_count: result.webhookWithoutTelemetryCount,
      route_outcome_mismatch_count: result.routeOutcomeMismatchCount,
      issues: result.issuesForHealth
    };

    if (result.status === 'degraded') {
      logger.error(
        `[BillingFunnelAudit] Degraded (rows=${result.rowsScanned}, missingCorrelation=${result.missingCorrelationCount}, missingOutcome=${result.missingOutcomeCount}, orphanAttempts=${result.orphanAttemptCount}, duplicateEvents=${result.duplicateEventCount}).`
      );
    } else {
      logger.info(`[BillingFunnelAudit] Healthy (${result.rowsScanned} rows scanned).`);
    }
  } catch (error) {
    billingFunnelAuditState = {
      enabled: true,
      status: 'degraded',
      message: `Billing funnel telemetry audit failed: ${error.message}`,
      last_checked_at: new Date().toISOString(),
      lookback_hours: 0,
      attempt_grace_minutes: 0,
      rows_scanned: 0,
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
};
    logger.error('[BillingFunnelAudit] Failed to run audit:', error.message);
  }
};

const scheduleBillingFunnelAudit = () => {
  if (!billingFunnelAuditEnabled) {
    billingFunnelAuditState = {
      ...billingFunnelAuditState,
      enabled: false,
      status: 'unknown',
      message: 'Billing funnel telemetry audit is disabled.'
    };
    return;
  }

  runBillingFunnelAudit().catch((error) => {
    logger.error('[BillingFunnelAudit] Startup audit failed:', error.message);
  });

  const intervalMs = billingFunnelAuditIntervalMinutes * 60 * 1000;
  billingFunnelAuditInterval = setInterval(() => {
    runBillingFunnelAudit().catch((error) => {
      logger.error('[BillingFunnelAudit] Scheduled audit failed:', error.message);
    });
  }, intervalMs);

  if (typeof billingFunnelAuditInterval.unref === 'function') {
    billingFunnelAuditInterval.unref();
  }
};

// Health check — intentionally before tenantHandler (no business middleware)
const handleHealthCheck = async (req, res) => {
  const { health, statusCode } = await buildHealthResponse({
    testConnectionFn: testConnection,
    isRedisConnectedFn: isRedisConnected,
    getTenantPoolStatsFn: () => tenantConnector.getPoolStats(),
    getRateLimiterStoreModeFn: getRateLimiterStoreMode,
    runtimeSchemaAuditState,
    schemaIndexAuditState,
    billingFunnelAuditState,
    environment: process.env.NODE_ENV || 'development'
  });

  res.status(statusCode).json(health);
};
app.get('/health', handleHealthCheck);
app.get('/api/v1/health', handleHealthCheck);

app.get('/metrics', (req, res) => {
  if (!metricsEnabled()) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Metrics endpoint is disabled',
      timestamp: new Date().toISOString()
    });
  }

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.status(200).send(renderPrometheusMetrics());
});

// Static uploads (POS catalog images and other generated assets).
app.use('/uploads', express.static(join(__dirname, '..', 'uploads'), {
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (String(filePath || '').toLowerCase().endsWith('.svg')) {
      // Legacy SVG uploads are served as plain text to avoid inline script execution.
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
  }
}));

// Tenant Resolution & Context Middleware (Must be before API routes)
import dgfyRoutes from './routes/dgfy.js';
import geoSearchRoutes from './routes/geoSearch.js';
app.use(csrfProtection);
app.use('/api/v1/dgfy', dgfyRoutes);
app.use('/api/v1/geo', geoSearchRoutes);

app.use(tenantHandler);

// API routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import itemRoutes from './routes/items.js';
import supplierRoutes from './routes/suppliers.js';
import purchaseOrderRoutes from './routes/purchaseOrders.js';
import jobOrderRoutes from './routes/jobOrders.js';
import dispatchOrderRoutes from './routes/dispatchOrders.js';
import stockMovementRoutes from './routes/stockMovements.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import forecastRoutes from './routes/forecast.js';
import alertRoutes from './routes/alerts.js';
import settingsRoutes from './routes/settings.js';
import receiveTokenRoutes from './routes/receiveTokens.js';
import analyticsRoutes from './routes/analytics.js';
import feedbackRoutes from './routes/feedback.js';
import aiRoutes from './routes/ai.js';
import posRoutes from './routes/pos.js';
import servicesRoutes from './routes/services.js';
import fnbRoutes from './routes/fnb.js';
import hospitalityRoutes, { hospitalityStorefrontRoutes } from './routes/hospitality.js';
import salesRoutes from './routes/sales.js';
import tenantLocationRoutes from './routes/tenantLocations.js';
import storeRoutes from './routes/store.js';
import storefrontDiscoveryRoutes from './routes/storefrontDiscovery.js';
import adminAuthRoutes from './routes/adminAuth.js';
import adminTenantRoutes from './routes/adminTenants.js';
import complianceRoutes from './routes/compliance.js';
import onboardingRoutes from './routes/onboarding.js';

// Auth routes (authLimiter applied selectively per-route in auth.js)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/items', itemRoutes);
app.use('/api/v1/suppliers', supplierRoutes);
app.use('/api/v1/purchase-orders', purchaseOrderRoutes);
app.use('/api/v1/job-orders', jobOrderRoutes);
app.use('/api/v1/dispatch-orders', dispatchOrderRoutes);
app.use('/api/v1/stock-movements', stockMovementRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/forecast', forecastRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/receive-tokens', receiveTokenRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/pos', posRoutes);
app.use('/api/v1/services', servicesRoutes);
app.use('/api/v1/fnb', fnbRoutes);
app.use('/api/v1/hospitality', hospitalityRoutes);
app.use('/api/v1/sales', salesRoutes);
app.use('/api/v1/tenant-locations', tenantLocationRoutes);
app.use('/api/v1/store/hospitality', hospitalityStorefrontRoutes);
app.use('/api/v1/store', storeRoutes);
app.use('/api/v1/storefront', storefrontDiscoveryRoutes);
app.use('/api/v1/storefront', geoSearchRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/feedback', feedbackRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/commerce-payments', commercePaymentRoutes);
// Mount specific admin routes first to avoid catching issues
app.use('/api/v1/admin/tenants', adminTenantRoutes);

app.use('/api/v1/admin', adminAuthRoutes);
app.use('/api/v1/compliance', complianceRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // ── Production environment guard ──────────────────────────────────────────
    // DISABLED - switching to PayMongo
    /*
    // If any required PayPal variable is missing in production the server must
    // refuse to start. This is the only reliable way to catch a misconfigured
    // deployment before it silently breaks the payment or webhook flow.
    if (process.env.NODE_ENV === 'production') {
      const requiredPaypalEnvVars = [
        'PAYPAL_CLIENT_ID',
        'PAYPAL_CLIENT_SECRET',
        'PAYPAL_WEBHOOK_ID',
        'PAYPAL_STANDARD_PLAN_ID'
      ];
      const missing = requiredPaypalEnvVars.filter(k => !process.env[k]);
      const hasPremiumPlan = Boolean(process.env.PAYPAL_PREMIUM_PLAN_ID || process.env.PAYPAL_PLAN_ID);
      if (!hasPremiumPlan) {
        missing.push('PAYPAL_PREMIUM_PLAN_ID (or legacy PAYPAL_PLAN_ID)');
      }
      if (missing.length > 0) {
        logger.error(`CRITICAL: Missing required PayPal environment variables: ${missing.join(', ')}. Server will not start.`);
        process.exit(1);
      }
    }
    */

    // Initialize cleanup job
    initCleanupJob();

    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Runtime schema preflight: fail fast when required migrations/columns are missing.
    if (runtimeSchemaAuditEnabled) {
      await runRuntimeSchemaAudit();
      if (runtimeSchemaPreflightRequired && runtimeSchemaAuditState.status === 'degraded') {
        logger.error('Runtime schema preflight failed. Apply pending migrations and retry startup.');
        process.exit(1);
      }
    } else if (runtimeSchemaPreflightRequired) {
      logger.warn('Runtime schema preflight is required but RUNTIME_SCHEMA_AUDIT_ENABLED=false. Continuing without preflight gate.');
    }

    // In development mode, only sync schema when explicitly enabled.
    // Auto-running sync({ alter: true }) on every PM2 boot can cause transient
    // startup failures or 5xx responses while schema alters are in progress.
    const autoSyncEnabled = process.env.DB_AUTO_SYNC === 'true';
    if ((process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) && autoSyncEnabled) {
      try {
        await sequelize.sync({ alter: true });
        logger.info('Database schema synced (development mode, DB_AUTO_SYNC=true)');
      } catch (syncError) {
        logger.warn('Database sync warning:', syncError.message);
        // Don't exit - table may already be in sync
      }
    } else if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      logger.info('Skipping sequelize.sync({ alter: true }). Set DB_AUTO_SYNC=true for controlled local sync.');
    }

    // Run schema index audits in the background (startup + periodic).
    scheduleRuntimeSchemaAudit();
    scheduleSchemaIndexAudit();
    scheduleBillingFunnelAudit();
    startStorefrontDiscoveryIndexReconciliationScheduler();
    startGeoInventoryWorker();

    // Initialize Redis (non-blocking - server will start even if Redis fails)
    if (process.env.REDIS_URL) {
      initializeRedis().catch((error) => {
        logger.warn('Redis initialization failed, continuing without cache:', error.message);
      });
    } else {
      logger.info('No REDIS_URL found, skipping Redis initialization.');
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🌐 API Base URL: ${isProduction ? process.env.FRONTEND_URL || 'production' : 'http://localhost:' + PORT}/api/v1`);

      // Start Billing Scheduler
      if (paymentsEnabled) {
        initBillingScheduler();
      } else {
        logger.info('Billing scheduler disabled because PAYMENTS_ENABLED is not true.');
      }
      aiController.startAiCleanupScheduler?.();

      // Start periodic tenant connection pool cleanup
      tenantConnector.startPeriodicCleanup();
    });

    // Kill requests that hang longer than 30 seconds (prevents connection pool exhaustion)
    server.setTimeout(30000);

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      if (schemaIndexAuditInterval) {
        clearInterval(schemaIndexAuditInterval);
        schemaIndexAuditInterval = null;
      }
      if (runtimeSchemaAuditInterval) {
        clearInterval(runtimeSchemaAuditInterval);
        runtimeSchemaAuditInterval = null;
      }
      if (billingFunnelAuditInterval) {
        clearInterval(billingFunnelAuditInterval);
        billingFunnelAuditInterval = null;
      }
      stopStorefrontDiscoveryIndexReconciliationScheduler();
      stopGeoInventoryWorker();
      aiController.stopAiCleanupScheduler?.();

      // Close Redis connection
      await closeRedis();

      // Close all tenant DB connections
      try {
        await tenantConnector.closeAll();
        logger.info('All tenant database connections closed.');
      } catch (err) {
        logger.error('Error closing tenant connections during shutdown:', err);
      }

      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle unhandled promise rejections — log but do NOT crash the server.
    // Calling gracefulShutdown here would take down all 50 users whenever any background
    // job (billing scheduler, OpenAI) throws an unexpected error.
    process.on('unhandledRejection', (err) => {
      logger.error('Unhandled Promise Rejection (non-fatal, server kept alive):', err);
    });

    // Handle truly unrecoverable errors (synchronous throws that corrupt Node.js state).
    // These legitimately require a restart — PM2 will bring the server back up.
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception (fatal, initiating graceful shutdown):', err);
      gracefulShutdown('uncaughtException');
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test' && process.env.SKIP_SERVER_START !== 'true') {
  startServer();
}

export const __setSchemaIndexAuditStateForTests = (nextState) => {
  schemaIndexAuditState = {
    ...schemaIndexAuditState,
    ...nextState
  };
};

export const __getSchemaIndexAuditStateForTests = () => schemaIndexAuditState;

export const __setRuntimeSchemaAuditStateForTests = (nextState) => {
  runtimeSchemaAuditState = {
    ...runtimeSchemaAuditState,
    ...nextState
  };
};

export const __getRuntimeSchemaAuditStateForTests = () => runtimeSchemaAuditState;

export const __setBillingFunnelAuditStateForTests = (nextState) => {
  billingFunnelAuditState = {
    ...billingFunnelAuditState,
    ...nextState
  };
};

export const __getBillingFunnelAuditStateForTests = () => billingFunnelAuditState;

export default app;
// End of file

// Load environment variables FIRST - before any other imports
// This ensures JWT_SECRET and other env vars are available when authService.js loads
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from the backend directory (parent of src)
dotenv.config({ path: join(__dirname, '..', '.env') });

import paymentRoutes from './routes/payments.js';
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
import { metricsMiddleware } from './middleware/metricsMiddleware.js';
import logger from './config/logger.js';
import { generalLimiter } from './middleware/rateLimiter.js';
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
import * as aiController from './controllers/aiController.js';

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

const schemaIndexAuditIntervalMinutes = parsePositiveInt(process.env.SCHEMA_INDEX_AUDIT_INTERVAL_MINUTES, 360);
const schemaIndexAuditTimeoutMs = parsePositiveInt(process.env.SCHEMA_INDEX_AUDIT_TIMEOUT_MS, 5000);
const billingFunnelAuditEnabled = process.env.BILLING_FUNNEL_AUDIT_ENABLED !== undefined
  ? process.env.BILLING_FUNNEL_AUDIT_ENABLED === 'true'
  : process.env.NODE_ENV === 'production';
const billingFunnelAuditIntervalMinutes = parsePositiveInt(process.env.BILLING_FUNNEL_AUDIT_INTERVAL_MINUTES, 60);

let schemaIndexAuditInterval = null;
let billingFunnelAuditInterval = null;
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

if (isProduction || trustProxyRequested) {
  // Trust all proxies in production context unless strictly bounded by known subnets
  app.set('trust proxy', 1); // Trust the first proxy in front of Express
  logger.info(`🛡️ Trust proxy enabled (1 hop) (Production: ${isProduction}, Override: ${trustProxyRequested})`);
} else {
  app.set('trust proxy', false);
}

// Environment validation for Production
if (isProduction) {
  const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];
  const missing = requiredEnv.filter(env => !process.env[env]);
  if (missing.length > 0) {
    logger.error(`❌ CRITICAL: Missing required production environment variables: ${missing.join(', ')}`);
    // We don't exit immediately here to allow the server to potentially show a health check failure
  }
}

// CORS configuration - must be applied before helmet
const corsOptions = {
  // Allow requests from localhost and any network IP on port 5173 (development)
  // For production, set CORS_ORIGIN env var to a comma-separated list of allowed origins
  origin: process.env.CORS_ORIGIN ? (origin, callback) => {
    const allowed = process.env.CORS_ORIGIN.split(',').map(o => o.trim());
    if (allowed.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  } : (origin, callback) => {
    // In development, allow localhost and any IP on ports 5173-5179 (Vite dev ports)
    if (!origin ||
      /^http:\/\/localhost:517[0-9]$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:517[0-9]$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1:5000$/.test(origin) ||
      /^http:\/\/localhost:5000$/.test(origin) ||
      /^http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:517[0-9]$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  exposedHeaders: ['Content-Disposition', 'Content-Length']
};
app.use(cors(corsOptions));

// Security middleware - applied after CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Attach per-request context metadata (request ID, trace root values).
app.use(requestContext);

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
app.get('/health', async (req, res) => {
  const { health, statusCode } = await buildHealthResponse({
    testConnectionFn: testConnection,
    isRedisConnectedFn: isRedisConnected,
    getTenantPoolStatsFn: () => tenantConnector.getPoolStats(),
    schemaIndexAuditState,
    billingFunnelAuditState,
    environment: process.env.NODE_ENV || 'development'
  });

  res.status(statusCode).json(health);
});

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

// Tenant Resolution & Context Middleware (Must be before API routes)
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
import adminAuthRoutes from './routes/adminAuth.js';
import adminTenantRoutes from './routes/adminTenants.js';

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
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/feedback', feedbackRoutes);
app.use('/api/v1/payments', paymentRoutes);
// Mount specific admin routes first to avoid catching issues
app.use('/api/v1/admin/tenants', adminTenantRoutes);

app.use('/api/v1/admin', adminAuthRoutes);

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

    // In development mode, sync database schema to apply any model changes
    if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      try {
        await sequelize.sync({ alter: true });
        logger.info('📦 Database schema synced (development mode)');
      } catch (syncError) {
        logger.warn('⚠️ Database sync warning:', syncError.message);
        // Don't exit - table may already be in sync
      }
    }

    // Run schema index audits in the background (startup + periodic).
    scheduleSchemaIndexAudit();
    scheduleBillingFunnelAudit();

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
      initBillingScheduler();
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
      if (billingFunnelAuditInterval) {
        clearInterval(billingFunnelAuditInterval);
        billingFunnelAuditInterval = null;
      }
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

export const __setBillingFunnelAuditStateForTests = (nextState) => {
  billingFunnelAuditState = {
    ...billingFunnelAuditState,
    ...nextState
  };
};

export const __getBillingFunnelAuditStateForTests = () => billingFunnelAuditState;

export default app;
// End of file


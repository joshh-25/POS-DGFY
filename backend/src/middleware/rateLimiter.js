import rateLimit from 'express-rate-limit';
import logger from '../config/logger.js';

// Get rate limit configuration from environment variables.
// In development, use more lenient limits to account for React StrictMode double renders.
const isDevelopment = process.env.NODE_ENV === 'development';
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes default
const parsedGeneralMax = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS);
const minProdGeneralMax = parseInt(process.env.RATE_LIMIT_MIN_PROD_REQUESTS) || 300;
const maxRequests = isDevelopment
  ? (parsedGeneralMax || 1000)
  : Math.max(parsedGeneralMax || 100, minProdGeneralMax);
const authWindowMs = parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes default
const authMaxRequests = parseInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS) || (isDevelopment ? 50 : 5); // 50 in dev, 5 in prod

// Standard error response format
const createRateLimitError = (message, metadata = {}) => ({
  success: false,
  data: null,
  message,
  ...metadata,
  timestamp: new Date().toISOString(),
});

const rateLimitCounters = {
  total: 0,
  auth_login: 0,
  auth_register: 0,
  auth_lookup: 0,
  ai: 0,
  registration: 0,
  other: 0,
};
const rateLimitAlertThreshold = parseInt(process.env.RATE_LIMIT_ALERT_THRESHOLD) || 50;

const normalizeEmail = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const firstForwardedIp = (req) => {
  const xffHeader = req.headers['x-forwarded-for'];
  if (typeof xffHeader !== 'string') return null;
  const first = xffHeader.split(',')[0]?.trim();
  return first || null;
};

const getScopeFromRequest = (req, fallbackScope) => {
  const path = req.path || '';
  if (path.includes('/auth/login')) return 'auth_login';
  if (path.includes('/auth/register')) return 'auth_register';
  if (path.includes('/auth/lookup')) return 'auth_lookup';
  if (path.includes('/ai/')) return 'ai';
  if (path.includes('/admin/tenants/register')) return 'registration';
  return fallbackScope || 'other';
};

const getRetryAfterSeconds = (req, options) => {
  const resetTimeMs = req?.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : null;
  if (resetTimeMs) {
    return Math.max(1, Math.ceil((resetTimeMs - Date.now()) / 1000));
  }
  return Math.max(1, Math.ceil((options?.windowMs || windowMs) / 1000));
};

const logRateLimitEvent = (req, scope, retryAfterSeconds, keyType) => {
  rateLimitCounters.total += 1;
  rateLimitCounters[scope] = (rateLimitCounters[scope] || 0) + 1;

  logger.warn('Rate limit exceeded', {
    ip: req.ip || req.connection?.remoteAddress,
    forwardedIp: firstForwardedIp(req),
    path: req.path,
    method: req.method,
    scope,
    keyType,
    retryAfterSeconds,
    companyTokenPresent: Boolean(req.headers['x-company-token']),
    tenantId: req.tenant?.id || null,
    userId: req.user?.user_id || null,
    rateLimitState: {
      limit: req.rateLimit?.limit ?? null,
      current: req.rateLimit?.current ?? null,
      remaining: req.rateLimit?.remaining ?? null,
      resetTime: req.rateLimit?.resetTime ?? null,
    },
    counters: { ...rateLimitCounters },
  });

  if (rateLimitCounters.total % rateLimitAlertThreshold === 0) {
    logger.error('Rate limit spike alert', {
      threshold: rateLimitAlertThreshold,
      total429: rateLimitCounters.total,
      counters: { ...rateLimitCounters },
      latestScope: scope,
      latestPath: req.path,
    });
  }
};

const buildRateLimitResponse = (req, options, message, scope, keyType) => {
  const retryAfterSeconds = getRetryAfterSeconds(req, options);
  return {
    status: 429,
    body: createRateLimitError(message, {
      retryAfterSeconds,
      limitScope: scope,
      limitKeyType: keyType,
    }),
    retryAfterSeconds,
  };
};

// General API rate limiter
export const generalLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  message: createRateLimitError('Too many requests from this IP, please try again later.'),
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  validate: { trustProxy: false },
  handler: (req, res, _next, options) => {
    const scope = getScopeFromRequest(req, 'other');
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many requests from this IP, please try again later.',
      scope,
      'ip'
    );
    logRateLimitEvent(req, scope, response.retryAfterSeconds, 'ip');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: (req) => {
    if (req.path === '/health') return true;
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

// Stricter rate limiter for authentication endpoints.
// Uses ip + email keying so users sharing one public IP do not throttle each other.
export const authLimiter = rateLimit({
  windowMs: authWindowMs,
  max: authMaxRequests,
  message: createRateLimitError('Too many authentication attempts, please try again later.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const email = normalizeEmail(req.body?.email);
    const scope = req.path?.includes('/register') ? 'register' : 'login';
    return email ? `auth:${scope}:${ip}:${email}` : `auth:${scope}:${ip}:unknown-email`;
  },
  handler: (req, res, _next, options) => {
    const scope = getScopeFromRequest(req, 'other');
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many authentication attempts, please try again later.',
      scope,
      'ip_email'
    );
    logRateLimitEvent(req, scope, response.retryAfterSeconds, 'ip_email');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => process.env.NODE_ENV === 'test',
});

// Strictest rate limiter for email lookup to prevent enumeration
export const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per window
  message: createRateLimitError('Too many email lookup attempts. For security reasons, please try again in 15 minutes.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many email lookup attempts. For security reasons, please try again in 15 minutes.',
      'auth_lookup',
      'ip'
    );
    logRateLimitEvent(req, 'auth_lookup', response.retryAfterSeconds, 'ip');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => process.env.NODE_ENV === 'test',
});

// Strict rate limiter for tenant registration (prevents DoS via auto-provisioning)
export const tenantRegistrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 50 : 5, // 5 per hour in prod, 50 in dev
  message: createRateLimitError('Too many registration requests from this IP, please try again after an hour.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many registration requests from this IP, please try again after an hour.',
      'registration',
      'ip'
    );
    logRateLimitEvent(req, 'registration', response.retryAfterSeconds, 'ip');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => process.env.NODE_ENV === 'test',
});

export default {
  general: generalLimiter,
  auth: authLimiter,
  lookup: lookupLimiter,
  registration: tenantRegistrationLimiter,
};

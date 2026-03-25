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
const posWindowMs = parseInt(process.env.RATE_LIMIT_POS_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes default
const posMaxRequests = parseInt(process.env.RATE_LIMIT_POS_MAX_REQUESTS) || (isDevelopment ? 3000 : 1500);

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
  pos: 0,
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
  if (path.includes('/pos/')) return 'pos';
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

import RedisStore from 'rate-limit-redis';
import { getRedisClient, isRedisConnected } from '../config/redis.js';

import { MemoryStore } from 'express-rate-limit';

// A robust DynamicStore that wraps MemoryStore (local) and RedisStore (distributed).
// It attempts to use Redis if available, falling back seamlessly to MemoryStore
// if the Redis connection is lost or unavailable.
class DynamicStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.memoryStore = new MemoryStore();
    this.redisStore = null;
    this.options = null;
  }

  init(options) {
    this.options = options;
    this.memoryStore.init?.(options);

    const client = getRedisClient();
    if (client && client.sendCommand) {
      try {
        const ActualRedisStore = (typeof RedisStore === 'function') ? RedisStore : RedisStore.default;
        this.redisStore = new ActualRedisStore({
          sendCommand: (...args) => {
            // Ensure we have a fresh client reference if possible, 
            // but for now we follow the captured one if it's still alive.
            const activeClient = getRedisClient();
            if (activeClient && activeClient.sendCommand) {
              return activeClient.sendCommand(args);
            }
            // Fallback to the one we captured at init if active is null
            return client.sendCommand(args);
          },
          prefix: `rl:${this.prefix}:`
        });
        this.redisStore.init?.(options);
      } catch (err) {
        logger.error(`[RateLimiter] RedisStore init failed for ${this.prefix}:`, err);
      }
    }
  }

  getStore() {
    // We only use Redis if both the store is initialized AND we have a live connection.
    if (this.redisStore && isRedisConnected()) {
      return this.redisStore;
    }
    return this.memoryStore;
  }

  async increment(key) {
    const store = this.getStore();
    try {
      return await store.increment(key);
    } catch (e) {
      if (store === this.redisStore && this.memoryStore) {
        logger.warn(`[RateLimiter] Redis failed for ${key}, falling back to memory`);
        return this.memoryStore.increment(key);
      }
      throw e;
    }
  }

  async decrement(key) {
    const store = this.getStore();
    return store.decrement(key);
  }

  async resetKey(key) {
    const store = this.getStore();
    return store.resetKey(key);
  }
}

// General API rate limiter
export const generalLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  message: createRateLimitError('Too many requests from this IP, please try again later.'),
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  validate: { trustProxy: false },
  store: new DynamicStore('general'),
  keyGenerator: (req) => firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip',
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
  store: new DynamicStore('auth'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
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
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

// Strictest rate limiter for email lookup to prevent enumeration
export const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per window
  message: createRateLimitError('Too many email lookup attempts. For security reasons, please try again in 15 minutes.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('lookup'),
  keyGenerator: (req) => firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip',
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
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

// Strict rate limiter for tenant registration (prevents DoS via auto-provisioning)
export const tenantRegistrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 50 : 5, // 5 per hour in prod, 50 in dev
  message: createRateLimitError('Too many registration requests from this IP, please try again after an hour.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('registration'),
  keyGenerator: (req) => firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip',
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
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

// POS rate limiter: tenant/user/terminal scoped to avoid IP-only throttling on shared networks
export const posLimiter = rateLimit({
  windowMs: posWindowMs,
  max: posMaxRequests,
  message: createRateLimitError('POS request limit reached. Please wait before retrying.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('pos'),
  keyGenerator: (req) => {
    const tenantKey = req.tenant?.id || req.headers['x-company-token'] || 'unknown-tenant';
    const userKey = req.user?.user_id || 'anonymous';
    const terminalKey = req.headers['x-pos-terminal-id'] || req.body?.terminal_id || firstForwardedIp(req) || req.ip || 'unknown-terminal';
    return `pos:${tenantKey}:${userKey}:${terminalKey}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'POS request limit reached. Please wait before retrying.',
      'pos',
      'tenant_user_terminal'
    );
    logRateLimitEvent(req, 'pos', response.retryAfterSeconds, 'tenant_user_terminal');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

export default {
  general: generalLimiter,
  auth: authLimiter,
  lookup: lookupLimiter,
  registration: tenantRegistrationLimiter,
  pos: posLimiter,
};

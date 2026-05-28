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
const emailOtpWindowMs = parseInt(process.env.RATE_LIMIT_EMAIL_OTP_WINDOW_MS) || 10 * 60 * 1000; // 10 minutes
const emailOtpMaxRequests = parseInt(process.env.RATE_LIMIT_EMAIL_OTP_MAX_REQUESTS) || (isDevelopment ? 12 : 3);
const adminAuthWindowMs = parseInt(process.env.RATE_LIMIT_ADMIN_AUTH_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const adminAuthMaxRequests = parseInt(process.env.RATE_LIMIT_ADMIN_AUTH_MAX_REQUESTS) || (isDevelopment ? 20 : 5);
const storeAuthWindowMs = parseInt(process.env.RATE_LIMIT_STORE_AUTH_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const storeAuthMaxRequests = parseInt(process.env.RATE_LIMIT_STORE_AUTH_MAX_REQUESTS) || (isDevelopment ? 60 : 10);
const storeTrackingWindowMs = parseInt(process.env.RATE_LIMIT_STORE_TRACKING_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const storeTrackingMaxRequests = parseInt(process.env.RATE_LIMIT_STORE_TRACKING_MAX_REQUESTS) || (isDevelopment ? 120 : 30);
const storefrontDiscoveryWindowMs = parseInt(process.env.RATE_LIMIT_STOREFRONT_DISCOVERY_WINDOW_MS) || 60 * 1000; // 1 minute
const storefrontDiscoveryMaxRequests = parseInt(process.env.RATE_LIMIT_STOREFRONT_DISCOVERY_MAX_REQUESTS) || (isDevelopment ? 240 : 90);
const storefrontFollowWindowMs = parseInt(process.env.RATE_LIMIT_STOREFRONT_FOLLOW_WINDOW_MS) || 60 * 1000; // 1 minute
const storefrontFollowMaxRequests = parseInt(process.env.RATE_LIMIT_STOREFRONT_FOLLOW_MAX_REQUESTS) || (isDevelopment ? 120 : 30);
const onboardingEventsWindowMs = parseInt(process.env.RATE_LIMIT_ONBOARDING_EVENTS_WINDOW_MS) || 5 * 60 * 1000; // 5 minutes
const onboardingEventsMaxRequests = parseInt(process.env.RATE_LIMIT_ONBOARDING_EVENTS_MAX_REQUESTS) || (isDevelopment ? 180 : 60);
const posWindowMs = parseInt(process.env.RATE_LIMIT_POS_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes default
const posMaxRequests = parseInt(process.env.RATE_LIMIT_POS_MAX_REQUESTS) || (isDevelopment ? 3000 : 1500);
const tenantRegistrationWindowMs = parseInt(process.env.RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS) || 60 * 60 * 1000; // 1 hour
const tenantRegistrationMaxRequests = parseInt(process.env.RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS) || (isDevelopment ? 50 : 5);
const geoSearchWindowMs = parseInt(process.env.RATE_LIMIT_GEO_SEARCH_WINDOW_MS) || 60 * 1000; // 1 minute
const geoSearchMaxRequests = parseInt(process.env.RATE_LIMIT_GEO_SEARCH_MAX_REQUESTS) || (isDevelopment ? 240 : 60);
const inventoryPushWindowMs = parseInt(process.env.RATE_LIMIT_INVENTORY_PUSH_WINDOW_MS) || 60 * 1000; // 1 minute
const inventoryPushMaxRequests = parseInt(process.env.RATE_LIMIT_INVENTORY_PUSH_MAX_REQUESTS) || (isDevelopment ? 120 : 20);

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
  email_otp: 0,
  store_auth: 0,
  store_tracking: 0,
  storefront_discovery: 0,
  storefront_follow: 0,
  onboarding_events: 0,
  ai: 0,
  pos: 0,
  registration: 0,
  geo_search: 0,
  inventory_push: 0,
  other: 0,
};
const rateLimitAlertThreshold = parseInt(process.env.RATE_LIMIT_ALERT_THRESHOLD) || 50;

const normalizeEmail = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const normalizeTrackingPin = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
};

const firstForwardedIp = (req) => {
  const xffHeader = req.headers['x-forwarded-for'];
  if (typeof xffHeader !== 'string') return null;
  const first = xffHeader.split(',')[0]?.trim();
  return first || null;
};

const isDevelopmentPreviewIp = (rawIp) => {
  const normalized = String(rawIp || '').trim().toLowerCase();
  if (!normalized) return false;
  const ip = normalized.replace(/^::ffff:/, '');
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  const parts = ip.split('.');
  if (parts.length === 4 && parts.every((part) => /^\d+$/.test(part))) {
    const firstOctet = Number(parts[0]);
    const secondOctet = Number(parts[1]);
    if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) return true;
  }
  return false;
};

const shouldSkipLocalPreviewDiscoveryRateLimit = (req) => {
  if (!isDevelopment && process.env.ALLOW_LOCAL_RATE_LIMIT_BYPASS !== 'true') return false;
  const forwardedIp = firstForwardedIp(req);
  const directIp = req.ip || req.connection?.remoteAddress || '';
  return isDevelopmentPreviewIp(forwardedIp) || isDevelopmentPreviewIp(directIp);
};

const normalizeIpForComparison = (rawIp) => String(rawIp || '').trim().toLowerCase().replace(/^::ffff:/, '');

const parseTrackingIpBypassList = () => String(process.env.RATE_LIMIT_STORE_TRACKING_BYPASS_IPS || '')
  .split(',')
  .map((ip) => normalizeIpForComparison(ip))
  .filter(Boolean);

const trackingIpBypassList = new Set(parseTrackingIpBypassList());

const shouldSkipTrackingRateLimitForIp = (req) => {
  const forwardedIp = normalizeIpForComparison(firstForwardedIp(req));
  const directIp = normalizeIpForComparison(req.ip || req.connection?.remoteAddress || '');
  if (trackingIpBypassList.has(forwardedIp) || trackingIpBypassList.has(directIp)) return true;
  if (isDevelopmentPreviewIp(forwardedIp) || isDevelopmentPreviewIp(directIp)) return true;
  return shouldSkipLocalPreviewDiscoveryRateLimit(req);
};

const normalizeCompanyTokenHeader = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeHostHeader = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.startsWith('[')) {
    const closingBracketIdx = trimmed.indexOf(']');
    if (closingBracketIdx !== -1) {
      return trimmed.slice(0, closingBracketIdx + 1);
    }
    return trimmed;
  }
  return trimmed.split(':')[0] || '';
};

const companyTokenFromValidatePath = (pathValue) => {
  if (typeof pathValue !== 'string') return '';
  const match = pathValue.match(/\/auth\/validate-token\/([^/?#]+)/i);
  if (!match?.[1]) return '';
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
};

const decodeJwtPayloadUnsafe = (token) => {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payloadPart = parts[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = payloadPart + '='.repeat((4 - (payloadPart.length % 4 || 4)) % 4);
  try {
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(decoded);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
};

const userKeyFromAuthHeader = (authHeader) => {
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) return '';
  const token = authHeader.slice(7).trim();
  if (!token) return '';
  const payload = decodeJwtPayloadUnsafe(token);
  if (!payload) return '';
  const userIdCandidate = payload.user_id ?? payload.sub ?? payload.id ?? '';
  return String(userIdCandidate || '').trim();
};

const getScopeFromRequest = (req, fallbackScope) => {
  const path = req.path || '';
  if (path.includes('/auth/login')) return 'auth_login';
  if (path.includes('/email-otp/request')) return 'email_otp';
  if (path.includes('/auth/register')) return 'auth_register';
  if (path.includes('/auth/lookup')) return 'auth_lookup';
  if (path.includes('/store/auth/')) return 'store_auth';
  if (path.includes('/store/track/') || path.includes('/store/orders/')) return 'store_tracking';
  if (path.includes('/storefront/discovery')) return 'storefront_discovery';
  if (path.includes('/store/follow')) return 'storefront_follow';
  if (path.includes('/onboarding/events')) return 'onboarding_events';
  if (path.includes('/ai/')) return 'ai';
  if (path.includes('/pos/')) return 'pos';
  if (path.includes('/admin/tenants/register')) return 'registration';
  if (path.includes('/storefront/geo-search')) return 'geo_search';
  if (path.includes('/store/inventory/push')) return 'inventory_push';
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

const dynamicStores = new Set();

// A robust DynamicStore that wraps MemoryStore (local) and RedisStore (distributed).
// It attempts to use Redis if available, falling back seamlessly to MemoryStore
// if the Redis connection is lost or unavailable.
export class DynamicStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.memoryStore = new MemoryStore();
    this.redisStore = null;
    this.options = null;
    dynamicStores.add(this);
  }

  init(options) {
    this.options = options;
    this.memoryStore.init?.(options);
    this.ensureRedisStore();
  }

  ensureRedisStore() {
    if (this.redisStore || !this.options || !isRedisConnected()) {
      return;
    }

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
        this.redisStore.init?.(this.options);
        logger.info(`[RateLimiter] RedisStore initialized for ${this.prefix}`);
      } catch (err) {
        logger.error(`[RateLimiter] RedisStore init failed for ${this.prefix}:`, err);
      }
    }
  }

  getStore() {
    this.ensureRedisStore();
    // We only use Redis if both the store is initialized AND we have a live connection.
    if (this.redisStore && isRedisConnected()) {
      return this.redisStore;
    }
    return this.memoryStore;
  }

  getMode() {
    this.ensureRedisStore();
    return this.redisStore && isRedisConnected() ? 'redis' : 'memory';
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

export const getRateLimiterStoreMode = () => {
  for (const store of dynamicStores) {
    if (store.getMode() === 'redis') {
      return 'redis';
    }
  }

  return process.env.REDIS_URL ? 'memory_fallback' : 'memory';
};

// General API rate limiter
export const generalLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  message: createRateLimitError('Too many requests from this IP, please try again later.'),
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  validate: { trustProxy: false },
  store: new DynamicStore('general'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const host = normalizeHostHeader(req.hostname || req.headers.host || '');
    const companyToken = normalizeCompanyTokenHeader(req.headers['x-company-token'])
      || companyTokenFromValidatePath(req.path || req.originalUrl || '');
    const userKey = userKeyFromAuthHeader(req.headers.authorization);
    if (host || companyToken || userKey) {
      return `general:${host || 'unknown-host'}:${companyToken || 'default'}:${userKey || 'anonymous'}:${ip}`;
    }
    return ip;
  },
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
  skip: (req) => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    if (shouldSkipLocalPreviewDiscoveryRateLimit(req)) return true;
    return false;
  },
});

export const emailOtpLimiter = rateLimit({
  windowMs: emailOtpWindowMs,
  max: emailOtpMaxRequests,
  message: createRateLimitError('Too many email verification code requests, please try again later.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('email_otp'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const email = normalizeEmail(req.body?.email || req.validatedData?.email);
    const inviteToken = String(req.body?.invitation_token || req.validatedData?.invitation_token || '').trim();
    const tenantKey = req.tenant?.id || req.headers['x-company-token'] || 'global';
    const purpose = String(req.body?.purpose || req.validatedData?.purpose || 'unknown').trim();
    const identity = email || inviteToken || 'unknown-email';
    return `email_otp:${purpose}:${tenantKey}:${ip}:${identity}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many email verification code requests, please try again later.',
      'email_otp',
      'tenant_ip_purpose_identity'
    );
    logRateLimitEvent(req, 'email_otp', response.retryAfterSeconds, 'tenant_ip_purpose_identity');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: (req) => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    if (shouldSkipTrackingRateLimitForIp(req)) return true;
    return false;
  },
});

// Strict admin auth limiter. Uses ip + username keying to reduce brute-force risk.
export const adminAuthLimiter = rateLimit({
  windowMs: adminAuthWindowMs,
  max: adminAuthMaxRequests,
  message: createRateLimitError('Too many admin authentication attempts, please try again later.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('admin_auth'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const username = normalizeEmail(req.body?.username);
    return username ? `admin_auth:${ip}:${username}` : `admin_auth:${ip}:unknown-username`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many admin authentication attempts, please try again later.',
      'admin_auth',
      'ip_username'
    );
    logRateLimitEvent(req, 'admin_auth', response.retryAfterSeconds, 'ip_username');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: (req) => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    if (shouldSkipTrackingRateLimitForIp(req)) return true;
    return false;
  },
});

// Store auth limiter (public storefront register/login)
export const storeAuthLimiter = rateLimit({
  windowMs: storeAuthWindowMs,
  max: storeAuthMaxRequests,
  message: createRateLimitError('Too many storefront authentication attempts, please try again later.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('store_auth'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const email = normalizeEmail(req.body?.email);
    const scope = req.path?.includes('/register') ? 'register' : 'login';
    return email ? `store_auth:${scope}:${ip}:${email}` : `store_auth:${scope}:${ip}:unknown-email`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many storefront authentication attempts, please try again later.',
      'store_auth',
      'ip_email'
    );
    logRateLimitEvent(req, 'store_auth', response.retryAfterSeconds, 'ip_email');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

// Store tracking limiter (public tracking/cancellation endpoints)
export const storeTrackingLimiter = rateLimit({
  windowMs: storeTrackingWindowMs,
  max: storeTrackingMaxRequests,
  message: createRateLimitError('Too many tracking requests. Please wait before trying again.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('store_tracking'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const trackingPin = normalizeTrackingPin(req.params?.tracking_pin || req.body?.tracking_pin || '');
    return trackingPin
      ? `store_tracking:${ip}:${trackingPin}`
      : `store_tracking:${ip}:missing-pin`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many tracking requests. Please wait before trying again.',
      'store_tracking',
      'ip_tracking_pin'
    );
    logRateLimitEvent(req, 'store_tracking', response.retryAfterSeconds, 'ip_tracking_pin');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

// Public storefront discovery limiter (search/list/map/profile lookups).
export const storefrontDiscoveryLimiter = rateLimit({
  windowMs: storefrontDiscoveryWindowMs,
  max: storefrontDiscoveryMaxRequests,
  message: createRateLimitError('Too many discovery requests. Please wait before trying again.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('storefront_discovery'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const search = String(req.query?.search || '').trim().toLowerCase();
    const slug = String(req.params?.slug || '').trim().toLowerCase();
    if (slug) return `storefront_discovery:${ip}:slug:${slug}`;
    if (search) return `storefront_discovery:${ip}:search:${search}`;
    return `storefront_discovery:${ip}:browse`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many discovery requests. Please wait before trying again.',
      'storefront_discovery',
      'ip_query'
    );
    logRateLimitEvent(req, 'storefront_discovery', response.retryAfterSeconds, 'ip_query');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: (req) => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    if (shouldSkipLocalPreviewDiscoveryRateLimit(req)) return true;
    return false;
  },
});

export const storefrontFollowLimiter = rateLimit({
  windowMs: storefrontFollowWindowMs,
  max: storefrontFollowMaxRequests,
  message: createRateLimitError('Too many storefront follow requests. Please wait before trying again.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('storefront_follow'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const tenantKey = req.tenant?.id || req.headers['x-company-token'] || 'unknown-tenant';
    const slugRaw = req.query?.storefront_slug ?? req.body?.storefront_slug ?? '';
    const slug = String(slugRaw || '').trim().toLowerCase() || 'unknown-slug';
    const customerId = String(req.storeCustomer?.customer_id || '').trim();
    const visitorIdRaw = req.query?.visitor_id ?? req.body?.visitor_id ?? '';
    const visitorId = String(visitorIdRaw || '').trim();
    const identity = customerId ? `customer:${customerId}` : `guest:${visitorId || 'missing-visitor'}`;
    return `storefront_follow:${tenantKey}:${slug}:${identity}:${ip}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many storefront follow requests. Please wait before trying again.',
      'storefront_follow',
      'tenant_slug_identity_ip'
    );
    logRateLimitEvent(req, 'storefront_follow', response.retryAfterSeconds, 'tenant_slug_identity_ip');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

// Tenant onboarding telemetry limiter (master-admin authenticated surface).
export const onboardingEventsLimiter = rateLimit({
  windowMs: onboardingEventsWindowMs,
  max: onboardingEventsMaxRequests,
  message: createRateLimitError('Too many onboarding event requests. Please wait before retrying.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('onboarding_events'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const tenantKey = req.tenant?.id || req.headers['x-company-token'] || 'unknown-tenant';
    const userKey = req.user?.user_id || 'anonymous';
    const eventKey = normalizeTrackingPin(req.body?.event_key || '');
    return `onboarding_events:${tenantKey}:${userKey}:${eventKey || 'unknown-event'}:${ip}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many onboarding event requests. Please wait before retrying.',
      'onboarding_events',
      'tenant_user_event_ip'
    );
    logRateLimitEvent(req, 'onboarding_events', response.retryAfterSeconds, 'tenant_user_event_ip');
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
  windowMs: tenantRegistrationWindowMs,
  max: tenantRegistrationMaxRequests,
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

// Geo-search limiter: public spatial item-search endpoint, IP + query keyed.
export const geoSearchLimiter = rateLimit({
  windowMs: geoSearchWindowMs,
  max: geoSearchMaxRequests,
  message: createRateLimitError('Too many geo-search requests. Please wait before trying again.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('geo_search'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const query = String(req.query?.query || '').trim().toLowerCase().slice(0, 64);
    return query ? `geo_search:${ip}:q:${query}` : `geo_search:${ip}:browse`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many geo-search requests. Please wait before trying again.',
      'geo_search',
      'ip_query'
    );
    logRateLimitEvent(req, 'geo_search', response.retryAfterSeconds, 'ip_query');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

// Inventory push limiter: tenant-scoped to prevent queue flooding.
export const inventoryPushLimiter = rateLimit({
  windowMs: inventoryPushWindowMs,
  max: inventoryPushMaxRequests,
  message: createRateLimitError('Too many inventory push requests. Please wait before trying again.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('inventory_push'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const tenantKey = req.tenant?.id || req.headers['x-company-token'] || 'unknown-tenant';
    return `inventory_push:${tenantKey}:${ip}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many inventory push requests. Please wait before trying again.',
      'inventory_push',
      'tenant_ip'
    );
    logRateLimitEvent(req, 'inventory_push', response.retryAfterSeconds, 'tenant_ip');
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
  emailOtp: emailOtpLimiter,
  adminAuth: adminAuthLimiter,
  storeAuth: storeAuthLimiter,
  storeTracking: storeTrackingLimiter,
  storefrontDiscovery: storefrontDiscoveryLimiter,
  storefrontFollow: storefrontFollowLimiter,
  onboardingEvents: onboardingEventsLimiter,
  lookup: lookupLimiter,
  registration: tenantRegistrationLimiter,
  pos: posLimiter,
  geoSearch: geoSearchLimiter,
  inventoryPush: inventoryPushLimiter,
};

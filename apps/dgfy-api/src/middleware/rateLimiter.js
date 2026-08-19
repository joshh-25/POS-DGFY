import rateLimit from 'express-rate-limit';
import logger from '../config/logger.js';
import { isPremiumActiveTenant } from '../utils/tenantPlan.js';
import { MOBILE_SYNC_LIMIT_PER_DAY } from '../modules/pos/usecases/mobilePosUseCases.js';

// Get rate limit configuration from environment variables.
// In development, use more lenient limits to account for React StrictMode double renders.
const isDevelopment = process.env.NODE_ENV === 'development';
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes default
const parsedGeneralMax = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS);
const minProdGeneralMax = parseInt(process.env.RATE_LIMIT_MIN_PROD_REQUESTS) || 300;
const maxRequests = isDevelopment
  ? (parsedGeneralMax || 1000)
  : Math.max(parsedGeneralMax || 100, minProdGeneralMax);
export const DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const authWindowMs = parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS;
const authMaxRequests = parseInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS) || (isDevelopment ? 50 : 5); // 50 in dev, 5 in prod
const lookupWindowMs = parseInt(process.env.RATE_LIMIT_LOOKUP_WINDOW_MS) || 5 * 60 * 1000; // 5 minutes default
const lookupMaxRequests = parseInt(process.env.RATE_LIMIT_LOOKUP_MAX_REQUESTS) || (isDevelopment ? 50 : 5);
const emailOtpWindowMs = parseInt(process.env.RATE_LIMIT_EMAIL_OTP_WINDOW_MS) || 10 * 60 * 1000; // 10 minutes
const emailOtpMaxRequests = parseInt(process.env.RATE_LIMIT_EMAIL_OTP_MAX_REQUESTS) || (isDevelopment ? 12 : 3);
const adminAuthWindowMs = parseInt(process.env.RATE_LIMIT_ADMIN_AUTH_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const adminAuthMaxRequests = parseInt(process.env.RATE_LIMIT_ADMIN_AUTH_MAX_REQUESTS) || (isDevelopment ? 20 : 5);
const storeAuthWindowMs = parseInt(process.env.RATE_LIMIT_STORE_AUTH_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const storeAuthMaxRequests = parseInt(process.env.RATE_LIMIT_STORE_AUTH_MAX_REQUESTS) || (isDevelopment ? 60 : 10);
const storeTrackingWindowMs = parseInt(process.env.RATE_LIMIT_STORE_TRACKING_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const storeTrackingMaxRequests = parseInt(process.env.RATE_LIMIT_STORE_TRACKING_MAX_REQUESTS) || (isDevelopment ? 120 : 30);
const storeTrackingReadWindowMs = parseInt(process.env.RATE_LIMIT_STORE_TRACKING_READ_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const storeTrackingReadMaxRequests = parseInt(process.env.RATE_LIMIT_STORE_TRACKING_READ_MAX_REQUESTS) || (isDevelopment ? 600 : 300);
const storeLocationsWindowMs = parseInt(process.env.RATE_LIMIT_STORE_LOCATIONS_WINDOW_MS) || 60 * 1000; // 1 minute
const storeLocationsMaxRequests = parseInt(process.env.RATE_LIMIT_STORE_LOCATIONS_MAX_REQUESTS) || (isDevelopment ? 240 : 90);
// #678 (voucher catalog display seam): a voucher_code query param on the public catalog/QR
// routes is both a valid/invalid voucher-code oracle and a lever that forces those responses to
// no-store, bypassing the shared CDN cache. Scoped tightly -- this only gates requests that
// actually carry voucher_code, never the plain catalog browse path.
const storeVoucherLookupWindowMs = parseInt(process.env.RATE_LIMIT_STORE_VOUCHER_LOOKUP_WINDOW_MS) || 60 * 1000; // 1 minute
const storeVoucherLookupMaxRequests = parseInt(process.env.RATE_LIMIT_STORE_VOUCHER_LOOKUP_MAX_REQUESTS) || (isDevelopment ? 120 : 20);
const storefrontDiscoveryWindowMs = parseInt(process.env.RATE_LIMIT_STOREFRONT_DISCOVERY_WINDOW_MS) || 60 * 1000; // 1 minute
const storefrontDiscoveryMaxRequests = parseInt(process.env.RATE_LIMIT_STOREFRONT_DISCOVERY_MAX_REQUESTS) || (isDevelopment ? 240 : 90);
const storefrontFollowWindowMs = parseInt(process.env.RATE_LIMIT_STOREFRONT_FOLLOW_WINDOW_MS) || 60 * 1000; // 1 minute
const storefrontFollowMaxRequests = parseInt(process.env.RATE_LIMIT_STOREFRONT_FOLLOW_MAX_REQUESTS) || (isDevelopment ? 120 : 30);
const onboardingEventsWindowMs = parseInt(process.env.RATE_LIMIT_ONBOARDING_EVENTS_WINDOW_MS) || 5 * 60 * 1000; // 5 minutes
const onboardingEventsMaxRequests = parseInt(process.env.RATE_LIMIT_ONBOARDING_EVENTS_MAX_REQUESTS) || (isDevelopment ? 180 : 60);
const posWindowMs = parseInt(process.env.RATE_LIMIT_POS_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes default
const posMaxRequests = parseInt(process.env.RATE_LIMIT_POS_MAX_REQUESTS) || (isDevelopment ? 3000 : 1500);
const posDrawerAuthorizationWindowMs = parseInt(process.env.RATE_LIMIT_POS_DRAWER_AUTH_WINDOW_MS) || 10 * 60 * 1000;
const posDrawerAuthorizationMaxRequests = parseInt(process.env.RATE_LIMIT_POS_DRAWER_AUTH_MAX_REQUESTS) || (isDevelopment ? 20 : 5);
const dgfyTenantSessionWindowMs = parseInt(process.env.RATE_LIMIT_DGFY_TENANT_SESSION_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
const dgfyTenantSessionMaxRequests = parseInt(process.env.RATE_LIMIT_DGFY_TENANT_SESSION_MAX_REQUESTS) || (isDevelopment ? 50 : 10);
const dgfyAccountSearchWindowMs = parseInt(process.env.RATE_LIMIT_DGFY_ACCOUNT_SEARCH_WINDOW_MS) || 60 * 1000; // 1 minute
const dgfyAccountSearchMaxRequests = parseInt(process.env.RATE_LIMIT_DGFY_ACCOUNT_SEARCH_MAX_REQUESTS) || (isDevelopment ? 120 : 30);
const tenantRegistrationWindowMs = parseInt(process.env.RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS) || 60 * 60 * 1000; // 1 hour
const tenantRegistrationMaxRequests = parseInt(process.env.RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS) || (isDevelopment ? 50 : 5);
const geoSearchWindowMs = parseInt(process.env.RATE_LIMIT_GEO_SEARCH_WINDOW_MS) || 60 * 1000; // 1 minute
const geoSearchMaxRequests = parseInt(process.env.RATE_LIMIT_GEO_SEARCH_MAX_REQUESTS) || (isDevelopment ? 240 : 60);
const routeCalculatorWindowMs = parseInt(process.env.RATE_LIMIT_ROUTE_CALCULATOR_WINDOW_MS) || 60 * 1000; // 1 minute
const routeCalculatorMaxRequests = parseInt(process.env.RATE_LIMIT_ROUTE_CALCULATOR_MAX_REQUESTS) || (isDevelopment ? 240 : 60);
const inventoryPushWindowMs = parseInt(process.env.RATE_LIMIT_INVENTORY_PUSH_WINDOW_MS) || 60 * 1000; // 1 minute
const inventoryPushMaxRequests = parseInt(process.env.RATE_LIMIT_INVENTORY_PUSH_MAX_REQUESTS) || (isDevelopment ? 120 : 20);
const itemOperationsWindowMs = parseInt(process.env.RATE_LIMIT_ITEM_OPERATIONS_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes default
const itemOperationsMaxRequests = parseInt(process.env.RATE_LIMIT_ITEM_OPERATIONS_MAX_REQUESTS) || (isDevelopment ? 3000 : 1500);
const tenantFinancialWindowMs = parseInt(process.env.RATE_LIMIT_TENANT_FINANCIAL_WINDOW_MS) || 15 * 60 * 1000;
const tenantFinancialMaxRequests = parseInt(process.env.RATE_LIMIT_TENANT_FINANCIAL_MAX_REQUESTS) || (isDevelopment ? 1000 : 240);
const mobilePosFreeSyncWindowMs = parseInt(process.env.RATE_LIMIT_MOBILE_POS_FREE_SYNC_WINDOW_MS) || 24 * 60 * 60 * 1000; // 24 hours
// Defaults to the same MOBILE_SYNC_LIMIT_PER_DAY already advertised to
// clients in sync_policy/sync_limit_policy (mobilePosUseCases.js), so the
// advertised and enforced caps can't drift apart.
const mobilePosFreeSyncMaxRequests = parseInt(process.env.RATE_LIMIT_MOBILE_POS_FREE_SYNC_MAX_REQUESTS) || MOBILE_SYNC_LIMIT_PER_DAY;

// Standard error response format
const createRateLimitError = (message, metadata = {}) => ({
  success: false,
  data: null,
  message,
  ...metadata,
  timestamp: new Date().toISOString(),
});

const formatWindowMinutes = (durationMs) => {
  const minutes = Math.max(1, Math.ceil(Number(durationMs || 0) / (60 * 1000)));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

const lookupRateLimitMessage = `Too many email lookup attempts. For security reasons, please try again in ${formatWindowMinutes(lookupWindowMs)}.`;

const rateLimitCounters = {
  total: 0,
  auth_login: 0,
  auth_register: 0,
  auth_lookup: 0,
  email_otp: 0,
  store_auth: 0,
  store_tracking: 0,
  store_tracking_read: 0,
  store_locations: 0,
  store_voucher_lookup: 0,
  storefront_discovery: 0,
  storefront_follow: 0,
  onboarding_events: 0,
  ai: 0,
  pos: 0,
  pos_drawer_authorization: 0,
  dgfy_tenant_session: 0,
  dgfy_account_search: 0,
  registration: 0,
  geo_search: 0,
  inventory_push: 0,
  mobile_pos_free_sync: 0,
  item_operations: 0,
  tenant_financial: 0,
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

const normalizeStoreLimiterSlug = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().slice(0, 128);
};

const getTrackingLimiterKeyParts = (req) => {
  const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
  const trackingPin = normalizeTrackingPin(req.params?.tracking_pin || req.body?.tracking_pin || '') || 'missing-pin';
  const storeSlug = normalizeStoreLimiterSlug(
    req.headers?.['x-store-slug']
    || req.tenant?.slug
    || req.tenant?.store_slug
    || req.tenant?.id
    || 'unknown-store'
  ) || 'unknown-store';

  return { ip, trackingPin, storeSlug };
};

const firstForwardedIp = (req) => {
  const xffHeader = req.headers['x-forwarded-for'];
  if (typeof xffHeader !== 'string') return null;
  const first = xffHeader.split(',')[0]?.trim();
  return first || null;
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

const AUTHENTICATED_POS_BOOTSTRAP_READ_PATHS = new Set([
  '/api/v1/settings',
  '/api/v1/settings/company-info',
  '/api/v1/users/me',
  '/api/v1/users',
  '/api/v1/tenant-locations',
  '/api/v1/items',
  '/api/v1/items/folders',
  '/api/v1/pos/catalog',
  '/api/v1/pos/setup/cashiers',
  '/api/v1/pos/device/status',
  '/api/v1/pos/terminal/shifts/current',
  '/api/v1/pos/terminal/dashboard/today',
  '/api/v1/pos/incoming-orders'
]);

const isAuthenticatedPosBootstrapRead = (req) => {
  if (String(req?.method || '').toUpperCase() !== 'GET') return false;
  const path = String(req?.originalUrl || req?.path || '').split('?')[0];
  if (!AUTHENTICATED_POS_BOOTSTRAP_READ_PATHS.has(path)) return false;
  const authHeader = String(req?.headers?.authorization || '').trim();
  const companyToken = normalizeCompanyTokenHeader(req?.headers?.['x-company-token']);
  return Boolean(authHeader) && Boolean(companyToken);
};

const isAuthenticatedItemOperation = (req) => {
  const path = String(req?.originalUrl || req?.path || '').split('?')[0];
  if (!/^\/api\/v1\/items(?:\/|$)/.test(path)) return false;

  // Item routes authenticate and authorize every request in routes/items.js.
  // Keep this protected operational traffic out of the shared public-IP bucket;
  // a busy store network must not block inventory creation, edits, or uploads.
  const authHeader = String(req?.headers?.authorization || '').trim();
  const companyToken = normalizeCompanyTokenHeader(req?.headers?.['x-company-token']);
  return Boolean(authHeader) && Boolean(companyToken);
};

const LOCAL_POS_ORIGINS = new Set([
  'dgfypos://app',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5184',
  'http://127.0.0.1:5184',
]);

const LOCAL_POS_ORIGIN_PATTERNS = [
  /^http:\/\/\d{1,3}(?:\.\d{1,3}){3}:5174$/,
  /^http:\/\/\d{1,3}(?:\.\d{1,3}){3}:5184$/,
];

const normalizeOriginLikeValue = (value) => {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  if (LOCAL_POS_ORIGINS.has(raw)) return raw;
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
};

const isDevelopmentLocalPosRequest = (req) => {
  if (!isDevelopment) return false;
  const origin = normalizeOriginLikeValue(req.headers.origin);
  if (LOCAL_POS_ORIGINS.has(origin) || LOCAL_POS_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))) return true;
  const refererOrigin = normalizeOriginLikeValue(req.headers.referer);
  return LOCAL_POS_ORIGINS.has(refererOrigin)
    || LOCAL_POS_ORIGIN_PATTERNS.some((pattern) => pattern.test(refererOrigin));
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
  if (path.includes('/dgfy/auth/tenant-session')) return 'dgfy_tenant_session';
  if (path.includes('/dgfy/accounts/search')) return 'dgfy_account_search';
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

const shouldSkipLocalPosAuthRateLimit = (req) => {
  if (!isDevelopmentLocalPosRequest(req)) return false;
  logger.info('[RateLimiter] Skipping local POS auth throttle in development', {
    path: req.path,
    origin: req.headers.origin || null,
    referer: req.headers.referer || null,
  });
  return true;
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
    // POS routes apply their own tenant/user/terminal limiter after authentication.
    // Do not also consume the shared public IP bucket for ordinary POS work.
    if (/^\/(?:v1\/)?(?:pos|mobile-pos)(?:\/|$)/.test(req.path || req.originalUrl || '')) return true;
    if (isAuthenticatedPosBootstrapRead(req)) return true;
    if (isAuthenticatedItemOperation(req)) return true;
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
    if (shouldSkipLocalPosAuthRateLimit(req)) return true;
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
    if (shouldSkipLocalPosAuthRateLimit(req)) return true;
    return false;
  },
});

const createStoreGuestCheckoutOtpLimiter = ({ operation, message }) => rateLimit({
  windowMs: emailOtpWindowMs,
  max: emailOtpMaxRequests,
  message: createRateLimitError(message),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore(`store_guest_checkout_otp_${operation}`),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const email = normalizeEmail(req.body?.email || req.validatedData?.email) || 'unknown-email';
    const tenantKey = req.tenant?.id || req.headers['x-company-token'] || 'global';
    return `store_guest_checkout_otp:${operation}:${tenantKey}:${ip}:${email}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      message,
      `store_guest_checkout_otp_${operation}`,
      'tenant_ip_email'
    );
    logRateLimitEvent(req, `store_guest_checkout_otp_${operation}`, response.retryAfterSeconds, 'tenant_ip_email');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  }
});

export const storeGuestCheckoutOtpRequestLimiter = createStoreGuestCheckoutOtpLimiter({
  operation: 'request',
  message: 'Too many email verification code requests, please try again later.'
});

export const storeGuestCheckoutOtpVerifyLimiter = createStoreGuestCheckoutOtpLimiter({
  operation: 'verify',
  message: 'Too many verification attempts, please try again later.'
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
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
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

// Store tracking mutation limiter (claim/cancellation actions).
export const storeTrackingLimiter = rateLimit({
  windowMs: storeTrackingWindowMs,
  max: storeTrackingMaxRequests,
  message: createRateLimitError('Too many tracking requests. Please wait before trying again.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
    store: new DynamicStore('store_tracking'),
    keyGenerator: (req) => {
      const { ip, trackingPin } = getTrackingLimiterKeyParts(req);
      return `store_tracking:${ip}:${trackingPin}`;
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

  // Public tracking reads have a dedicated tenant/store + PIN bucket with
  // headroom for customer refreshes. Claim/cancel mutations remain stricter.
  export const storeTrackingReadLimiter = rateLimit({
  windowMs: storeTrackingReadWindowMs,
  max: storeTrackingReadMaxRequests,
  message: createRateLimitError('Too many tracking refresh requests. Please wait before trying again.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
    store: new DynamicStore('store_tracking_read'),
    keyGenerator: (req) => {
      const { ip, storeSlug, trackingPin } = getTrackingLimiterKeyParts(req);
      return `store_tracking_read:${ip}:${storeSlug}:${trackingPin}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
        options,
        'Too many tracking refresh requests. Please wait before trying again.',
        'store_tracking_read',
        'ip_store_tracking_pin'
      );
      logRateLimitEvent(req, 'store_tracking_read', response.retryAfterSeconds, 'ip_store_tracking_pin');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

// GET /api/v1/store/locations had no rate limiter at all -- unlike every
// other public storefront read route. That mattered once the discovery
// page fanned out one call per store per page load (up to 100 at once, see
// #297): nothing here would have throttled it back. IP + store-slug keyed,
// matching the tracking-read limiter above, since each key now legitimately
// sees at most one request per store profile view.
export const storeLocationsLimiter = rateLimit({
  windowMs: storeLocationsWindowMs,
  max: storeLocationsMaxRequests,
  message: createRateLimitError('Too many location requests. Please wait before trying again.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('store_locations'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const storeSlug = normalizeStoreLimiterSlug(req.headers?.['x-store-slug']) || 'unknown-store';
    return `store_locations:${ip}:${storeSlug}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many location requests. Please wait before trying again.',
      'store_locations',
      'ip_store_slug'
    );
    logRateLimitEvent(req, 'store_locations', response.retryAfterSeconds, 'ip_store_slug');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

// #678: throttles the voucher_code-bearing path of the public catalog/QR routes specifically
// (see routes/store.js's limitVoucherCodeLookups) -- a voucher code is both an enumerable
// oracle and, via the no-store cache bypass it also triggers, a way to force every request to
// skip the shared CDN cache. IP + store-slug keyed, same shape as storeLocationsLimiter above.
export const storeVoucherLookupLimiter = rateLimit({
  windowMs: storeVoucherLookupWindowMs,
  max: storeVoucherLookupMaxRequests,
  message: createRateLimitError('Too many voucher lookups. Please wait before trying again.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('store_voucher_lookup'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const storeSlug = normalizeStoreLimiterSlug(req.headers?.['x-store-slug']) || 'unknown-store';
    return `store_voucher_lookup:${ip}:${storeSlug}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many voucher lookups. Please wait before trying again.',
      'store_voucher_lookup',
      'ip_store_slug'
    );
    logRateLimitEvent(req, 'store_voucher_lookup', response.retryAfterSeconds, 'ip_store_slug');
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
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
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
  windowMs: lookupWindowMs,
  max: lookupMaxRequests,
  message: createRateLimitError(lookupRateLimitMessage),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('lookup'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const email = normalizeEmail(req.body?.email);
    return email ? `lookup:${ip}:${email}` : `lookup:${ip}:unknown-email`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      lookupRateLimitMessage,
      'auth_lookup',
      'ip_email'
    );
    logRateLimitEvent(req, 'auth_lookup', response.retryAfterSeconds, 'ip_email');
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

// DGFY-to-IMS tenant-session handoff limiter. Auth has already run before this
// limiter, so key by account and tenant instead of the generic auth unknown-email bucket.
export const dgfyTenantSessionLimiter = rateLimit({
  windowMs: dgfyTenantSessionWindowMs,
  max: dgfyTenantSessionMaxRequests,
  message: createRateLimitError('Too many business session attempts. Please wait before opening this company again.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('dgfy_tenant_session'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const accountId = String(req.dgfyAccount?.id || 'unknown-account').trim();
    const tenantId = String(req.body?.tenant_id || req.body?.tenantId || 'unknown-tenant').trim();
    return `dgfy_tenant_session:${ip}:${accountId || 'unknown-account'}:${tenantId || 'unknown-tenant'}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many business session attempts. Please wait before opening this company again.',
      'dgfy_tenant_session',
      'ip_account_tenant'
    );
    logRateLimitEvent(req, 'dgfy_tenant_session', response.retryAfterSeconds, 'ip_account_tenant');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

// DGFY business account search is an authenticated IMS user-management lookup.
// Keep it separate from authLimiter so normal typing cannot consume login buckets.
export const dgfyAccountSearchLimiter = rateLimit({
  windowMs: dgfyAccountSearchWindowMs,
  max: dgfyAccountSearchMaxRequests,
  message: createRateLimitError('Too many DGFY account searches. Wait a moment, then try again.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('dgfy_account_search'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    const tenantKey = String(req.tenant?.id || req.headers['x-company-token'] || 'unknown-tenant').trim();
    const userKey = String(req.user?.user_id || userKeyFromAuthHeader(req.headers.authorization) || 'unknown-user').trim();
    const query = String(req.query?.query || req.query?.q || '')
      .trim()
      .toLowerCase()
      .slice(0, 64);
    return `dgfy_account_search:${tenantKey || 'unknown-tenant'}:${userKey || 'unknown-user'}:${ip}:${query || 'empty-query'}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many DGFY account searches. Wait a moment, then try again.',
      'dgfy_account_search',
      'tenant_user_ip_query'
    );
    logRateLimitEvent(req, 'dgfy_account_search', response.retryAfterSeconds, 'tenant_user_ip_query');
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

// Drawer authorization is a PIN-protected operation, so it needs a much
// smaller bucket than ordinary POS reads/checkouts. Scope it to the tenant,
// user, shift, terminal, and source address so one cashier cannot consume a
// different cashier's allowance on a shared terminal.
export const posDrawerAuthorizationLimiter = rateLimit({
  windowMs: posDrawerAuthorizationWindowMs,
  max: posDrawerAuthorizationMaxRequests,
  message: createRateLimitError('Too many cash drawer authorization attempts. Please wait before trying again.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('pos_drawer_authorization'),
  keyGenerator: (req) => {
    const tenantKey = req.tenant?.id || req.headers['x-company-token'] || 'unknown-tenant';
    const userKey = req.user?.user_id || userKeyFromAuthHeader(req.headers.authorization) || 'anonymous';
    const shiftKey = req.body?.shift_id || 'unknown-shift';
    const terminalKey = req.headers['x-pos-terminal-id'] || req.body?.terminal_id || 'unknown-terminal';
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    return `pos_drawer_authorization:${tenantKey}:${userKey}:${shiftKey}:${terminalKey}:${ip}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many cash drawer authorization attempts. Please wait before trying again.',
      'pos_drawer_authorization',
      'tenant_user_shift_terminal_ip'
    );
    logRateLimitEvent(req, 'pos_drawer_authorization', response.retryAfterSeconds, 'tenant_user_shift_terminal_ip');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

// Item operations limiter: tenant/user scoped. All /api/v1/items routes require
// authentication and are exempted from generalLimiter's shared IP bucket (see
// isAuthenticatedItemOperation) so a busy store network doesn't block ordinary
// inventory work — this is what stands in that bucket's place instead of
// leaving the routes fully unprotected (e.g. GET /items/barcodes/resolve).
export const itemOperationsLimiter = rateLimit({
  windowMs: itemOperationsWindowMs,
  max: itemOperationsMaxRequests,
  message: createRateLimitError('Item request limit reached. Please wait before retrying.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('item_operations'),
  keyGenerator: (req) => {
    const tenantKey = req.tenant?.id || req.headers['x-company-token'] || 'unknown-tenant';
    const userKey = req.user?.user_id || 'anonymous';
    return `item_operations:${tenantKey}:${userKey}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Item request limit reached. Please wait before retrying.',
      'item_operations',
      'tenant_user'
    );
    logRateLimitEvent(req, 'item_operations', response.retryAfterSeconds, 'tenant_user');
    res.set('Retry-After', String(response.retryAfterSeconds));
    res.status(response.status).json(response.body);
  },
  skip: () => {
    if (process.env.NODE_ENV === 'test') return true;
    if (isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true') return true;
    return false;
  },
});

export const tenantFinancialLimiter = rateLimit({
  windowMs: tenantFinancialWindowMs,
  max: tenantFinancialMaxRequests,
  message: createRateLimitError('Financial request limit reached. Please wait before retrying.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('tenant_financial'),
  keyGenerator: (req) => {
    const tenantKey = req.tenant?.id || req.query?.tenant_id || req.body?.tenant_id || 'platform';
    const actorKey = req.admin?.username || req.user?.user_id || req.user?.email || 'unknown-actor';
    return `tenant_financial:${tenantKey}:${actorKey}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Financial request limit reached. Please wait before retrying.',
      'tenant_financial',
      'tenant_actor'
    );
    logRateLimitEvent(req, 'tenant_financial', response.retryAfterSeconds, 'tenant_actor');
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

// Route calculator limiter: public GraphHopper-proxy endpoint, IP + coordinate-pair keyed.
export const routeCalculatorLimiter = rateLimit({
  windowMs: routeCalculatorWindowMs,
  max: routeCalculatorMaxRequests,
  message: createRateLimitError('Too many route requests. Please wait before trying again.'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('route_calculator'),
  keyGenerator: (req) => {
    const ip = firstForwardedIp(req) || req.ip || req.connection?.remoteAddress || 'unknown-ip';
    return `route_calculator:${ip}`;
  },
  handler: (req, res, _next, options) => {
    const response = buildRateLimitResponse(
      req,
      options,
      'Too many route requests. Please wait before trying again.',
      'route_calculator',
      'ip'
    );
    logRateLimitEvent(req, 'route_calculator', response.retryAfterSeconds, 'ip');
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

// Free-tier cap for the offline-sync API (see dgfy-mobile
// docs/architecture/SYNC-ARCHITECTURE.md, Channel A). Premium tenants skip
// this limiter entirely (isPremiumActiveTenant) and sync in realtime; free
// tenants get up to 2 pushes per rolling 24h window, tenant-keyed - the cap
// is per business, matching the client's resolveSyncPolicy({ dailyCap: 2 }),
// not per terminal/device. Only mount this on the write endpoints
// (POST /mobile-pos/sync/*); GET /mobile-pos/bootstrap/* (Channel B,
// reference/config) is opportunistic and uncapped for both tiers.
export const mobilePosFreeSyncLimiter = rateLimit({
  windowMs: mobilePosFreeSyncWindowMs,
  max: mobilePosFreeSyncMaxRequests,
  message: createRateLimitError('Free plan is limited to 2 syncs per day. Upgrade to Premium for unlimited sync.', { requiresUpgrade: true }),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  store: new DynamicStore('mobile_pos_free_sync'),
  keyGenerator: (req) => {
    const tenantKey = req.tenant?.id || req.headers['x-company-token'] || 'unknown-tenant';
    return `mobile_pos_free_sync:${tenantKey}`;
  },
  handler: (req, res, _next, options) => {
    const retryAfterSeconds = getRetryAfterSeconds(req, options);
    const body = createRateLimitError(
      'Free plan is limited to 2 syncs per day. Upgrade to Premium for unlimited sync.',
      {
        retryAfterSeconds,
        limitScope: 'mobile_pos_free_sync',
        limitKeyType: 'tenant',
        requiresUpgrade: true
      }
    );
    logRateLimitEvent(req, 'mobile_pos_free_sync', retryAfterSeconds, 'tenant');
    res.set('Retry-After', String(retryAfterSeconds));
    res.status(429).json(body);
  },
  skip: (req) => {
    if (isPremiumActiveTenant(req)) return true;
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
  storeTrackingRead: storeTrackingReadLimiter,
  storefrontDiscovery: storefrontDiscoveryLimiter,
  storefrontFollow: storefrontFollowLimiter,
  onboardingEvents: onboardingEventsLimiter,
  lookup: lookupLimiter,
  dgfyAccountSearch: dgfyAccountSearchLimiter,
  registration: tenantRegistrationLimiter,
  pos: posLimiter,
  geoSearch: geoSearchLimiter,
  routeCalculator: routeCalculatorLimiter,
  inventoryPush: inventoryPushLimiter,
  mobilePosFreeSync: mobilePosFreeSyncLimiter,
  itemOperations: itemOperationsLimiter,
};

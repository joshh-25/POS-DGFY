import { verifyToken, isTokenBlacklisted } from '../services/authService.js';
import dbStore from '../utils/dbStore.js';
import { paymentsEnabled } from '../config/paymentsFeature.js';

// Short-lived in-memory cache to avoid a DB round-trip on every authenticated request.
// The JWT is cryptographically verified before the cache is consulted, so this is safe.
// isTokenBlacklisted() still runs first, so logout is immediately honoured.
const _userCache = new Map(); // user_id -> { user, expiresAt }
const USER_CACHE_TTL_MS = 30_000; // 30 seconds
const SUBSCRIPTION_GATE_BYPASS_ROUTES = new Set([
  'POST /upgrade',
  'POST /migrate-to-paypal',
  'POST /migrate-to-paymongo',
  'POST /change-plan',
  'POST /change-paymongo-plan',
  'POST /setup-paymongo-recurring',
  'POST /sync',
  'POST /sync-paymongo',
]);

const shouldBypassSubscriptionGate = (req) => {
  const routeKey = `${(req.method || '').toUpperCase()} ${req.path || ''}`;
  return req.baseUrl === '/api/v1/payments' && SUBSCRIPTION_GATE_BYPASS_ROUTES.has(routeKey);
};

export const invalidateUserAuthCache = ({ companyToken, userId } = {}) => {
  // Targeted eviction whenever possible to keep perf benefits of short-lived cache.
  if (userId != null) {
    if (companyToken) {
      _userCache.delete(`${companyToken}:${userId}`);
      return;
    }
    for (const key of _userCache.keys()) {
      if (key.endsWith(`:${userId}`)) {
        _userCache.delete(key);
      }
    }
    return;
  }

  if (companyToken) {
    const prefix = `${companyToken}:`;
    for (const key of _userCache.keys()) {
      if (key.startsWith(prefix)) {
        _userCache.delete(key);
      }
    }
    return;
  }

  _userCache.clear();
};

export const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Authentication required. Please provide a valid token.',
        timestamp: new Date().toISOString()
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check if token is blacklisted (logged out)
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Token has been revoked. Please login again.',
        timestamp: new Date().toISOString()
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          data: null,
          message: 'Invalid token',
          timestamp: new Date().toISOString()
        });
      }
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          data: null,
          message: 'Token expired',
          timestamp: new Date().toISOString()
        });
      }
      throw error;
    }

    // Find user — check cache first to avoid a DB hit on every request.
    // Cache key includes the company token so tenants with the same numeric user_id
    // don't cross-contaminate each other (user_id=1 is very common across tenants).
    const companyToken = req.headers['x-company-token'] || 'default';
    const cacheKey = `${companyToken}:${decoded.user_id}`;
    const cached = _userCache.get(cacheKey);
    let user;
    if (cached && cached.expiresAt > Date.now()) {
      user = cached.user;
    } else {
      const User = dbStore.get('User');
      user = await User.findByPk(decoded.user_id);
      if (user) {
        _userCache.set(cacheKey, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'User not found',
        timestamp: new Date().toISOString()
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'User account is inactive',
        timestamp: new Date().toISOString()
      });
    }

    if (user.deleted_at) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'User account has been removed from this company',
        timestamp: new Date().toISOString()
      });
    }

    // G6: Block access for tenants with expired/inactive subscriptions.
    // req.tenant is set by tenantHandler which runs before authenticate.
    if (req.tenant) {
      const tenantStatus = req.tenant.status;
      const tenantPlan = String(req.tenant.plan || '').toLowerCase();
      const subStatus = req.tenant.subscription_status;
      const bypassSubscriptionGate = shouldBypassSubscriptionGate(req);
      const shouldEnforceSubscriptionGate = paymentsEnabled && tenantPlan === 'premium';
      const now = new Date();
      const periodEnd = req.tenant.current_period_end ? new Date(req.tenant.current_period_end) : null;

      if (tenantStatus === 'inactive') {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'Your company subscription is inactive. Please contact your administrator to reactivate.',
          subscriptionStatus: 'inactive',
          timestamp: new Date().toISOString()
        });
      }

      if (!bypassSubscriptionGate && shouldEnforceSubscriptionGate && tenantStatus === 'active' && subStatus === 'inactive') {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'Your subscription has expired. Please renew to continue.',
          subscriptionStatus: 'inactive',
          timestamp: new Date().toISOString()
        });
      }

      if (!bypassSubscriptionGate && shouldEnforceSubscriptionGate && tenantStatus === 'active' && subStatus === 'cancelled' && periodEnd && periodEnd < now) {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'Your subscription has been cancelled and has expired.',
          subscriptionStatus: 'cancelled',
          timestamp: new Date().toISOString()
        });
      }
    }

    // Attach user to request
    req.user = {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions: user.permissions || [],
      is_master_admin: user.is_master_admin
    };

    next();
  } catch (error) {
    next(error);
  }
};



export const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Master Admin bypass - they can do everything
    if (req.user.is_master_admin) {
      return next();
    }

    // Check if user has the specific permission
    const userPermissions = req.user.permissions || [];
    if (userPermissions.includes(requiredPermission)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied: Insufficient permissions',
      required: requiredPermission
    });
  };
};

/**
 * Admin authentication middleware
 * Verifies admin JWT token without checking database
 */
export const authenticateAdmin = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Admin token has been revoked. Please login again.'
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid admin token'
        });
      }
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Admin session expired'
        });
      }
      throw error;
    }

    // Verify this is an admin token
    if (decoded.type !== 'admin' || decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    // Attach admin info to request
    req.admin = {
      username: decoded.username,
      role: decoded.role
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Require Master Admin access
 * Must be used after authenticate middleware
 */
export const requireMasterAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      data: null,
      message: 'Authentication required',
      timestamp: new Date().toISOString()
    });
  }

  if (!req.user.is_master_admin) {
    return res.status(403).json({
      success: false,
      data: null,
      message: 'Master Admin access required',
      timestamp: new Date().toISOString()
    });
  }

  next();
};

/**
 * Require Premium Plan
 * Must be used after tenantHandler
 */
export const requirePremium = (req, res, next) => {
  // If no tenant context (e.g. during specific admin ops), fail safe
  if (!req.tenant) {
    // If user is Master Admin, maybe allow? 
    // For now, fail safe.
    return res.status(403).json({
      success: false,
      message: 'Premium subscription context missing.'
    });
  }

  if (req.tenant.plan !== 'premium') {
    return res.status(403).json({
      success: false,
      message: 'This feature requires a Premium subscription.',
      requiresUpgrade: true
    });
  }

  // G7: Also verify the premium subscription is still live (active or in grace period).
  const now = new Date();
  const subStatus = req.tenant.subscription_status;
  const gracePeriodEnd = req.tenant.grace_period_end ? new Date(req.tenant.grace_period_end) : null;
  const inGrace = subStatus === 'past_due' && gracePeriodEnd && gracePeriodEnd > now;

  if (subStatus !== 'active' && !inGrace) {
    return res.status(403).json({
      success: false,
      message: 'Your Premium subscription has expired.',
      requiresRenewal: true
    });
  }

  return next();
};

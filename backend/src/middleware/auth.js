import { verifyToken, isTokenBlacklisted } from '../services/authService.js';
import dbStore from '../utils/dbStore.js';
import { paymentsEnabled } from '../config/paymentsFeature.js';
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '../config/permissions.js';
import { isPhoneCompletionEnforcedForTenant } from '../config/phoneCompletionRollout.js';

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
const PHONE_COMPLETION_BYPASS_ROUTES = new Set([
  'GET /api/v1/users/me',
  'PUT /api/v1/users/me',
  'POST /api/v1/auth/logout'
]);

const shouldBypassSubscriptionGate = (req) => {
  const routeKey = `${(req.method || '').toUpperCase()} ${req.path || ''}`;
  return req.baseUrl === '/api/v1/payments' && SUBSCRIPTION_GATE_BYPASS_ROUTES.has(routeKey);
};

const shouldBypassPhoneCompletionGate = (req) => {
  const requestPath = String(req.originalUrl || '').split('?')[0];
  const routeKey = `${(req.method || '').toUpperCase()} ${requestPath}`;
  return PHONE_COMPLETION_BYPASS_ROUTES.has(routeKey);
};

const normalizePermissionArray = (rawPermissions) => {
  let normalized = rawPermissions;

  if (typeof normalized === 'string') {
    try {
      normalized = JSON.parse(normalized);
    } catch {
      normalized = [];
    }
  }

  if (!Array.isArray(normalized)) {
    return [];
  }

  return Array.from(
    new Set(
      normalized
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
    )
  );
};

const resolveEffectivePermissions = (user) => {
  const parsedPermissions = normalizePermissionArray(user?.permissions);
  if (parsedPermissions.length > 0) {
    return parsedPermissions;
  }

  const normalizedRole = String(user?.role || '').trim().toLowerCase();
  const defaults = DEFAULT_ROLE_PERMISSIONS[normalizedRole];
  return Array.isArray(defaults) ? [...defaults] : [];
};

export const invalidateUserAuthCache = ({ companyToken, tenantId, userId } = {}) => {
  const normalizedTenantId = String(tenantId || '').trim();
  const normalizedCompanyToken = String(companyToken || '').trim();

  // Targeted eviction whenever possible to keep perf benefits of short-lived cache.
  if (userId != null) {
    if (normalizedTenantId) {
      _userCache.delete(`${normalizedTenantId}:${userId}`);
    }
    if (normalizedCompanyToken) {
      _userCache.delete(`${normalizedCompanyToken}:${userId}`);
    }

    // Current cache keys are tenantId:userId. When only companyToken is available,
    // fall back to user-id sweep to avoid stale auth state.
    if (!normalizedTenantId) {
      for (const key of _userCache.keys()) {
        if (key.endsWith(`:${userId}`)) {
          _userCache.delete(key);
        }
      }
      return;
    }

    // Keep backward-compatible suffix sweep for mixed key shapes during rollout.
    for (const key of _userCache.keys()) {
      if (key.endsWith(`:${userId}`)) {
        _userCache.delete(key);
      }
    }
    return;
  }

  if (normalizedTenantId || normalizedCompanyToken) {
    const prefixes = [
      normalizedTenantId ? `${normalizedTenantId}:` : null,
      normalizedCompanyToken ? `${normalizedCompanyToken}:` : null
    ].filter(Boolean);

    for (const key of _userCache.keys()) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
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
    const tenantContext = dbStore.getStore();
    if (!tenantContext || tenantContext.tenantId === 'default') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Valid tenant context is required for authenticated requests.',
        error_code: 'TENANT_CONTEXT_REQUIRED',
        timestamp: new Date().toISOString()
      });
    }

    const contextTenantId = String(req?.tenant?.id || tenantContext?.tenantId || '').trim();
    const tokenTenantId = String(decoded?.tenant_id || '').trim();

    if (!tokenTenantId) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Token is missing tenant binding.',
        error_code: 'TENANT_BINDING_REQUIRED',
        timestamp: new Date().toISOString()
      });
    }

    if (!contextTenantId || tokenTenantId !== contextTenantId) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Token tenant binding does not match request tenant context.',
        error_code: 'TENANT_BINDING_MISMATCH',
        timestamp: new Date().toISOString()
      });
    }

    const cacheKey = `${contextTenantId}:${decoded.user_id}`;
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

    if (
      isPhoneCompletionEnforcedForTenant(req.tenant) &&
      !String(user.phone_number || '').trim() &&
      !shouldBypassPhoneCompletionGate(req)
    ) {
      return res.status(428).json({
        success: false,
        data: null,
        message: 'Phone number is required before continuing.',
        error_code: 'PHONE_NUMBER_REQUIRED',
        errors: {
          remediation: 'Update your phone number in Settings > Profile.'
        },
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
      phone_number: user.phone_number || null,
      role: user.role,
      role_preset_key: user.role_preset_key || null,
      permissions: resolveEffectivePermissions(user),
      is_master_admin: user.is_master_admin,
      tenant_id: contextTenantId
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

export const checkAnyPermission = (requiredPermissions) => {
  const permissions = Array.isArray(requiredPermissions)
    ? requiredPermissions.filter(Boolean)
    : [requiredPermissions].filter(Boolean);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (req.user.is_master_admin) {
      return next();
    }

    const userPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    if (permissions.some((permission) => userPermissions.includes(permission))) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied: Insufficient permissions',
      required: permissions
    });
  };
};

/**
 * Storefront branding mutation guard.
 * Allowed when request user is:
 * - master admin, or
 * - admin role, or
 * - explicitly granted the storefront branding micropermission.
 */
export const checkStorefrontBrandingEditPermission = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.is_master_admin) {
    return next();
  }

  const normalizedRole = String(req.user.role || '').trim().toLowerCase();
  if (normalizedRole === 'admin') {
    return next();
  }

  const userPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
  if (userPermissions.includes(PERMISSIONS.SYSTEM.actions.EDIT_STOREFRONT_BRANDING)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied: Storefront branding edit permission required',
    required: PERMISSIONS.SYSTEM.actions.EDIT_STOREFRONT_BRANDING
  });
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

  const tenantPlan = String(req.tenant.plan || '').toLowerCase();
  if (tenantPlan !== 'premium') {
    return res.status(403).json({
      success: false,
      message: 'This feature requires a Premium subscription.',
      requiresUpgrade: true
    });
  }

  // Billing-paused mode allows manual plan metadata overrides to unlock premium-gated features.
  if (!paymentsEnabled) {
    return next();
  }

  // G7: Also verify the premium subscription is still live (active or in grace period).
  const now = new Date();
  const subStatus = String(req.tenant.subscription_status || '').toLowerCase();
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

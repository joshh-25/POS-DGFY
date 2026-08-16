import { verifyToken, isTokenBlacklisted } from '../services/authService.js';
import dbStore from '../utils/dbStore.js';
import { getCookie, SESSION_COOKIE_NAMES } from '../utils/browserSessionCookies.js';
import { isPremiumActiveTenant } from '../utils/tenantPlan.js';
import { paymentsEnabled } from '../config/paymentsFeature.js';
import { PERMISSIONS } from '../config/permissions.js';
import { isPhoneCompletionEnforcedForTenant } from '../config/phoneCompletionRollout.js';
import { resolveEffectivePermissions } from '../utils/userPermissions.js';
import {
  ADMIN_FINANCIAL_ROLES,
  getAdminAccounts
} from '../config/adminAuthConfig.js';
import { isAdminLikeRole } from '../config/userRoles.js';

const resolveAdminFinancialRole = (username, isMaster = false) => {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const configuredAccount = getAdminAccounts().find(
    (account) => String(account.username || '').trim().toLowerCase() === normalizedUsername
  );
  return configuredAccount?.financialRole
    || (isMaster ? ADMIN_FINANCIAL_ROLES.PLATFORM_ADMIN : ADMIN_FINANCIAL_ROLES.FINANCE_VIEWER);
};

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

    const activeBrowserCompanyToken = String(
      getCookie(req, SESSION_COOKIE_NAMES.tenantContext) || ''
    ).trim();
    const requestCompanyToken = String(
      req?.tenant?.company_token || req.headers['x-company-token'] || ''
    ).trim();

    if (
      activeBrowserCompanyToken
      && requestCompanyToken
      && activeBrowserCompanyToken !== requestCompanyToken
    ) {
      return res.status(409).json({
        success: false,
        data: null,
        message: 'The active company changed. Refresh the POS and retry.',
        error_code: 'TENANT_SESSION_CONTEXT_MISMATCH',
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

// Audit history is intentionally narrower than the generic audit:view
// permission: only tenant admins and master admins may inspect the complete
// activity stream because it includes cashier, terminal, and discount data.
export const requireTenantAdminRole = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  if (req.user.is_master_admin || isAdminLikeRole(req.user.role)) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Tenant admin role is required to view audit history.',
    error_code: 'AUDIT_ADMIN_ROLE_REQUIRED'
  });
};

/**
 * Category lifecycle uses a company-local permission so a DGFY identity can
 * manage categories in one company without inheriting that access elsewhere.
 */
export const requireTenantAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const userPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
  if (
    req.user.is_master_admin
    || userPermissions.includes(PERMISSIONS.SYSTEM.actions.MANAGE_CATEGORIES)
  ) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Category management permission is required.',
    required: PERMISSIONS.SYSTEM.actions.MANAGE_CATEGORIES
  });
};

const isPosPermission = (permission) => String(permission || '').startsWith('pos:');

const filterCapabilityDisabledPermissions = async (req, permissions = []) => {
  if (!permissions.some(isPosPermission)) {
    return permissions;
  }

  const store = dbStore.getStore?.() || {};
  const SystemSetting = store.SystemSetting || null;
  if (!SystemSetting || !req.tenant || req.tenant.status !== 'active') {
    return permissions;
  }

  const setting = await SystemSetting.findOne({
    where: { setting_key: 'tenant_pos_enabled' },
    attributes: ['setting_value']
  });
  const posEnabled = parseCapabilityBoolean(setting?.setting_value, true);
  if (posEnabled) {
    return permissions;
  }

  return permissions.filter((permission) => !isPosPermission(permission));
};

export const checkAnyPermission = (requiredPermissions) => {
  const permissions = Array.isArray(requiredPermissions)
    ? requiredPermissions.filter(Boolean)
    : [requiredPermissions].filter(Boolean);

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (req.user.is_master_admin) {
      return next();
    }

    try {
      const userPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
      const effectivePermissions = await filterCapabilityDisabledPermissions(req, permissions);
      if (effectivePermissions.some((permission) => userPermissions.includes(permission))) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: 'Access denied: Insufficient permissions',
        required: effectivePermissions
      });
    } catch (error) {
      return next(error);
    }
  };
};

/**
 * Storefront branding mutation guard.
 * Allowed when request user is:
 * - master admin, or
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
 * Verifies the JWT and resolves live, revocable Platform Admin session authority.
 */
export const authenticateAdmin = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : getCookie(req, SESSION_COOKIE_NAMES.admin);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

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

    if (decoded.type === 'platform_admin') {
      const { createPlatformAdminRepository } = await import('../modules/platformAdmin/repositories/platformAdminRepository.js');
      const authority = await createPlatformAdminRepository().resolveSessionAuthority({
        adminId: decoded.admin_id,
        sessionId: decoded.session_id,
        authVersion: decoded.auth_version
      });
      if (!authority) {
        return res.status(401).json({ success: false, message: 'Admin session is expired or revoked' });
      }
      req.admin = {
        id: authority.user.id,
        username: authority.user.username,
        is_master: Boolean(authority.user.is_master),
        permissions: authority.permissions,
        financial_role: resolveAdminFinancialRole(
          authority.user.username,
          Boolean(authority.user.is_master)
        ),
        temporary_password_active: Boolean(authority.user.temporary_password_active),
        session_id: authority.session.id
      };
      return enforcePlatformAdminRouteAuthority(req, res, next);
    }

    // Legacy tokens are intentionally no longer accepted once DB-backed platform
    // admin sessions are enabled. They have no revocable session or live authority.
    if (decoded.type !== 'admin' || decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    return res.status(401).json({ success: false, message: 'Please sign in again to establish a secure admin session' });
  } catch (error) {
    next(error);
  }
};

export const resolvePlatformAdminRoutePolicy = (req) => {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (/^\/api\/v1\/admin\/(me|logout|change-password)$/.test(path)) return { permissions: [] };
  if (/^\/api\/v1\/admin\/platform-admins(?:\/|$)/.test(path)) return { masterOnly: true };
  if (/^\/api\/v1\/admin\/invoices(?:\/|$)/.test(path)) return { permissions: ['admin.invoices'] };
  if (/^\/api\/v1\/admin\/feedback(?:\/|$)/.test(path)) return { permissions: ['admin.feedback'] };
  if (/^\/api\/v1\/admin\/tenants\/pricing(?:\/|$)/.test(path)) return { permissions: ['admin.pricing'] };
  if (/^\/api\/v1\/admin\/tenants\/(admin-provision-with-account|[^/]+\/owner)(?:\/|$)/.test(path)) return { permissions: ['admin.tenants', 'admin.dgfy_accounts'] };
  if (/^\/api\/v1\/admin\/tenants(?:\/|$)/.test(path)) return { permissions: ['admin.tenants'] };
  if (/^\/api\/v1\/dgfy\/admin\/accounts(?:\/|$)/.test(path)) return { permissions: ['admin.dgfy_accounts'] };
  if (/^\/api\/v1\/commerce-payments\/admin(?:\/|$)/.test(path)) return { permissions: ['admin.payments'] };
  // Store Template curation (issue #178 Phase 14, ADR 0056) is deliberately
  // master-only, not a delegable permission: a published template shapes
  // what every future tenant provisions with, platform-wide.
  if (/^\/api\/v1\/admin\/templates(?:\/|$)/.test(path)) return { masterOnly: true };
  // Protected legacy admin endpoints without a visible page are deliberately
  // master-only until they are added to the checked-in permission matrix.
  return { masterOnly: true };
};

const enforcePlatformAdminRouteAuthority = (req, res, next) => {
  const policy = resolvePlatformAdminRoutePolicy(req);
  if (policy.masterOnly) {
    if (req.admin.is_master) return next();
    return res.status(403).json({ success: false, message: 'Platform Master Admin access required' });
  }
  const missing = (policy.permissions || []).filter((permission) => !req.admin.is_master && !req.admin.permissions.includes(permission));
  if (!missing.length) return next();
  return res.status(403).json({ success: false, message: 'Access denied for this Platform Admin page', required_permissions: policy.permissions });
};

export const requireAdminPermission = (permissionKey) => (req, res, next) => {
  if (!req.admin) return res.status(401).json({ success: false, message: 'Admin authentication required' });
  if (req.admin.is_master || req.admin.permissions?.includes(permissionKey)) return next();
  return res.status(403).json({ success: false, message: 'Access denied for this Platform Admin page', required_permission: permissionKey });
};

export const requirePlatformMaster = (req, res, next) => {
  if (!req.admin) return res.status(401).json({ success: false, message: 'Admin authentication required' });
  if (req.admin.is_master) return next();
  return res.status(403).json({ success: false, message: 'Platform Master Admin access required' });
};

export const authorizeAdminFinancialRoles = (...allowedRoles) => {
  const allowed = new Set(allowedRoles.flat().filter(Boolean));
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    const financialRole = String(
      req.admin.financial_role
      || resolveAdminFinancialRole(req.admin.username, req.admin.is_master)
    ).trim().toLowerCase();
    if (
      financialRole === ADMIN_FINANCIAL_ROLES.PLATFORM_ADMIN
      || allowed.has(financialRole)
    ) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'This financial action requires an authorized finance role.',
      required_financial_roles: [...allowed]
    });
  };
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
// isPremiumActiveTenant now lives in utils/tenantPlan.js (dependency-light,
// so middleware/rateLimiter.js can use it without pulling in
// services/authService.js) and is re-exported here for existing importers.
export { isPremiumActiveTenant };

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

  if (isPremiumActiveTenant(req)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Your Premium subscription has expired.',
    requiresRenewal: true
  });
};

const parseCapabilityBoolean = (value, fallback = true) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

export const requireTenantCapability = (settingKey, capabilityLabel = 'This feature') => {
  const normalizedSettingKey = String(settingKey || '').trim();
  return async (req, res, next) => {
    try {
      if (!normalizedSettingKey || !req.tenant || req.tenant.status !== 'active') {
        return next();
      }

      const store = dbStore.getStore?.() || {};
      const SystemSetting = store.SystemSetting || null;
      if (!SystemSetting) {
        return next();
      }

      const setting = await SystemSetting.findOne({
        where: { setting_key: normalizedSettingKey },
        attributes: ['setting_value']
      });
      const enabled = parseCapabilityBoolean(setting?.setting_value, true);
      if (enabled) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: `${capabilityLabel} is disabled for this tenant by platform admin.`,
        code: 'TENANT_CAPABILITY_DISABLED',
        capability: normalizedSettingKey
      });
    } catch (error) {
      return next(error);
    }
  };
};

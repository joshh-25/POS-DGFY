
import tenantConnector from '../utils/TenantConnector.js';
import dbStore from '../utils/dbStore.js';
import jwt from 'jsonwebtoken';
import { findTenantById, findTenantByToken, resolveInvitationTenantTokenByToken } from '../services/landlordService.js';
import logger from '../config/logger.js';
import { getTenantModels } from '../utils/tenantModelFactory.js';
import { resolveTenantByStoreSlug } from '../services/storefrontTenantResolver.js';
import { getTenantContextToken, getTenantRefreshToken } from '../utils/browserSessionCookies.js';

// Short-lived in-memory cache for tenant lookups.
// Avoids a DB round-trip to the landlord database on every single API request.
// TTL of 60 seconds: tenant tokens rarely change, and 1-minute stale is acceptable.
const tenantCache = new Map(); // token -> { tenant, expiresAt }
const TENANT_CACHE_TTL_MS = 60_000; // 60 seconds
const PLAN_SENSITIVE_ROUTE_PATTERN = /^\/api\/v1\/(pos|ai|forecast|payments|compliance|settings)\b/i;
const STOREFRONT_ROUTE_PATTERN = /^\/api\/v1\/store(?:\/|$)/i;
const STRICT_AUTH_ROUTE_PATTERN = /^\/api\/v1\/auth\/(register|email-otp\/request|login|refresh-token|logout|validate-invite|accept-invite)\b/i;
const REFRESH_TOKEN_ROUTE_PATTERN = /^\/api\/v1\/auth\/refresh-token\b/i;
const AUTH_EMAIL_OTP_REQUEST_ROUTE_PATTERN = /^\/api\/v1\/auth\/email-otp\/request\b/i;

const DEFAULT_TENANT_CONTEXT = Object.freeze({
    tenantId: 'default',
    tenantName: 'SKU-Inventory-Manager (Default)'
});

const runDefaultTenantContext = (next, context = {}) => dbStore.run({
    ...DEFAULT_TENANT_CONTEXT,
    ...context
}, next);

const sendTenantContextError = (res, statusCode, message, errorCode) => (
    res.status(statusCode).json({
        success: false,
        data: null,
        message,
        error_code: errorCode,
        timestamp: new Date().toISOString()
    })
);

const resolveTenantTokenFromRefreshCookie = async (req) => {
    const refreshToken = getTenantRefreshToken(req);
    if (!refreshToken) return '';

    const refreshSecret = process.env.REFRESH_TOKEN_SECRET;
    if (!refreshSecret) return '';

    try {
        const decoded = jwt.verify(refreshToken, refreshSecret);
        const tenantId = String(decoded?.tenant_id || '').trim();
        if (!tenantId) return '';

        const tenant = await findTenantById(tenantId);
        return String(tenant?.company_token || '').trim();
    } catch (error) {
        logger.warn(`[TenantHandler] Refresh-token tenant context recovery failed: ${error.message}`);
        return '';
    }
};

const resolveTenantTokenFromBearerToken = async (req) => {
    const authHeader = String(req.headers?.authorization || '').trim();
    if (!authHeader.startsWith('Bearer ')) return '';

    const accessSecret = process.env.JWT_SECRET;
    if (!accessSecret) return '';

    try {
        const token = authHeader.substring('Bearer '.length);
        const decoded = jwt.verify(token, accessSecret);
        const tenantId = String(decoded?.tenant_id || '').trim();
        if (!tenantId) return '';

        const tenant = await findTenantById(tenantId);
        return String(tenant?.company_token || '').trim();
    } catch (error) {
        logger.warn(`[TenantHandler] Bearer-token tenant context recovery failed: ${error.message}`);
        return '';
    }
};

const resolveStrictAuthDbFailure = (tenantStatus) => {
    const normalizedStatus = String(tenantStatus || '').trim().toLowerCase();

    if (normalizedStatus === 'pending') {
        return {
            statusCode: 403,
            message: 'Tenant is pending approval and is not yet provisioned for login/registration.',
            errorCode: 'TENANT_PENDING_APPROVAL'
        };
    }

    if (normalizedStatus === 'rejected') {
        return {
            statusCode: 403,
            message: 'Tenant registration has been rejected. Please re-submit registration for review.',
            errorCode: 'TENANT_REJECTED'
        };
    }

    if (normalizedStatus === 'inactive') {
        return {
            statusCode: 403,
            message: 'Tenant account is inactive. Contact support or request reactivation.',
            errorCode: 'TENANT_INACTIVE'
        };
    }

    return {
        statusCode: 503,
        message: 'Tenant database is unavailable. Please try again later.',
        errorCode: 'TENANT_DB_UNAVAILABLE'
    };
};

const isGlobalDgfyAccountOtpRequest = (req, path) => (
    AUTH_EMAIL_OTP_REQUEST_ROUTE_PATTERN.test(path)
    && String(req.body?.purpose || '').trim() === 'dgfy_account_verification'
);

const isDgfyTenantMembershipBridgeRequest = (req, path) => (
    /^\/api\/v1\/dgfy\/account\b/i.test(path)
    && String(req.headers?.['x-dgfy-auth-mode'] || '').trim().toLowerCase() === 'tenant_membership'
);

const isDgfyTenantAuthenticatedBusinessRequest = (path) => (
    /^\/api\/v1\/dgfy\/account\b/i.test(path)
    || /^\/api\/v1\/dgfy\/accounts\/search\b/i.test(path)
    || /^\/api\/v1\/dgfy\/invitations(?:\/|$)/i.test(path)
);

export const invalidateTenantLookupCache = ({ companyToken = null, tenantId = null } = {}) => {
    if (companyToken) {
        tenantCache.delete(String(companyToken));
    }

    if (tenantId) {
        for (const [key, entry] of tenantCache.entries()) {
            if (entry?.tenant?.id === tenantId) {
                tenantCache.delete(key);
            }
        }
    }
};

/**
 * Middleware to resolve tenant and bind models to the request context
 */
export const tenantHandler = async (req, res, next) => {
    try {
        const path = String(req.originalUrl || req.path || '').split('?')[0];
        const isPublicWebhookRoute = path === '/api/v1/payments/webhook'
            || path === '/api/v1/commerce-payments/paymongo/webhook';
        const isStrictAuthRoute = STRICT_AUTH_ROUTE_PATTERN.test(path);
        const isGlobalDgfyOtpRequest = isGlobalDgfyAccountOtpRequest(req, path);

        if (isGlobalDgfyOtpRequest) {
            delete req.headers['x-company-token'];
            return runDefaultTenantContext(next, {
                tenantContextFailure: 'dgfy_global_otp'
            });
        }

        // 1. Identification Strategy:
        // Header (x-company-token) -> Store slug (x-store-slug for public store routes) -> Subdomain (Future) -> Auth User (Future)
        let companyToken = req.headers['x-company-token'];
        if (!companyToken && isStrictAuthRoute) {
            companyToken = getTenantContextToken(req);
            if (companyToken) {
                req.headers['x-company-token'] = companyToken;
            }
        }
        if (!companyToken && (isDgfyTenantMembershipBridgeRequest(req, path) || isDgfyTenantAuthenticatedBusinessRequest(path))) {
            companyToken = getTenantContextToken(req);
            if (!companyToken) {
                companyToken = await resolveTenantTokenFromBearerToken(req);
            }
            if (companyToken) {
                req.headers['x-company-token'] = companyToken;
            }
        }
        if (!companyToken && REFRESH_TOKEN_ROUTE_PATTERN.test(path)) {
            companyToken = await resolveTenantTokenFromRefreshCookie(req);
            if (companyToken) {
                req.headers['x-company-token'] = companyToken;
            }
        }
        const storeSlug = String(req.headers['x-store-slug'] || '').trim().toLowerCase();
        const allowStoreSlugResolution = STOREFRONT_ROUTE_PATTERN.test(path);
        if (!companyToken && isStrictAuthRoute && /\/(validate-invite|accept-invite|email-otp\/request)\b/i.test(path)) {
            const pathInviteMatch = path.match(/\/auth\/validate-invite\/([^/?#]+)/i);
            const inviteToken = String(req.params?.token || req.body?.token || req.body?.invitation_token || pathInviteMatch?.[1] || '').trim();
            if (inviteToken) {
                try {
                    const resolvedToken = await resolveInvitationTenantTokenByToken(inviteToken);
                    if (resolvedToken) {
                        companyToken = resolvedToken;
                        req.headers['x-company-token'] = resolvedToken;
                    } else if (!req.headers['x-company-token']) {
                        return sendTenantContextError(
                            res,
                            400,
                            'Invalid or expired invitation token.',
                            'INVITATION_TOKEN_INVALID'
                        );
                    }
                } catch (inviteResolveError) {
                    logger.warn(`[TenantHandler] Invitation tenant resolution failed: ${inviteResolveError.message}`);
                    return sendTenantContextError(
                        res,
                        400,
                        'Invalid or expired invitation token.',
                        'INVITATION_TOKEN_INVALID'
                    );
                }
            }
        }

        // 1.1 No Tenant Token?
        if (!companyToken && allowStoreSlugResolution && storeSlug) {
            try {
                const tenantBySlug = await resolveTenantByStoreSlug(storeSlug);
                if (tenantBySlug?.company_token) {
                    companyToken = tenantBySlug.company_token;
                    req.headers['x-company-token'] = companyToken;
                }
            } catch (slugResolveError) {
                logger.warn(`[TenantHandler] Store slug resolution failed for "${storeSlug}": ${slugResolveError.message}`);
            }
        }

        if (!companyToken) {
            // For now, if no token, we default to the "Main" DB (Single User/Legacy Mode)
            // In the future, this might redirect to a "Select Company" page for unauthenticated users
            // Or rely on the user's login session to identify the tenant.

            // Allow proceed with DEFAULT context (no isolation yet)
            // This is crucial for Phase 2 compatibility.
            // Wrap in dbStore.run with EMPTY context so dbStore.get() falls back to global models.
            if (!isPublicWebhookRoute) {
                logger.warn('[TenantHandler] No company token provided in request headers');
            } else {
                logger.debug('[TenantHandler] No company token for webhook route (expected).');
            }
            if (isStrictAuthRoute) {
                return sendTenantContextError(
                    res,
                    400,
                    'Company token is required for authentication.',
                    'TENANT_TOKEN_REQUIRED'
                );
            }

            return runDefaultTenantContext(next, {
                tenantContextFailure: 'missing_token'
            });
        }

        // 2. Resolve Tenant (with in-memory cache to avoid a DB hit on every request)
        let tenant;
        const cached = tenantCache.get(companyToken);
        const requiresFreshPlanRead = PLAN_SENSITIVE_ROUTE_PATTERN.test(path);
        try {
            if (cached && cached.expiresAt > Date.now() && !requiresFreshPlanRead) {
                tenant = cached.tenant;
            } else {
                logger.info(`[TenantHandler] Resolving tenant for token: ${companyToken}`);
                tenant = await findTenantByToken(companyToken);
                if (tenant) {
                    tenantCache.set(companyToken, { tenant, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });
                }
            }
        } catch (lookupError) {
            logger.error(`[TenantHandler] Tenant lookup failed for token ${companyToken}: ${lookupError.message}`);
            if (isStrictAuthRoute) {
                return sendTenantContextError(
                    res,
                    503,
                    'Tenant lookup is currently unavailable. Please try again.',
                    'TENANT_LOOKUP_UNAVAILABLE'
                );
            }

            return runDefaultTenantContext(next, {
                tenantContextFailure: 'lookup_error',
                tenantTokenAttempted: companyToken
            });
        }

        if (!tenant) {
            logger.warn(`Invalid Company Token provided: ${companyToken}. Falling back to default context.`);
            // Instead of blocking with 404, we fall back to default context.
            // This allows endpoints like /logout or /health to still work even with a stale token.
            if (isStrictAuthRoute) {
                return sendTenantContextError(
                    res,
                    404,
                    'Invalid company token.',
                    'TENANT_TOKEN_INVALID'
                );
            }

            return runDefaultTenantContext(next, {
                tenantContextFailure: 'invalid_token',
                tenantTokenAttempted: companyToken
            });
        }

        logger.debug(`[TenantHandler] Found tenant: ${tenant.name} (${tenant.id})`);

        // Attach tenant to request immediately so public endpoints (reactivation, resubmit)
        // can access req.tenant.id even if the tenant DB is not yet provisioned.
        req.tenant = tenant;

        // 3. Get Connection — may fail for tenants whose DB has not been provisioned yet
        // (e.g. rejected registrations). Fall back to default context while keeping req.tenant.
        let sequelizeInstance;
        try {
            sequelizeInstance = await tenantConnector.getConnection(tenant);
        } catch {
            logger.warn(`[TenantHandler] Could not connect to tenant DB for ${tenant.name} (${tenant.status}). Falling back to default context.`);
            if (isStrictAuthRoute) {
                const failure = resolveStrictAuthDbFailure(tenant.status);
                return sendTenantContextError(
                    res,
                    failure.statusCode,
                    failure.message,
                    failure.errorCode
                );
            }

            return runDefaultTenantContext(next, {
                tenantContextFailure: 'db_unavailable',
                tenantTokenAttempted: companyToken,
                resolvedTenantId: tenant.id || null,
                resolvedTenantStatus: tenant.status || null
            });
        }

        // 4. Bind Models (Factory Logic)
        // Since we are not rewriting all models to factories YET, we need a hybrid approach.
        // Option A: Real Models (Future) -> const User = UserModel(sequelizeInstance)
        // Option B: Clone/Polyfill (Phase 2 Hack)

        // FOR NOW: We just pass the sequelize instance in the store.
        // The models are still static in Phase 2 Pilot.
        // But for AuthPilot, we will need at least User model to optionally be bound.

        // Important: In Phase 3, we will load models dynamically.
        // For now, we put the 'sequelize' instance in the store so services can use it.
        // 53. const context = {
        //     sequelize: sequelizeInstance,
        //     tenantId: tenant.id,
        //     tenantName: tenant.name,
        //     // Add other models here as we convert them to factories
        // };

        // Bind models to this connection
        const tenantModels = getTenantModels(sequelizeInstance);

        const context = {
            sequelize: sequelizeInstance,
            tenantId: tenant.id,
            tenantToken: companyToken,
            tenantName: tenant.name,
            tenantDbName: tenant.db_name || null,
            tenantPlan: tenant.plan,
            tenantSubscriptionStatus: tenant.subscription_status,
            tenantGracePeriodEnd: tenant.grace_period_end,
            tenantPaymentMethod: tenant.payment_method,
            tenantComplianceModeState: tenant.compliance_mode_state || null,
            tenantComplianceModeChoiceRequired: tenant.compliance_mode_choice_required === true,
            tenantComplianceModeSelectedAt: tenant.compliance_mode_selected_at || null,
            tenantComplianceModeSelectedBy: tenant.compliance_mode_selected_by || null,
            tenantComplianceActivatedAt: tenant.compliance_activated_at || null,
            tenantCompliancePolicyVersion: tenant.compliance_policy_version || null,
            tenantComplianceProfile: tenant.compliance_profile || null,
            ...tenantModels
        };

        // 5. Run Request in Context
        dbStore.run(context, next);

    } catch (error) {
        logger.error('Tenant Handler Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error during Tenant Resolution'
        });
    }
};

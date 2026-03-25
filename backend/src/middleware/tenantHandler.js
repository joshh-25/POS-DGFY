
import tenantConnector from '../utils/TenantConnector.js';
import dbStore from '../utils/dbStore.js';
import { findTenantByToken } from '../services/landlordService.js';
import logger from '../config/logger.js';
import { getTenantModels } from '../utils/tenantModelFactory.js';

// Short-lived in-memory cache for tenant lookups.
// Avoids a DB round-trip to the landlord database on every single API request.
// TTL of 60 seconds: tenant tokens rarely change, and 1-minute stale is acceptable.
const tenantCache = new Map(); // token -> { tenant, expiresAt }
const TENANT_CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Middleware to resolve tenant and bind models to the request context
 */
export const tenantHandler = async (req, res, next) => {
    try {
        const path = req.path || '';
        const isPublicWebhookRoute = path === '/api/v1/payments/webhook';

        // 1. Identification Strategy: Header (x-company-token) -> Subdomain (Future) -> Auth User (Future)
        const companyToken = req.headers['x-company-token'];

        // 1.1 No Tenant Token?
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
            return dbStore.run({
                tenantId: 'default',
                tenantName: 'SKU-Inventory-Manager (Default)'
            }, next);
        }

        // 2. Resolve Tenant (with in-memory cache to avoid a DB hit on every request)
        let tenant;
        const cached = tenantCache.get(companyToken);
        if (cached && cached.expiresAt > Date.now()) {
            tenant = cached.tenant;
        } else {
            logger.info(`[TenantHandler] Resolving tenant for token: ${companyToken}`);
            tenant = await findTenantByToken(companyToken);
            if (tenant) {
                tenantCache.set(companyToken, { tenant, expiresAt: Date.now() + TENANT_CACHE_TTL_MS });
            }
        }

        if (!tenant) {
            logger.warn(`Invalid Company Token provided: ${companyToken}. Falling back to default context.`);
            // Instead of blocking with 404, we fall back to default context.
            // This allows endpoints like /logout or /health to still work even with a stale token.
            return dbStore.run({
                tenantId: 'default',
                tenantName: 'SKU-Inventory-Manager (Default)'
            }, next);
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
            return dbStore.run({
                tenantId: 'default',
                tenantName: 'SKU-Inventory-Manager (Default)'
            }, next);
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
            tenantPlan: tenant.plan,
            tenantSubscriptionStatus: tenant.subscription_status,
            tenantGracePeriodEnd: tenant.grace_period_end,
            tenantPaymentMethod: tenant.payment_method,
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

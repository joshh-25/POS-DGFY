
import tenantConnector from '../utils/TenantConnector.js';
import dbStore from '../utils/dbStore.js';
import { findTenantByToken } from '../services/landlordService.js';
import logger from '../config/logger.js';
import defaultModels from '../models/index.js'; // Fallback models
import { getTenantModels } from '../utils/tenantModelFactory.js';

/**
 * Middleware to resolve tenant and bind models to the request context
 */
export const tenantHandler = async (req, res, next) => {
    try {
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
            logger.warn('[TenantHandler] ⚠️ No company token provided in request headers');
            return dbStore.run({
                tenantId: 'default',
                tenantName: 'SKU-Inventory-Manager (Default)'
            }, next);
        }

        logger.info(`[TenantHandler] Resolving tenant for token: ${companyToken}`);

        // 2. Resolve Tenant
        const tenant = await findTenantByToken(companyToken);

        if (!tenant) {
            logger.warn(`Invalid Company Token provided: ${companyToken}`);
            return res.status(404).json({
                success: false,
                message: 'Invalid Company Token. Tenant not found.'
            });
        }

        logger.info(`[TenantHandler] Found tenant: ${tenant.name} (${tenant.id})`);

        // 3. Get Connection
        const sequelizeInstance = await tenantConnector.getConnection(tenant);

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
            tenantName: tenant.name,
            tenantPlan: tenant.plan,
            ...tenantModels
        };

        // Attach tenant to request for downstream middleware/controllers
        req.tenant = tenant;

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

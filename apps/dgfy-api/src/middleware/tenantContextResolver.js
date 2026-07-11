// tenantContextResolver.js — enhances tenant context resolution for
// apps/dgfy-api (D-06/D-14, API-03/API-04), enhancing/extending the legacy
// tenantHandler pattern (backend/src/middleware/tenantHandler.js) referenced
// by 04-PLAN.md's "Pattern Reuse & Adaptation" section, adapted to Phase 4's
// Clean Architecture and DGFY account/business identity model.
//
// Dependency-injected factory (Dependency Inversion) — receives repository
// abstractions and a TenantConnector rather than importing models directly,
// mirroring ../modules/accounts/middleware/accountAuthMiddleware.js's
// factory pattern. MUST run after an authenticateAccount-style middleware
// that sets req.account (the membership check below requires it).
//
// KNOWN LIMITATION (Wave 4): this middleware is built and ready, but is NOT
// yet mounted on any route — no tenant-scoped business endpoint exists in
// this phase that needs req.tenantContext/req.tenantModels (Location,
// Business staff, and branch endpoints from Waves 3/3.5 are membership-
// scoped only, not tenant-connection-scoped). This mirrors
// ../models/Tenant/Location.js's Wave 3.5 precedent of shipping
// ready-but-unwired infrastructure ahead of its first live caller. A future
// phase that adds genuinely tenant-database-scoped endpoints (e.g. reading
// live StaffAccount/TerminalIdentity rows) is expected to call
// buildTenantContextResolver(...)(...) as route middleware.

import { DomainErrorCode } from '../shared/contracts/domainErrors.js';

const TENANT_HEADER_NAMES = ['x-business-id', 'x-tenant-id', 'x-company-token'];

const extractBusinessIdFromHeaders = (req) => {
    for (const headerName of TENANT_HEADER_NAMES) {
        const value = req.headers?.[headerName];
        if (value) return String(value).trim();
    }
    return null;
};

const sendContextError = (res, statusCode, code, message) => res.status(statusCode).json({
    success: false,
    data: null,
    error: { code, message },
    message
});

/**
 * Builds the tenantContextResolver middleware factory.
 * @param {{businessRepository, businessDatabaseRegistry, tenantConnector, tenantModelFactories?: Object}} deps
 *   `tenantModelFactories` is a `{ [modelName]: (sequelize) => Model }` map
 *   (e.g. `{ Location: defineLocationModel, StaffAccount: defineStaffAccountModel,
 *   TerminalIdentity: defineTerminalIdentityModel }`), mirroring each
 *   Tenant/*.js file's default export shape — supplied by the caller so this
 *   middleware never imports models directly.
 * @returns {(options?: {required?: boolean}) => import('express').RequestHandler}
 */
export function buildTenantContextResolver({
    businessRepository,
    businessDatabaseRegistry,
    tenantConnector,
    tenantModelFactories = {}
} = {}) {
    if (!businessRepository) {
        throw new Error('buildTenantContextResolver requires a businessRepository.');
    }
    if (!businessDatabaseRegistry) {
        throw new Error('buildTenantContextResolver requires a businessDatabaseRegistry repository.');
    }
    if (!tenantConnector) {
        throw new Error('buildTenantContextResolver requires a tenantConnector.');
    }

    const tenantModelsByDatabase = new Map();

    const resolveTenantModels = (databaseName) => {
        if (tenantModelsByDatabase.has(databaseName)) {
            return tenantModelsByDatabase.get(databaseName);
        }
        const connection = tenantConnector.getConnection(databaseName);
        const models = {};
        for (const [name, factory] of Object.entries(tenantModelFactories)) {
            models[name] = factory(connection);
        }
        tenantModelsByDatabase.set(databaseName, models);
        return models;
    };

    /**
     * @param {{required?: boolean}} [options] - when `required: true`, a
     *   missing/unresolvable tenant context short-circuits with HTTP 400.
     *   Landlord-only endpoints (e.g. GET /businesses) use the default
     *   (`required: false`) so a missing header passes through unbound,
     *   per the plan's "Handle missing context gracefully" requirement.
     */
    return function tenantContextResolver({ required = false } = {}) {
        return async function resolve(req, res, next) {
            try {
                const businessId = extractBusinessIdFromHeaders(req);

                if (!businessId) {
                    if (required) {
                        return sendContextError(
                            res,
                            400,
                            'TENANT_CONTEXT_REQUIRED',
                            'A business/tenant context header (x-business-id) is required for this endpoint.'
                        );
                    }
                    return next();
                }

                if (!req.account?.id) {
                    return sendContextError(
                        res,
                        401,
                        DomainErrorCode.AUTHENTICATION_FAILED,
                        'Account authentication is required to resolve tenant context.'
                    );
                }

                const membership = await businessRepository.getMembership(req.account.id, businessId);
                if (!membership || membership.status !== 'active') {
                    return sendContextError(res, 403, 'NO_MEMBERSHIP', 'You are not a member of this business.');
                }

                const registryEntry = await businessDatabaseRegistry.findByBusinessId(businessId);
                if (!registryEntry || !registryEntry.database_name) {
                    return sendContextError(
                        res,
                        404,
                        'NO_TENANT_DATABASE',
                        'No tenant database is registered for this business.'
                    );
                }

                req.tenantContext = {
                    businessId,
                    databaseName: registryEntry.database_name,
                    membership
                };
                req.tenantModels = resolveTenantModels(registryEntry.database_name);

                return next();
            } catch (error) {
                return sendContextError(
                    res,
                    500,
                    DomainErrorCode.INTERNAL_ERROR,
                    'Failed to resolve tenant context.'
                );
            }
        };
    };
}

export default buildTenantContextResolver;

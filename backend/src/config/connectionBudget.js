/**
 * Central MySQL connection budget.
 *
 * Every MySQL connection this process can hold comes from one of two places:
 *
 *   landlord pool          -> src/config/database.js        (LANDLORD_DB_POOL_MAX)
 *   cached tenant pools    -> src/utils/TenantConnector.js  (TENANT_MAX_CACHED_CONNECTIONS
 *                                                            x TENANT_DB_POOL_MAX)
 *
 * Worst case is therefore:
 *
 *   TENANT_MAX_CACHED_CONNECTIONS x TENANT_DB_POOL_MAX + LANDLORD_DB_POOL_MAX
 *
 * That total MUST stay at or below the server's `max_connections`. When it
 * doesn't, the failure is neither obvious nor local: tenant DB connects start
 * throwing `Too many connections`, tenantHandler quietly degrades to the
 * default tenant context, and unrelated storefront requests surface as 400
 * TENANT_CONTEXT_MISSING or 500 INTERNAL_ERROR. That is exactly what happened
 * on stage.dgfy.ph on 2026-07-27 -- see
 * docs/ops/STAGE_CONNECTION_EXHAUSTION_AND_CSP_INCIDENT_2026-07-27.md.
 *
 * The defaults below are the historical values, kept so behaviour is unchanged
 * for anyone who sets nothing. `assertConnectionBudget()` is what's new: it
 * turns a silent, minutes-long outage into a loud line in the boot log.
 */

const readPositiveInt = (rawValue, fallback) => {
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/** Max simultaneous connections in the landlord (shared/public DB) pool. */
export const getLandlordPoolMax = () => readPositiveInt(process.env.LANDLORD_DB_POOL_MAX, 30);

/** Max tenant Sequelize instances TenantConnector keeps alive at once. */
export const getTenantMaxCachedConnections = () => readPositiveInt(process.env.TENANT_MAX_CACHED_CONNECTIONS, 20);

/** Max simultaneous connections inside a single tenant's pool. */
export const getTenantPoolMax = () => readPositiveInt(process.env.TENANT_DB_POOL_MAX, 7);

/**
 * The server's `max_connections`. Declared here rather than probed so the check
 * still works before the first connection is made, and so a deploy that lowers
 * the server limit without telling the app is itself a visible mismatch.
 * 151 is MySQL's own default.
 */
export const getServerMaxConnections = () => readPositiveInt(process.env.DB_MAX_CONNECTIONS, 151);

export const computeConnectionBudget = () => {
    const landlordPoolMax = getLandlordPoolMax();
    const tenantMaxCached = getTenantMaxCachedConnections();
    const tenantPoolMax = getTenantPoolMax();
    const serverMaxConnections = getServerMaxConnections();

    const tenantWorstCase = tenantMaxCached * tenantPoolMax;
    const worstCase = tenantWorstCase + landlordPoolMax;

    return {
        landlordPoolMax,
        tenantMaxCached,
        tenantPoolMax,
        tenantWorstCase,
        worstCase,
        serverMaxConnections,
        withinBudget: worstCase <= serverMaxConnections
    };
};

/**
 * Log the connection budget at startup, loudly if it doesn't fit.
 *
 * Deliberately a warning and not a throw: an over-budget process still serves
 * traffic fine until it actually saturates, and refusing to boot would turn a
 * capacity-planning problem into an outage. The point is that the mismatch is
 * never again something you have to reconstruct from logs after the fact.
 *
 * @param {{ warn: Function, info: Function }} logger
 */
export const assertConnectionBudget = (logger) => {
    const budget = computeConnectionBudget();
    const arithmetic = `${budget.tenantMaxCached} tenants x ${budget.tenantPoolMax} + ${budget.landlordPoolMax} landlord = ${budget.worstCase}`;

    if (!budget.withinBudget) {
        logger.warn(
            `[ConnectionBudget] OVER BUDGET: ${arithmetic}, but max_connections is ${budget.serverMaxConnections}. `
            + 'Under load this surfaces as "Too many connections" and storefront requests failing with '
            + 'TENANT_CONTEXT_MISSING / INTERNAL_ERROR. Raise the server\'s max_connections, or lower '
            + 'TENANT_MAX_CACHED_CONNECTIONS / TENANT_DB_POOL_MAX / LANDLORD_DB_POOL_MAX.'
        );
    } else {
        logger.info(`[ConnectionBudget] ${arithmetic}, within max_connections ${budget.serverMaxConnections}.`);
    }

    return budget;
};

export default {
    getLandlordPoolMax,
    getTenantMaxCachedConnections,
    getTenantPoolMax,
    getServerMaxConnections,
    computeConnectionBudget,
    assertConnectionBudget
};

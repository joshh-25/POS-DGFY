import * as Sentry from '@sentry/node';
import { isSentryInitialized } from '../config/sentry.js';
import logger from '../config/logger.js';
import tenantConnector from './TenantConnector.js';
import dbStore from './dbStore.js';

const ACQUIRE_TIMEOUT_ERROR_NAME = 'SequelizeConnectionAcquireTimeoutError';
const recordedTimeoutErrors = new WeakSet();

const isObjectLike = (value) => (
    (typeof value === 'object' && value !== null)
    || typeof value === 'function'
);

const findConnectionAcquireTimeout = (error) => {
    const pending = [error];
    const visited = new Set();

    while (pending.length > 0) {
        const current = pending.shift();
        if (!isObjectLike(current) || visited.has(current)) continue;
        visited.add(current);

        try {
            if (current.name === ACQUIRE_TIMEOUT_ERROR_NAME) return current;
        } catch {
            // Keep inspecting the remaining error chain if a custom getter fails.
        }

        for (const property of ['cause', 'original', 'parent']) {
            try {
                pending.push(current[property]);
            } catch {
                // Error wrappers occasionally expose custom getters; diagnostics are best-effort.
            }
        }
    }

    return null;
};
export const isConnectionAcquireTimeout = (error) => Boolean(findConnectionAcquireTimeout(error));

const resolveTenantId = (req) => {
    const tenantId = req?.tenant?.id ?? dbStore.getStore()?.tenantId;
    if (tenantId == null) return null;
    const normalized = String(tenantId).trim();
    return !normalized || normalized === 'default' ? null : normalized;
};

const resolveRoute = (req) => {
    if (req?.route?.path != null) {
        const base = String(req.baseUrl || '').replace(/\/$/, '');
        const path = Array.isArray(req.route.path)
            ? req.route.path.map(String).join('|')
            : String(req.route.path);
        return `${base}${path.startsWith('/') ? path : `/${path}`}` || null;
    }
    const originalUrl = String(req?.originalUrl || req?.url || '').split('?')[0];
    return originalUrl || null;
};

const safelyRead = (read, fallback = null) => {
    try {
        return read() ?? fallback;
    } catch {
        return fallback;
    }
};

/** Record tenant and global pool state for a Sequelize acquire timeout. Never throws. */
export const recordConnectionAcquireTimeout = (error, { req } = {}) => {
    try {
        const acquireTimeout = findConnectionAcquireTimeout(error);
        if (!acquireTimeout || recordedTimeoutErrors.has(acquireTimeout)) return;
        recordedTimeoutErrors.add(acquireTimeout);

        const tenantId = safelyRead(() => resolveTenantId(req));
        const route = safelyRead(() => resolveRoute(req));
        const method = safelyRead(() => req?.method || null);
        const requestId = safelyRead(() => req?.requestId || req?.headers?.['x-request-id'] || null);
        const pool = tenantId
            ? safelyRead(() => tenantConnector.getTenantPoolSnapshot(tenantId))
            : null;
        const globalPool = safelyRead(() => tenantConnector.getPoolStats());
        const context = {
            tenant_id: tenantId,
            route,
            method,
            request_id: requestId,
            pool,
            global_pool: globalPool
        };

        logger.error('[DbPool] Tenant connection acquire timeout', context);

        if (isSentryInitialized()) {
            Sentry.setTag('db_pool_acquire_timeout', 'true');
            Sentry.setContext('db_pool', context);
        }
    } catch {
        // Telemetry must never change the response or error propagation path.
    }
};

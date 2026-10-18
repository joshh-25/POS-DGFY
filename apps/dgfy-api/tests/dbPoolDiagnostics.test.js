import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const setTag = jest.fn();
const setContext = jest.fn();
jest.unstable_mockModule('@sentry/node', () => ({ setTag, setContext }));

const isSentryInitialized = jest.fn();
jest.unstable_mockModule('../src/config/sentry.js', () => ({ isSentryInitialized }));

const getTenantPoolSnapshot = jest.fn();
const getPoolStats = jest.fn();
jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
    default: { getTenantPoolSnapshot, getPoolStats }
}));

const getStore = jest.fn();
jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: { getStore }
}));

const loggerError = jest.fn();
jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: { error: loggerError }
}));

const { isConnectionAcquireTimeout, recordConnectionAcquireTimeout } = await import(
    '../src/utils/dbPoolDiagnostics.js'
);
const { dbPoolTimeoutDiagnostics } = await import('../src/middleware/dbPoolTimeoutDiagnostics.js');

const makeAcquireTimeout = () => Object.assign(
    new Error('Operation timeout'),
    { name: 'SequelizeConnectionAcquireTimeoutError' }
);

describe('tenant DB pool timeout diagnostics', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isSentryInitialized.mockReturnValue(false);
        getTenantPoolSnapshot.mockReturnValue({
            using: 7,
            waiting: 3,
            size: 7,
            available: 0,
            max: 7
        });
        getPoolStats.mockReturnValue({ total: 20, pending: 0, capacity: 20, utilizationPercent: 100 });
        getStore.mockReturnValue({ tenantId: 'tenant-from-store' });
    });

    it('recognizes the acquire-timeout error name through cause, original, and parent wrappers', () => {
        const timeout = makeAcquireTimeout();
        expect(isConnectionAcquireTimeout(timeout)).toBe(true);
        expect(isConnectionAcquireTimeout({ cause: { original: timeout } })).toBe(true);
        expect(isConnectionAcquireTimeout({ parent: timeout })).toBe(true);
        expect(isConnectionAcquireTimeout(new Error('different database error'))).toBe(false);
    });

    it('logs tenant, route, request and both pool snapshots', () => {
        const error = makeAcquireTimeout();
        const req = {
            tenant: { id: 'tenant-42' },
            baseUrl: '/api/v1/pos',
            route: { path: '/incoming-orders' },
            originalUrl: '/api/v1/pos/incoming-orders?since=1',
            method: 'GET',
            requestId: 'req-42'
        };

        recordConnectionAcquireTimeout(error, { req });

        expect(getTenantPoolSnapshot).toHaveBeenCalledWith('tenant-42');
        expect(loggerError).toHaveBeenCalledWith('[DbPool] Tenant connection acquire timeout', {
            tenant_id: 'tenant-42',
            route: '/api/v1/pos/incoming-orders',
            method: 'GET',
            request_id: 'req-42',
            pool: { using: 7, waiting: 3, size: 7, available: 0, max: 7 },
            global_pool: { total: 20, pending: 0, capacity: 20, utilizationPercent: 100 }
        });
    });

    it('uses originalUrl without its query and records a null tenant-pool snapshot when no tenant pool is known', () => {
        getStore.mockReturnValue({ tenantId: 'default' });
        const error = makeAcquireTimeout();

        recordConnectionAcquireTimeout(error, {
            req: {
                originalUrl: '/health?probe=1',
                method: 'GET',
                requestId: 'req-landlord'
            }
        });

        expect(getTenantPoolSnapshot).not.toHaveBeenCalled();
        expect(loggerError).toHaveBeenCalledWith('[DbPool] Tenant connection acquire timeout', expect.objectContaining({
            tenant_id: null,
            route: '/health',
            pool: null
        }));
    });

    it('deduplicates the same underlying acquire-timeout error object', () => {
        const timeout = makeAcquireTimeout();
        const wrapper = { cause: timeout };
        const req = { tenant: { id: 'tenant-42' }, originalUrl: '/api/v1/pos/incoming-orders' };

        recordConnectionAcquireTimeout(timeout, { req });
        recordConnectionAcquireTimeout(wrapper, { req });

        expect(loggerError).toHaveBeenCalledTimes(1);
        expect(getTenantPoolSnapshot).toHaveBeenCalledTimes(1);
    });

    it('sets Sentry acquire-timeout tag and context when initialized', () => {
        isSentryInitialized.mockReturnValue(true);
        const req = { tenant: { id: 'tenant-42' }, method: 'GET', originalUrl: '/api/v1/pos/incoming-orders' };

        recordConnectionAcquireTimeout(makeAcquireTimeout(), { req });

        expect(setTag).toHaveBeenCalledWith('db_pool_acquire_timeout', 'true');
        expect(setContext).toHaveBeenCalledWith('db_pool', expect.objectContaining({
            tenant_id: 'tenant-42',
            pool: expect.objectContaining({ using: 7, waiting: 3, size: 7, max: 7 })
        }));
    });

    it('does not throw when pool introspection fails', () => {
        getTenantPoolSnapshot.mockImplementation(() => {
            throw new Error('pool getter failed');
        });
        getPoolStats.mockImplementation(() => {
            throw new Error('global stats failed');
        });

        expect(() => recordConnectionAcquireTimeout(makeAcquireTimeout(), {
            req: { tenant: { id: 'tenant-42' }, method: 'GET', originalUrl: '/api/v1/pos/incoming-orders' }
        })).not.toThrow();
        expect(loggerError).toHaveBeenCalledWith('[DbPool] Tenant connection acquire timeout', expect.objectContaining({
            pool: null,
            global_pool: null
        }));
    });

    it('passes the same error to next without writing to the response', () => {
        const error = makeAcquireTimeout();
        const req = { tenant: { id: 'tenant-42' }, method: 'GET', originalUrl: '/api/v1/pos/incoming-orders' };
        const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
        const next = jest.fn();

        dbPoolTimeoutDiagnostics(error, req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(error);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
        expect(res.setHeader).not.toHaveBeenCalled();
        expect(loggerError).toHaveBeenCalledTimes(1);
    });
});

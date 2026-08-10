import { jest } from '@jest/globals';
import { buildRequestOutcome, createRequestOutcomeLogger } from '../src/middleware/requestOutcomeLogger.js';

describe('requestOutcomeLogger middleware', () => {
    it('builds sanitized request outcome metadata', () => {
        const req = {
            requestId: 'req-outcome-123',
            traceId: 'trace-outcome-123',
            method: 'GET',
            baseUrl: '/api/v1/store',
            path: '/catalog',
            route: { path: '/catalog' },
            ip: '192.0.2.55',
            get: () => 'Mozilla/5.0 Chrome/120.0',
            tenant: { id: 'tenant-1' },
            user: { user_id: 42 },
            headers: {
                authorization: 'Bearer secret-token-that-must-not-appear'
            },
            body: {
                password: 'secret'
            }
        };
        const res = {
            statusCode: 500,
            locals: {
                errorCode: 'STORE_CATALOG_RUNTIME_ERROR'
            }
        };

        const outcome = buildRequestOutcome(req, res, Date.now() - 12);

        expect(outcome).toEqual(expect.objectContaining({
            event: 'request_outcome',
            request_id: 'req-outcome-123',
            trace_id: 'trace-outcome-123',
            method: 'GET',
            route: '/api/v1/store/catalog',
            status: 500,
            status_class: '5xx',
            surface: 'storefront',
            tenant_id: 'tenant-1',
            user_id: 42,
            error_code: 'STORE_CATALOG_RUNTIME_ERROR',
            user_agent_family: 'chrome'
        }));
        expect(outcome.ip_hash).toHaveLength(24);
        expect(JSON.stringify(outcome)).not.toContain('secret-token-that-must-not-appear');
        expect(JSON.stringify(outcome)).not.toContain('password');
    });

    it('writes one outcome on finish when enabled', () => {
        const info = jest.fn();
        const middleware = createRequestOutcomeLogger({
            logger: { info },
            enabled: () => true
        });
        const finishHandlers = [];
        const req = {
            requestId: 'req-finish-1',
            traceId: 'trace-finish-1',
            method: 'POST',
            path: '/api/v1/pos/checkout',
            get: () => 'curl/8.0',
            connection: { remoteAddress: '127.0.0.1' }
        };
        const res = {
            statusCode: 422,
            locals: { errorCode: 'VALIDATION_FAILED' },
            on: (event, handler) => {
                if (event === 'finish') finishHandlers.push(handler);
            }
        };
        const next = jest.fn();

        middleware(req, res, next);
        finishHandlers.forEach((handler) => handler());

        expect(next).toHaveBeenCalledTimes(1);
        expect(info).toHaveBeenCalledTimes(1);
        expect(info.mock.calls[0][0]).toBe('request_outcome');
        expect(info.mock.calls[0][1]).toEqual(expect.objectContaining({
            request_id: 'req-finish-1',
            trace_id: 'trace-finish-1',
            status_class: '4xx',
            surface: 'pos',
            error_code: 'VALIDATION_FAILED'
        }));
    });
});

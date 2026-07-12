import request from 'supertest';
import app from '../../../src/app.js';

/**
 * Transport-level mount proof for 08-08-PLAN.md (Wave 5): asserts every
 * commerce module built across waves 3-4 (products, inventory, compliance,
 * shifts, booking) is actually reachable through the real composition root
 * (routes/index.js -> app.js), behind the shared authenticateAccount
 * middleware.
 *
 * Mirrors health.transport.test.js's convention exactly: imports the real
 * `app` (no hand-rolled Express instance, no mocked router) and issues
 * unauthenticated requests. A protected commerce endpoint that is correctly
 * mounted returns 401 (auth required) — authenticateAccount rejects a
 * missing bearer token before any DB/tenant-connector code runs (see
 * accountAuthMiddleware.js: no token -> immediate 401, no getAccount call).
 * A route that is NOT mounted (typo'd path, missing router.use(), etc.)
 * would instead fall through to the app's notFoundHandler and return 404.
 * This test proves 401-not-404 for one representative endpoint per module,
 * so it never requires a live MySQL/tenant database to run.
 */
describe('Commerce modules mount (Phase 8 composition root, 08-08)', () => {
    const commerceEndpoints = [
        { module: 'products', method: 'get', path: '/v1/products' },
        { module: 'inventory', method: 'get', path: '/v1/inventory/movements' },
        { module: 'compliance', method: 'get', path: '/v1/compliance/state' },
        { module: 'shifts', method: 'get', path: '/v1/shifts' },
        { module: 'bookings', method: 'get', path: '/v1/bookings' }
    ];

    it.each(commerceEndpoints)(
        'GET $path ($module) returns 401 (auth required), not 404 (route missing), when unauthenticated',
        async ({ method, path }) => {
            const response = await request(app)[method](path);
            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        }
    );

    it('still returns a 404 with the standard error envelope for a genuinely unmounted path', async () => {
        const response = await request(app).get('/v1/this-commerce-path-does-not-exist');
        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
    });
});

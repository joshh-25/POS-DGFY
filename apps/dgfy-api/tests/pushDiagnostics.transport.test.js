import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DomainError, DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const callOrder = [];
const useCases = {
    getOverview: jest.fn(),
    listRegistrations: jest.fn(),
    listAttempts: jest.fn(),
    createEnrollmentCode: jest.fn(),
    listDiagnosticDevices: jest.fn(),
    revokeDiagnosticDevice: jest.fn(),
    sendTestNotification: jest.fn(),
    enrollDevice: jest.fn()
};

jest.unstable_mockModule('../src/modules/pushDiagnostics/index.js', () => ({ pushDiagnosticsUseCases: useCases }));
jest.unstable_mockModule('../src/middleware/auth.js', () => ({
    // x-test-admin: "none" -> unauthenticated, "granted" -> holds the page grant, otherwise a delegated admin without it.
    authenticateAdmin: (req, res, next) => {
        callOrder.push('authenticate');
        const mode = req.headers['x-test-admin'];
        if (mode === 'none') return res.status(401).json({ success: false, message: 'Admin authentication required' });
        req.admin = { id: 'admin-1', username: 'ops', is_master: false, permissions: mode === 'granted' ? ['admin.push_diagnostics'] : ['admin.feedback'] };
        return next();
    },
    requireAdminPermission: (key) => (req, res, next) => {
        callOrder.push('permission');
        return req.admin.permissions.includes(key)
            ? next()
            : res.status(403).json({ success: false, message: 'Access denied for this Platform Admin page', required_permission: key });
    }
}));
jest.unstable_mockModule('../src/middleware/rateLimiter.js', () => ({
    adminPushTestSendLimiter: (_req, _res, next) => { callOrder.push('test-send-limiter'); next(); },
    pushDiagnosticEnrollLimiter: (_req, _res, next) => { callOrder.push('enroll-limiter'); next(); }
}));

let app;
beforeAll(async () => {
    const adminRouter = (await import('../src/routes/adminPushDiagnostics.js')).default;
    const enrollRouter = (await import('../src/routes/pushDiagnosticsEnrollment.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/v1/admin/push-diagnostics', adminRouter);
    app.use('/api/v1/push-diagnostics', enrollRouter);
    app.use((error, _req, res, _next) => res.status(500).json({ success: false, message: 'internal' }));
});

const granted = { 'x-test-admin': 'granted' };

beforeEach(() => {
    jest.clearAllMocks();
    callOrder.length = 0;
    useCases.getOverview.mockResolvedValue({ environment: { label: 'staging', source: 'DEPLOY_ENV_LABEL' } });
    useCases.sendTestNotification.mockResolvedValue({ provider_mode: 'expo', status: 'accepted', state: 'accepted_receipt_pending' });
});

describe('Platform Admin push diagnostics transport', () => {
    it.each([
        ['get', '/api/v1/admin/push-diagnostics/overview'],
        ['get', '/api/v1/admin/push-diagnostics/registrations'],
        ['get', '/api/v1/admin/push-diagnostics/attempts'],
        ['get', '/api/v1/admin/push-diagnostics/diagnostic-devices'],
        ['post', '/api/v1/admin/push-diagnostics/enrollment-codes'],
        ['delete', '/api/v1/admin/push-diagnostics/diagnostic-devices/dev-1'],
        ['post', '/api/v1/admin/push-diagnostics/diagnostic-devices/dev-1/test-send']
    ])('rejects %s %s without a session and without the page grant', async (method, path) => {
        const anonymous = await request(app)[method](path).set('x-test-admin', 'none');
        expect(anonymous.status).toBe(401);
        const withoutGrant = await request(app)[method](path).set('x-test-admin', 'delegated');
        expect(withoutGrant.status).toBe(403);
        expect(withoutGrant.body.required_permission).toBe('admin.push_diagnostics');
        for (const useCase of Object.values(useCases)) expect(useCase).not.toHaveBeenCalled();
    });

    it('returns the overview with no-store caching and passes the admin and request context for auditing', async () => {
        const response = await request(app).get('/api/v1/admin/push-diagnostics/overview').set(granted);
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body).toEqual({ success: true, data: { environment: { label: 'staging', source: 'DEPLOY_ENV_LABEL' } } });
        expect(useCases.getOverview).toHaveBeenCalledWith({
            admin: expect.objectContaining({ id: 'admin-1' }),
            request: expect.objectContaining({ method: 'GET', path: '/api/v1/admin/push-diagnostics/overview' })
        });
    });

    it('maps domain errors to their status and code without leaking internals', async () => {
        useCases.listRegistrations.mockRejectedValue(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Invalid platform filter.'));
        const bad = await request(app).get('/api/v1/admin/push-diagnostics/registrations?platform=windows').set(granted);
        expect(bad.status).toBe(400);
        expect(bad.body).toEqual({ success: false, error_code: 'VALIDATION_FAILED', message: 'Invalid platform filter.' });

        useCases.getOverview.mockRejectedValue(new Error('SequelizeConnectionError: password=hunter2'));
        const failed = await request(app).get('/api/v1/admin/push-diagnostics/overview').set(granted);
        expect(failed.status).toBe(500);
        expect(JSON.stringify(failed.body)).not.toContain('hunter2');
    });

    it('authenticates, checks the grant, then rate limits a test send before reaching the use case', async () => {
        const response = await request(app).post('/api/v1/admin/push-diagnostics/diagnostic-devices/dev-1/test-send').set(granted).send({});
        expect(response.status).toBe(200);
        expect(callOrder).toEqual(['authenticate', 'permission', 'test-send-limiter']);
        expect(useCases.sendTestNotification).toHaveBeenCalledWith(expect.objectContaining({ id: 'dev-1', body: {} }));
    });

    it('hands any request body to the use case so a token or other target is rejected there', async () => {
        useCases.sendTestNotification.mockRejectedValue(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Test sends accept no request body; the target is the enrolled device only.'));
        const response = await request(app)
            .post('/api/v1/admin/push-diagnostics/diagnostic-devices/dev-1/test-send')
            .set(granted)
            .send({ token: 'ExponentPushToken[arbitrary-customer-token]' });
        expect(response.status).toBe(400);
        expect(useCases.sendTestNotification).toHaveBeenCalledWith(expect.objectContaining({ body: { token: 'ExponentPushToken[arbitrary-customer-token]' } }));
        expect(JSON.stringify(response.body)).not.toContain('arbitrary-customer-token');
    });

    it('has no route that sends to a token or without a device id', async () => {
        for (const path of ['/test-send', '/send', '/diagnostic-devices/test-send']) {
            const response = await request(app).post(`/api/v1/admin/push-diagnostics${path}`).set(granted).send({ token: 'x' });
            expect(response.status).toBe(404);
        }
        expect(useCases.sendTestNotification).not.toHaveBeenCalled();
    });

    it('surfaces the per-device limit as a 429', async () => {
        useCases.sendTestNotification.mockRejectedValue(new DomainError('PUSH_TEST_SEND_LIMIT', 'This device reached its hourly test-send limit.', { statusCode: 429 }));
        const response = await request(app).post('/api/v1/admin/push-diagnostics/diagnostic-devices/dev-1/test-send').set(granted).send({});
        expect(response.status).toBe(429);
        expect(response.body.error_code).toBe('PUSH_TEST_SEND_LIMIT');
    });

    it('creates an enrollment code with 201 and no-store so the plaintext is never cached', async () => {
        useCases.createEnrollmentCode.mockResolvedValue({ code: 'plaintext-once', expires_at: '2026-10-19T00:10:00.000Z' });
        const response = await request(app).post('/api/v1/admin/push-diagnostics/enrollment-codes').set(granted).send({});
        expect(response.status).toBe(201);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body.data.code).toBe('plaintext-once');
    });
});

describe('device-side enrollment transport', () => {
    it('is session-less: it never runs admin authentication, only the per-IP limiter', async () => {
        useCases.enrollDevice.mockResolvedValue({ enrolled: true, ref: 'abcdef012345' });
        const body = { code: 'c', token: 'ExponentPushToken[abcdefghijk]', platform: 'ios', app: 'storefront', brand: 'dgfy' };
        const response = await request(app).post('/api/v1/push-diagnostics/enroll').send(body);
        expect(response.status).toBe(201);
        expect(response.body).toEqual({ success: true, data: { enrolled: true, ref: 'abcdef012345' } });
        expect(callOrder).toEqual(['enroll-limiter']);
        expect(useCases.enrollDevice).toHaveBeenCalledWith(body);
    });

    it('answers an invalid, expired or replayed code with a bare 404 and no enrolled-device detail', async () => {
        useCases.enrollDevice.mockRejectedValue(new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Enrollment code is invalid or expired.'));
        const response = await request(app).post('/api/v1/push-diagnostics/enroll').send({ code: 'bad' });
        expect(response.status).toBe(404);
        expect(response.body).toEqual({ success: false, error_code: 'RESOURCE_NOT_FOUND', message: 'Enrollment code is invalid or expired.' });
    });

    it('exposes no other session-less diagnostics route', async () => {
        for (const [method, path] of [['get', '/overview'], ['get', '/attempts'], ['post', '/test-send'], ['get', '/enroll']]) {
            const response = await request(app)[method](`/api/v1/push-diagnostics${path}`);
            expect(response.status).toBe(404);
        }
    });
});

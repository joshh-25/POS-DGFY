import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const originalEnv = { ...process.env };

const loadAppWithEnv = async (overrides = {}) => {
    process.env = {
        ...originalEnv,
        NODE_ENV: 'test',
        SKIP_SERVER_START: 'true',
        ...overrides
    };
    jest.resetModules();
    const module = await import('../src/server.js');
    return module.default;
};

describe('ENC-01 HTTPS transport enforcement middleware', () => {
    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('returns 426 HTTPS_REQUIRED for insecure non-health API routes when enforcement is enabled', async () => {
        const app = await loadAppWithEnv({ ENFORCE_HTTPS: 'true' });
        const response = await request(app).get('/api/v1/pos/catalog');

        expect(response.status).toBe(426);
        expect(response.body).toEqual(expect.objectContaining({
            success: false,
            error_code: 'HTTPS_REQUIRED'
        }));
    });

    it('allows proxy-terminated HTTPS requests via x-forwarded-proto header', async () => {
        const app = await loadAppWithEnv({ ENFORCE_HTTPS: 'true' });
        const response = await request(app)
            .get('/api/v1/pos/catalog')
            .set('x-forwarded-proto', 'https');

        expect(response.status).not.toBe(426);
    });

    it('does not block /health with HTTPS enforcement enabled', async () => {
        const app = await loadAppWithEnv({ ENFORCE_HTTPS: 'true' });
        const response = await request(app).get('/health');

        expect(response.status).not.toBe(426);
    });

    it('does not block /api/v1/health with HTTPS enforcement enabled', async () => {
        const app = await loadAppWithEnv({ ENFORCE_HTTPS: 'true' });
        const response = await request(app).get('/api/v1/health');

        expect(response.status).not.toBe(426);
    });

    it('exposes request and trace headers for browser-readable diagnostics', async () => {
        const app = await loadAppWithEnv();
        const response = await request(app)
            .get('/health')
            .set('Origin', 'http://localhost:5173')
            .set('x-request-id', 'req-health-123');

        expect(response.status).toBe(200);
        expect(response.headers['x-request-id']).toBe('req-health-123');
        expect(response.headers['x-trace-id']).toBe('req-health-123');
        expect(response.headers['access-control-expose-headers']).toContain('x-request-id');
        expect(response.headers['access-control-expose-headers']).toContain('x-trace-id');
    });
});

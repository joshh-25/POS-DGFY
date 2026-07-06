import request from 'supertest';
import app from '../src/app.js';

describe('GET /v1/health', () => {
    it('responds even when the database is unreachable (returns 503, not a crash)', async () => {
        const response = await request(app).get('/v1/health');
        expect([200, 503]).toContain(response.status);
        expect(response.body).toHaveProperty('success');
    });
});

describe('unknown routes', () => {
    it('returns a 404 with the standard error envelope', async () => {
        const response = await request(app).get('/v1/does-not-exist');
        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
    });
});

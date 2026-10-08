import express from 'express';
import request from 'supertest';

const originalEnv = { ...process.env };
process.env.OIDC_RATE_LIMIT_WINDOW_MS = '60000';
process.env.OIDC_RATE_LIMIT_MAX_REQUESTS = '2';
const { oidcLimiter } = await import('../src/middleware/rateLimiter.js');

afterAll(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

describe('OIDC rate limiter', () => {
  test('limits a client and route with the standard 429 response', async () => {
    process.env.NODE_ENV = 'production';
    const app = express();
    app.use(express.json());
    app.post('/token', oidcLimiter, (_req, res) => res.json({ ok: true }));

    const call = () => request(app).post('/token').send({ client_id: 'dglaundry-web' });
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const limited = await call();
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.body).toMatchObject({ success: false, message: 'Too many OIDC requests, please try again later.' });
  });
});

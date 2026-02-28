import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const originalEnv = { ...process.env };

let generalLimiter;
let authLimiter;
let logger;

beforeAll(async () => {
  process.env.NODE_ENV = 'development';
  process.env.RATE_LIMIT_WINDOW_MS = '60000';
  process.env.RATE_LIMIT_MAX_REQUESTS = '1';
  process.env.RATE_LIMIT_AUTH_WINDOW_MS = '60000';
  process.env.RATE_LIMIT_AUTH_MAX_REQUESTS = '1';
  process.env.RATE_LIMIT_ALERT_THRESHOLD = '999999';

  const loggerModule = await import('../src/config/logger.js');
  logger = loggerModule.default;

  const limiterModule = await import('../src/middleware/rateLimiter.js');
  generalLimiter = limiterModule.generalLimiter;
  authLimiter = limiterModule.authLimiter;
});

afterAll(() => {
  process.env = originalEnv;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Rate limiter behavior', () => {
  it('returns standardized 429 payload + Retry-After for general limiter', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    const app = express();
    app.use(express.json());
    app.use('/api', generalLimiter);
    app.get('/api/ping', (req, res) => res.status(200).json({ ok: true }));

    await request(app).get('/api/ping').set('x-company-token', 'tenant-token-1').expect(200);

    const second = await request(app).get('/api/ping').set('x-company-token', 'tenant-token-1').expect(429);
    expect(second.body).toEqual(expect.objectContaining({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      retryAfterSeconds: expect.any(Number),
      limitScope: 'other',
      limitKeyType: 'ip',
      timestamp: expect.any(String),
    }));
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0);

    expect(warnSpy).toHaveBeenCalledWith(
      'Rate limit exceeded',
      expect.objectContaining({
        scope: 'other',
        keyType: 'ip',
        companyTokenPresent: true,
        rateLimitState: expect.objectContaining({
          limit: expect.any(Number),
          current: expect.any(Number),
          remaining: expect.any(Number),
        }),
      })
    );
  });

  it('keys auth limiter by ip+email so different emails do not share the same bucket', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/v1/auth/login', authLimiter, (_req, res) => res.status(200).json({ ok: true }));

    // First attempt for email A consumes that key's single slot.
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alpha@example.com', password: 'x' })
      .expect(200);

    // Second attempt for email A is rate-limited.
    const sameEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alpha@example.com', password: 'x' })
      .expect(429);

    expect(sameEmail.body).toEqual(expect.objectContaining({
      success: false,
      message: 'Too many authentication attempts, please try again later.',
      limitScope: 'auth_login',
      limitKeyType: 'ip_email',
      retryAfterSeconds: expect.any(Number),
    }));

    // First attempt for email B should still pass (separate limiter key).
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'beta@example.com', password: 'x' })
      .expect(200);
  });
});

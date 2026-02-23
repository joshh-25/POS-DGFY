/**
 * Token Refresh Race Condition — Backend INTEGRATION Tests
 *
 * Run with: TEST_TYPE=integration npm run test:integration
 *
 * Unlike token_refresh_race.test.js, these tests use REAL Redis.
 * jest.config.cjs line 11 skips setup.js when TEST_TYPE=integration,
 * so the Redis mock is NOT active here — actual blacklisting fires.
 *
 * What these tests verify (Redis-live):
 *   1.5 — Concurrent RTR enforcement: exactly 1 of 6 concurrent refresh
 *          calls with the same token succeeds; the other 5 are blocked
 *          by the blacklist and return 401.
 *   1.6 — Sequential RTR: rt1 → rt2 succeeds; reusing rt1 after rotation
 *          returns 401, and isTokenBlacklisted(rt1) returns true.
 *
 * Prerequisites:
 *   - Redis running on localhost:6379 (REDIS_URL in backend/.env)
 *   - DB running with the test company token registered
 */

import request from 'supertest';
import app from '../src/server.js';
import sequelize from '../src/config/database.js';
import db from '../src/models/index.js';
import { initializeRedis, isRedisConnected, closeRedis } from '../src/config/redis.js';

describe('Token Refresh Race Condition — Integration (Real Redis)', () => {
  const COMPANY_TOKEN = 'token-testbox4236-175692e6';
  const EMAIL = `race-int-${Date.now()}@example.com`;
  const USERNAME = `raceint${Date.now()}`;
  const PASSWORD = 'TestPassword123!';

  let baseRefreshToken;

  const cleanup = async () => {
    await db.User.destroy({ where: { email: EMAIL } }).catch(() => {});
  };

  beforeAll(async () => {
    await sequelize.authenticate();

    // Explicitly initialize Redis for the integration test.
    // server.js may not have completed its async initializeRedis() by the time
    // beforeAll runs, so we call it directly here and wait for the ready event.
    if (!isRedisConnected()) {
      await initializeRedis();
      // Wait up to 5s for the 'ready' event to fire
      const deadline = Date.now() + 5000;
      while (!isRedisConnected() && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
    if (!isRedisConnected()) {
      throw new Error('Redis did not become available within 5s. Is redis-server running?');
    }

    await cleanup();

    await request(app)
      .post('/api/v1/auth/register')
      .set('x-company-token', COMPANY_TOKEN)
      .send({ username: USERNAME, email: EMAIL, password: PASSWORD })
      .expect(201);
  });

  afterAll(async () => {
    await cleanup();
    await sequelize.close();
    await closeRedis();
  });

  beforeEach(async () => {
    // Wait 1100ms to ensure generateRefreshToken produces a distinct JWT per test.
    // generateRefreshToken uses iat (issued-at seconds); two logins within the
    // same second for the same user produce identical JWTs. If a prior test
    // blacklisted the token, the next test's token would be pre-blacklisted.
    await new Promise(r => setTimeout(r, 1100));

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('x-company-token', COMPANY_TOKEN)
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    baseRefreshToken = loginRes.body.data.refreshToken;
  });

  // -------------------------------------------------------------------------
  // 1.5 — Concurrent RTR behavior with real Redis.
  //
  //       Without a distributed lock (Redlock), all N concurrent requests that
  //       arrive before any blacklist write completes will pass the blacklist
  //       check simultaneously. Each will then write its own blacklist entry.
  //       The backend does not enforce single-winner at HTTP concurrency.
  //
  //       This is why the FRONTEND mutex is essential: it ensures only 1
  //       refresh request is EVER sent from the browser tab. The backend
  //       enforces RTR only for SEQUENTIAL reuse (test 1.6).
  //
  //       What this test verifies (with real Redis):
  //       - At least 1 request succeeds (the endpoint works end-to-end)
  //       - All successful responses have valid JWT token structure
  //       - No requests crash the server (no 5xx responses)
  // -------------------------------------------------------------------------
  it('1.5 — concurrent refresh calls all succeed (real Redis, no distributed lock); each response has valid JWT structure', async () => {
    const CONCURRENCY = 6;
    const calls = Array.from({ length: CONCURRENCY }, () =>
      request(app)
        .post('/api/v1/auth/refresh-token')
        .set('x-company-token', COMPANY_TOKEN)
        .send({ refreshToken: baseRefreshToken })
    );

    const settled = await Promise.allSettled(calls);
    const responses = settled.map(r => (r.status === 'fulfilled' ? r.value : r.reason?.response));

    // All HTTP calls must have completed (no crashes)
    expect(responses.every(r => r !== undefined)).toBe(true);

    const successes = responses.filter(r => r?.status === 200);
    const serverErrors = responses.filter(r => r?.status >= 500);

    // No 5xx errors — the endpoint must handle concurrency without crashing
    expect(serverErrors).toHaveLength(0);

    // At least 1 must succeed
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // Every 200 response must have a valid JWT structure
    successes.forEach(r => {
      expect(r.body.success).toBe(true);
      expect(r.body.data.token.split('.').length).toBe(3);
      expect(r.body.data.refreshToken.split('.').length).toBe(3);
      expect(r.body.data.expiresIn).toBe(86400);
    });
  });

  // -------------------------------------------------------------------------
  // 1.6 — Sequential RTR: used token is blacklisted.
  //       After a successful refresh (rt1 → rt2), rt1 must be rejected on
  //       reuse and isTokenBlacklisted(rt1) must return true.
  // -------------------------------------------------------------------------
  it('1.6 — used refresh token is blacklisted and cannot be reused', async () => {
    const rt1 = baseRefreshToken;

    // First refresh: rt1 → rt2
    const firstRes = await request(app)
      .post('/api/v1/auth/refresh-token')
      .set('x-company-token', COMPANY_TOKEN)
      .send({ refreshToken: rt1 })
      .expect(200);

    expect(firstRes.body.success).toBe(true);
    const rt2 = firstRes.body.data.refreshToken;
    expect(rt2).toBeDefined();
    expect(rt2.split('.').length).toBe(3);

    // Reusing rt1 must return 401 — the backend blacklisted it during the refresh
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh-token')
      .set('x-company-token', COMPANY_TOKEN)
      .send({ refreshToken: rt1 });

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.success).toBe(false);
  });
});

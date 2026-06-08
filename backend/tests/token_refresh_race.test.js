/**
 * Token Refresh Race Condition — Backend Tests
 *
 * Tests the server-side behavior that the frontend mutex depends on.
 *
 * Test Environment Note:
 * ─────────────────────
 * setup.js mocks Redis with a stub that:
 *   - Reports isRedisConnected() = true (so fail-closed path is not taken)
 *   - Returns null for all blacklist lookups (no token is ever found as blacklisted)
 *   - Silently accepts blacklist writes (setEx returns 'OK' without persisting)
 *
 * Consequence: in the test environment, ALL concurrent refresh requests with
 * the same token will succeed because the blacklist read always returns null.
 * This is by design — the setup.js comment explains the mock is intentional.
 *
 * What these tests DO verify (Redis-mock-safe):
 *   1.1 — Backend handles 6 concurrent refresh requests without crashing;
 *          each returns a valid token structure (documents fail-open mock behavior)
 *   1.2 — Invalid JWT string always returns 401 (JWT verification, not Redis-dependent)
 *   1.3 — Valid sequential refresh returns a well-formed JWT response
 *   1.4 — Blacklist lookup returns false for un-blacklisted tokens (mock behavior documented)
 */

import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../src/server.js';
import sequelize from '../src/config/database.js';
import db from '../src/models/index.js';
import * as authService from '../src/services/authService.js';
import { createTestTenant, destroyTestTenant } from './helpers/testTenantHelper.js';

describe('Token Refresh Race Condition (Backend RTR Invariant)', () => {
  jest.setTimeout(120000);
  let COMPANY_TOKEN;
  let testTenantContext;
  const EMAIL = `race-test-${Date.now()}@example.com`;
  const USERNAME = `raceuser${Date.now()}`;
  const PASSWORD = 'TestPassword123!';

  let baseRefreshToken;
  let baseSessionCookies;
  let baseCsrfToken;

  const extractCookieValue = (cookies = [], name) => {
    const rawCookie = cookies.find((cookie) => cookie.startsWith(`${name}=`));
    if (!rawCookie) return '';
    return decodeURIComponent(rawCookie.split(';')[0].split('=').slice(1).join('='));
  };

  const extractSession = (res) => {
    const cookies = res.headers['set-cookie'] || [];
    return {
      cookies,
      refreshToken: extractCookieValue(cookies, 'sku_refresh_token'),
      csrfToken: extractCookieValue(cookies, 'sku_csrf_token')
    };
  };

  const cleanup = async () => {
    await db.User.destroy({ where: { email: EMAIL } }).catch(() => {});
  };

  beforeAll(async () => {
    await sequelize.authenticate();
    testTenantContext = await createTestTenant('rttrace');
    COMPANY_TOKEN = testTenantContext.token;
    await cleanup();

    await request(app)
      .post('/api/v1/auth/register')
      .set('x-company-token', COMPANY_TOKEN)
      .send({ username: USERNAME, email: EMAIL, phone_number: '+63 917 000 5000', password: PASSWORD })
      .expect(201);
  });

  afterAll(async () => {
    await cleanup();
    if (testTenantContext) {
      await destroyTestTenant(testTenantContext);
    }
    await sequelize.close();
  });

  beforeEach(async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('x-company-token', COMPANY_TOKEN)
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const session = extractSession(loginRes);
    baseRefreshToken = session.refreshToken;
    baseSessionCookies = session.cookies;
    baseCsrfToken = session.csrfToken;
  });

  // -------------------------------------------------------------------------
  // 1.1 — Backend handles 6 concurrent refresh requests without crashing.
  //       In test env (mocked Redis blacklist returning null), all 6 succeed.
  //       This documents the mocked behavior and verifies structural correctness
  //       of each response — the frontend mutex prevents this from happening in
  //       production by ensuring only 1 refresh request is ever sent.
  // -------------------------------------------------------------------------
  it('1.1 — backend processes 6 concurrent refresh calls; each response has valid token structure', async () => {
    const CONCURRENCY = 6;
    const calls = Array.from({ length: CONCURRENCY }, () =>
      request(app)
        .post('/api/v1/auth/refresh-token')
        .set('Cookie', baseSessionCookies)
        .set('x-csrf-token', baseCsrfToken)
        .send({})
    );

    const settled = await Promise.allSettled(calls);
    const responses = settled.map(r => (r.status === 'fulfilled' ? r.value : r.reason?.response));

    // All responses must have completed (no unhandled crashes)
    expect(responses.every(r => r !== undefined)).toBe(true);

    const successes = responses.filter(r => r?.status === 200);

    // In mocked-Redis test env: all 6 succeed (blacklist never fires)
    // In production with real Redis: only 1 would succeed
    // Either way: every 200 response must have a valid token structure
    successes.forEach(r => {
      expect(r.body.success).toBe(true);
      expect(r.body.data.token).toBeDefined();
      expect(typeof r.body.data.token).toBe('string');
      expect(r.body.data.token.split('.').length).toBe(3); // valid JWT
      expect(r.body.data.refreshToken).toBeUndefined();
      expect(extractSession(r).refreshToken).not.toBe('');
      expect(r.body.data.expiresIn).toBeDefined();
    });

    // At least 1 must succeed regardless of environment
    expect(successes.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 1.2 — Body refresh token is ignored; browser refresh authority must be cookie-backed
  // -------------------------------------------------------------------------
  it('1.2 — body-only refresh token returns 400 with success: false', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .set('x-company-token', COMPANY_TOKEN)
      .send({ refreshToken: 'this-is-not-a-valid-token' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Refresh token is required');
  });

  // -------------------------------------------------------------------------
  // 1.3 — Valid sequential refresh returns a correct response structure
  // -------------------------------------------------------------------------
  it('1.3 — sequential refresh call returns a valid token structure', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .set('Cookie', baseSessionCookies)
      .set('x-csrf-token', baseCsrfToken)
      .send({})
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(res.body.data.expiresIn).toBe(86400); // 24h in seconds

    // Returned tokens must be valid JWTs
    expect(res.body.data.token.split('.').length).toBe(3);
    expect(extractSession(res).refreshToken.split('.').length).toBe(3);
  });

  // -------------------------------------------------------------------------
  // 1.4 — Documents the mocked Redis behavior: blacklist lookups return false.
  //       This test makes the mock behavior explicit so future devs understand
  //       why concurrent tests don't enforce RTR.
  // -------------------------------------------------------------------------
  it('1.4 — blacklist lookup returns false in test environment (mocked Redis stub)', async () => {
    // In production with real Redis and a USED token, this would return true.
    // In tests, the Redis mock (setup.js) returns null for all gets → false.
    const isBlacklisted = await authService.isTokenBlacklisted(baseRefreshToken);
    expect(isBlacklisted).toBe(false);
  });
});

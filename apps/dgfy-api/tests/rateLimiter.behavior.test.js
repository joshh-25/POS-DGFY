import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const originalEnv = { ...process.env };

let generalLimiter;
let authLimiter;
let dgfyTenantSessionLimiter;
let lookupLimiter;
let tenantRegistrationLimiter;
let storeTrackingLimiter;
let storeTrackingReadLimiter;
let storeGuestCheckoutOtpRequestLimiter;
let storeGuestCheckoutOtpVerifyLimiter;
let mobilePosFreeSyncLimiter;
let itemOperationsLimiter;
let logger;
let defaultAuthRateLimitWindowMs;

beforeAll(async () => {
  process.env.NODE_ENV = 'development';
  process.env.RATE_LIMIT_WINDOW_MS = '60000';
  process.env.RATE_LIMIT_MAX_REQUESTS = '1';
  process.env.RATE_LIMIT_AUTH_WINDOW_MS = '60000';
  process.env.RATE_LIMIT_AUTH_MAX_REQUESTS = '1';
  process.env.RATE_LIMIT_DGFY_TENANT_SESSION_WINDOW_MS = '60000';
  process.env.RATE_LIMIT_DGFY_TENANT_SESSION_MAX_REQUESTS = '1';
  process.env.RATE_LIMIT_LOOKUP_WINDOW_MS = '60000';
  process.env.RATE_LIMIT_LOOKUP_MAX_REQUESTS = '1';
  process.env.RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS = '60000';
  process.env.RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS = '1';
  process.env.RATE_LIMIT_STORE_TRACKING_MAX_REQUESTS = '1';
  process.env.RATE_LIMIT_STORE_TRACKING_READ_MAX_REQUESTS = '1';
  process.env.RATE_LIMIT_MOBILE_POS_FREE_SYNC_WINDOW_MS = '60000';
  process.env.RATE_LIMIT_MOBILE_POS_FREE_SYNC_MAX_REQUESTS = '2';
  process.env.RATE_LIMIT_ITEM_OPERATIONS_WINDOW_MS = '60000';
  process.env.RATE_LIMIT_ITEM_OPERATIONS_MAX_REQUESTS = '1';
  process.env.RATE_LIMIT_ALERT_THRESHOLD = '999999';

  const loggerModule = await import('../src/config/logger.js');
  logger = loggerModule.default;

  const limiterModule = await import('../src/middleware/rateLimiter.js');
  generalLimiter = limiterModule.generalLimiter;
  authLimiter = limiterModule.authLimiter;
  defaultAuthRateLimitWindowMs = limiterModule.DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS;
  dgfyTenantSessionLimiter = limiterModule.dgfyTenantSessionLimiter;
  lookupLimiter = limiterModule.lookupLimiter;
  tenantRegistrationLimiter = limiterModule.tenantRegistrationLimiter;
  storeTrackingLimiter = limiterModule.storeTrackingLimiter;
  storeTrackingReadLimiter = limiterModule.storeTrackingReadLimiter;
  storeGuestCheckoutOtpRequestLimiter = limiterModule.storeGuestCheckoutOtpRequestLimiter;
  storeGuestCheckoutOtpVerifyLimiter = limiterModule.storeGuestCheckoutOtpVerifyLimiter;
  mobilePosFreeSyncLimiter = limiterModule.mobilePosFreeSyncLimiter;
  itemOperationsLimiter = limiterModule.itemOperationsLimiter;
});

afterAll(() => {
  process.env = originalEnv;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Rate limiter behavior', () => {
  it('defaults authentication lockout to five minutes', () => {
    expect(defaultAuthRateLimitWindowMs).toBe(5 * 60 * 1000);
  });

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

  it('does not apply the public IP bucket to authenticated item operations', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', generalLimiter);
    app.post('/api/v1/items', (_req, res) => res.status(200).json({ ok: true }));

    const headers = {
      authorization: 'Bearer authenticated-item-operation',
      'x-company-token': 'tenant-token-1'
    };

    await request(app).post('/api/v1/items').set(headers).send({ name: 'First item' }).expect(200);
    await request(app).post('/api/v1/items').set(headers).send({ name: 'Second item' }).expect(200);
  });

  it('rate-limits authenticated item operations once the general IP bucket has been skipped', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', (req, _res, next) => {
      req.user = { user_id: req.headers['x-test-user-id'] || 'user-a' };
      next();
    }, itemOperationsLimiter);
    app.get('/api/v1/items/barcodes/resolve', (_req, res) => res.status(200).json({ ok: true }));

    const headers = {
      authorization: 'Bearer authenticated-item-operation',
      'x-company-token': 'tenant-token-1'
    };

    await request(app).get('/api/v1/items/barcodes/resolve').set(headers).expect(200);

    const second = await request(app).get('/api/v1/items/barcodes/resolve').set(headers).expect(429);
    expect(second.body).toEqual(expect.objectContaining({
      success: false,
      message: 'Item request limit reached. Please wait before retrying.',
      retryAfterSeconds: expect.any(Number),
      limitScope: 'item_operations',
      limitKeyType: 'tenant_user',
      timestamp: expect.any(String),
    }));
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('keys item operations by tenant+user so different users do not share the same bucket', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', (req, _res, next) => {
      req.user = { user_id: req.headers['x-test-user-id'] };
      next();
    }, itemOperationsLimiter);
    app.get('/api/v1/items/barcodes/resolve', (_req, res) => res.status(200).json({ ok: true }));

    await request(app)
      .get('/api/v1/items/barcodes/resolve')
      .set({ authorization: 'Bearer user-c', 'x-company-token': 'tenant-token-2', 'x-test-user-id': 'user-c' })
      .expect(200);

    await request(app)
      .get('/api/v1/items/barcodes/resolve')
      .set({ authorization: 'Bearer user-d', 'x-company-token': 'tenant-token-2', 'x-test-user-id': 'user-d' })
      .expect(200);
  });

  it('keeps guest checkout OTP sends and verification attempts in separate rate-limit buckets', async () => {
    const app = express();
    app.use(express.json());
    app.post('/guest-otp/request', storeGuestCheckoutOtpRequestLimiter, (_req, res) => res.status(200).json({ ok: true }));
    app.post('/guest-otp/verify', storeGuestCheckoutOtpVerifyLimiter, (_req, res) => res.status(200).json({ ok: true }));

    await request(app)
      .post('/guest-otp/request')
      .send({ email: 'guest-otp-bucket@example.com' })
      .expect(200);

    await request(app)
      .post('/guest-otp/verify')
      .send({ email: 'guest-otp-bucket@example.com', code: '123456' })
      .expect(200);
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

  it('keys lookup limiter by ip+email so shared POS networks do not cross-throttle different cashiers', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/v1/auth/lookup', lookupLimiter, (_req, res) => res.status(200).json({ ok: true }));

    await request(app)
      .post('/api/v1/auth/lookup')
      .send({ email: 'cashier-a@example.com' })
      .expect(200);

    const sameEmail = await request(app)
      .post('/api/v1/auth/lookup')
      .send({ email: 'cashier-a@example.com' })
      .expect(429);

    expect(sameEmail.body).toEqual(expect.objectContaining({
      success: false,
      message: 'Too many email lookup attempts. For security reasons, please try again in 1 minute.',
      limitScope: 'auth_lookup',
      limitKeyType: 'ip_email',
      retryAfterSeconds: expect.any(Number),
    }));
    expect(Number(sameEmail.headers['retry-after'])).toBeLessThanOrEqual(60);

    await request(app)
      .post('/api/v1/auth/lookup')
      .send({ email: 'cashier-b@example.com' })
      .expect(200);
  });

  it('rate-limits tenant company registration with registration-scoped response metadata', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/v1/admin/tenants/register', tenantRegistrationLimiter, (_req, res) => {
      res.status(201).json({ success: true });
    });

    await request(app)
      .post('/api/v1/admin/tenants/register')
      .send({ name: 'Tenant A', adminEmail: 'owner-a@example.test' })
      .expect(201);

    const second = await request(app)
      .post('/api/v1/admin/tenants/register')
      .send({ name: 'Tenant B', adminEmail: 'owner-b@example.test' })
      .expect(429);

    expect(second.body).toEqual(expect.objectContaining({
      success: false,
      message: 'Too many registration requests from this IP, please try again after an hour.',
      limitScope: 'registration',
      limitKeyType: 'ip',
      retryAfterSeconds: expect.any(Number),
    }));
  });

  it('keys DGFY tenant session handoff by authenticated account and tenant', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/v1/dgfy/auth/tenant-session', (req, _res, next) => {
      req.dgfyAccount = { id: req.headers['x-test-dgfy-account'] || 'acct-a' };
      next();
    }, dgfyTenantSessionLimiter, (_req, res) => res.status(200).json({ ok: true }));

    await request(app)
      .post('/api/v1/dgfy/auth/tenant-session')
      .set('x-test-dgfy-account', 'acct-a')
      .send({ tenant_id: 'tenant-a', company_token: 'secret-token-a' })
      .expect(200);

    const sameAccountTenant = await request(app)
      .post('/api/v1/dgfy/auth/tenant-session')
      .set('x-test-dgfy-account', 'acct-a')
      .send({ tenant_id: 'tenant-a', company_token: 'secret-token-a' })
      .expect(429);

    expect(sameAccountTenant.body).toEqual(expect.objectContaining({
      success: false,
      message: 'Too many business session attempts. Please wait before opening this company again.',
      limitScope: 'dgfy_tenant_session',
      limitKeyType: 'ip_account_tenant',
      retryAfterSeconds: expect.any(Number),
    }));
    expect(JSON.stringify(sameAccountTenant.body)).not.toContain('secret-token-a');

    await request(app)
      .post('/api/v1/dgfy/auth/tenant-session')
      .set('x-test-dgfy-account', 'acct-b')
      .send({ tenant_id: 'tenant-a', company_token: 'secret-token-a' })
      .expect(200);

    await request(app)
      .post('/api/v1/dgfy/auth/tenant-session')
      .set('x-test-dgfy-account', 'acct-a')
      .send({ tenant_id: 'tenant-b', company_token: 'secret-token-b' })
      .expect(200);
  });

  it('keeps public tracking reads separate from claim and cancellation mutation buckets', async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/v1/store/track/:tracking_pin', storeTrackingReadLimiter, (_req, res) => res.status(200).json({ ok: true }));
    app.patch('/api/v1/store/orders/:tracking_pin/cancel', storeTrackingLimiter, (_req, res) => res.status(200).json({ ok: true }));

    await request(app).get('/api/v1/store/track/SK-READ01').expect(200);
    await request(app).patch('/api/v1/store/orders/SK-READ01/cancel').expect(200);

    const readLimited = await request(app).get('/api/v1/store/track/sk-read01').expect(429);
    expect(readLimited.body).toEqual(expect.objectContaining({
      limitScope: 'store_tracking_read',
      limitKeyType: 'ip_store_tracking_pin',
      retryAfterSeconds: expect.any(Number)
    }));

    const mutationLimited = await request(app).patch('/api/v1/store/orders/SK-READ01/cancel').expect(429);
    expect(mutationLimited.body).toEqual(expect.objectContaining({
      limitScope: 'store_tracking',
      limitKeyType: 'ip_tracking_pin',
      retryAfterSeconds: expect.any(Number)
    }));
  });

  it('keys public tracking reads by store slug and PIN without sharing mutation buckets', async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/v1/store/track/:tracking_pin', storeTrackingReadLimiter, (_req, res) => res.status(200).json({ ok: true }));

    await request(app)
      .get('/api/v1/store/track/SK-SHARED01')
      .set('x-store-slug', 'eatery-ni-doe-2e561d')
      .expect(200);

    const sameStoreSamePin = await request(app)
      .get('/api/v1/store/track/sk-shared01')
      .set('x-store-slug', 'eatery-ni-doe-2e561d')
      .expect(429);

    expect(sameStoreSamePin.body).toEqual(expect.objectContaining({
      limitScope: 'store_tracking_read',
      limitKeyType: 'ip_store_tracking_pin',
      retryAfterSeconds: expect.any(Number)
    }));

    await request(app)
      .get('/api/v1/store/track/SK-SHARED01')
      .set('x-store-slug', 'another-store')
      .expect(200);
  });

  describe('mobilePosFreeSyncLimiter (B2: free-tier offline-sync cap)', () => {
    const withTenant = (tenant) => (req, _res, next) => {
      req.tenant = tenant;
      next();
    };

    it('caps a free tenant at the configured daily sync count and returns an upgrade prompt', async () => {
      const app = express();
      app.use(express.json());
      app.use(withTenant({ id: 'tenant-free-1', plan: 'free' }));
      app.post('/api/v1/mobile-pos/sync/checkouts', mobilePosFreeSyncLimiter, (_req, res) => res.status(200).json({ ok: true }));

      await request(app).post('/api/v1/mobile-pos/sync/checkouts').expect(200);
      await request(app).post('/api/v1/mobile-pos/sync/checkouts').expect(200);

      const third = await request(app).post('/api/v1/mobile-pos/sync/checkouts').expect(429);
      expect(third.body).toEqual(expect.objectContaining({
        success: false,
        message: 'Free plan is limited to 2 syncs per day. Upgrade to Premium for unlimited sync.',
        limitScope: 'mobile_pos_free_sync',
        limitKeyType: 'tenant',
        requiresUpgrade: true,
        retryAfterSeconds: expect.any(Number),
      }));
      expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('shares one budget across every sync endpoint for the same free tenant', async () => {
      const app = express();
      app.use(express.json());
      app.use(withTenant({ id: 'tenant-free-shared', plan: 'free' }));
      app.post('/api/v1/mobile-pos/sync/checkouts', mobilePosFreeSyncLimiter, (_req, res) => res.status(200).json({ ok: true }));
      app.post('/api/v1/mobile-pos/sync/shifts', mobilePosFreeSyncLimiter, (_req, res) => res.status(200).json({ ok: true }));

      await request(app).post('/api/v1/mobile-pos/sync/checkouts').expect(200);
      await request(app).post('/api/v1/mobile-pos/sync/shifts').expect(200);

      // The budget is per business, not per endpoint - a third call to
      // either route is the third sync of the day and gets capped.
      await request(app).post('/api/v1/mobile-pos/sync/checkouts').expect(429);
    });

    it('never caps a premium tenant with an active subscription', async () => {
      const app = express();
      app.use(express.json());
      app.use(withTenant({ id: 'tenant-premium-1', plan: 'premium', subscription_status: 'active' }));
      app.post('/api/v1/mobile-pos/sync/checkouts', mobilePosFreeSyncLimiter, (_req, res) => res.status(200).json({ ok: true }));

      await request(app).post('/api/v1/mobile-pos/sync/checkouts').expect(200);
      await request(app).post('/api/v1/mobile-pos/sync/checkouts').expect(200);
      await request(app).post('/api/v1/mobile-pos/sync/checkouts').expect(200);
    });

    it('does not let one free tenant exhaust another free tenant\'s daily budget', async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.tenant = { id: req.headers['x-test-tenant'], plan: 'free' };
        next();
      });
      app.post('/api/v1/mobile-pos/sync/checkouts', mobilePosFreeSyncLimiter, (_req, res) => res.status(200).json({ ok: true }));

      await request(app).post('/api/v1/mobile-pos/sync/checkouts').set('x-test-tenant', 'tenant-a').expect(200);
      await request(app).post('/api/v1/mobile-pos/sync/checkouts').set('x-test-tenant', 'tenant-a').expect(200);
      await request(app).post('/api/v1/mobile-pos/sync/checkouts').set('x-test-tenant', 'tenant-a').expect(429);

      // Tenant B's budget is untouched by tenant A exhausting theirs.
      await request(app).post('/api/v1/mobile-pos/sync/checkouts').set('x-test-tenant', 'tenant-b').expect(200);
    });
  });
});

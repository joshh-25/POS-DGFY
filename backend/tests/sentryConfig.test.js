import * as Sentry from '@sentry/node';
import {
  initSentry,
  makeTracesSampler,
  redactSensitiveData,
  resolveSentryConfig,
  resolveSentryEnvironment,
  resolveTracesSampleRate,
  sanitizeSentryEvent,
  sentryRequestContext,
  shouldReportErrorToSentry
} from '../src/config/sentry.js';
import { extractSentryTraceId, requestContext } from '../src/middleware/requestContext.js';

describe('backend Sentry config', () => {
  test('is inactive by default even when a DSN is present', () => {
    const config = resolveSentryConfig({
      SENTRY_BACKEND_DSN: 'https://example@sentry.test/1',
      NODE_ENV: 'production'
    });

    expect(config.enabled).toBe(false);
    expect(config.active).toBe(false);
  });

  test('is active only when explicitly enabled and configured', () => {
    const config = resolveSentryConfig({
      SENTRY_ENABLED: 'true',
      SENTRY_BACKEND_DSN: 'https://example@sentry.test/1',
      SENTRY_ENVIRONMENT: 'beta',
      SENTRY_RELEASE: 'abc123'
    });

    expect(config.active).toBe(true);
    expect(config.environment).toBe('beta');
    expect(config.release).toBe('abc123');
  });

  test('hard-disable wins when DSN is configured', () => {
    const config = resolveSentryConfig({
      SENTRY_ENABLED: 'false',
      SENTRY_BACKEND_DSN: 'https://example@sentry.test/1'
    });

    expect(config.active).toBe(false);
  });

  describe('resolveSentryEnvironment', () => {
    test('uses SENTRY_ENVIRONMENT when explicitly set, even under NODE_ENV=production', () => {
      expect(resolveSentryEnvironment({ SENTRY_ENVIRONMENT: 'DEV', NODE_ENV: 'production' })).toBe('DEV');
    });

    test('falls back to NODE_ENV when it is not "production"', () => {
      expect(resolveSentryEnvironment({ NODE_ENV: 'staging' })).toBe('staging');
      expect(resolveSentryEnvironment({ NODE_ENV: 'development' })).toBe('development');
    });

    // The backend image hard-sets NODE_ENV=production on every box -- dev,
    // staging, beta and prod alike -- so falling back to it here would
    // silently file a non-prod server's errors under "production" the
    // moment SENTRY_ENABLED is flipped on without SENTRY_ENVIRONMENT.
    test('resolves to "unknown", NOT "production", when only NODE_ENV=production is set', () => {
      expect(resolveSentryEnvironment({ NODE_ENV: 'production' })).toBe('unknown');
    });

    test('defaults to "development" when neither variable is set', () => {
      expect(resolveSentryEnvironment({})).toBe('development');
    });

    test('resolveSentryConfig never resolves environment to "production" via the NODE_ENV fallback alone', () => {
      const config = resolveSentryConfig({ SENTRY_ENABLED: 'true', SENTRY_BACKEND_DSN: 'https://example@sentry.test/1', NODE_ENV: 'production' });
      expect(config.environment).toBe('unknown');
    });
  });

  test('redacts sensitive request details before sending events', () => {
    const event = sanitizeSentryEvent({
      request: {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'sid=secret',
          'x-request-id': 'req-123'
        },
        data: {
          password: 'secret',
          employee_credit: {
            pin: '4321',
            account_code: 'EC-1001'
          },
          nested: {
            otp: '123456',
            safe: 'kept'
          }
        },
        cookies: { sid: 'secret' }
      },
      user: {
        id: '42',
        email: 'admin@example.com',
        ip_address: '127.0.0.1'
      }
    });

    expect(event.request.headers.authorization).toBe('[Filtered]');
    expect(event.request.headers.cookie).toBe('[Filtered]');
    expect(event.request.headers['x-request-id']).toBe('req-123');
    expect(event.request.data.password).toBe('[Filtered]');
    expect(event.request.data.employee_credit.pin).toBe('[Filtered]');
    expect(event.request.data.employee_credit.account_code).toBe('EC-1001');
    expect(event.request.data.nested.otp).toBe('[Filtered]');
    expect(event.request.data.nested.safe).toBe('kept');
    expect(event.request.cookies).toBeUndefined();
    expect(event.user).toEqual({ id: '42', username: undefined, email: undefined, ip_address: undefined });
  });

  test('redacts nested sensitive fields in generic objects', () => {
    expect(redactSensitiveData({
      accessToken: 'secret',
      profile: {
        email: 'admin@example.com',
        displayName: 'Admin'
      }
    })).toEqual({
      accessToken: '[Filtered]',
      profile: {
        email: '[Filtered]',
        displayName: 'Admin'
      }
    });
  });
});

describe('traces sample rate resolution', () => {
  // A literal 0 must never reach Sentry.init(). hasSpansEnabled() is
  // `tracesSampleRate != null`, so 0 enables spans and then forces a negative
  // sampling decision that propagates outward as `sentry-trace: <id>-<id>-0`.
  // null means tracing-without-performance: ids propagate, nothing is billed.
  test('collapses unset, zero, and non-numeric rates to null', () => {
    expect(resolveTracesSampleRate(undefined)).toBeNull();
    expect(resolveTracesSampleRate('')).toBeNull();
    expect(resolveTracesSampleRate('0')).toBeNull();
    expect(resolveTracesSampleRate('-1')).toBeNull();
    expect(resolveTracesSampleRate('nonsense')).toBeNull();
  });

  test('keeps positive rates and clamps above 1', () => {
    expect(resolveTracesSampleRate('0.05')).toBe(0.05);
    expect(resolveTracesSampleRate('1')).toBe(1);
    expect(resolveTracesSampleRate('2')).toBe(1);
  });

  test('resolveSentryConfig exposes the tri-state rate', () => {
    expect(resolveSentryConfig({}).tracesSampleRate).toBeNull();
    expect(resolveSentryConfig({ SENTRY_TRACES_SAMPLE_RATE: '0' }).tracesSampleRate).toBeNull();
    expect(resolveSentryConfig({ SENTRY_TRACES_SAMPLE_RATE: '0.2' }).tracesSampleRate).toBe(0.2);
  });
});

describe('makeTracesSampler', () => {
  const sampler = makeTracesSampler(0.05);
  const inheritOrSampleWith = (fallback) => fallback;

  test('drops healthcheck and metrics transactions entirely', () => {
    expect(sampler({ name: 'GET /health', inheritOrSampleWith })).toBe(0);
    expect(sampler({ name: 'GET /healthz', inheritOrSampleWith })).toBe(0);
    expect(sampler({ name: 'GET /ready', inheritOrSampleWith })).toBe(0);
    expect(sampler({ name: 'GET /metrics', inheritOrSampleWith })).toBe(0);
  });

  test('heavily down-samples the 12s POS incoming-orders poll', () => {
    expect(sampler({ name: 'GET /api/v1/pos/incoming-orders', inheritOrSampleWith })).toBe(0.01);
    expect(sampler({
      name: 'GET /api/v1/pos/incoming-orders',
      attributes: { 'http.route': '/api/v1/pos/incoming-orders' },
      inheritOrSampleWith
    })).toBe(0.01);
  });

  test('drops CORS preflights', () => {
    expect(sampler({
      name: 'OPTIONS /api/v1/items',
      attributes: { 'http.request.method': 'OPTIONS' },
      inheritOrSampleWith
    })).toBe(0);
  });

  test('falls back to the base rate for ordinary routes', () => {
    expect(sampler({ name: 'POST /api/v1/orders', inheritOrSampleWith })).toBe(0.05);
  });

  test('honours an upstream sampling decision when the browser made one', () => {
    const inheritNo = () => false;
    expect(sampler({ name: 'POST /api/v1/orders', parentSampled: false, inheritOrSampleWith: inheritNo }))
      .toBe(false);
  });

  test('survives a sampling context without inheritOrSampleWith', () => {
    expect(sampler({ name: 'POST /api/v1/orders' })).toBe(0.05);
  });

  test('matches the poll route even when prefixed by a mount path', () => {
    expect(sampler({ name: 'GET /pos/incoming-orders', inheritOrSampleWith })).toBe(0.01);
  });
});

describe('exception message scrubbing', () => {
  test('redacts an API key that the provider SDK embedded in its error text', () => {
    const event = sanitizeSentryEvent({
      exception: {
        values: [{
          type: 'Error',
          value: '401 Incorrect API key provided: sk-proj-abcdefghijklmnopqrstuvwxyz012345. You can find your API key at https://platform.openai.com/account/api-keys.',
          stacktrace: { frames: [{ filename: 'embeddingService.js', lineno: 30 }] },
          mechanism: { handled: false, type: 'auto.ai.openai' }
        }]
      }
    });

    const scrubbed = event.exception.values[0];
    expect(scrubbed.value).toContain('[redacted:openai-key]');
    expect(scrubbed.value).not.toContain('sk-proj-');
    // Grouping inputs must be preserved exactly.
    expect(scrubbed.type).toBe('Error');
    expect(scrubbed.stacktrace).toEqual({ frames: [{ filename: 'embeddingService.js', lineno: 30 }] });
    expect(scrubbed.mechanism).toEqual({ handled: false, type: 'auto.ai.openai' });
  });

  test('redacts credentials in urls, bearer tokens, and key=value assignments', () => {
    const event = sanitizeSentryEvent({
      message: 'connect mysql://dbuser:hunter2@db.internal:3306 failed',
      breadcrumbs: [{ message: 'sent Authorization: Bearer abcdefghijklmnopqrstuv' }],
      exception: { values: [{ type: 'Error', value: 'client_secret: s3cr3tvalue123 rejected' }] }
    });

    expect(event.message).toBe('connect mysql://[redacted]@db.internal:3306 failed');
    expect(event.breadcrumbs[0].message).toBe('sent Authorization: Bearer [redacted]');
    expect(event.exception.values[0].value).toBe('client_secret: [redacted] rejected');
  });

  test('leaves ordinary diagnostic text intact', () => {
    const value = 'ER_DUP_ENTRY: Duplicate entry SKU-000184 for key items.sku on tenant tenant_premium';
    const event = sanitizeSentryEvent({ exception: { values: [{ type: 'Error', value }] } });

    expect(event.exception.values[0].value).toBe(value);
  });
});

describe('shouldReportErrorToSentry', () => {
  // sentryErrorHandler runs before errorHandler, so res.statusCode is never
  // a legitimate signal here -- this predicate must decide purely from the
  // error itself. The generic-500 case below is the actual bug this guards:
  // a plain Error with no .statusCode used to fall through to
  // `res.statusCode` (still Express's default 200 at this point in the
  // pipeline) and get silently dropped.
  test('reports a generic error with no explicit status code', () => {
    expect(shouldReportErrorToSentry(new Error('boom'))).toBe(true);
  });

  test('reports an error with an explicit 5xx statusCode', () => {
    expect(shouldReportErrorToSentry({ statusCode: 503 })).toBe(true);
    expect(shouldReportErrorToSentry({ status: 500 })).toBe(true);
  });

  test('does not report an error with an explicit 4xx statusCode', () => {
    expect(shouldReportErrorToSentry({ statusCode: 404 })).toBe(false);
    expect(shouldReportErrorToSentry({ status: 400 })).toBe(false);
  });
});

describe('requestContext trace id adoption', () => {
  const makeRes = () => ({ locals: {}, setHeader: () => {} });

  test('extracts the trace id from a sentry-trace header', () => {
    expect(extractSentryTraceId('4a1c0f9e2b7d48a1b6e3c5d7f9a0b2c3-8b2e1f4a6c9d7a10-1'))
      .toBe('4a1c0f9e2b7d48a1b6e3c5d7f9a0b2c3');
    // The sampled flag is optional in the header grammar.
    expect(extractSentryTraceId('4a1c0f9e2b7d48a1b6e3c5d7f9a0b2c3-8b2e1f4a6c9d7a10'))
      .toBe('4a1c0f9e2b7d48a1b6e3c5d7f9a0b2c3');
    expect(extractSentryTraceId('garbage')).toBeNull();
    expect(extractSentryTraceId(undefined)).toBeNull();
  });

  test('adopts the browser trace id so x-trace-id is a Sentry search key', () => {
    const req = {
      get: (name) => (name === 'sentry-trace'
        ? '4a1c0f9e2b7d48a1b6e3c5d7f9a0b2c3-8b2e1f4a6c9d7a10-1'
        : undefined)
    };
    const res = makeRes();

    requestContext(req, res, () => {});

    expect(req.traceId).toBe('4a1c0f9e2b7d48a1b6e3c5d7f9a0b2c3');
    // request_id stays independent -- it is generated, not inherited.
    expect(req.requestId).not.toBe(req.traceId);
  });

  test('an explicit x-trace-id header still wins over sentry-trace', () => {
    const headers = {
      'x-trace-id': 'caller-supplied-trace',
      'sentry-trace': '4a1c0f9e2b7d48a1b6e3c5d7f9a0b2c3-8b2e1f4a6c9d7a10-1'
    };
    const req = { get: (name) => headers[name] };

    requestContext(req, makeRes(), () => {});

    expect(req.traceId).toBe('caller-supplied-trace');
  });

  test('falls back to the request id when no trace headers are present', () => {
    const req = { get: () => undefined };

    requestContext(req, makeRes(), () => {});

    expect(req.traceId).toBe(req.requestId);
  });
});

// This module is a singleton (`let initialized`), so this describe block
// runs after every test above and calls the real initSentry() once --
// safe because Sentry.init() only configures a transport, it doesn't make
// a network call, and Jest gives each test *file* its own module registry
// so this doesn't leak into other test files.
describe('sentryRequestContext isolation scope', () => {
  beforeAll(() => {
    initSentry({
      env: { SENTRY_ENABLED: 'true', SENTRY_BACKEND_DSN: 'https://test@sentry.test/1' },
      logger: { info: () => {}, warn: () => {} }
    });
  });

  test('sets request/tenant tags on the isolation scope for the current request', () => {
    const req = {
      requestId: 'req-abc',
      traceId: 'trace-abc',
      headers: { 'x-dgfy-surface': 'pos' },
      user: { user_id: 7 },
      tenant: { id: 99 }
    };
    let tagsSeenInsideNext = null;

    sentryRequestContext(req, {}, () => {
      tagsSeenInsideNext = Sentry.getIsolationScope().getScopeData().tags;
    });

    expect(tagsSeenInsideNext).toMatchObject({
      service: 'backend',
      request_id: 'req-abc',
      surface: 'pos'
    });
    // No `trace_id` tag on purpose: Sentry already carries the real
    // distributed trace id at contexts.trace.trace_id and indexes it as the
    // `trace:<id>` search. A same-named custom tag shadowed it in the UI with
    // an unrelated per-request UUID.
    expect(tagsSeenInsideNext.trace_id).toBeUndefined();
  });

  test('does not leak tags between two sequential requests', () => {
    const makeReq = (id) => ({ requestId: id, traceId: id, headers: {} });
    const seenRequestIds = [];

    sentryRequestContext(makeReq('req-1'), {}, () => {
      seenRequestIds.push(Sentry.getIsolationScope().getScopeData().tags.request_id);
    });
    sentryRequestContext(makeReq('req-2'), {}, () => {
      seenRequestIds.push(Sentry.getIsolationScope().getScopeData().tags.request_id);
    });

    expect(seenRequestIds).toEqual(['req-1', 'req-2']);
    // Outside any request-scoped middleware call, the ambient isolation
    // scope must not carry a tag left over from either request above.
    expect(Sentry.getIsolationScope().getScopeData().tags.request_id).toBeUndefined();
  });
});

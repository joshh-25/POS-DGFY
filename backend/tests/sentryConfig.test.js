import * as Sentry from '@sentry/node';
import {
  initSentry,
  redactSensitiveData,
  resolveSentryConfig,
  sanitizeSentryEvent,
  sentryRequestContext
} from '../src/config/sentry.js';

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

  test('sets request/trace/tenant tags on the isolation scope for the current request', () => {
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
      trace_id: 'trace-abc',
      surface: 'pos'
    });
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

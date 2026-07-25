import {
  redactSensitiveData,
  resolveSentryConfig,
  sanitizeSentryEvent
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

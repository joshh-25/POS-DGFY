import { describe, expect, it } from 'vitest';
import {
  resolveSentryBrowserConfig,
  sanitizeSentryEvent
} from '../sentryClient.js';

describe('browser Sentry config', () => {
  it('is inactive by default even when a surface DSN exists', () => {
    const config = resolveSentryBrowserConfig({
      VITE_APP_SURFACE: 'pos',
      VITE_SENTRY_DSN_POS: 'https://example@sentry.test/1'
    });

    expect(config.enabled).toBe(false);
    expect(config.active).toBe(false);
  });

  it('selects the DSN for the requested surface when enabled', () => {
    const config = resolveSentryBrowserConfig({
      VITE_SENTRY_ENABLED: 'true',
      VITE_SENTRY_DSN_SKUPERVISOR: 'https://skupervisor@sentry.test/1',
      VITE_SENTRY_DSN_POS: 'https://pos@sentry.test/2',
      VITE_SENTRY_DSN_STORE: 'https://store@sentry.test/3',
      VITE_SENTRY_ENVIRONMENT: 'beta',
      VITE_SENTRY_RELEASE: 'abc123'
    }, 'store');

    expect(config.active).toBe(true);
    expect(config.dsn).toBe('https://store@sentry.test/3');
    expect(config.environment).toBe('beta');
    expect(config.release).toBe('abc123');
  });

  it('hard-disable wins when a DSN is configured', () => {
    const config = resolveSentryBrowserConfig({
      VITE_SENTRY_ENABLED: 'false',
      VITE_SENTRY_DSN_POS: 'https://pos@sentry.test/2'
    }, 'pos');

    expect(config.active).toBe(false);
  });

  it('sanitizes browser event request and user data', () => {
    const event = sanitizeSentryEvent({
      request: {
        headers: {
          authorization: 'Bearer secret'
        },
        data: {
          token: 'secret'
        },
        cookies: {
          sid: 'secret'
        }
      },
      user: {
        id: '42',
        email: 'admin@example.com',
        ip_address: '127.0.0.1'
      }
    });

    expect(event.request.headers).toBeUndefined();
    expect(event.request.data).toBeUndefined();
    expect(event.request.cookies).toBeUndefined();
    expect(event.user).toEqual({ id: '42', username: undefined, email: undefined, ip_address: undefined });
  });
});

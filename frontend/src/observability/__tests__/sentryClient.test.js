import { describe, expect, it, vi } from 'vitest';
import {
  resolveSentryBrowserConfig,
  resolveTracePropagationTargets,
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

  it('resolves tracePropagationTargets from an explicit comma-separated env var', () => {
    const targets = resolveTracePropagationTargets({
      VITE_SENTRY_TRACE_PROPAGATION_TARGETS: 'https://api.dgfy.ph, https://store.dgfy.ph '
    });

    expect(targets).toEqual(['https://api.dgfy.ph', 'https://store.dgfy.ph']);
  });

  it('falls back to same-origin plus an absolute VITE_API_URL when unset', () => {
    vi.stubGlobal('window', { location: { origin: 'https://store.dgfy.ph' } });
    const targets = resolveTracePropagationTargets({ VITE_API_URL: 'https://api.dgfy.ph/api/v1' });

    expect(targets).toEqual(['https://store.dgfy.ph', 'https://api.dgfy.ph/api/v1']);
    vi.unstubAllGlobals();
  });

  it('does not include a relative VITE_API_URL as a propagation target', () => {
    vi.stubGlobal('window', { location: { origin: 'https://store.dgfy.ph' } });
    const targets = resolveTracePropagationTargets({ VITE_API_URL: '/api/v1' });

    expect(targets).toEqual(['https://store.dgfy.ph']);
    vi.unstubAllGlobals();
  });
});

describe('initBrowserSentry integrations', () => {
  const importFreshSentryClient = async () => {
    vi.resetModules();
    return import('../sentryClient.js');
  };

  it('registers browserTracingIntegration and replayIntegration only when their sample rates are > 0', async () => {
    const browserTracingIntegration = vi.fn(() => ({ name: 'BrowserTracing' }));
    const replayIntegration = vi.fn(() => ({ name: 'Replay' }));
    const init = vi.fn();
    vi.doMock('@sentry/react', () => ({ init, browserTracingIntegration, replayIntegration }));

    const freshModule = await importFreshSentryClient();
    freshModule.initBrowserSentry({
      env: {
        VITE_SENTRY_ENABLED: 'true',
        VITE_SENTRY_DSN_STORE: 'https://test@sentry.test/1',
        VITE_SENTRY_TRACES_SAMPLE_RATE: '0.5',
        VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: '0.1'
      },
      surface: 'store'
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(browserTracingIntegration).toHaveBeenCalled();
    expect(replayIntegration).toHaveBeenCalled();
    const initOptions = init.mock.calls[0][0];
    expect(initOptions.integrations).toHaveLength(2);
    vi.doUnmock('@sentry/react');
  });

  it('registers neither integration when both sample rates are 0', async () => {
    const browserTracingIntegration = vi.fn(() => ({ name: 'BrowserTracing' }));
    const replayIntegration = vi.fn(() => ({ name: 'Replay' }));
    const init = vi.fn();
    vi.doMock('@sentry/react', () => ({ init, browserTracingIntegration, replayIntegration }));

    const freshModule = await importFreshSentryClient();
    freshModule.initBrowserSentry({
      env: {
        VITE_SENTRY_ENABLED: 'true',
        VITE_SENTRY_DSN_STORE: 'https://test@sentry.test/1'
      },
      surface: 'store'
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(browserTracingIntegration).not.toHaveBeenCalled();
    expect(replayIntegration).not.toHaveBeenCalled();
    const initOptions = init.mock.calls[0][0];
    expect(initOptions.integrations).toHaveLength(0);
    vi.doUnmock('@sentry/react');
  });
});

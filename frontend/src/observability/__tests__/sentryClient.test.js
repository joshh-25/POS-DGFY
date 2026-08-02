import { describe, expect, it, vi } from 'vitest';
import {
  normalizeRequestUrl,
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

describe('normalizeRequestUrl', () => {
  it('collapses numeric id segments', () => {
    expect(normalizeRequestUrl('/api/v1/items/123')).toBe('/api/v1/items/:id');
    expect(normalizeRequestUrl('/api/v1/items/456')).toBe('/api/v1/items/:id');
  });

  it('collapses UUID and Mongo-style id segments', () => {
    expect(normalizeRequestUrl('/api/v1/items/550e8400-e29b-41d4-a716-446655440000')).toBe('/api/v1/items/:id');
    expect(normalizeRequestUrl('/api/v1/items/507f1f77bcf86cd799439011')).toBe('/api/v1/items/:id');
  });

  it('strips query strings and hash fragments before normalizing', () => {
    expect(normalizeRequestUrl('/api/v1/pos/checkout?x=1#f')).toBe('/api/v1/pos/checkout');
  });

  it('leaves non-id path segments untouched', () => {
    expect(normalizeRequestUrl('/api/v1/items/supplier-coverage')).toBe('/api/v1/items/supplier-coverage');
    expect(normalizeRequestUrl('/api/v1/purchase-orders')).toBe('/api/v1/purchase-orders');
  });

  it('handles empty/missing input', () => {
    expect(normalizeRequestUrl('')).toBe('');
    expect(normalizeRequestUrl(undefined)).toBe('');
  });
});

// The functions below all route through Sentry once it's initialized, so
// each test spins up a fresh module instance (mirrors the
// "initBrowserSentry integrations" pattern above) rather than sharing the
// statically-imported module -- that keeps each test's throttle/init state
// isolated instead of leaking across tests.
describe('Sentry identity, context, and route helpers', () => {
  const importInitializedSentryClient = async (env = {}) => {
    const Sentry = {
      init: vi.fn(),
      setUser: vi.fn(),
      setTag: vi.fn(),
      setContext: vi.fn(),
      addBreadcrumb: vi.fn(),
      captureException: vi.fn(() => 'evt-1'),
      browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
      replayIntegration: vi.fn(() => ({ name: 'Replay' }))
    };
    vi.doMock('@sentry/react', () => Sentry);
    vi.resetModules();
    const freshModule = await import('../sentryClient.js');
    freshModule.initBrowserSentry({
      env: {
        VITE_SENTRY_ENABLED: 'true',
        VITE_SENTRY_DSN_STORE: 'https://test@sentry.test/1',
        ...env
      },
      surface: 'store'
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { freshModule, Sentry };
  };

  it('identifySentryUser sets only an id on the user object and role as a tag', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();
    freshModule.identifySentryUser({ id: 42, role: 'cashier' });

    expect(Sentry.setUser).toHaveBeenCalledWith({ id: '42' });
    expect(Sentry.setTag).toHaveBeenCalledWith('user_role', 'cashier');
    vi.doUnmock('@sentry/react');
  });

  it('identifySentryUser is a no-op without an id', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();
    freshModule.identifySentryUser({});
    freshModule.identifySentryUser({ role: 'cashier' });

    expect(Sentry.setUser).not.toHaveBeenCalled();
    vi.doUnmock('@sentry/react');
  });

  it('setSentryContext tags tenant/store/business-mode/location and skips unset fields', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();
    freshModule.setSentryContext({ tenantId: 7, businessMode: 'fnb' });

    expect(Sentry.setTag).toHaveBeenCalledWith('tenant_id', '7');
    expect(Sentry.setTag).toHaveBeenCalledWith('business_mode', 'fnb');
    expect(Sentry.setTag).not.toHaveBeenCalledWith('store_slug', expect.anything());
    expect(Sentry.setTag).not.toHaveBeenCalledWith('location_id', expect.anything());
    vi.doUnmock('@sentry/react');
  });

  it('resetSentryIdentity clears the user and every identity/context tag', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();
    freshModule.resetSentryIdentity();

    expect(Sentry.setUser).toHaveBeenCalledWith(null);
    expect(Sentry.setTag).toHaveBeenCalledWith('user_role', undefined);
    expect(Sentry.setTag).toHaveBeenCalledWith('tenant_id', undefined);
    expect(Sentry.setTag).toHaveBeenCalledWith('store_slug', undefined);
    expect(Sentry.setTag).toHaveBeenCalledWith('business_mode', undefined);
    expect(Sentry.setTag).toHaveBeenCalledWith('location_id', undefined);
    vi.doUnmock('@sentry/react');
  });

  it('setSentryRoute tags the route and adds a navigation breadcrumb', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();
    freshModule.setSentryRoute('/items');

    expect(Sentry.setTag).toHaveBeenCalledWith('route', '/items');
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({
      category: 'navigation',
      message: 'Navigated to /items',
      data: { pathname: '/items' }
    }));
    vi.doUnmock('@sentry/react');
  });

  it('setSentryRoute is a no-op for an empty pathname', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();
    freshModule.setSentryRoute('');

    expect(Sentry.setTag).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
    vi.doUnmock('@sentry/react');
  });

  it('identity/route helpers do not throw when Sentry was never initialized', async () => {
    vi.resetModules();
    const freshModule = await import('../sentryClient.js');

    expect(() => {
      freshModule.identifySentryUser({ id: 1 });
      freshModule.setSentryContext({ tenantId: 1 });
      freshModule.resetSentryIdentity();
      freshModule.setSentryRoute('/items');
    }).not.toThrow();
  });

  it('preserves tags through sanitizeSentryEvent (beforeSend never strips them)', () => {
    const event = {
      user: { id: '42' },
      tags: { tenant_id: '7', user_role: 'admin', route: '/items' }
    };
    const sanitized = sanitizeSentryEvent(event);
    expect(sanitized.tags).toEqual(event.tags);
  });
});

describe('captureRequestFailure', () => {
  const importInitializedSentryClient = async () => {
    const scope = { setLevel: vi.fn(), setFingerprint: vi.fn(), setTag: vi.fn(), setContext: vi.fn() };
    const Sentry = {
      init: vi.fn(),
      captureException: vi.fn(() => 'evt-1'),
      browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
      replayIntegration: vi.fn(() => ({ name: 'Replay' }))
    };
    vi.doMock('@sentry/react', () => Sentry);
    vi.resetModules();
    const freshModule = await import('../sentryClient.js');
    freshModule.initBrowserSentry({
      env: { VITE_SENTRY_ENABLED: 'true', VITE_SENTRY_DSN_STORE: 'https://test@sentry.test/1' },
      surface: 'store'
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { freshModule, Sentry, scope };
  };

  it('captures a 500 and fingerprints by normalized endpoint + status', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();
    freshModule.captureRequestFailure({ method: 'get', url: '/api/v1/items/123', status: 500 });

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [, options] = Sentry.captureException.mock.calls[0];
    expect(options.fingerprint).toEqual(['api', 'GET', '/api/v1/items/:id', '500']);
    vi.doUnmock('@sentry/react');
  });

  it('does not capture 4xx responses', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();
    freshModule.captureRequestFailure({ method: 'get', url: '/api/v1/items/1', status: 400 });
    freshModule.captureRequestFailure({ method: 'get', url: '/api/v1/items/1', status: 401 });
    freshModule.captureRequestFailure({ method: 'get', url: '/api/v1/items/1', status: 404 });
    freshModule.captureRequestFailure({ method: 'post', url: '/api/v1/items', status: 422 });

    expect(Sentry.captureException).not.toHaveBeenCalled();
    vi.doUnmock('@sentry/react');
  });

  it('captures a network/no-response failure with a "network" status token', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();
    freshModule.captureRequestFailure({ method: 'get', url: '/api/v1/items' });

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [, options] = Sentry.captureException.mock.calls[0];
    expect(options.fingerprint).toEqual(['api', 'GET', '/api/v1/items', 'network']);
    vi.doUnmock('@sentry/react');
  });

  it('throttles repeat failures of the same endpoint within the cooldown window', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);

    freshModule.captureRequestFailure({ method: 'get', url: '/api/v1/items/1', status: 500 });
    freshModule.captureRequestFailure({ method: 'get', url: '/api/v1/items/2', status: 500 });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1_000_000 + 60_000);
    freshModule.captureRequestFailure({ method: 'get', url: '/api/v1/items/3', status: 500 });
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
    vi.doUnmock('@sentry/react');
  });

  it('caps captured events at 20 per session', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();
    const nowSpy = vi.spyOn(Date, 'now');

    for (let i = 0; i < 25; i += 1) {
      nowSpy.mockReturnValue(i * 100_000);
      freshModule.captureRequestFailure({ method: 'get', url: `/api/v1/items/${i}/detail`, status: 500 });
    }

    expect(Sentry.captureException).toHaveBeenCalledTimes(20);
    nowSpy.mockRestore();
    vi.doUnmock('@sentry/react');
  });

  it('does not throw when Sentry was never initialized', async () => {
    vi.resetModules();
    const freshModule = await import('../sentryClient.js');
    expect(() => freshModule.captureRequestFailure({ method: 'get', url: '/api/v1/items', status: 500 })).not.toThrow();
  });
});

describe('window.__sentryTestError dev hook', () => {
  it('is registered in a dev build and captures a test error when Sentry is active', async () => {
    vi.stubGlobal('window', {});
    const Sentry = {
      init: vi.fn(),
      captureException: vi.fn(() => 'evt-1'),
      browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
      replayIntegration: vi.fn(() => ({ name: 'Replay' }))
    };
    vi.doMock('@sentry/react', () => Sentry);
    vi.resetModules();
    const freshModule = await import('../sentryClient.js');
    freshModule.initBrowserSentry({
      env: { VITE_SENTRY_ENABLED: 'true', VITE_SENTRY_DSN_STORE: 'https://test@sentry.test/1' },
      surface: 'store'
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(typeof window.__sentryTestError).toBe('function');
    window.__sentryTestError();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    vi.doUnmock('@sentry/react');
    vi.unstubAllGlobals();
  });

  it('warns instead of capturing when Sentry is not active', async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const freshModule = await import('../sentryClient.js');
    const logger = { warn: vi.fn(), info: vi.fn() };
    freshModule.initBrowserSentry({ env: { VITE_SENTRY_ENABLED: 'false' }, surface: 'store', logger });

    expect(typeof window.__sentryTestError).toBe('function');
    window.__sentryTestError();
    expect(logger.warn).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

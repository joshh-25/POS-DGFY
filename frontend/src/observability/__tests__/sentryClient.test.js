import { describe, expect, it, vi } from 'vitest';
import {
  classifyRequestFailure,
  normalizeRequestUrl,
  resolveSentryBrowserConfig,
  resolveSentryEnvironment,
  resolveTracePropagationTargets,
  resolveTracesSampleRate,
  resolveTracingMode,
  sanitizeSentryEvent
} from '../sentryClient.js';

describe('resolveSentryEnvironment', () => {
  it('prefers an explicit VITE_SENTRY_ENVIRONMENT even when MODE is production', () => {
    expect(resolveSentryEnvironment({ VITE_SENTRY_ENVIRONMENT: 'DEV', MODE: 'production' })).toBe('DEV');
  });

  it('falls back to MODE when it is not production', () => {
    expect(resolveSentryEnvironment({ MODE: 'staging' })).toBe('staging');
    expect(resolveSentryEnvironment({ MODE: 'development' })).toBe('development');
  });

  it('never falls back to a MODE of production -- resolves to "unknown" instead', () => {
    expect(resolveSentryEnvironment({ MODE: 'production' })).toBe('unknown');
  });

  it('defaults to development when nothing is set', () => {
    expect(resolveSentryEnvironment({})).toBe('development');
  });
});

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

  it('merges runtime-resolved extra targets and drops duplicates', () => {
    vi.stubGlobal('window', { location: { origin: 'https://pos.dgfy.ph' } });
    const targets = resolveTracePropagationTargets(
      {},
      ['https://api.dgfy.ph', 'https://pos.dgfy.ph']
    );

    expect(targets).toEqual(['https://pos.dgfy.ph', 'https://api.dgfy.ph']);
    vi.unstubAllGlobals();
  });

  it('merges extra targets into an explicit env var list too', () => {
    const targets = resolveTracePropagationTargets(
      { VITE_SENTRY_TRACE_PROPAGATION_TARGETS: 'https://api.dgfy.ph' },
      ['https://desktop.internal']
    );

    expect(targets).toEqual(['https://api.dgfy.ph', 'https://desktop.internal']);
  });

  // A custom-protocol Electron window reports origin as the literal "null".
  it('drops the literal "null" origin', () => {
    vi.stubGlobal('window', { location: { origin: 'null' } });
    const targets = resolveTracePropagationTargets({}, ['https://api.dgfy.ph']);

    expect(targets).toEqual(['https://api.dgfy.ph']);
    vi.unstubAllGlobals();
  });

  it('treats an unset or zero traces sample rate as propagation-only', () => {
    expect(resolveTracesSampleRate(undefined)).toBeNull();
    expect(resolveTracesSampleRate('')).toBeNull();
    expect(resolveTracesSampleRate('0')).toBeNull();
    expect(resolveTracesSampleRate('not-a-number')).toBeNull();
    expect(resolveTracesSampleRate('0.25')).toBe(0.25);
    expect(resolveTracesSampleRate('5')).toBe(1);

    expect(resolveTracingMode({})).toBe('propagate');
    expect(resolveTracingMode({ VITE_SENTRY_TRACES_SAMPLE_RATE: '0' })).toBe('propagate');
    expect(resolveTracingMode({ VITE_SENTRY_TRACES_SAMPLE_RATE: '0.1' })).toBe('spans');
    expect(resolveTracingMode({ VITE_SENTRY_TRACE_PROPAGATION_ENABLED: 'false' })).toBe('off');
  });
});

describe('secret scrubbing', () => {
  it('redacts an API key embedded in an exception message', () => {
    const event = sanitizeSentryEvent({
      exception: {
        values: [{
          type: 'Error',
          value: '401 Incorrect API key provided: sk-proj-abcdefghijklmnopqrstuvwxyz012345.',
          stacktrace: { frames: [{ filename: 'embeddingService.js' }] },
          mechanism: { handled: false }
        }]
      }
    });

    const scrubbed = event.exception.values[0];
    expect(scrubbed.value).toBe('401 Incorrect API key provided: [redacted:openai-key].');
    expect(scrubbed.value).not.toContain('sk-proj-');
    // Grouping inputs must survive untouched.
    expect(scrubbed.type).toBe('Error');
    expect(scrubbed.stacktrace).toEqual({ frames: [{ filename: 'embeddingService.js' }] });
    expect(scrubbed.mechanism).toEqual({ handled: false });
  });

  it('redacts bearer tokens and JWTs in messages and breadcrumbs', () => {
    const event = sanitizeSentryEvent({
      message: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
      breadcrumbs: [
        { message: 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N' },
        { message: 'harmless breadcrumb' }
      ]
    });

    expect(event.message).toBe('Authorization: Bearer [redacted]');
    expect(event.breadcrumbs[0].message).toBe('token [redacted:jwt]');
    expect(event.breadcrumbs[1].message).toBe('harmless breadcrumb');
  });

  it('leaves diagnostic identifiers alone', () => {
    const event = sanitizeSentryEvent({
      exception: {
        values: [{
          type: 'AxiosError',
          value: 'Request failed: GET /api/v1/orders/ORD-2026-000184 for tenant tenant_premium (status 502)'
        }]
      }
    });

    expect(event.exception.values[0].value).toBe(
      'Request failed: GET /api/v1/orders/ORD-2026-000184 for tenant tenant_premium (status 502)'
    );
  });

  it('preserves an explicit fingerprint', () => {
    const event = sanitizeSentryEvent({
      fingerprint: ['api', 'GET', '/api/v1/items/:id', '502'],
      exception: { values: [{ type: 'Error', value: 'boom' }] }
    });

    expect(event.fingerprint).toEqual(['api', 'GET', '/api/v1/items/:id', '502']);
  });
});

describe('initBrowserSentry integrations', () => {
  const importFreshSentryClient = async () => {
    vi.resetModules();
    return import('../sentryClient.js');
  };

  it('registers browserTracingIntegration with full options and replayIntegration when their sample rates are > 0', async () => {
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

    expect(browserTracingIntegration).toHaveBeenCalledWith({});
    expect(replayIntegration).toHaveBeenCalled();
    const initOptions = init.mock.calls[0][0];
    expect(initOptions.integrations).toHaveLength(2);
    expect(initOptions.tracesSampleRate).toBe(0.5);
    vi.doUnmock('@sentry/react');
  });

  // Regression guard for the bug this replaced: registration used to be gated
  // on tracesSampleRate > 0, so the default config attached no
  // sentry-trace/baggage headers and browser errors could never be correlated
  // with backend errors.
  it('still registers browserTracingIntegration for propagation when no sample rate is set', async () => {
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

    expect(replayIntegration).not.toHaveBeenCalled();
    const propagationOptions = browserTracingIntegration.mock.calls[0][0];
    expect(propagationOptions).toMatchObject({
      enableInp: false,
      enableLongTask: false,
      enableLongAnimationFrame: false,
      markBackgroundSpan: false
    });
    // These must NOT be disabled -- they are what rotate the trace id per
    // navigation. Pinning one trace id to a whole tab lifetime would make a
    // long POS shift unusable in the trace view.
    expect(propagationOptions.instrumentPageLoad).toBeUndefined();
    expect(propagationOptions.instrumentNavigation).toBeUndefined();

    const initOptions = init.mock.calls[0][0];
    expect(initOptions.integrations).toHaveLength(1);
    // The key must be ABSENT, not 0. Sentry's hasSpansEnabled() is
    // `tracesSampleRate != null`, so a literal 0 would enable spans and force
    // a negative sampling decision that propagates as `-0` and permanently
    // poisons the backend sampler. `in` is used rather than toBeUndefined()
    // because the latter passes vacuously for a present-but-undefined key.
    expect('tracesSampleRate' in initOptions).toBe(false);
    vi.doUnmock('@sentry/react');
  });

  it('registers no tracing integration when the propagation kill switch is off', async () => {
    const browserTracingIntegration = vi.fn(() => ({ name: 'BrowserTracing' }));
    const replayIntegration = vi.fn(() => ({ name: 'Replay' }));
    const init = vi.fn();
    vi.doMock('@sentry/react', () => ({ init, browserTracingIntegration, replayIntegration }));

    const freshModule = await importFreshSentryClient();
    freshModule.initBrowserSentry({
      env: {
        VITE_SENTRY_ENABLED: 'true',
        VITE_SENTRY_DSN_STORE: 'https://test@sentry.test/1',
        VITE_SENTRY_TRACE_PROPAGATION_ENABLED: 'false'
      },
      surface: 'store'
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(browserTracingIntegration).not.toHaveBeenCalled();
    expect(init.mock.calls[0][0].integrations).toHaveLength(0);
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

describe('classifyRequestFailure', () => {
  it('classifies 502/503/504 and no-response as transient', () => {
    expect(classifyRequestFailure({ status: 502 })).toBe('transient');
    expect(classifyRequestFailure({ status: 503 })).toBe('transient');
    expect(classifyRequestFailure({ status: 504 })).toBe('transient');
    expect(classifyRequestFailure({})).toBe('transient');
  });

  it('classifies 500 and other 5xx as server', () => {
    expect(classifyRequestFailure({ status: 500 })).toBe('server');
    expect(classifyRequestFailure({ status: 599 })).toBe('server');
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
    expect(options.level).toBe('error');
    expect(options.tags.request_failure_class).toBe('server');
    vi.doUnmock('@sentry/react');
  });

  it('classifies 502/503/504 as transient (warning level) without changing the fingerprint', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();

    freshModule.captureRequestFailure({ method: 'get', url: '/api/v1/items/1', status: 502 });
    freshModule.captureRequestFailure({ method: 'get', url: '/api/v1/items/2', status: 503 });
    freshModule.captureRequestFailure({ method: 'get', url: '/api/v1/items/3', status: 504 });

    expect(Sentry.captureException).toHaveBeenCalledTimes(3);
    Sentry.captureException.mock.calls.forEach(([, options], index) => {
      const status = [502, 503, 504][index];
      // Fingerprint's 4th element is already the status code -- this is the
      // regression guard proving classification never touches grouping.
      expect(options.fingerprint).toEqual(['api', 'GET', `/api/v1/items/:id`, String(status)]);
      expect(options.level).toBe('warning');
      expect(options.tags.request_failure_class).toBe('transient');
    });
    vi.doUnmock('@sentry/react');
  });

  it('classifies a network/no-response failure as transient (warning level)', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();
    freshModule.captureRequestFailure({ method: 'get', url: '/api/v1/items' });

    const [, options] = Sentry.captureException.mock.calls[0];
    expect(options.fingerprint).toEqual(['api', 'GET', '/api/v1/items', 'network']);
    expect(options.level).toBe('warning');
    expect(options.tags.request_failure_class).toBe('transient');
    vi.doUnmock('@sentry/react');
  });

  it('does not capture a canceled/aborted request', async () => {
    const { freshModule, Sentry } = await importInitializedSentryClient();

    const canceled = new Error('canceled');
    canceled.name = 'CanceledError';
    canceled.code = 'ERR_CANCELED';
    freshModule.captureRequestFailure({ error: canceled, method: 'get', url: '/api/v1/items' });

    const aborted = new Error('The operation was aborted');
    aborted.name = 'AbortError';
    freshModule.captureRequestFailure({ error: aborted, method: 'get', url: '/api/v1/items/2' });

    expect(Sentry.captureException).not.toHaveBeenCalled();
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

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

let initialized = false;
let sentryModule = null;
let initPromise = null;

export const parseBooleanFlag = (value, fallback = false) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
};

const resolveSurfaceDsn = (env, surface) => {
  if (surface === 'pos') return env.VITE_SENTRY_DSN_POS || '';
  if (surface === 'store') return env.VITE_SENTRY_DSN_STORE || '';
  if (surface === 'skupervisor') return env.VITE_SENTRY_DSN_SKUPERVISOR || '';
  return env.VITE_SENTRY_DSN || '';
};

// Distributed tracing needs `sentry-trace`/`baggage` headers attached to
// outgoing requests, but only to *our* backend -- attaching them to every
// request (third-party maps/asset CDNs, PostHog, payment iframes) would leak
// trace info and break strict CORS preflight on hosts that don't expect the
// extra headers. Sentry's own unconfigured default (`['localhost', /^\//]`)
// only covers same-origin relative paths, which misses two real cases here:
// the storefront's custom-merchant-domain requests (still same-origin, but
// worth being explicit about) and the POS Electron shell, which resolves an
// absolute `backendOrigin` that isn't `window.location.origin` at all (see
// utils/runtimeConfig.js). `VITE_SENTRY_TRACE_PROPAGATION_TARGETS` lets each
// deploy override explicitly; otherwise this falls back to same-origin plus
// VITE_API_URL when that's set to an absolute URL.
export const resolveTracePropagationTargets = (env = import.meta.env) => {
  const configured = String(env.VITE_SENTRY_TRACE_PROPAGATION_TARGETS || '').trim();
  if (configured) {
    return configured.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  const targets = [];
  if (typeof window !== 'undefined' && window.location?.origin) {
    targets.push(window.location.origin);
  }
  const apiUrl = String(env.VITE_API_URL || '').trim();
  if (/^https?:\/\//i.test(apiUrl)) {
    targets.push(apiUrl);
  }
  return targets;
};

export const resolveSentryBrowserConfig = (env = import.meta.env, surfaceOverride = '') => {
  const surface = String(surfaceOverride || env.VITE_APP_SURFACE || 'skupervisor').trim().toLowerCase();
  const enabled = parseBooleanFlag(env.VITE_SENTRY_ENABLED, false);
  const dsn = String(resolveSurfaceDsn(env, surface)).trim();

  return {
    enabled,
    dsn,
    active: enabled && Boolean(dsn),
    surface,
    environment: String(env.VITE_SENTRY_ENVIRONMENT || env.MODE || 'development').trim(),
    release: String(env.VITE_SENTRY_RELEASE || env.VITE_BUILD_STAMP || '').trim(),
    tracesSampleRate: Number.parseFloat(env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0') || 0,
    replaysSessionSampleRate: Number.parseFloat(env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE || '0') || 0,
    replaysOnErrorSampleRate: Number.parseFloat(env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE || '0') || 0,
    debug: parseBooleanFlag(env.VITE_SENTRY_DEBUG, false),
    tracePropagationTargets: resolveTracePropagationTargets(env)
  };
};

export const sanitizeSentryEvent = (event) => {
  if (!event || typeof event !== 'object') return event;
  return {
    ...event,
    user: event.user
      ? {
        id: event.user.id,
        username: undefined,
        email: undefined,
        ip_address: undefined
      }
      : event.user,
    request: event.request
      ? {
        ...event.request,
        cookies: undefined,
        headers: undefined,
        data: undefined
      }
      : event.request
  };
};

// Vite dev-only test trigger: exposes window.__sentryTestError() so a DSN
// can be proven end-to-end from the browser console without shipping a
// trigger to production. Registered on every initBrowserSentry() call
// (regardless of whether Sentry ends up active) so it's always discoverable
// in a dev build, and gives a clear message instead of silently no-oping
// when Sentry isn't enabled/configured.
const registerDevSentryTestTrigger = (config, logger) => {
  if (typeof window === 'undefined') return;
  if (!import.meta.env?.DEV) return;

  window.__sentryTestError = () => {
    const error = new Error('[Sentry] Test error triggered via window.__sentryTestError()');
    if (!config.active) {
      logger.warn?.('[Sentry] __sentryTestError(): Sentry is not active (VITE_SENTRY_ENABLED or the surface DSN is unset) -- nothing was sent.');
      return error;
    }
    withSentry((Sentry) => Sentry.captureException(error));
    logger.info?.('[Sentry] Test error captured -- check the configured DSN project.');
    return error;
  };
};

export const initBrowserSentry = ({ env = import.meta.env, surface, logger = console } = {}) => {
  const config = resolveSentryBrowserConfig(env, surface);
  registerDevSentryTestTrigger(config, logger);

  if (!config.enabled) {
    return { active: false, reason: 'disabled' };
  }

  if (!config.dsn) {
    logger.warn?.(`[Sentry] VITE_SENTRY_ENABLED=true but no DSN is configured for surface "${config.surface}"; continuing without Sentry.`);
    return { active: false, reason: 'missing_dsn' };
  }

  if (initialized) {
    return { active: true, reason: 'already_initialized' };
  }

  initPromise = import('@sentry/react')
    .then((Sentry) => {
      // Sentry.init's own default integrations
      // (InboundFilters/BrowserApiErrors/GlobalHandlers/etc, see
      // Sentry.getDefaultIntegrations()) do NOT include tracing or replay --
      // both must be added explicitly here or tracesSampleRate/replay*Rate
      // above are silently inert despite being fully wired through env vars,
      // docker-compose, and CI. This was verified missing against the
      // installed @sentry/browser build before this fix.
      const integrations = [];
      if (config.tracesSampleRate > 0) {
        // NOTE: deliberately plain browserTracingIntegration(), not
        // reactRouterBrowserTracingIntegration(). The router-aware variant
        // forces instrumentNavigation:false on the base integration and only
        // re-enables navigation spans through Sentry.wrapReactRouterRouting()
        // wrapping <Routes> -- confirmed against the installed SDK
        // (@sentry/react/build/esm/reactrouter-compat-utils/instrumentation.js).
        // That wrapper needs the lazily-imported SDK synchronously at render
        // time, which conflicts with this module's zero-cost-when-disabled
        // lazy-import design, and tracesSampleRate is 0 in every configured
        // environment today. Registering the router-aware integration
        // without the wrapper would silently produce ZERO navigation
        // transactions (worse than this plain fallback), so route-pattern
        // transaction naming is deferred rather than shipped half-wired.
        // Route identification independent of tracing lives in
        // setSentryRoute() below (a `route` tag + breadcrumb on every event).
        integrations.push(Sentry.browserTracingIntegration());
      }
      if (config.replaysSessionSampleRate > 0 || config.replaysOnErrorSampleRate > 0) {
        integrations.push(Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true
        }));
      }

      Sentry.init({
        dsn: config.dsn,
        environment: config.environment,
        release: config.release || undefined,
        tracesSampleRate: config.tracesSampleRate,
        replaysSessionSampleRate: config.replaysSessionSampleRate,
        replaysOnErrorSampleRate: config.replaysOnErrorSampleRate,
        debug: config.debug,
        integrations,
        tracePropagationTargets: config.tracePropagationTargets,
        beforeSend: sanitizeSentryEvent,
        initialScope: {
          tags: {
            surface: config.surface
          }
        }
      });

      sentryModule = Sentry;
      initialized = true;
      logger.info?.(`[Sentry] browser error tracking enabled for ${config.surface}`);
      return Sentry;
    })
    .catch((error) => {
      logger.warn?.('[Sentry] failed to initialize browser error tracking', error);
      initPromise = null;
      return null;
    });

  return { active: true, reason: 'enabled' };
};

// Shared "run this against the Sentry module once it's available" helper --
// mirrors analyticsClient.js's withPostHog(). Sentry is lazy-imported (see
// initBrowserSentry above), so a call made before the import resolves must
// queue onto initPromise instead of silently no-oping.
const withSentry = (callback) => {
  if (initialized && sentryModule) {
    callback(sentryModule);
    return;
  }
  if (initPromise) {
    initPromise.then((Sentry) => Sentry && callback(Sentry)).catch(() => {});
  }
};

export const captureRenderError = (error, info = {}) => {
  withSentry((Sentry) => Sentry.captureException?.(error, {
    contexts: {
      react: {
        componentStack: info.componentStack
      }
    }
  }));
};

// The backend already echoes `x-request-id`/`x-trace-id` on every response
// (backend/src/middleware/requestContext.js, exposed via CORS
// exposedHeaders) and tags its own Sentry events with the same id
// (sentryRequestContext in backend/src/config/sentry.js). Tagging it here
// too means a frontend error and the backend error that caused it can be
// joined by request id even for requests that fall outside the trace
// sample rate, without needing a full trace. This is a lighter-weight
// single-tab correlation than distributed tracing above, not a duplicate
// of it -- a request id is one string; a trace covers a whole click.
export const tagRequestFailureContext = ({ requestId, url, status } = {}) => {
  if (!requestId) return;

  withSentry((Sentry) => {
    Sentry.setContext?.('failed_request', { request_id: requestId, url, status });
    Sentry.addBreadcrumb?.({
      category: 'http',
      message: `Request failed: ${status || '?'} ${url || ''}`.trim(),
      level: 'error',
      data: { request_id: requestId, status }
    });
  });
};

// Matches the PII posture already enforced by sanitizeSentryEvent (id only,
// never email/username) and mirrors analyticsClient.js's
// identifyAnalyticsUser/setAnalyticsContext/resetAnalyticsIdentity shape so
// the two clients stay easy to reason about side by side. Call from the same
// identity-sync flow that already calls the analytics equivalents (see
// AnalyticsIdentitySync in each app's main.jsx) -- do not add a second
// getCurrentUser() poll just for Sentry.

/**
 * Identifies the current person on Sentry events without ever sending
 * direct contact info. Call on sign-in; pair with resetSentryIdentity() on
 * sign-out. `role` is attached as a tag, never as a user field, since
 * Sentry's `user` object is what sanitizeSentryEvent scrubs down to `id`.
 */
export const identifySentryUser = ({ id, role } = {}) => {
  if (!id) return;
  withSentry((Sentry) => {
    Sentry.setUser({ id: String(id) });
    if (role) Sentry.setTag('user_role', role);
  });
};

/**
 * Registers tenant/store/business-mode/location as tags on every subsequent
 * event from this session, so issues can be filtered/grouped by tenant in
 * Sentry the same way setAnalyticsContext groups PostHog events.
 */
export const setSentryContext = ({ tenantId, storeSlug, businessMode, locationId } = {}) => {
  withSentry((Sentry) => {
    if (tenantId) Sentry.setTag('tenant_id', String(tenantId));
    if (storeSlug) Sentry.setTag('store_slug', storeSlug);
    if (businessMode) Sentry.setTag('business_mode', businessMode);
    if (locationId) Sentry.setTag('location_id', String(locationId));
  });
};

export const resetSentryIdentity = () => {
  withSentry((Sentry) => {
    Sentry.setUser(null);
    Sentry.setTag('user_role', undefined);
    Sentry.setTag('tenant_id', undefined);
    Sentry.setTag('store_slug', undefined);
    Sentry.setTag('business_mode', undefined);
    Sentry.setTag('location_id', undefined);
  });
};

/**
 * Tags the current route on every subsequent event and drops a navigation
 * breadcrumb, so an error report says which page it happened on even when
 * tracesSampleRate is 0 (and reactRouterBrowserTracingIntegration therefore
 * isn't registered). Call from the same pathname effect that already calls
 * capturePageview() -- no new effect needed.
 */
export const setSentryRoute = (pathname) => {
  if (!pathname) return;
  withSentry((Sentry) => {
    Sentry.setTag('route', pathname);
    Sentry.addBreadcrumb({
      category: 'navigation',
      message: `Navigated to ${pathname}`,
      level: 'info',
      data: { pathname }
    });
  });
};

// Collapses numeric/UUID/Mongo-style id path segments so
// /api/v1/items/123 and /api/v1/items/456 fingerprint as the same endpoint
// instead of each becoming its own Sentry issue.
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONGO_ID_SEGMENT = /^[0-9a-f]{24}$/i;
const NUMERIC_SEGMENT = /^\d+$/;

export const normalizeRequestUrl = (url) => String(url || '')
  .split('?')[0]
  .split('#')[0]
  .split('/')
  .map((segment) => (
    NUMERIC_SEGMENT.test(segment) || UUID_SEGMENT.test(segment) || MONGO_ID_SEGMENT.test(segment)
      ? ':id'
      : segment
  ))
  .join('/');

// A backend outage or a broken endpoint can otherwise generate one Sentry
// event per failed request; this cooldown + session cap keeps a single
// grouped issue instead of burning the project's event quota. Both are
// module-level (reset on page reload), matching the rest of this module's
// per-tab-session state (`initialized`, `sentryModule`).
const REQUEST_FAILURE_COOLDOWN_MS = 60_000;
const MAX_REQUEST_FAILURE_EVENTS_PER_SESSION = 20;
const requestFailureLastSentAt = new Map();
let requestFailureEventCount = 0;

/**
 * Captures a genuine final API failure (5xx, or a network/no-response
 * error) as a Sentry event, complementing tagRequestFailureContext's
 * breadcrumb-only correlation above. Deliberately excludes 4xx responses --
 * those are expected validation/permission/auth outcomes (401 has its own
 * refresh-and-retry path upstream in api.js, 422 is validation), not bugs.
 * Call this from the same trailing axios interceptor that already calls
 * tagRequestFailureContext, once a request has failed past every retry.
 */
export const captureRequestFailure = ({ error, method, url, status, requestId } = {}) => {
  const hasResponse = status !== undefined && status !== null;
  if (hasResponse && Number(status) < 500) return;

  const normalizedUrl = normalizeRequestUrl(url);
  const fingerprint = ['api', String(method || 'GET').toUpperCase(), normalizedUrl, hasResponse ? String(status) : 'network'];
  const fingerprintKey = fingerprint.join('|');

  const now = Date.now();
  const lastSentAt = requestFailureLastSentAt.get(fingerprintKey);
  if (lastSentAt !== undefined && now - lastSentAt < REQUEST_FAILURE_COOLDOWN_MS) return;
  if (requestFailureEventCount >= MAX_REQUEST_FAILURE_EVENTS_PER_SESSION) return;

  requestFailureLastSentAt.set(fingerprintKey, now);
  requestFailureEventCount += 1;

  withSentry((Sentry) => {
    Sentry.captureException(error || new Error(`Request failed: ${method || 'GET'} ${normalizedUrl}`), {
      fingerprint,
      contexts: {
        failed_request: { request_id: requestId, url, status }
      },
      tags: {
        request_method: method ? String(method).toUpperCase() : undefined,
        request_status: hasResponse ? String(status) : 'network'
      }
    });
  });
};

export const isBrowserSentryInitialized = () => initialized;

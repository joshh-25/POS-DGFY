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
// `extraTargets` exists because this resolver only sees build-time
// import.meta.env, but the POS Electron shell resolves its backend origin at
// *runtime* from the preload bridge (see utils/runtimeConfig.js). Without it,
// the desktop shell would silently never propagate trace headers.
export const resolveTracePropagationTargets = (env = import.meta.env, extraTargets = []) => {
  const normalize = (list) => {
    const seen = new Set();
    return list
      .map((entry) => String(entry ?? '').trim())
      // A custom-protocol Electron window reports window.location.origin as
      // the literal string "null"; propagating that as a match target is
      // meaningless noise.
      .filter((entry) => entry && entry !== 'null')
      .filter((entry) => (seen.has(entry) ? false : seen.add(entry)));
  };

  const configured = String(env.VITE_SENTRY_TRACE_PROPAGATION_TARGETS || '').trim();
  if (configured) {
    return normalize([...configured.split(','), ...extraTargets]);
  }
  const targets = [];
  if (typeof window !== 'undefined' && window.location?.origin) {
    targets.push(window.location.origin);
  }
  const apiUrl = String(env.VITE_API_URL || '').trim();
  if (/^https?:\/\//i.test(apiUrl)) {
    targets.push(apiUrl);
  }
  return normalize([...targets, ...extraTargets]);
};

// Mirrors the backend's resolveTracesSampleRate, and for the same reason:
// Sentry's hasSpansEnabled() is `tracesSampleRate != null || !!tracesSampler`,
// so a literal 0 enables spans and then forces a *negative* sampling
// decision, which the browser propagates outward as
// `sentry-trace: <id>-<id>-0`. The backend inherits that "no" and can never
// sample. Omitting the key entirely gives tracing-without-performance: trace
// ids still propagate with a deferred decision, errors still carry
// contexts.trace.trace_id, and zero transactions are billed.
export const resolveTracesSampleRate = (rawValue) => {
  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 1);
};

// Three modes, not a boolean:
//   'off'       -- emergency kill switch only; no trace headers at all.
//   'propagate' -- default. Headers propagate, no transactions emitted.
//   'spans'     -- a positive sample rate was configured; real perf data.
// The kill switch defaults ON deliberately, the opposite polarity to
// VITE_SENTRY_ENABLED: if the build arg is ever mis-threaded and arrives
// empty, the failure mode should be "tracing works", not "tracing silently
// dead". It exists so a single variable plus a frontend rebuild is a complete
// rollback.
export const resolveTracingMode = (env = import.meta.env) => {
  if (!parseBooleanFlag(env.VITE_SENTRY_TRACE_PROPAGATION_ENABLED, true)) return 'off';
  return resolveTracesSampleRate(env.VITE_SENTRY_TRACES_SAMPLE_RATE) == null ? 'propagate' : 'spans';
};

// Mirrors backend/src/config/sentry.js's resolveSentryEnvironment: `MODE` is
// "production" for every `vite build` regardless of which real environment
// (DEV/STAGING/BETA/PROD) produced it, so falling back to it here would
// silently file an unconfigured environment's errors under "production" the
// moment VITE_SENTRY_ENABLED flips on without VITE_SENTRY_ENVIRONMENT also
// being set (this is exactly how BETA is configured today). Only fall back
// to MODE when it is NOT "production"; otherwise resolve to a value that is
// obviously wrong in the Sentry UI and prompts a fix, rather than quietly
// polluting the real PROD environment's data.
export const resolveSentryEnvironment = (env) => {
  const explicit = String(env.VITE_SENTRY_ENVIRONMENT || '').trim();
  if (explicit) return explicit;
  const mode = String(env.MODE || '').trim();
  if (mode && mode !== 'production') return mode;
  return mode === 'production' ? 'unknown' : 'development';
};

export const resolveSentryBrowserConfig = (env = import.meta.env, surfaceOverride = '', extraTracePropagationTargets = []) => {
  const surface = String(surfaceOverride || env.VITE_APP_SURFACE || 'skupervisor').trim().toLowerCase();
  const enabled = parseBooleanFlag(env.VITE_SENTRY_ENABLED, false);
  const dsn = String(resolveSurfaceDsn(env, surface)).trim();

  return {
    enabled,
    dsn,
    active: enabled && Boolean(dsn),
    surface,
    environment: resolveSentryEnvironment(env),
    release: String(env.VITE_SENTRY_RELEASE || env.VITE_BUILD_STAMP || '').trim(),
    tracingMode: resolveTracingMode(env),
    tracesSampleRate: resolveTracesSampleRate(env.VITE_SENTRY_TRACES_SAMPLE_RATE),
    replaysSessionSampleRate: Number.parseFloat(env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE || '0') || 0,
    replaysOnErrorSampleRate: Number.parseFloat(env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE || '0') || 0,
    debug: parseBooleanFlag(env.VITE_SENTRY_DEBUG, false),
    tracePropagationTargets: resolveTracePropagationTargets(env, extraTracePropagationTargets)
  };
};

// Deliberately duplicated from backend/src/config/sentry.js rather than
// shared: there is no build seam between frontend/src and backend/src, and
// this copy has to tree-shake into the lazily-imported Sentry chunk.
//
// Every pattern is anchored on a distinctive prefix or an explicit
// key=/secret: assignment. There is no generic "long alphanumeric string"
// rule on purpose -- that would eat order ids, SKUs and store slugs, which
// are what make an issue diagnosable.
const SECRET_PATTERNS = [
  [/\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g, '[redacted:openai-key]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted:jwt]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [redacted]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[redacted:aws-key]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[redacted:github-token]'],
  // Any scheme, not just http(s) -- credentialed connection strings show up
  // in error text from more protocols than the web ones.
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@'],
  [/\bhttps?:\/\/[0-9a-f]{32}@[^\s]+/gi, '[redacted:sentry-dsn]'],
  [
    /((?:api[_-]?key|apikey|access[_-]?token|client[_-]?secret|password|secret)\s*[=:]\s*)(["']?)[^\s"',;)]{8,}\2/gi,
    '$1[redacted]'
  ]
];

const MAX_SCRUBBED_TEXT_LENGTH = 50_000;

export const redactSecretsInText = (value) => {
  if (typeof value !== 'string' || !value) return value;
  const input = value.length > MAX_SCRUBBED_TEXT_LENGTH
    ? value.slice(0, MAX_SCRUBBED_TEXT_LENGTH)
    : value;
  return SECRET_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    input
  );
};

// Only free-text fields are rewritten. exception.type, .stacktrace,
// .mechanism and event.fingerprint are untouched, which keeps grouping intact
// -- including captureRequestFailure's explicit fingerprint below.
export const scrubEventText = (event) => {
  if (!event || typeof event !== 'object') return event;
  const scrubbed = { ...event };

  if (typeof scrubbed.message === 'string') {
    scrubbed.message = redactSecretsInText(scrubbed.message);
  }

  if (Array.isArray(scrubbed.exception?.values)) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((entry) => (
        entry && typeof entry.value === 'string'
          ? { ...entry, value: redactSecretsInText(entry.value) }
          : entry
      ))
    };
  }

  if (scrubbed.logentry && typeof scrubbed.logentry === 'object') {
    scrubbed.logentry = {
      ...scrubbed.logentry,
      message: redactSecretsInText(scrubbed.logentry.message),
      params: Array.isArray(scrubbed.logentry.params)
        ? scrubbed.logentry.params.map((param) => redactSecretsInText(param))
        : scrubbed.logentry.params
    };
  }

  if (Array.isArray(scrubbed.breadcrumbs)) {
    scrubbed.breadcrumbs = scrubbed.breadcrumbs.map((crumb) => (
      crumb && typeof crumb.message === 'string'
        ? { ...crumb, message: redactSecretsInText(crumb.message) }
        : crumb
    ));
  }

  return scrubbed;
};

export const sanitizeSentryEvent = (rawEvent) => {
  if (!rawEvent || typeof rawEvent !== 'object') return rawEvent;
  const event = scrubEventText(rawEvent);
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

export const initBrowserSentry = ({
  env = import.meta.env,
  surface,
  logger = console,
  extraTracePropagationTargets = []
} = {}) => {
  const config = resolveSentryBrowserConfig(env, surface, extraTracePropagationTargets);
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
      if (config.tracingMode !== 'off') {
        // browserTracingIntegration is what registers
        // instrumentOutgoingRequests(), and that call sits in afterAllSetup()
        // OUTSIDE any hasSpansEnabled() guard -- verified against the
        // installed build. So registering it is what attaches
        // `sentry-trace`/`baggage` to fetch/XHR, and that works with no
        // sampling at all. Gating registration on tracesSampleRate > 0 (the
        // previous behaviour) meant the default config propagated nothing and
        // a browser error could never be correlated with its backend error.
        //
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
        integrations.push(Sentry.browserTracingIntegration(
          config.tracingMode === 'spans'
            ? {}
            : {
              // Propagation-only: these each register a PerformanceObserver,
              // which is real CPU on low-end POS hardware and pointless when
              // no spans are emitted.
              enableInp: false,
              enableLongTask: false,
              enableLongAnimationFrame: false,
              markBackgroundSpan: false
              // instrumentPageLoad / instrumentNavigation MUST stay true.
              // Those handlers are what call setPropagationContext() with a
              // fresh trace id per navigation; disabling them would pin one
              // trace id to an entire tab lifetime, so a POS terminal open
              // for a 10-hour shift would hang thousands of requests and
              // every error off a single unusable trace. They cost nothing
              // here -- with spans disabled, startIdleSpan() returns a
              // SentryNonRecordingSpan and no transaction is sent.
            }
        ));
      }
      if (config.replaysSessionSampleRate > 0 || config.replaysOnErrorSampleRate > 0) {
        integrations.push(Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true
        }));
      }

      const initOptions = {
        dsn: config.dsn,
        environment: config.environment,
        release: config.release || undefined,
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
      };

      // The key must be ABSENT, not 0 -- see resolveTracesSampleRate above.
      // Passing 0 here would make every outgoing `sentry-trace` header end in
      // `-0`, permanently forcing the backend's sampler to inherit "no".
      if (config.tracingMode === 'spans') {
        initOptions.tracesSampleRate = config.tracesSampleRate;
      }

      Sentry.init(initOptions);

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

// 502/503/504 (and a bare no-response failure) are treated as "transient":
// symptomatic of a deploy window or a single gateway/worker restart rather
// than a bug. A 500 or any other 5xx is classified "server" -- a genuine
// application error. This only affects the `level` and a searchable tag on
// the emitted event, never the fingerprint (see the comment on `fingerprint`
// below for why grouping must not change).
const TRANSIENT_REQUEST_STATUSES = new Set([502, 503, 504]);

export const classifyRequestFailure = ({ status } = {}) => (
  (status === undefined || status === null || TRANSIENT_REQUEST_STATUSES.has(Number(status)))
    ? 'transient'
    : 'server'
);

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
  // A canceled/aborted request is a caller decision (component unmount, a
  // superseded request), not a failure -- covers all three call sites
  // (api.js's trailing interceptor, requestJson.js's two paths) in one
  // place rather than requiring every caller to filter it out first.
  const errorName = String(error?.name || '');
  if (errorName === 'CanceledError' || errorName === 'AbortError' || error?.code === 'ERR_CANCELED') return;

  const hasResponse = status !== undefined && status !== null;
  if (hasResponse && Number(status) < 500) return;

  const normalizedUrl = normalizeRequestUrl(url);
  // Fingerprint is intentionally UNCHANGED by the transient/server
  // classification below. Sentry groups solely on this array; the status
  // code is already its 4th element, so 502/503/504/network already group
  // separately from 500 today. Adding a classification token here would
  // orphan every existing issue built on the current fingerprint (a new
  // hash starts a new issue, losing assignees/ignore-state/history) and
  // would reset the cooldown Map below, which is keyed off this same
  // fingerprint -- the first minute after such a change would emit MORE
  // events, not fewer. `level` and the tag are how classification is
  // surfaced instead.
  const fingerprint = ['api', String(method || 'GET').toUpperCase(), normalizedUrl, hasResponse ? String(status) : 'network'];
  const fingerprintKey = fingerprint.join('|');

  const now = Date.now();
  const lastSentAt = requestFailureLastSentAt.get(fingerprintKey);
  if (lastSentAt !== undefined && now - lastSentAt < REQUEST_FAILURE_COOLDOWN_MS) return;
  if (requestFailureEventCount >= MAX_REQUEST_FAILURE_EVENTS_PER_SESSION) return;

  requestFailureLastSentAt.set(fingerprintKey, now);
  requestFailureEventCount += 1;

  const failureClass = classifyRequestFailure({ status });

  withSentry((Sentry) => {
    Sentry.captureException(error || new Error(`Request failed: ${method || 'GET'} ${normalizedUrl}`), {
      fingerprint,
      level: failureClass === 'transient' ? 'warning' : 'error',
      contexts: {
        failed_request: { request_id: requestId, url, status }
      },
      tags: {
        request_method: method ? String(method).toUpperCase() : undefined,
        request_status: hasResponse ? String(status) : 'network',
        request_failure_class: failureClass
      }
    });
  });
};

export const isBrowserSentryInitialized = () => initialized;

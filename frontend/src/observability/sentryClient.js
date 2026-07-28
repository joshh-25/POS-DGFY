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

export const initBrowserSentry = ({ env = import.meta.env, surface, logger = console } = {}) => {
  const config = resolveSentryBrowserConfig(env, surface);

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

export const captureRenderError = (error, info = {}) => {
  const captureWith = (Sentry) => Sentry?.captureException?.(error, {
    contexts: {
      react: {
        componentStack: info.componentStack
      }
    }
  });

  if (initialized && sentryModule) {
    captureWith(sentryModule);
    return;
  }

  if (initPromise) {
    initPromise.then(captureWith).catch(() => {});
  }
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

  const applyTags = (Sentry) => {
    Sentry?.setContext?.('failed_request', { request_id: requestId, url, status });
    Sentry?.addBreadcrumb?.({
      category: 'http',
      message: `Request failed: ${status || '?'} ${url || ''}`.trim(),
      level: 'error',
      data: { request_id: requestId, status }
    });
  };

  if (initialized && sentryModule) {
    applyTags(sentryModule);
    return;
  }
  if (initPromise) {
    initPromise.then(applyTags).catch(() => {});
  }
};

export const isBrowserSentryInitialized = () => initialized;

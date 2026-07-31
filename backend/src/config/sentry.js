import * as Sentry from '@sentry/node';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

let initialized = false;

export const parseBooleanFlag = (value, fallback = false) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
};

export const resolveSentryConfig = (env = process.env) => {
  const enabled = parseBooleanFlag(env.SENTRY_ENABLED, false);
  const dsn = String(env.SENTRY_BACKEND_DSN || env.SENTRY_DSN || '').trim();

  return {
    enabled,
    dsn,
    active: enabled && Boolean(dsn),
    environment: String(env.SENTRY_ENVIRONMENT || env.NODE_ENV || 'development').trim(),
    release: String(env.SENTRY_RELEASE || env.RELEASE_TARGET_SHA || env.GITHUB_SHA || '').trim(),
    tracesSampleRate: Number.parseFloat(env.SENTRY_TRACES_SAMPLE_RATE || '0') || 0,
    sendDefaultPii: parseBooleanFlag(env.SENTRY_SEND_DEFAULT_PII, false),
    debug: parseBooleanFlag(env.SENTRY_DEBUG, false)
  };
};

export const redactSensitiveData = (value) => {
  if (!value || typeof value !== 'object') return value;
  const sensitiveKeyPattern = /(authorization|cookie|token|secret|password|pin|otp|email|phone|companytoken|company_token|auth|session)/i;

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveData(entry));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKeyPattern.test(key) ? '[Filtered]' : redactSensitiveData(entry)
    ])
  );
};

export const sanitizeSentryEvent = (event) => {
  if (!event || typeof event !== 'object') return event;

  return {
    ...event,
    request: event.request
      ? {
        ...event.request,
        cookies: undefined,
        data: event.request.data ? redactSensitiveData(event.request.data) : undefined,
        headers: event.request.headers ? redactSensitiveData(event.request.headers) : undefined
      }
      : event.request,
    extra: event.extra ? redactSensitiveData(event.extra) : event.extra,
    contexts: event.contexts ? redactSensitiveData(event.contexts) : event.contexts,
    user: event.user
      ? {
        id: event.user.id,
        username: undefined,
        email: undefined,
        ip_address: undefined
      }
      : event.user
  };
};

export const initSentry = ({ env = process.env, logger = console } = {}) => {
  const config = resolveSentryConfig(env);

  if (!config.enabled) {
    return { active: false, reason: 'disabled' };
  }

  if (!config.dsn) {
    logger.warn?.('[Sentry] SENTRY_ENABLED=true but no backend DSN is configured; continuing without Sentry.');
    return { active: false, reason: 'missing_dsn' };
  }

  if (initialized) {
    return { active: true, reason: 'already_initialized' };
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release || undefined,
    tracesSampleRate: config.tracesSampleRate,
    sendDefaultPii: config.sendDefaultPii,
    debug: config.debug,
    // express/mysql2 integrations patch those modules' exports at import
    // time (spans for routes/queries) -- they only work if Sentry.init()
    // runs before express/mysql2 are first imported anywhere in the
    // process. This is why initSentry() must be called from
    // src/instrument.js via `node --import`, not from server.js after its
    // ~65 application imports have already loaded both. httpIntegration
    // (request isolation, see sentryRequestContext below) is a default and
    // unaffected by this ordering.
    integrations: [
      Sentry.expressIntegration(),
      Sentry.mysql2Integration()
    ],
    beforeSend: sanitizeSentryEvent,
    initialScope: {
      tags: {
        service: 'backend'
      }
    }
  });

  initialized = true;
  logger.info?.('[Sentry] backend error tracking enabled');
  return { active: true, reason: 'enabled' };
};

export const sentryRequestContext = (req, _res, next) => {
  if (!initialized) return next();

  // Node >=22.12 + Sentry.init() running before app.listen() (both true
  // here) already gives every incoming request its own isolation scope
  // automatically via AsyncLocalStorage -- see
  // https://docs.sentry.io/platforms/javascript/guides/express/install/lightweight.
  // withIsolationScope() here is Sentry's documented explicit pattern on
  // top of that: it doesn't depend on the Node-version threshold holding in
  // every environment this runs in (local dev, a future Node change), and
  // it's what makes the fork explicit rather than implicit. `next()` runs
  // synchronously inside the callback, which is what keeps every
  // downstream middleware/route handler within the forked scope.
  return Sentry.withIsolationScope(() => {
    Sentry.setTag('service', 'backend');
    Sentry.setTag('request_id', req.requestId || null);
    Sentry.setTag('trace_id', req.traceId || req.requestId || null);
    Sentry.setTag('surface', req.headers?.['x-dgfy-surface'] || req.headers?.['x-app-surface'] || null);
    Sentry.setUser(req.user?.user_id || req.user?.id ? { id: String(req.user.user_id || req.user.id) } : null);

    if (req.tenant?.id || req.tenantId) {
      Sentry.setContext('tenant', {
        id: String(req.tenant?.id || req.tenantId)
      });
    }

    return next();
  });
};

export const sentryErrorHandler = (err, req, res, next) => {
  if (!initialized) return next(err);
  return Sentry.expressErrorHandler({
    shouldHandleError(error) {
      const statusCode = Number(error?.statusCode || error?.status || res?.statusCode || 500);
      return statusCode >= 500;
    }
  })(err, req, res, next);
};

export const isSentryInitialized = () => initialized;

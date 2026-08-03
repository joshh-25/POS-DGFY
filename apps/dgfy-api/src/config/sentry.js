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

// `tracesSampleRate` is deliberately tri-state, and the difference is not
// cosmetic. Sentry's hasSpansEnabled() is `tracesSampleRate != null ||
// !!tracesSampler`, so passing a literal 0 turns span support ON and then
// forces a negative sampling decision on every trace -- which the SDK
// propagates outward as `sentry-trace: <id>-<id>-0`. Anything downstream that
// inherits that decision can then never sample, silently.
//
// Omitting the key entirely is a different mode: "Tracing without
// Performance". Trace ids still propagate and still land on error events
// (contexts.trace.trace_id), the sampling decision stays deferred, and zero
// transactions are billed. That is the mode we want by default -- it is all
// that FE->BE error correlation needs, because errors are never sampled out.
//
// So: null means TwP, a positive number means real span sampling. Never 0.
export const resolveTracesSampleRate = (rawValue) => {
  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 1);
};

// The backend image hard-sets NODE_ENV=production (see
// infrastructure/docker/dgfy-api/Dockerfile) on every environment -- dev,
// staging, beta and prod alike -- because that's what npm/Express expect for
// runtime behavior, not because the box is actually production. Falling back
// to NODE_ENV here would silently file a dev or staging server's errors
// under `environment: "production"` the moment SENTRY_ENABLED is flipped on
// without also setting SENTRY_ENVIRONMENT. Only fall back to NODE_ENV when
// it is NOT "production"; otherwise resolve to a value ("unknown") that is
// obviously wrong in the Sentry UI and prompts an operator to set the real
// one, rather than quietly polluting the production environment's data.
export const resolveSentryEnvironment = (env = process.env) => {
  const explicit = String(env.SENTRY_ENVIRONMENT || '').trim();
  if (explicit) return explicit;
  const nodeEnv = String(env.NODE_ENV || '').trim();
  if (nodeEnv && nodeEnv !== 'production') return nodeEnv;
  return nodeEnv === 'production' ? 'unknown' : 'development';
};

export const resolveSentryConfig = (env = process.env) => {
  const enabled = parseBooleanFlag(env.SENTRY_ENABLED, false);
  const dsn = String(env.SENTRY_BACKEND_DSN || env.SENTRY_DSN || '').trim();

  return {
    enabled,
    dsn,
    active: enabled && Boolean(dsn),
    environment: resolveSentryEnvironment(env),
    release: String(env.SENTRY_RELEASE || env.RELEASE_TARGET_SHA || env.GITHUB_SHA || '').trim(),
    tracesSampleRate: resolveTracesSampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
    sendDefaultPii: parseBooleanFlag(env.SENTRY_SEND_DEFAULT_PII, false),
    debug: parseBooleanFlag(env.SENTRY_DEBUG, false)
  };
};

// Endpoints whose transactions carry no diagnostic value but arrive at a
// constant rate: container healthchecks and the Prometheus scrape.
const ZERO_RATE_ROUTE_PATTERN = /(^|\/)(health|healthz|ready|metrics)$/i;
// The POS terminal polls this every 12s per open terminal (see
// ONLINE_ORDER_POLL_INTERVAL_MS in frontend/src/features/pos/pages/TerminalPage.jsx).
// Twenty terminals over a 12h day is ~72k requests; at the base rate that
// would swamp every other transaction in the project.
const POLL_ROUTE_PATTERN = /(^|\/)pos\/incoming-orders$/i;
const POLL_SAMPLE_RATE = 0.01;

// Exported separately from initSentry so it can be unit-tested without
// standing up the SDK. v10 hands the sampler a SamplingContext of
// { name, attributes, parentSampled, parentSampleRate, inheritOrSampleWith }.
export const makeTracesSampler = (baseRate) => (samplingContext = {}) => {
  const { name, attributes, inheritOrSampleWith } = samplingContext;
  // `http.route` is the parameterized path, so it survives ids in the URL.
  const route = String(attributes?.['http.route'] || name || '');
  const method = String(attributes?.['http.request.method'] || '').toUpperCase();
  const path = route.replace(/^[A-Z]+\s+/, '').split('?')[0];

  if (method === 'OPTIONS') return 0;
  if (ZERO_RATE_ROUTE_PATTERN.test(path)) return 0;
  if (POLL_ROUTE_PATTERN.test(path)) return POLL_SAMPLE_RATE;

  // Honour an upstream decision when the browser made one; fall back to the
  // configured base rate when it did not (the TwP case).
  return typeof inheritOrSampleWith === 'function'
    ? inheritOrSampleWith(baseRate)
    : baseRate;
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

// redactSensitiveData above is key-name based: it can only redact a secret
// that sits under a recognisable key. A secret pasted *inside* a message
// string is invisible to it, which is exactly how an OpenAI API key ended up
// as a Sentry issue *title* -- the openai SDK embeds the key it tried to use
// in its own 401 error text, and nothing scrubbed exception values.
//
// Every pattern below is anchored on a distinctive prefix or an explicit
// key=/secret: assignment. There is deliberately no generic "long
// alphanumeric string" rule: that would eat order ids, SKUs, tenant slugs and
// MySQL error text, which are the things that make an issue diagnosable.
const SECRET_PATTERNS = [
  [/\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g, '[redacted:openai-key]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted:jwt]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [redacted]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[redacted:aws-key]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[redacted:github-token]'],
  // Any scheme, not just http(s): mysql://, postgres://, redis:// and amqp://
  // connection strings carry credentials and routinely appear verbatim in
  // driver error messages.
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@'],
  [/\bhttps?:\/\/[0-9a-f]{32}@[^\s]+/gi, '[redacted:sentry-dsn]'],
  [
    /((?:api[_-]?key|apikey|access[_-]?token|client[_-]?secret|password|secret)\s*[=:]\s*)(["']?)[^\s"',;)]{8,}\2/gi,
    '$1[redacted]'
  ]
];

// beforeSend runs synchronously on the request path, so a pathological
// message must not turn this into a CPU stall.
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
// .mechanism, .module and event.fingerprint are left untouched, which is what
// keeps grouping intact: Sentry groups by stacktrace whenever one exists. For
// stackless events this actually groups *better* than before, because the
// placeholder is a fixed literal -- a raw key made every occurrence a unique
// title.
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

  const initOptions = {
    dsn: config.dsn,
    environment: config.environment,
    release: config.release || undefined,
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
  };

  // Only install sampling when a positive base rate is configured. Never pass
  // both tracesSampleRate and tracesSampler -- the sampler wins and the
  // literal becomes dead config that misleads the next reader. With neither
  // key present the SDK runs in tracing-without-performance mode: trace ids
  // propagate, no transactions are emitted.
  if (config.tracesSampleRate != null) {
    initOptions.tracesSampler = makeTracesSampler(config.tracesSampleRate);
  }

  Sentry.init(initOptions);

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
    // No `trace_id` tag is set here on purpose. Sentry already carries the
    // real distributed trace id at event.contexts.trace.trace_id and indexes
    // it as the `trace:<id>` search. A hand-set tag of the same name is an
    // unrelated custom tag that shadows it in the UI -- events were shipping
    // with tag trace_id=<uuid> next to contexts.trace.trace_id=<32-hex>, two
    // different values under one name. requestContext now adopts the inbound
    // sentry-trace id as req.traceId, so the x-trace-id response header
    // carries the same id the `request_id` tag already exposes.
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

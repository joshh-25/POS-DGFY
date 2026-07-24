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
    debug: parseBooleanFlag(env.VITE_SENTRY_DEBUG, false)
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
      Sentry.init({
        dsn: config.dsn,
        environment: config.environment,
        release: config.release || undefined,
        tracesSampleRate: config.tracesSampleRate,
        replaysSessionSampleRate: config.replaysSessionSampleRate,
        replaysOnErrorSampleRate: config.replaysOnErrorSampleRate,
        debug: config.debug,
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

export const isBrowserSentryInitialized = () => initialized;

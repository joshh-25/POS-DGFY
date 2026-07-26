const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const CONSENT_STORAGE_KEY = 'dgfy_analytics_consent_v1';

let initialized = false;
let posthogModule = null;
let initPromise = null;

const parseBooleanFlag = (value, fallback = false) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
};

export const resolvePostHogBrowserConfig = (env = import.meta.env, surfaceOverride = '') => {
  const surface = String(surfaceOverride || env.VITE_APP_SURFACE || 'skupervisor').trim().toLowerCase();
  const enabled = parseBooleanFlag(env.VITE_POSTHOG_ENABLED, false);
  const apiKey = String(env.VITE_POSTHOG_KEY || '').trim();
  const apiHost = String(env.VITE_POSTHOG_HOST || '').trim();

  return {
    enabled,
    apiKey,
    apiHost,
    active: enabled && Boolean(apiKey) && Boolean(apiHost),
    surface,
    environment: String(env.VITE_POSTHOG_ENVIRONMENT || env.MODE || 'development').trim()
  };
};

export const getStoredAnalyticsConsent = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw === 'granted') return true;
    if (raw === 'denied') return false;
    return null;
  } catch {
    return null;
  }
};

export const setStoredAnalyticsConsent = (granted) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, granted ? 'granted' : 'denied');
  } catch {
    // Consent persistence is best-effort; a failed write just re-prompts next visit.
  }
};

export const initBrowserAnalytics = ({ env = import.meta.env, surface, consent = true, logger = console } = {}) => {
  const config = resolvePostHogBrowserConfig(env, surface);

  if (!config.enabled) {
    return { active: false, reason: 'disabled' };
  }

  if (!consent) {
    return { active: false, reason: 'consent_denied' };
  }

  if (!config.apiKey || !config.apiHost) {
    logger.warn?.(`[Analytics] VITE_POSTHOG_ENABLED=true but no API key/host is configured for surface "${config.surface}"; continuing without analytics.`);
    return { active: false, reason: 'missing_config' };
  }

  if (initialized) {
    return { active: true, reason: 'already_initialized' };
  }

  initPromise = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(config.apiKey, {
        api_host: config.apiHost,
        capture_pageview: false,
        person_profiles: 'identified_only'
      });
      posthog.register({ surface: config.surface, environment: config.environment });

      posthogModule = posthog;
      initialized = true;
      logger.info?.(`[Analytics] PostHog enabled for ${config.surface}`);
      return posthog;
    })
    .catch((error) => {
      logger.warn?.('[Analytics] failed to initialize PostHog', error);
      initPromise = null;
      return null;
    });

  return { active: true, reason: 'enabled' };
};

const withPostHog = (callback) => {
  if (initialized && posthogModule) {
    callback(posthogModule);
    return;
  }
  if (initPromise) {
    initPromise.then((posthog) => posthog && callback(posthog)).catch(() => {});
  }
};

export const trackEvent = (name, properties = {}) => {
  withPostHog((posthog) => posthog.capture(name, properties));
};

export const capturePageview = (properties = {}) => {
  trackEvent('$pageview', properties);
};

export const identifyUser = (id, traits = {}) => {
  withPostHog((posthog) => posthog.identify(id, traits));
};

export const resetAnalyticsIdentity = () => {
  withPostHog((posthog) => posthog.reset());
};

export const isBrowserAnalyticsInitialized = () => initialized;

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const CONSENT_STORAGE_KEY = 'dgfy_analytics_consent_v1';

// Same-origin path proxied to PostHog EU cloud by infrastructure/docker/nginx/
// nginx.conf.template's /ingest/ location blocks. Sending event/config/asset
// requests through this path (rather than straight to eu.i.posthog.com /
// eu-assets.i.posthog.com) means they satisfy `script-src 'self'` without
// loosening the storefront's CSP at all -- see
// docs/ops/STAGE_CONNECTION_EXHAUSTION_AND_CSP_INCIDENT_2026-07-27.md for why
// that mattered: PostHog's core chunk is bundled and already same-origin, but
// session replay, surveys, web vitals, and dead-click autocapture are fetched
// at runtime from eu-assets.i.posthog.com and were silently blocked by CSP.
// VITE_POSTHOG_HOST still overrides this for local dev (pointing straight at
// PostHog with no proxy in front) or a differently-pathed proxy.
const DEFAULT_POSTHOG_PROXY_PATH = '/ingest';
const POSTHOG_UI_HOST = 'https://eu.posthog.com';

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
  const apiHost = String(env.VITE_POSTHOG_HOST || '').trim() || DEFAULT_POSTHOG_PROXY_PATH;

  return {
    enabled,
    apiKey,
    apiHost,
    uiHost: POSTHOG_UI_HOST,
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
        ui_host: config.uiHost,
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

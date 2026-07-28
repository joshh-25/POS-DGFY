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

// Session replay defaults to off everywhere. It is switched on per-surface,
// per-environment via env vars -- never by a code change -- because POS
// replay records a fixed all-day terminal that shows customer names,
// addresses, and phone numbers, while storefront replay is a public visitor
// session. `VITE_POSTHOG_SESSION_REPLAY_<SURFACE>` (STORE, POS) takes
// precedence; the surface-less `VITE_POSTHOG_SESSION_REPLAY` is a shared
// fallback for surfaces without a dedicated flag (e.g. skupervisor).
const resolveSessionReplayFlag = (env, surface) => {
  const surfaceKey = String(surface || '').trim().toUpperCase();
  const surfaceFlag = surfaceKey ? env[`VITE_POSTHOG_SESSION_REPLAY_${surfaceKey}`] : undefined;
  if (surfaceFlag !== undefined) return parseBooleanFlag(surfaceFlag, false);
  return parseBooleanFlag(env.VITE_POSTHOG_SESSION_REPLAY, false);
};

export const resolvePostHogBrowserConfig = (env = import.meta.env, surfaceOverride = '') => {
  const surface = String(surfaceOverride || env.VITE_APP_SURFACE || 'skupervisor').trim().toLowerCase();
  const enabled = parseBooleanFlag(env.VITE_POSTHOG_ENABLED, false);
  const apiKey = String(env.VITE_POSTHOG_KEY || '').trim();
  const apiHost = String(env.VITE_POSTHOG_HOST || '').trim() || DEFAULT_POSTHOG_PROXY_PATH;
  const sessionReplayEnabled = resolveSessionReplayFlag(env, surface);
  // POS is a single terminal running all day in front of customers --
  // autocapture there is scoped to interactive elements only, so an 8-hour
  // shift doesn't flood the project with incidental DOM noise.
  const isPos = surface === 'pos';

  return {
    enabled,
    apiKey,
    apiHost,
    uiHost: POSTHOG_UI_HOST,
    active: enabled && Boolean(apiKey) && Boolean(apiHost),
    surface,
    environment: String(env.VITE_POSTHOG_ENVIRONMENT || env.MODE || 'development').trim(),
    sessionReplayEnabled,
    autocapture: isPos
      ? {
        element_allowlist: ['button', 'a', 'input', 'select'],
        css_selector_ignorelist: ['.ph-no-capture', '[data-ph-no-capture]']
      }
      : true
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
        // Time-on-page / bounce analysis needs a $pageleave signal; we still
        // drive $pageview manually (capture_pageview: false) via
        // capturePageview() so it can carry route/business-mode properties
        // the auto-fired event can't know about.
        capture_pageleave: true,
        person_profiles: 'identified_only',
        autocapture: config.autocapture,
        // Errors are Sentry's job -- keep the two tools' responsibilities
        // separate rather than double-capturing exceptions into PostHog.
        capture_exceptions: false,
        disable_session_recording: !config.sessionReplayEnabled,
        session_recording: {
          // Default to fully masked; individual fields opt in to being shown
          // via [data-ph-mask] (mask) / [data-ph-block] (never record at
          // all, used for payment/address fields and the POS customer panel).
          maskAllInputs: true,
          maskTextSelector: '[data-ph-mask]',
          blockSelector: '[data-ph-block]',
          // POS is a single terminal displaying customer PII (name, address,
          // phone) all day -- blanket-mask all text there rather than rely
          // on selectors covering every surface.
          maskTextFn: config.surface === 'pos' ? () => '*' : undefined
        }
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

// Matches the PII posture already enforced on the Sentry side
// (sentryClient.js's sanitizeSentryEvent): identify traits never carry
// direct contact info, only attributes useful for behavioral segmentation.
const PII_TRAIT_PATTERN = /(email|phone|password|token|secret|address)/i;

const stripPiiTraits = (traits = {}) => Object.fromEntries(
  Object.entries(traits).filter(([key]) => !PII_TRAIT_PATTERN.test(key))
);

/**
 * Identifies the current person for behavioral segmentation without ever
 * sending direct contact info to PostHog. Call on sign-in; pair with
 * resetAnalyticsIdentity() on explicit sign-out.
 */
export const identifyAnalyticsUser = ({ id, ...traits } = {}) => {
  if (!id) return;
  identifyUser(String(id), stripPiiTraits(traits));
};

/**
 * Registers store/tenant/business-mode as super properties (attached to
 * every subsequent event) and as PostHog groups, so events can be sliced by
 * "which store" or "which tenant" without a join -- e.g. "which stores do
 * visitors most often convert from".
 */
export const setAnalyticsContext = ({
  storeSlug,
  storeName,
  tenantId,
  businessMode,
  locationId
} = {}) => {
  withPostHog((posthog) => {
    const superProperties = {};
    if (storeSlug) superProperties.store_slug = storeSlug;
    if (tenantId) superProperties.tenant_id = tenantId;
    if (businessMode) superProperties.business_mode = businessMode;
    if (locationId) superProperties.location_id = locationId;
    if (Object.keys(superProperties).length) posthog.register(superProperties);

    if (storeSlug) posthog.group('store', storeSlug, { name: storeName, business_mode: businessMode });
    if (tenantId) posthog.group('tenant', String(tenantId));
  });
};

export const isBrowserAnalyticsInitialized = () => initialized;

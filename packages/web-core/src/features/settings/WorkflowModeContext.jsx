import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getAllSettings } from '@/services/settingsService.js';
import {
  DEFAULT_WORKFLOW_MODE,
  ENABLED_CAPABILITIES_SETTING_KEY,
  DISABLED_CAPABILITIES_SETTING_KEY,
  WORKFLOW_MODE_CHANGED_EVENT,
  WORKFLOW_MODE_SETTING_KEY,
  modeHasCapability,
  normalizeEnabledCapabilities,
  normalizeDisabledCapabilities,
  normalizeWorkflowMode
} from './workflowMode.js';
import {
  STORE_PROFILE_SETTING_KEY,
  buildStoreProfile,
  storeProfilesEqual
} from '@sieitzz/shared-constants/storeProfile';
import { getAccessToken, getCompanyToken, refreshBrowserSession } from '@/services/browserSession.js';
import { shouldRefreshBrowserSessionForPath } from '@/services/publicRoutePolicy.js';
import { setImageClientConversionFromSettings } from '../../utils/imageEncoding/rolloutFlag.js';
import { loadWorkflowModeCache, saveWorkflowModeCache } from './workflowModeCache.js';

const WorkflowModeContext = createContext(null);

// Issue #2824: bounded retry while the last settings load failed. The `online` event covers the
// "connectivity came back" case; this covers a flaky link that never reports offline.
const WORKFLOW_MODE_RETRY_BASE_MS = 5000;
const WORKFLOW_MODE_RETRY_MAX_MS = 60000;

// The last-known-good cache is best-effort: a storage or tenant-key problem must never turn a good
// settings result into a failure, nor crash the failure path.
const persistWorkflowSettings = (settings) => {
  try {
    saveWorkflowModeCache(getCompanyToken(), settings);
  } catch {
    // ignore
  }
};

const readCachedWorkflowSettings = () => {
  try {
    return loadWorkflowModeCache(getCompanyToken());
  } catch {
    return null;
  }
};

const extractWorkflowModeFromSettings = (settings) => (
  normalizeWorkflowMode(settings?.[WORKFLOW_MODE_SETTING_KEY]?.value)
);

const extractEnabledCapabilitiesFromSettings = (settings) => (
  normalizeEnabledCapabilities(settings?.[ENABLED_CAPABILITIES_SETTING_KEY]?.value)
);

// Issue #178 Phase 16 - plumbed through starting here so Phase 19's gate
// flip has it ready, mirroring the backend's own staged rollout
// (workflowCapabilitySettingsCache.js reads it before anything consumes it).
const extractDisabledCapabilitiesFromSettings = (settings) => (
  normalizeDisabledCapabilities(settings?.[DISABLED_CAPABILITIES_SETTING_KEY]?.value)
);

// Issue #178 Phase 18: the server's own materialized Profile when present
// (a tenant curated with a Store Template) - otherwise a client-side
// rebuild from mode + both overlays, which is what a tenant with no
// template curation has always effectively had (buildStoreProfile is the
// exact same pure function the backend uses to build ops_store_profile in
// the first place, so an uncurated tenant's rebuild is byte-identical to
// what the server would have stamped).
//
// Persisted profiles are a server-derived shadow, not an independent source
// of truth. Compare them with the current rebuild before using them so a
// profile materialized before a shared default change cannot keep stale POS
// affordances hidden in the browser. Provenance is historical metadata and
// must not make an otherwise-current profile look stale.
const stripProfileProvenance = (profile) => {
  if (!profile || typeof profile !== 'object') return profile;
  const comparable = { ...profile };
  delete comparable.provenance;
  return comparable;
};

const extractProfileFromSettings = (settings, { workflowMode, enabledCapabilities, disabledCapabilities }) => {
  const persisted = settings?.[STORE_PROFILE_SETTING_KEY]?.value;
  const rebuilt = buildStoreProfile({ workflowMode, enabledCapabilities, disabledCapabilities });
  if (
    persisted
    && typeof persisted === 'object'
    && persisted.profile_version === rebuilt.profile_version
    && storeProfilesEqual(
      stripProfileProvenance(persisted),
      stripProfileProvenance(rebuilt)
    )
  ) {
    return persisted;
  }
  return rebuilt;
};

export const broadcastWorkflowModeChange = ({ mode, source = 'settings' } = {}) => {
  const normalizedMode = normalizeWorkflowMode(mode);
  window.dispatchEvent(new CustomEvent(WORKFLOW_MODE_CHANGED_EVENT, {
    detail: {
      mode: normalizedMode,
      source
    }
  }));
  return normalizedMode;
};

const DEFAULT_PROFILE = buildStoreProfile({ workflowMode: DEFAULT_WORKFLOW_MODE, enabledCapabilities: [], disabledCapabilities: [] });

export function WorkflowModeProvider({ children }) {
  const [workflowMode, setWorkflowMode] = useState(DEFAULT_WORKFLOW_MODE);
  const [enabledCapabilities, setEnabledCapabilities] = useState([]);
  const [disabledCapabilities, setDisabledCapabilities] = useState([]);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState(false);
  const [workflowSource, setWorkflowSource] = useState('unresolved');
  const [error, setError] = useState(null);
  const [modeChangeNotice, setModeChangeNotice] = useState(null);
  // Bumped on every failed fetch so the retry effect re-arms even if the same error object recurs.
  const [failureCount, setFailureCount] = useState(0);
  const workflowModeRef = useRef(DEFAULT_WORKFLOW_MODE);
  // Issue #2824: true while the last refresh did not produce a fresh server result -- covers both
  // the settings-fetch failure and the no-token branch (which leaves `error` null).
  const recoveryNeededRef = useRef(false);
  const inFlightRefreshesRef = useRef(0);
  const retryAttemptRef = useRef(0);

  // Single derivation path for both a fresh server response and the cached last-known-good
  // subset, so the persisted-profile-vs-rebuild guard applies to the cache too.
  const applyWorkflowSettings = useCallback((settings) => {
    const nextMode = extractWorkflowModeFromSettings(settings);
    const nextEnabledCapabilities = extractEnabledCapabilitiesFromSettings(settings);
    const nextDisabledCapabilities = extractDisabledCapabilitiesFromSettings(settings);
    setWorkflowMode(nextMode);
    setEnabledCapabilities(nextEnabledCapabilities);
    setDisabledCapabilities(nextDisabledCapabilities);
    setProfile(extractProfileFromSettings(settings, {
      workflowMode: nextMode,
      enabledCapabilities: nextEnabledCapabilities,
      disabledCapabilities: nextDisabledCapabilities
    }));
    return nextMode;
  }, []);

  // `background` (issue #2824) is for recovery refreshes: it must not flip loading/resolved, or
  // WorkflowModeRouteGate would blank a live terminal every retry.
  const runWorkflowModeRefresh = useCallback(async ({ force = false, background = false } = {}) => {
    if (!shouldRefreshBrowserSessionForPath(window.location.pathname)) {
      setWorkflowMode(DEFAULT_WORKFLOW_MODE);
      setEnabledCapabilities([]);
      setDisabledCapabilities([]);
      setProfile(DEFAULT_PROFILE);
      setResolved(true);
      setWorkflowSource('unresolved');
      setError(null);
      setLoading(false);
      // Phase 298 (#265): no settings fetch happened on this path -- fail-safe default (every
      // scope disabled) is what setImageClientConversionFromSettings(null) already means.
      setImageClientConversionFromSettings(null);
      recoveryNeededRef.current = false;
      return DEFAULT_WORKFLOW_MODE;
    }

    const token = getAccessToken() || await refreshBrowserSession().catch(() => '');
    if (!token) {
      setWorkflowMode(DEFAULT_WORKFLOW_MODE);
      setEnabledCapabilities([]);
      setDisabledCapabilities([]);
      setProfile(DEFAULT_PROFILE);
      setResolved(true);
      setWorkflowSource('unresolved');
      setError(null);
      setLoading(false);
      setImageClientConversionFromSettings(null);
      // Issue #2824: pre-login this is the normal state, but after a reload that could not
      // refresh its session it is the same wrong-workflow state as a failed fetch. `error` stays
      // null here, so recovery is event-driven (`online`) only, never a polling loop.
      recoveryNeededRef.current = true;
      return DEFAULT_WORKFLOW_MODE;
    }

    if (!background) {
      setLoading(true);
      setResolved(false);
      setError(null);
    }

    try {
      const settings = await getAllSettings({ force });
      const nextMode = applyWorkflowSettings(settings);
      setResolved(true);
      setWorkflowSource('server');
      setError(null);
      // Issue #2824: only a successful server response is ever persisted -- never a fallback.
      persistWorkflowSettings(settings);
      recoveryNeededRef.current = false;
      retryAttemptRef.current = 0;
      // Phase 298 (#265): populates rolloutFlag.js's module-level cache from the same bootstrap
      // /settings response this Provider already fetches -- the identity-sync idiom
      // identifySentryUser/setAnalyticsContext already use, applied to this rollout flag too.
      setImageClientConversionFromSettings(settings);
      return nextMode;
    } catch (refreshError) {
      recoveryNeededRef.current = true;
      setFailureCount((count) => count + 1);
      // Fetch failed -- fail-safe default, matching this catch block's own reset-to-default
      // pattern for every other piece of settings-derived state.
      setImageClientConversionFromSettings(null);

      // Issue #2824: prefer this tenant's last-known-good workflow over the Counter default, so a
      // failed load does not silently change what an F&B terminal sells. `error` stays set so the
      // staleness is observable and the retry loop keeps running; `resolved` is true because the
      // cached subset is a confirmed result for this tenant.
      const cachedSettings = readCachedWorkflowSettings();
      if (cachedSettings) {
        const cachedMode = applyWorkflowSettings(cachedSettings);
        setResolved(true);
        setWorkflowSource('cache');
        setError(refreshError);
        return cachedMode;
      }

      setWorkflowMode(DEFAULT_WORKFLOW_MODE);
      setEnabledCapabilities([]);
      setDisabledCapabilities([]);
      setProfile(DEFAULT_PROFILE);
      setResolved(false);
      setWorkflowSource('unresolved');
      setError(refreshError);
      return DEFAULT_WORKFLOW_MODE;
    } finally {
      setLoading(false);
    }
  }, [applyWorkflowSettings]);

  const refreshWorkflowMode = useCallback(async (options) => {
    inFlightRefreshesRef.current += 1;
    try {
      return await runWorkflowModeRefresh(options);
    } finally {
      inFlightRefreshesRef.current -= 1;
    }
  }, [runWorkflowModeRefresh]);

  const dismissModeChangeNotice = useCallback(() => {
    setModeChangeNotice(null);
  }, []);

  useEffect(() => {
    workflowModeRef.current = workflowMode;
  }, [workflowMode]);

  useEffect(() => {
    refreshWorkflowMode({ force: false });
  }, [refreshWorkflowMode]);

  useEffect(() => {
    const handleAuthLogin = () => {
      refreshWorkflowMode({ force: true });
    };
    // Issue #2824: connectivity returned. Re-fetch settings only -- this must never touch the
    // offline queue or replay (ADR 0014: no reconnect event may submit queued records).
    const handleOnline = () => {
      if (!recoveryNeededRef.current || inFlightRefreshesRef.current > 0) return;
      refreshWorkflowMode({ force: true, background: true });
    };
    const handleAuthLogout = () => {
      setWorkflowMode(DEFAULT_WORKFLOW_MODE);
      setEnabledCapabilities([]);
      setDisabledCapabilities([]);
      setProfile(DEFAULT_PROFILE);
      setResolved(false);
      setWorkflowSource('unresolved');
      setError(null);
      setModeChangeNotice(null);
      setLoading(false);
      recoveryNeededRef.current = false;
      retryAttemptRef.current = 0;
      // Phase 298 (#265): a signed-out session has no settings of its own -- fail-safe default.
      setImageClientConversionFromSettings(null);
    };
    const handleModeChanged = (event) => {
      const nextMode = normalizeWorkflowMode(event?.detail?.mode);
      const previousMode = workflowModeRef.current;
      setWorkflowMode(nextMode);
      setResolved(true);
      setWorkflowSource('server');
      setError(null);
      if (nextMode !== previousMode) {
        setModeChangeNotice({
          from: previousMode,
          to: nextMode,
          source: String(event?.detail?.source || 'settings')
        });
      }
    };

    window.addEventListener('auth:login', handleAuthLogin);
    window.addEventListener('auth:logout', handleAuthLogout);
    window.addEventListener('online', handleOnline);
    window.addEventListener(WORKFLOW_MODE_CHANGED_EVENT, handleModeChanged);

    return () => {
      window.removeEventListener('auth:login', handleAuthLogin);
      window.removeEventListener('auth:logout', handleAuthLogout);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener(WORKFLOW_MODE_CHANGED_EVENT, handleModeChanged);
    };
  }, [refreshWorkflowMode]);

  // Issue #2824: bounded exponential backoff while the last fetch failed (`error` set). Each failed
  // attempt bumps `failureCount`, which re-arms this effect; success clears `error` and resets the
  // attempt counter. Paused while the browser reports offline (the `online` listener above
  // resumes it), and cleared on logout/unmount via the effect cleanup.
  useEffect(() => {
    if (!error || loading) return undefined;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return undefined;

    const delay = Math.min(
      WORKFLOW_MODE_RETRY_MAX_MS,
      WORKFLOW_MODE_RETRY_BASE_MS * Math.pow(2, retryAttemptRef.current)
    );
    const timer = setTimeout(() => {
      retryAttemptRef.current += 1;
      if (inFlightRefreshesRef.current > 0) return;
      refreshWorkflowMode({ force: true, background: true });
    }, delay);

    return () => clearTimeout(timer);
  }, [error, failureCount, loading, refreshWorkflowMode]);

  // Issue #178 Phase 21: honors the disabled overlay too, so a curated
  // template's subtraction is reflected everywhere this hook gates UI, not
  // just in the pages/routes that call modeHasCapability directly
  // (Layout.jsx, WorkflowModeRouteGate.jsx). PosPageShell.jsx's panel
  // rendering is the consumer this fixes - it was rendering panels a
  // template had subtracted, which the backend then correctly 403'd.
  const hasCapability = useCallback((capability) => (
    modeHasCapability(workflowMode, capability, enabledCapabilities, disabledCapabilities)
  ), [disabledCapabilities, enabledCapabilities, workflowMode]);

  const value = useMemo(() => ({
    workflowMode,
    enabledCapabilities,
    disabledCapabilities,
    profile,
    hasCapability,
    loading,
    resolved,
    workflowSource,
    error,
    modeChangeNotice,
    refreshWorkflowMode,
    dismissModeChangeNotice
  }), [dismissModeChangeNotice, disabledCapabilities, enabledCapabilities, error, hasCapability, loading, modeChangeNotice, profile, refreshWorkflowMode, resolved, workflowMode, workflowSource]);

  return (
    <WorkflowModeContext.Provider value={value}>
      {children}
    </WorkflowModeContext.Provider>
  );
}

export const useWorkflowMode = () => {
  const context = useContext(WorkflowModeContext);
  if (!context) {
    throw new Error('useWorkflowMode must be used within WorkflowModeProvider');
  }
  return context;
};

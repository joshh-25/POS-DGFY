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
import { getAccessToken, refreshBrowserSession } from '@/services/browserSession.js';
import { shouldRefreshBrowserSessionForPath } from '@/services/publicRoutePolicy.js';

const WorkflowModeContext = createContext(null);

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
  const [error, setError] = useState(null);
  const [modeChangeNotice, setModeChangeNotice] = useState(null);
  const workflowModeRef = useRef(DEFAULT_WORKFLOW_MODE);

  const refreshWorkflowMode = useCallback(async ({ force = false } = {}) => {
    if (!shouldRefreshBrowserSessionForPath(window.location.pathname)) {
      setWorkflowMode(DEFAULT_WORKFLOW_MODE);
      setEnabledCapabilities([]);
      setDisabledCapabilities([]);
      setProfile(DEFAULT_PROFILE);
      setResolved(true);
      setError(null);
      setLoading(false);
      return DEFAULT_WORKFLOW_MODE;
    }

    const token = getAccessToken() || await refreshBrowserSession().catch(() => '');
    if (!token) {
      setWorkflowMode(DEFAULT_WORKFLOW_MODE);
      setEnabledCapabilities([]);
      setDisabledCapabilities([]);
      setProfile(DEFAULT_PROFILE);
      setResolved(true);
      setError(null);
      setLoading(false);
      return DEFAULT_WORKFLOW_MODE;
    }

    setLoading(true);
    setResolved(false);
    setError(null);

    try {
      const settings = await getAllSettings({ force });
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
      setResolved(true);
      return nextMode;
    } catch (refreshError) {
      setWorkflowMode(DEFAULT_WORKFLOW_MODE);
      setEnabledCapabilities([]);
      setDisabledCapabilities([]);
      setProfile(DEFAULT_PROFILE);
      setResolved(false);
      setError(refreshError);
      return DEFAULT_WORKFLOW_MODE;
    } finally {
      setLoading(false);
    }
  }, []);

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
    const handleAuthLogout = () => {
      setWorkflowMode(DEFAULT_WORKFLOW_MODE);
      setEnabledCapabilities([]);
      setDisabledCapabilities([]);
      setProfile(DEFAULT_PROFILE);
      setResolved(false);
      setError(null);
      setModeChangeNotice(null);
      setLoading(false);
    };
    const handleModeChanged = (event) => {
      const nextMode = normalizeWorkflowMode(event?.detail?.mode);
      const previousMode = workflowModeRef.current;
      setWorkflowMode(nextMode);
      setResolved(true);
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
    window.addEventListener(WORKFLOW_MODE_CHANGED_EVENT, handleModeChanged);

    return () => {
      window.removeEventListener('auth:login', handleAuthLogin);
      window.removeEventListener('auth:logout', handleAuthLogout);
      window.removeEventListener(WORKFLOW_MODE_CHANGED_EVENT, handleModeChanged);
    };
  }, [refreshWorkflowMode]);

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
    error,
    modeChangeNotice,
    refreshWorkflowMode,
    dismissModeChangeNotice
  }), [dismissModeChangeNotice, disabledCapabilities, enabledCapabilities, error, hasCapability, loading, modeChangeNotice, profile, refreshWorkflowMode, resolved, workflowMode]);

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

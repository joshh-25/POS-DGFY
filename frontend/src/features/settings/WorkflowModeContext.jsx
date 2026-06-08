import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getAllSettings } from '@/services/settingsService.js';
import {
  DEFAULT_WORKFLOW_MODE,
  WORKFLOW_MODE_CHANGED_EVENT,
  WORKFLOW_MODE_SETTING_KEY,
  normalizeWorkflowMode
} from './workflowMode.js';
import { getAccessToken, refreshBrowserSession } from '@/services/browserSession.js';
import { shouldRefreshBrowserSessionForPath } from '@/services/publicRoutePolicy.js';

const WorkflowModeContext = createContext(null);

const extractWorkflowModeFromSettings = (settings) => (
  normalizeWorkflowMode(settings?.[WORKFLOW_MODE_SETTING_KEY]?.value)
);

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

export function WorkflowModeProvider({ children }) {
  const [workflowMode, setWorkflowMode] = useState(DEFAULT_WORKFLOW_MODE);
  const [loading, setLoading] = useState(true);
  const [modeChangeNotice, setModeChangeNotice] = useState(null);
  const workflowModeRef = useRef(DEFAULT_WORKFLOW_MODE);

  const refreshWorkflowMode = useCallback(async ({ force = false } = {}) => {
    if (!shouldRefreshBrowserSessionForPath(window.location.pathname)) {
      setWorkflowMode(DEFAULT_WORKFLOW_MODE);
      setLoading(false);
      return DEFAULT_WORKFLOW_MODE;
    }

    const token = getAccessToken() || await refreshBrowserSession().catch(() => '');
    if (!token) {
      setWorkflowMode(DEFAULT_WORKFLOW_MODE);
      setLoading(false);
      return DEFAULT_WORKFLOW_MODE;
    }

    setLoading(true);

    try {
      const settings = await getAllSettings({ force });
      const nextMode = extractWorkflowModeFromSettings(settings);
      setWorkflowMode(nextMode);
      return nextMode;
    } catch {
      setWorkflowMode(DEFAULT_WORKFLOW_MODE);
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
      setModeChangeNotice(null);
      setLoading(false);
    };
    const handleModeChanged = (event) => {
      const nextMode = normalizeWorkflowMode(event?.detail?.mode);
      const previousMode = workflowModeRef.current;
      setWorkflowMode(nextMode);
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

  const value = useMemo(() => ({
    workflowMode,
    loading,
    modeChangeNotice,
    refreshWorkflowMode,
    dismissModeChangeNotice
  }), [dismissModeChangeNotice, loading, modeChangeNotice, refreshWorkflowMode, workflowMode]);

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

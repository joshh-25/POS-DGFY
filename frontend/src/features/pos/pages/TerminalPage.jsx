import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  closeTerminalShift,
  createPosCheckout,
  fetchIncomingOnlineOrders,
  fetchCurrentTerminalShift,
  fetchTerminalTodayDashboard,
  openPosDeviceDrawer,
  openTerminalShift,
  switchTerminalShiftLocation,
  recordCashDrawerEvent,
  updateOnlineOrderStatus
} from '../services/posService';
import { login as loginWithCredentials, getCurrentUser as fetchCurrentUser } from '@/services/authService.js';
import { getAllSettings } from '@/services/settingsService.js';
import { listTenantLocations } from '@/services/tenantLocationService.js';
import { getComplianceProfile } from '@/services/complianceService.js';
import api from '@/services/api.js';
import { clearClientSession } from '@/services/sessionCleanup.js';
import { getAccessToken, getCompanyToken, refreshBrowserSession } from '@/services/browserSession.js';
import { useWorkflowMode } from '../../settings/WorkflowModeContext.jsx';
import { getWorkflowModeLabel, isMsmeWorkflowMode } from '../../settings/workflowMode.js';
import { resolveBusinessModePosDefaults } from '../../settings/businessModeTemplates.js';
import {
  TERMINAL_QUEUE_STATUS,
  enqueueTerminalOperationIntent as persistTerminalOperationIntent,
  getReplayCandidateEntries,
  getTerminalOperationQueueSummary,
  hydrateTerminalOperationQueueStore,
  listTerminalOperationQueueEntries,
  markTerminalOperationFailedManualResolution,
  markTerminalOperationQueued,
  markTerminalOperationReplayed,
  markTerminalOperationReplaying,
  markTerminalOperationResolved,
  markTerminalOperationRetryScheduled,
  pruneTerminalOperationHistory
} from '../services/terminalOperationQueueStore.js';

import TerminalPageLayout from '../components/TerminalPageLayout.jsx';
import OnboardingSetupModal from '../../onboarding/components/OnboardingSetupModal.jsx';
const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';

const DEFAULT_CURRENCY = 'PHP';
const TERMINAL_ID_STORAGE_KEY = 'pos_terminal_identity_v1';
const DEFAULT_TERMINAL_ID_OPTIONS = ['COUNTER-01', 'COUNTER-02', 'KIOSK-01'];
const TERMINAL_REGISTRY_MODES = new Set(['warn', 'enforce']);
const ONLINE_ORDER_POLL_INTERVAL_MS = 12000;
const QUEUE_HISTORY_LIMIT = 250;
const TERMINAL_OPERATION_MAX_RETRIES = 5;
const TERMINAL_OPERATION_REPLAY_BATCH_SIZE = 25;
const DESKTOP_TERMINAL_BREAKPOINT_PX = IS_DGFY_POS_SURFACE ? 1024 : 1280;
const CHECKOUT_VIEW_MODES = ['checkout', 'history', 'receipt'];
const OPERATIONS_VIEW_MODES = [
  'incoming_queue',
  'location_scope',
  'shift_controls',
  'cash_drawer',
  'close_shift',
  'reports',
  'items',
  'sales_today',
  'terminal_setup',
  'sync_queue'
];
const MSME_OPERATIONS_VIEW_MODES = ['shift_controls', 'close_shift', 'items', 'sync_queue'];
const TERMINAL_SECTION_IDS = {
  checkoutWorkspace: 'pos-checkout-workspace',
  terminalSetup: 'pos-section-terminal-setup',
  activeShift: 'pos-section-active-shift',
  cashDrawer: 'pos-section-cash-drawer',
  closeShift: 'pos-section-close-shift',
  locationScope: 'pos-section-location-scope',
  incomingOrders: 'pos-section-incoming-orders',
  reports: 'pos-section-reports',
  items: 'pos-section-items',
  salesToday: 'pos-section-sales-today',
  syncQueue: 'pos-section-sync-queue'
};
const RETRYABLE_TERMINAL_OPERATION_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_COMPLIANCE_ACTION_TARGET = '/settings?tab=compliance';
const COMPLIANCE_REASON_LABELS = Object.freeze({
  COMPLIANCE_GATE_UNAVAILABLE: 'Compliance status unavailable',
  LEGACY_MODE_SELECTION_REQUIRED: 'Compliance mode selection required',
  COMPLIANCE_PROFILE_INCOMPLETE: 'Compliance profile incomplete',
  COMPLIANCE_SETTINGS_INCOMPLETE: 'Compliance settings incomplete',
  COMPLIANCE_ARTIFACTS_INCOMPLETE: 'Compliance artifacts incomplete',
  ACCREDITED_PERIPHERAL_REQUIRED: 'Accredited peripherals incomplete',
  TERMINAL_DEVICE_MISMATCH: 'Terminal-peripheral mismatch',
  READINESS_TESTS_REQUIRED: 'Readiness tests required',
  BSP_OPS_REGISTRATION_REQUIRED: 'BSP OPS registration controls incomplete',
  BSP_PAYMENT_CONTROL_REQUIRED: 'BSP payment control review incomplete'
});

const normalizeActivationBlocker = (entry) => {
  const code = String(entry?.code || '').trim() || 'COMPLIANCE_BLOCKER';
  const actionTarget = String(entry?.action_target || '').trim() || DEFAULT_COMPLIANCE_ACTION_TARGET;
  const label = COMPLIANCE_REASON_LABELS[code] || code.replace(/_/g, ' ').toLowerCase();
  return {
    code,
    label,
    section: String(entry?.section || '').trim() || 'compliance',
    message: String(entry?.message || '').trim() || 'Compliance requirement is not yet satisfied.',
    action_target: actionTarget
  };
};

const normalizeActivationBlockers = (entries = []) => (
  Array.isArray(entries)
    ? entries.map((entry) => normalizeActivationBlocker(entry))
    : []
);

const createIdempotencyKey = (prefix = 'pos-terminal') => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const sanitizeTerminalId = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, '-')
  .replace(/[^A-Za-z0-9._-]/g, '')
  .toUpperCase();
const normalizeTerminalRegistry = (rawRegistry) => {
  let parsed = rawRegistry;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set();
  const normalized = [];
  parsed.forEach((entry) => {
    const terminalId = sanitizeTerminalId(entry?.terminal_id);
    if (!terminalId) return;
    if (seen.has(terminalId)) return;
    seen.add(terminalId);

    const isActive = entry?.is_active !== false;
    normalized.push({
      terminal_id: terminalId,
      label: String(entry?.label || '').trim(),
      location_id: Number.isInteger(Number(entry?.location_id)) ? Number(entry?.location_id) : null,
      is_active: isActive,
      is_default: isActive && entry?.is_default === true
    });
  });

  if (normalized.length === 0) return [];

  const defaultIndex = normalized.findIndex((entry) => entry.is_default === true);
  if (defaultIndex >= 0) {
    normalized.forEach((entry, index) => {
      if (index !== defaultIndex) {
        entry.is_default = false;
      }
    });
  } else {
    const firstActiveIndex = normalized.findIndex((entry) => entry.is_active);
    if (firstActiveIndex >= 0) {
      normalized[firstActiveIndex].is_default = true;
    }
  }

  return normalized;
};

const resolvePreferredTerminalId = (registryEntries = [], preferredTerminalId = '') => {
  const activeEntries = Array.isArray(registryEntries)
    ? registryEntries.filter((entry) => entry?.is_active !== false)
    : [];
  if (activeEntries.length === 0) {
    return sanitizeTerminalId(preferredTerminalId);
  }

  const normalizedPreferred = sanitizeTerminalId(preferredTerminalId);
  if (normalizedPreferred && activeEntries.some((entry) => entry.terminal_id === normalizedPreferred)) {
    return normalizedPreferred;
  }

  const defaultEntry = activeEntries.find((entry) => entry.is_default === true);
  if (defaultEntry?.terminal_id) return defaultEntry.terminal_id;
  return activeEntries[0]?.terminal_id || '';
};

const readStoredTerminalId = () => {
  if (typeof window === 'undefined') return '';
  return sanitizeTerminalId(window.localStorage.getItem(TERMINAL_ID_STORAGE_KEY) || '');
};

const isRetryableTerminalOperationError = (error) => {
  if (!error?.response) return true;
  const status = Number(error?.response?.status || 0);
  return RETRYABLE_TERMINAL_OPERATION_STATUS_CODES.has(status);
};

const resolveTerminalOperationErrorDetails = (error) => ({
  message: String(error?.response?.data?.message || error?.message || 'Operation replay failed').trim(),
  code: String(error?.response?.data?.error_code || error?.code || '').trim() || undefined,
  status: Number(error?.response?.status || 0) || undefined
});

const computeRetryBackoffMs = (attemptCount = 1) => {
  const baseMs = 1500;
  const jitterMs = Math.floor(Math.random() * 250);
  return Math.min(90_000, (baseMs * (2 ** Math.max(0, attemptCount - 1))) + jitterMs);
};

const SUPPRESS_GLOBAL_ERROR_TOAST = Object.freeze({ skipGlobalErrorToast: true });

const lookupCompanyToken = async (email) => {
  const response = await api.post('/auth/lookup', { email }, { skipGlobalErrorToast: true });
  const tenant = response?.data?.data;
  return tenant?.company_token || null;
};
const isCompanyTokenResolutionError = (error) => {
  const status = Number(error?.response?.status || 0);
  const message = String(error?.response?.data?.message || '').toLowerCase();
  if (status === 404) {
    return message.includes('company token') || message.includes('tenant');
  }
  return status === 400 && message.includes('company token');
};

const resolveTerminalLoginErrorMessage = (error) => {
  const responseMessage = String(error?.response?.data?.message || '').trim();
  if (responseMessage) return responseMessage;

  const status = Number(error?.response?.status || 0);
  if (!status) {
    return 'Unable to reach the POS backend. Check the server connection and try again.';
  }

  if (status === 401) return 'Invalid email or password.';
  if (status === 403) return 'Your account is not allowed to unlock this terminal.';
  if (status === 404) return 'Email not registered in any company.';

  return 'Unable to sign in to terminal.';
};

const parseUserPermissions = (user) => {
  if (!user) return [];
  if (Array.isArray(user.permissions)) return user.permissions;
  if (typeof user.permissions === 'string') {
    try {
      const parsed = JSON.parse(user.permissions);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        const flattened = [];
        Object.entries(parsed).forEach(([entity, actions]) => {
          if (!actions || typeof actions !== 'object') return;
          Object.entries(actions).forEach(([action, allowed]) => {
            if (allowed) flattened.push(`${entity}:${action}`);
          });
        });
        return flattened;
      }
      return [];
    } catch {
      // Legacy fallback: comma-separated permissions.
      if (user.permissions.includes(',')) {
        return user.permissions
          .split(',')
          .map((permission) => String(permission || '').trim())
          .filter(Boolean);
      }
      return [];
    }
  }
  if (user.permissions && typeof user.permissions === 'object') {
    const flattened = [];
    Object.entries(user.permissions).forEach(([entity, actions]) => {
      if (!actions || typeof actions !== 'object') return;
      Object.entries(actions).forEach(([action, allowed]) => {
        if (allowed) flattened.push(`${entity}:${action}`);
      });
    });
    return flattened;
  }
  return [];
};

export default function TerminalPage() {
  const { workflowMode, modeChangeNotice, dismissModeChangeNotice } = useWorkflowMode();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('posTerminalSidebarCollapsed');
    return stored === '1';
  });
  const [locked, setLocked] = useState(() => !getAccessToken());
  const [drawerOpen, setDrawerOpen] = useState(() => !getAccessToken());
  const [loadingUser, setLoadingUser] = useState(false);
  const [terminalUser, setTerminalUser] = useState(null);
  const [onboardingSetupOpen, setOnboardingSetupOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTerminalId, setActiveTerminalId] = useState(() => readStoredTerminalId());
  const [terminalRegistry, setTerminalRegistry] = useState([]);
  const [terminalRegistryMode, setTerminalRegistryMode] = useState('warn');
  const [terminalMeta, setTerminalMeta] = useState({
    loading: true,
    pettyCashSymbol: DEFAULT_CURRENCY,
    pettyCashAmount: 0,
    activeDiscountCount: 0,
    enabledFeeMethods: [],
    locationBindingReadiness: null
  });
  const [complianceGate, setComplianceGate] = useState({
    loading: false,
    loadError: false,
    modeChoiceRequired: false,
    modeState: null,
    checklistReady: true,
    missingRequirementCount: 0,
    activationBlockers: []
  });
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    terminalId: readStoredTerminalId()
  });

  const [shiftState, setShiftState] = useState({
    loading: false,
    shift: null,
    cashSummary: null
  });
  const [todayDashboard, setTodayDashboard] = useState({
    loading: false,
    businessDate: null,
    salesSummary: null
  });
  const [reportRefreshKey, setReportRefreshKey] = useState(0);
  const [openShiftForm, setOpenShiftForm] = useState({
    openingFloatAmount: '',
    openingNote: ''
  });
  const [cashEventForm, setCashEventForm] = useState({
    eventType: 'cash_in',
    amount: '',
    reason: ''
  });
  const [closeShiftForm, setCloseShiftForm] = useState({
    closingCashAmount: '',
    closingNote: ''
  });
  const [shiftActionLoading, setShiftActionLoading] = useState({
    open: false,
    switchLocation: false,
    cashEvent: false,
    close: false
  });
  const [locationsState, setLocationsState] = useState({
    loading: false,
    locations: []
  });
  const [operatingLocationId, setOperatingLocationId] = useState(null);
  const [queueLocationScopeId, setQueueLocationScopeId] = useState(null);
  const [incomingOrdersState, setIncomingOrdersState] = useState({
    loading: false,
    orders: [],
    accessState: 'idle',
    errorMessage: ''
  });
  const [incomingOrderActionState, setIncomingOrderActionState] = useState({});
  const [receiptRequestId, setReceiptRequestId] = useState(null);
  const [incomingReceiptOpeningId, setIncomingReceiptOpeningId] = useState(null);
  const [receiptReturnViewMode, setReceiptReturnViewMode] = useState(null);
  const [historyRequestQuery, setHistoryRequestQuery] = useState('');
  const [incomingHistoryOpeningId, setIncomingHistoryOpeningId] = useState(null);
  const [catalogSearchPrefill, setCatalogSearchPrefill] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return String(params.get('catalog_search') || '').trim();
  });
  const [queuedTerminalOperations, setQueuedTerminalOperations] = useState([]);
  const [queueStatusFilter, setQueueStatusFilter] = useState('all');
  const [queueSummary, setQueueSummary] = useState({
    total: 0,
    pending: 0,
    blocked: 0,
    [TERMINAL_QUEUE_STATUS.QUEUED]: 0,
    [TERMINAL_QUEUE_STATUS.REPLAYING]: 0,
    [TERMINAL_QUEUE_STATUS.REPLAYED]: 0,
    [TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED]: 0
  });
  const [replayingQueuedTerminalOperations, setReplayingQueuedTerminalOperations] = useState(false);
  const [posViewMode, setPosViewMode] = useState('checkout');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const workspacePaneRef = useRef(null);
  const replayingQueueRef = useRef(false);
  const [isDesktopWide, setIsDesktopWide] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= DESKTOP_TERMINAL_BREAKPOINT_PX;
  });
  const isMsmeMode = isMsmeWorkflowMode(workflowMode);
  const modePosDefaults = useMemo(
    () => resolveBusinessModePosDefaults(workflowMode),
    [workflowMode]
  );
  const activeOperationsViewModes = useMemo(() => {
    const baseModes = isMsmeMode ? MSME_OPERATIONS_VIEW_MODES : OPERATIONS_VIEW_MODES;
    if (modePosDefaults.show_online_queue !== false) return baseModes;
    return baseModes.filter((mode) => !['incoming_queue', 'location_scope'].includes(mode));
  }, [isMsmeMode, modePosDefaults.show_online_queue]);
  const activeViewModes = useMemo(
    () => [...CHECKOUT_VIEW_MODES, ...activeOperationsViewModes],
    [activeOperationsViewModes]
  );

  const permissions = useMemo(() => parseUserPermissions(terminalUser), [terminalUser]);
  const activeTerminalRegistry = useMemo(
    () => (Array.isArray(terminalRegistry) ? terminalRegistry.filter((entry) => entry?.is_active !== false) : []),
    [terminalRegistry]
  );
  const terminalRegistryLookup = useMemo(() => {
    const lookup = new Map();
    activeTerminalRegistry.forEach((entry) => {
      lookup.set(String(entry.terminal_id || ''), entry);
    });
    return lookup;
  }, [activeTerminalRegistry]);
  const registryEnforced = terminalRegistryMode === 'enforce';
  const terminalIdOptions = useMemo(() => {
    const current = sanitizeTerminalId(activeTerminalId);
    const formTerminal = sanitizeTerminalId(formData.terminalId);
    const registryIds = activeTerminalRegistry.map((entry) => entry.terminal_id);
    const fallbackOptions = registryEnforced
      ? registryIds
      : (registryIds.length > 0 ? registryIds : DEFAULT_TERMINAL_ID_OPTIONS);
    const merged = new Set([...fallbackOptions, current, formTerminal].filter(Boolean));
    return Array.from(merged);
  }, [activeTerminalId, activeTerminalRegistry, formData.terminalId, registryEnforced]);
  const hasPermission = useCallback((permission) => {
    if (!terminalUser) return false;
    if (terminalUser.is_master_admin) return true;
    return permissions.includes(permission);
  }, [permissions, terminalUser]);

  const canViewPos = hasPermission('pos:view');
  const canTransactPos = hasPermission('pos:transact');
  const canSwitchPosLocation = hasPermission('pos:switch_location');
  const canAdjustCashDrawer = hasPermission('pos:cash_drawer_adjust');
  const canCloseDay = hasPermission('pos:close_day');
  const onboardingState = String(terminalUser?.onboarding?.tenant_onboarding_state || 'not_started').trim().toLowerCase();
  const onboardingProgress = terminalUser?.onboarding?.tenant_onboarding_progress?.checklist_snapshot || null;
  const showOnboardingReminder = !locked && terminalUser?.is_master_admin === true && onboardingState !== 'completed';
  const onboardingCompletedCount = Number(onboardingProgress?.completed_required_count || 0);
  const onboardingRequiredTotal = Number(onboardingProgress?.required_total || 0);

  const refreshTerminalOperationQueue = useCallback(async ({ keepResolved = true } = {}) => {
    const entries = await listTerminalOperationQueueEntries({
      includeResolved: keepResolved,
      limit: QUEUE_HISTORY_LIMIT
    });
    const summary = await getTerminalOperationQueueSummary();
    setQueuedTerminalOperations(entries);
    setQueueSummary(summary);
  }, []);

  const requestBackgroundQueueReplay = useCallback(async () => {
    if (typeof window === 'undefined') return false;
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    if (!registration || !('sync' in registration)) return false;
    try {
      await registration.sync.register('pos-terminal-operation-replay');
      return true;
    } catch {
      return false;
    }
  }, []);

  const enqueueTerminalOperationIntent = useCallback(async (entry, source = 'manual') => {
    const intentId = String(entry?.intent_id || entry?.payload?.idempotency_key || '').trim();
    if (!intentId) return null;
    await persistTerminalOperationIntent({
      ...entry,
      intent_id: intentId
    }, source);
    await pruneTerminalOperationHistory({ keep: QUEUE_HISTORY_LIMIT });
    await refreshTerminalOperationQueue();
    await requestBackgroundQueueReplay();
    return intentId;
  }, [refreshTerminalOperationQueue, requestBackgroundQueueReplay]);

  const hydrateTerminalMeta = useCallback(async ({ suppressGlobalErrors = false } = {}) => {
    setTerminalMeta((prev) => ({ ...prev, loading: true }));
    try {
      const allSettings = await getAllSettings({
        requestConfig: suppressGlobalErrors ? SUPPRESS_GLOBAL_ERROR_TOAST : {}
      });
      const pettyCashSymbol = String(allSettings?.pos_petty_cash_symbol?.value || DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY;
      const pettyCashAmount = Number(allSettings?.pos_petty_cash_amount?.value ?? 0);
      const normalizedRegistry = normalizeTerminalRegistry(allSettings?.pos_terminal_registry?.value || []);
      const resolvedRegistryMode = String(allSettings?.pos_terminal_registry_mode?.value || '')
        .trim()
        .toLowerCase();
      const normalizedRegistryMode = TERMINAL_REGISTRY_MODES.has(resolvedRegistryMode)
        ? resolvedRegistryMode
        : 'warn';

      let discountProfiles = allSettings?.pos_discount_profiles?.value || [];
      if (typeof discountProfiles === 'string') {
        try {
          discountProfiles = JSON.parse(discountProfiles);
        } catch {
          discountProfiles = [];
        }
      }
      const activeDiscountCount = Array.isArray(discountProfiles)
        ? discountProfiles.filter((profile) => profile && profile.active !== false && String(profile.name || '').trim()).length
        : 0;

      const enabledFeeMethods = ['dgfy_global_1pct'];

      setTerminalRegistry(normalizedRegistry);
      setTerminalRegistryMode(normalizedRegistryMode);

      const preferredTerminalId = resolvePreferredTerminalId(
        normalizedRegistry,
        readStoredTerminalId()
      );
      if (preferredTerminalId) {
        setActiveTerminalId((prev) => (prev === preferredTerminalId ? prev : preferredTerminalId));
        setFormData((prev) => (
          prev.terminalId === preferredTerminalId
            ? prev
            : { ...prev, terminalId: preferredTerminalId }
        ));
        if (typeof window !== 'undefined') {
          if (window.localStorage.getItem(TERMINAL_ID_STORAGE_KEY) !== preferredTerminalId) {
            window.localStorage.setItem(TERMINAL_ID_STORAGE_KEY, preferredTerminalId);
          }
        }
      }

      setTerminalMeta({
        loading: false,
        pettyCashSymbol,
        pettyCashAmount: Number.isFinite(pettyCashAmount) ? pettyCashAmount : 0,
        activeDiscountCount,
        enabledFeeMethods,
        locationBindingReadiness: null
      });
    } catch {
      setTerminalRegistry([]);
      setTerminalRegistryMode('warn');
      setTerminalMeta((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const refreshComplianceGate = useCallback(async ({ suppressGlobalErrors = false } = {}) => {
    if (locked) {
      setComplianceGate({
        loading: false,
        loadError: false,
        modeChoiceRequired: false,
        modeState: null,
        checklistReady: true,
        missingRequirementCount: 0,
        activationBlockers: []
      });
      return;
    }

    setComplianceGate((prev) => ({ ...prev, loading: true }));
    try {
      const profile = await getComplianceProfile(
        suppressGlobalErrors ? SUPPRESS_GLOBAL_ERROR_TOAST : {}
      );
      const checklist = profile?.checklist || {};
      const requirements = Array.isArray(checklist.requirements) ? checklist.requirements : [];
      const derivedMissingCount = requirements.length > 0
        ? requirements.filter((entry) => String(entry?.status || '').toLowerCase() !== 'complete').length
        : (
          (Array.isArray(checklist.missing_profile_fields) ? checklist.missing_profile_fields.length : 0)
          + (Array.isArray(checklist.missing_artifacts) ? checklist.missing_artifacts.length : 0)
          + (Array.isArray(checklist.missing_peripheral_classes) ? checklist.missing_peripheral_classes.length : 0)
          + (Array.isArray(checklist.missing_setting_keys) ? checklist.missing_setting_keys.length : 0)
        );
      setComplianceGate({
        loading: false,
        loadError: false,
        modeChoiceRequired: profile?.mode_choice_required === true,
        modeState: profile?.mode_state || null,
        checklistReady: checklist.ready_for_compliant_activation === true,
        missingRequirementCount: Math.max(0, Number(derivedMissingCount) || 0),
        activationBlockers: normalizeActivationBlockers(checklist.activation_blockers)
      });
    } catch {
      setComplianceGate({
        loading: false,
        loadError: true,
        modeChoiceRequired: false,
        modeState: null,
        checklistReady: false,
        missingRequirementCount: 0,
        activationBlockers: [
          normalizeActivationBlocker({
            code: 'COMPLIANCE_GATE_UNAVAILABLE',
            section: 'profile',
            message: 'Compliance status could not be loaded. POS remains blocked until compliance checks can be confirmed.',
            action_target: DEFAULT_COMPLIANCE_ACTION_TARGET
          })
        ]
      });
    }
  }, [locked]);

  const refreshOperationalContext = useCallback(async ({
    terminalIdOverride = null,
    suppressGlobalErrors = false
  } = {}) => {
    if (locked || !canViewPos) {
      setShiftState((prev) => ({ ...prev, loading: false }));
      setTodayDashboard((prev) => ({ ...prev, loading: false }));
      return;
    }
    const terminalId = sanitizeTerminalId(terminalIdOverride || activeTerminalId);
    if (!terminalId) {
      setShiftState((prev) => ({ ...prev, loading: false, shift: null, cashSummary: null }));
      setTodayDashboard((prev) => ({ ...prev, loading: false, businessDate: null, salesSummary: null }));
      return;
    }
    const scopedOperatingLocationId = Number.isInteger(Number(operatingLocationId))
      ? Number(operatingLocationId)
      : null;
    if (!scopedOperatingLocationId) {
      setShiftState((prev) => ({ ...prev, loading: false, shift: null, cashSummary: null }));
      setTodayDashboard((prev) => ({ ...prev, loading: false, businessDate: null, salesSummary: null }));
      return;
    }
    setShiftState((prev) => ({ ...prev, loading: true }));
    setTodayDashboard((prev) => ({ ...prev, loading: true }));
    try {
      const [currentShiftResult, dashboardResult] = await Promise.all([
        fetchCurrentTerminalShift(
          { terminal_id: terminalId, location_id: scopedOperatingLocationId },
          suppressGlobalErrors ? SUPPRESS_GLOBAL_ERROR_TOAST : {}
        ),
        fetchTerminalTodayDashboard(
          { terminal_id: terminalId, location_id: scopedOperatingLocationId },
          suppressGlobalErrors ? SUPPRESS_GLOBAL_ERROR_TOAST : {}
        )
      ]);

      const shiftPayload = currentShiftResult?.shift || null;
      const cashSummary = currentShiftResult?.cash_summary || null;
      const activeShift = dashboardResult?.active_shift || shiftPayload;
      const activeShiftSummary = dashboardResult?.active_shift_cash_summary || cashSummary;
      const readinessSummary = dashboardResult?.location_binding_readiness || currentShiftResult?.location_binding_readiness || null;

      setShiftState({
        loading: false,
        shift: activeShift,
        cashSummary: activeShiftSummary
      });
      const shiftLocationId = Number(activeShift?.location_id);
      if (Number.isInteger(shiftLocationId) && shiftLocationId > 0 && shiftLocationId !== scopedOperatingLocationId) {
        setOperatingLocationId(shiftLocationId);
      }
      setTodayDashboard({
        loading: false,
        businessDate: dashboardResult?.business_date || null,
        salesSummary: dashboardResult?.sales_summary || null
      });
      setTerminalMeta((prev) => ({
        ...prev,
        locationBindingReadiness: readinessSummary
      }));
    } catch (error) {
      setShiftState((prev) => ({ ...prev, loading: false }));
      setTodayDashboard((prev) => ({ ...prev, loading: false }));
      if (!suppressGlobalErrors && error?.response?.status !== 403) {
        toast.error(error?.response?.data?.message || 'Failed to load terminal operational context.');
      }
    }
  }, [activeTerminalId, canViewPos, locked, operatingLocationId]);

  const refreshTenantLocations = useCallback(async ({ suppressGlobalErrors = false } = {}) => {
    if (locked) return;
    setLocationsState((prev) => ({ ...prev, loading: true }));
    try {
      const rows = await listTenantLocations(
        { include_inactive: false },
        suppressGlobalErrors ? SUPPRESS_GLOBAL_ERROR_TOAST : {}
      );
      const activeLocations = (Array.isArray(rows) ? rows : [])
        .filter((location) => location?.is_active !== false)
        .sort((a, b) => {
          const aPrimary = a?.is_primary_storefront === true ? 1 : 0;
          const bPrimary = b?.is_primary_storefront === true ? 1 : 0;
          if (aPrimary !== bPrimary) return bPrimary - aPrimary;
          const aOpen = a?.is_open !== false ? 1 : 0;
          const bOpen = b?.is_open !== false ? 1 : 0;
          if (aOpen !== bOpen) return bOpen - aOpen;
          return String(a?.name || '').localeCompare(String(b?.name || ''));
        });
      setLocationsState({
        loading: false,
        locations: activeLocations
      });

      const fallbackLocationId = activeLocations.length > 0
        ? Number(activeLocations[0].location_id)
        : null;
      const hasOperatingLocation = operatingLocationId
        && activeLocations.some((location) => Number(location.location_id) === Number(operatingLocationId));
      const hasQueueLocationScope = queueLocationScopeId
        && activeLocations.some((location) => Number(location.location_id) === Number(queueLocationScopeId));

      if (!hasOperatingLocation) {
        setOperatingLocationId(fallbackLocationId);
      }
      if (!hasQueueLocationScope) {
        setQueueLocationScopeId(fallbackLocationId);
      }
    } catch {
      setLocationsState((prev) => ({ ...prev, loading: false }));
    }
  }, [locked, operatingLocationId, queueLocationScopeId]);

  const refreshIncomingOrders = useCallback(async ({ silent = false } = {}) => {
    if (locked) {
      setIncomingOrdersState({
        loading: false,
        orders: [],
        accessState: 'locked',
        errorMessage: ''
      });
      return;
    }

    if (!canViewPos) {
      setIncomingOrdersState({
        loading: false,
        orders: [],
        accessState: 'forbidden',
        errorMessage: 'You need POS view permission to access incoming online orders.'
      });
      return;
    }
    if (!queueLocationScopeId) {
      setIncomingOrdersState({
        loading: false,
        orders: [],
        accessState: 'idle',
        errorMessage: 'Select queue location scope to load incoming online orders.'
      });
      return;
    }

    if (!silent) {
      setIncomingOrdersState((prev) => ({
        ...prev,
        loading: true,
        accessState: 'allowed',
        errorMessage: ''
      }));
    }

    try {
      const params = queueLocationScopeId ? { location_id: queueLocationScopeId } : {};
      const payload = await fetchIncomingOnlineOrders(params, {
        skipGlobalErrorToast: silent === true
      });
      setIncomingOrdersState({
        loading: false,
        orders: Array.isArray(payload?.orders) ? payload.orders : [],
        accessState: 'allowed',
        errorMessage: ''
      });
    } catch (error) {
      const isForbidden = error?.response?.status === 403;
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setIncomingOrdersState({
        loading: false,
        orders: [],
        accessState: isForbidden ? 'forbidden' : 'error',
        errorMessage: isForbidden
          ? 'You need POS view permission to access incoming online orders.'
          : (offline ? 'You are offline. Incoming queue refresh is temporarily unavailable.' : (error?.response?.data?.message || 'Failed to load incoming online orders.'))
      });
      if (!silent && !offline) {
        toast.error(error?.response?.data?.message || 'Failed to load incoming online orders.');
      }
    }
  }, [canViewPos, locked, queueLocationScopeId]);

  const replayQueuedTerminalOperations = useCallback(async ({
    toastIfEmpty = false,
    force = false
  } = {}) => {
    if (locked || replayingQueueRef.current) return;
    if (!force && !isOnline) return;

    const candidates = await getReplayCandidateEntries({ limit: TERMINAL_OPERATION_REPLAY_BATCH_SIZE });
    if (!Array.isArray(candidates) || candidates.length === 0) {
      await refreshTerminalOperationQueue();
      if (toastIfEmpty) {
        toast.message('No queued terminal operations to replay.');
      }
      return;
    }

    replayingQueueRef.current = true;
    setReplayingQueuedTerminalOperations(true);
    let replayedCount = 0;
    let retryScheduledCount = 0;
    let failedManualCount = 0;
    let shouldRefreshOperational = false;
    let shouldRefreshIncoming = false;

    try {
      for (const candidate of candidates) {
        const intentId = String(candidate?.intent_id || '').trim();
        const operation = String(candidate?.operation || '').trim();
        const payload = candidate?.payload && typeof candidate.payload === 'object'
          ? candidate.payload
          : {};

        if (!intentId || !operation) {
          await markTerminalOperationFailedManualResolution(intentId, {
            error: {
              message: 'Queued operation is malformed and requires manual resolution.',
              code: 'POS_QUEUE_MALFORMED_ENTRY'
            }
          });
          failedManualCount += 1;
          continue;
        }

        await markTerminalOperationReplaying(intentId);
        try {
          if (operation === 'shift_open') {
            await openTerminalShift(payload);
            shouldRefreshOperational = true;
          } else if (operation === 'cash_event') {
            const shiftId = Number.parseInt(candidate?.shift_id || payload?.shift_id, 10);
            if (!Number.isInteger(shiftId) || shiftId <= 0) {
              throw new Error('Missing shift_id for queued cash event replay.');
            }
            await recordCashDrawerEvent(shiftId, payload);
            shouldRefreshOperational = true;
          } else if (operation === 'shift_close') {
            const shiftId = Number.parseInt(candidate?.shift_id || payload?.shift_id, 10);
            if (!Number.isInteger(shiftId) || shiftId <= 0) {
              throw new Error('Missing shift_id for queued shift-close replay.');
            }
            await closeTerminalShift(shiftId, payload);
            shouldRefreshOperational = true;
          } else if (operation === 'order_status_update') {
            const transactionId = Number.parseInt(candidate?.pos_transaction_id || payload?.pos_transaction_id, 10);
            if (!Number.isInteger(transactionId) || transactionId <= 0) {
              throw new Error('Missing pos_transaction_id for queued order-status replay.');
            }
            await updateOnlineOrderStatus(transactionId, payload);
            shouldRefreshIncoming = true;
          } else if (operation === 'checkout') {
            await createPosCheckout(payload);
            shouldRefreshOperational = true;
          } else {
            throw new Error(`Unsupported queued operation '${operation}'.`);
          }

          await markTerminalOperationReplayed(intentId);
          replayedCount += 1;
        } catch (error) {
          const errorDetails = resolveTerminalOperationErrorDetails(error);
          if (!isRetryableTerminalOperationError(error)) {
            await markTerminalOperationFailedManualResolution(intentId, { error: errorDetails });
            failedManualCount += 1;
            continue;
          }

          const nextAttemptCount = (Number(candidate?.attempt_count) || 0) + 1;
          if (nextAttemptCount >= TERMINAL_OPERATION_MAX_RETRIES) {
            await markTerminalOperationFailedManualResolution(intentId, { error: errorDetails });
            failedManualCount += 1;
            continue;
          }

          const nextRetryAt = Date.now() + computeRetryBackoffMs(nextAttemptCount);
          await markTerminalOperationRetryScheduled(intentId, {
            attemptCount: nextAttemptCount,
            nextRetryAt,
            error: errorDetails
          });
          retryScheduledCount += 1;
        }
      }

      if (shouldRefreshOperational) {
        await refreshOperationalContext();
      }
      if (shouldRefreshIncoming) {
        await refreshIncomingOrders({ silent: true });
      }

      await pruneTerminalOperationHistory({ keep: QUEUE_HISTORY_LIMIT });
      await refreshTerminalOperationQueue();

      if (replayedCount > 0) {
        toast.success(`${replayedCount} queued terminal operation${replayedCount === 1 ? '' : 's'} replayed.`);
      } else if (toastIfEmpty && retryScheduledCount === 0 && failedManualCount === 0) {
        toast.message('No queued terminal operations were replayed.');
      }

      if (retryScheduledCount > 0) {
        toast.message(
          `${retryScheduledCount} queued terminal operation${retryScheduledCount === 1 ? '' : 's'} scheduled for retry.`
        );
        await requestBackgroundQueueReplay();
      }

      if (failedManualCount > 0) {
        toast.warning(
          `${failedManualCount} queued terminal operation${failedManualCount === 1 ? '' : 's'} require manual resolution.`
        );
      }
    } finally {
      setReplayingQueuedTerminalOperations(false);
      replayingQueueRef.current = false;
    }
  }, [
    isOnline,
    locked,
    refreshIncomingOrders,
    refreshOperationalContext,
    refreshTerminalOperationQueue,
    requestBackgroundQueueReplay
  ]);

  const filteredQueueEntries = useMemo(() => {
    if (queueStatusFilter === 'all') return queuedTerminalOperations;
    return queuedTerminalOperations.filter((entry) => String(entry?.status || '') === queueStatusFilter);
  }, [queueStatusFilter, queuedTerminalOperations]);

  const handleRetryQueuedOperation = useCallback(async (intentId) => {
    const normalizedIntentId = String(intentId || '').trim();
    if (!normalizedIntentId) return;
    await markTerminalOperationQueued(normalizedIntentId, { preserveAttempts: true });
    await refreshTerminalOperationQueue();
    if (isOnline) {
      await replayQueuedTerminalOperations({ force: true });
      return;
    }
    await requestBackgroundQueueReplay();
    toast.message('Queued operation set back to queued. It will replay when connectivity returns.');
  }, [isOnline, refreshTerminalOperationQueue, replayQueuedTerminalOperations, requestBackgroundQueueReplay]);

  const handleResolveQueuedOperation = useCallback(async (intentId) => {
    const normalizedIntentId = String(intentId || '').trim();
    if (!normalizedIntentId) return;
    await markTerminalOperationResolved(normalizedIntentId);
    await pruneTerminalOperationHistory({ keep: QUEUE_HISTORY_LIMIT });
    await refreshTerminalOperationQueue();
    toast.success('Queued operation marked as manually resolved.');
  }, [refreshTerminalOperationQueue]);

  const hydrateUser = useCallback(async ({ suppressGlobalErrors = false } = {}) => {
    let token = getAccessToken();
    if (!token) {
      try {
        token = await refreshBrowserSession();
      } catch {
        token = '';
      }
    }
    if (!token) {
      setTerminalUser(null);
      setLocked(true);
      setDrawerOpen(true);
      return;
    }

    setLoadingUser(true);
    try {
      const user = await fetchCurrentUser(
        suppressGlobalErrors ? SUPPRESS_GLOBAL_ERROR_TOAST : {}
      );
      if (!user) {
        setTerminalUser(null);
        setLocked(true);
        setDrawerOpen(true);
        return;
      }
      setTerminalUser(user);
      setLocked(false);
      setDrawerOpen(false);
    } catch {
      setTerminalUser(null);
      setLocked(true);
      setDrawerOpen(true);
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    hydrateUser();
  }, [hydrateUser]);

  useEffect(() => {
    if (!locked) {
      hydrateTerminalMeta();
      return;
    }
    setTerminalMeta((prev) => ({ ...prev, loading: false }));
  }, [hydrateTerminalMeta, locked]);

  useEffect(() => {
    if (!locked) {
      refreshOperationalContext();
    }
  }, [locked, refreshOperationalContext]);

  useEffect(() => {
    if (!locked) {
      refreshTenantLocations();
    }
  }, [locked, refreshTenantLocations]);

  useEffect(() => {
    if (!locked) {
      refreshComplianceGate();
      return;
    }
    setComplianceGate({
      loading: false,
      loadError: false,
      modeChoiceRequired: false,
      modeState: null,
      checklistReady: true,
      missingRequirementCount: 0,
      activationBlockers: []
    });
  }, [locked, refreshComplianceGate]);

  useEffect(() => {
    if (locked || !canViewPos) {
      refreshIncomingOrders({ silent: true });
      return undefined;
    }
    refreshIncomingOrders();
    const timer = window.setInterval(() => {
      refreshIncomingOrders({ silent: true });
    }, ONLINE_ORDER_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [canViewPos, locked, refreshIncomingOrders]);

  useEffect(() => {
    if (shiftState.shift) return;
    const configuredPettyCash = Number(terminalMeta.pettyCashAmount ?? 0);
    if (!Number.isFinite(configuredPettyCash) || configuredPettyCash < 0) return;

    setOpenShiftForm((prev) => {
      const currentValue = String(prev.openingFloatAmount ?? '').trim();
      const parsedCurrentValue = Number(currentValue);
      const isEffectivelyEmpty = currentValue === '';
      const isZeroLike = Number.isFinite(parsedCurrentValue) && parsedCurrentValue === 0;
      if (!isEffectivelyEmpty && !(isZeroLike && configuredPettyCash > 0)) return prev;
      return {
        ...prev,
        openingFloatAmount: configuredPettyCash.toFixed(2)
      };
    });
  }, [shiftState.shift, terminalMeta.pettyCashAmount]);

  useEffect(() => {
    const onSessionExpired = () => {
      setLocked(true);
      setDrawerOpen(true);
      setTerminalUser(null);
    };

    window.addEventListener('auth:session-expired', onSessionExpired);
    window.addEventListener('auth:session-cleared', onSessionExpired);
    window.addEventListener('auth:logout', onSessionExpired);
    return () => {
      window.removeEventListener('auth:session-expired', onSessionExpired);
      window.removeEventListener('auth:session-cleared', onSessionExpired);
      window.removeEventListener('auth:logout', onSessionExpired);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('posTerminalSidebarCollapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!activeTerminalId) return;
    setFormData((prev) => (
      prev.terminalId === activeTerminalId
        ? prev
        : { ...prev, terminalId: activeTerminalId }
    ));
  }, [activeTerminalId]);

  useEffect(() => {
    if (!registryEnforced) return;
    const preferredTerminalId = resolvePreferredTerminalId(activeTerminalRegistry, activeTerminalId);
    if (!preferredTerminalId || preferredTerminalId === activeTerminalId) return;

    setActiveTerminalId(preferredTerminalId);
    setFormData((prev) => (
      prev.terminalId === preferredTerminalId
        ? prev
        : { ...prev, terminalId: preferredTerminalId }
    ));
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TERMINAL_ID_STORAGE_KEY, preferredTerminalId);
    }
  }, [activeTerminalId, activeTerminalRegistry, registryEnforced]);

  const headerSubtitle = useMemo(() => {
    const terminalLabel = activeTerminalId || 'No terminal selected';
    const modeLabel = getWorkflowModeLabel(workflowMode);
    if (loadingUser) return 'Loading terminal session...';
    if (locked) return `Terminal locked (${terminalLabel}) [${modeLabel}]. Sign in from the right panel.`;
    if (isMsmeMode) {
      return `Terminal ${terminalLabel}: MSME cashier workspace for checkout, history, receipt preview, and shift open/close.`;
    }
    return `Terminal ${terminalLabel}: cashier workspace for sell, orders, history, receipts, and shift controls.`;
  }, [activeTerminalId, isMsmeMode, loadingUser, locked, workflowMode]);

  const checkoutBlockedReason = useMemo(() => {
    if (locked) return 'Terminal locked. Login from the right panel.';
    if (complianceGate.loadError) return 'Compliance status is unavailable. Please refresh and retry.';
    if (complianceGate.modeChoiceRequired) return 'Compliance mode selection is required. Ask tenant master admin to select mode in Settings > Compliance.';
    if (complianceGate.modeState === 'compliant_pending' && complianceGate.checklistReady !== true) {
      return `Compliant mode activation checklist is incomplete (${complianceGate.missingRequirementCount} unresolved requirement${complianceGate.missingRequirementCount === 1 ? '' : 's'}). Complete required profile, settings, artifacts, and peripherals in Settings > Compliance.`;
    }
    if (!canTransactPos) return 'Your account does not have POS transact permission.';
    if (!shiftState.shift) return 'Open a shift before checkout.';
    return '';
  }, [canTransactPos, complianceGate.checklistReady, complianceGate.loadError, complianceGate.missingRequirementCount, complianceGate.modeChoiceRequired, complianceGate.modeState, locked, shiftState.shift]);

  const complianceBlockerDetails = useMemo(() => {
    if (locked) {
      return null;
    }
    if (complianceGate.loadError) {
      const firstBlocker = complianceGate.activationBlockers[0] || null;
      return {
        title: 'Compliance gate unavailable',
        message: 'POS operations are blocked until compliance readiness can be verified.',
        actionLabel: 'Open Compliance Settings',
        actionHref: firstBlocker?.action_target || DEFAULT_COMPLIANCE_ACTION_TARGET,
        missingRequirementCount: 0,
        blockers: complianceGate.activationBlockers,
        reasonCode: firstBlocker?.code || 'COMPLIANCE_GATE_UNAVAILABLE'
      };
    }
    if (complianceGate.modeChoiceRequired) {
      return {
        title: 'Compliance mode selection required',
        message: 'POS operations are blocked until a tenant master admin selects compliance mode.',
        actionLabel: 'Open Compliance Settings',
        actionHref: DEFAULT_COMPLIANCE_ACTION_TARGET,
        missingRequirementCount: 0,
        reasonCode: 'LEGACY_MODE_SELECTION_REQUIRED'
      };
    }
    if (complianceGate.modeState === 'compliant_pending' && complianceGate.checklistReady !== true) {
      const firstBlocker = complianceGate.activationBlockers[0] || null;
      return {
        title: 'Compliant activation checklist incomplete',
        message: `Finish all pending compliance requirements before terminal operations continue. ${complianceGate.missingRequirementCount} requirement${complianceGate.missingRequirementCount === 1 ? '' : 's'} remain unresolved.`,
        actionLabel: 'Resolve Checklist',
        actionHref: firstBlocker?.action_target || DEFAULT_COMPLIANCE_ACTION_TARGET,
        missingRequirementCount: complianceGate.missingRequirementCount,
        blockers: complianceGate.activationBlockers,
        reasonCode: firstBlocker?.code || 'COMPLIANCE_PROFILE_INCOMPLETE'
      };
    }
    return null;
  }, [complianceGate.activationBlockers, complianceGate.checklistReady, complianceGate.loadError, complianceGate.missingRequirementCount, complianceGate.modeChoiceRequired, complianceGate.modeState, locked]);

  const activeShiftId = shiftState?.shift?.pos_terminal_shift_id || null;
  const handleLogin = async (event) => {
    event.preventDefault();
    const email = String(formData.email || '').trim();
    const password = String(formData.password || '');
    const selectedTerminalId = sanitizeTerminalId(formData.terminalId);
    const registryEntry = terminalRegistryLookup.get(selectedTerminalId);

    if (!email || !password) {
      toast.error('Email and password are required.');
      return;
    }
    if (registryEnforced && !selectedTerminalId) {
      toast.error('Terminal ID is required when registry enforcement is enabled.');
      return;
    }
    if (registryEnforced && !registryEntry) {
      toast.error('Select an active terminal from the configured registry.');
      return;
    }
    if (!registryEnforced && selectedTerminalId && !registryEntry && activeTerminalRegistry.length > 0) {
      toast.warning(`Terminal ID ${selectedTerminalId} is not in the active registry. Continuing in warn mode.`);
    }

    setSubmitting(true);
    try {
      let resolvedCompanyToken = String(
        getCompanyToken() || ''
      ).trim();
      if (!resolvedCompanyToken) {
        resolvedCompanyToken = String(await lookupCompanyToken(email) || '').trim();
        if (!resolvedCompanyToken) {
          toast.error('Unable to resolve company token for this account.');
          return;
        }
      }
      try {
        await loginWithCredentials(
          { email, password, companyToken: resolvedCompanyToken },
          SUPPRESS_GLOBAL_ERROR_TOAST
        );
      } catch (error) {
        if (isCompanyTokenResolutionError(error)) {
          resolvedCompanyToken = String(await lookupCompanyToken(email) || '').trim();
          if (!resolvedCompanyToken) {
            toast.error('Unable to resolve company token for this account.');
            return;
          }
          await loginWithCredentials(
            { email, password, companyToken: resolvedCompanyToken },
            SUPPRESS_GLOBAL_ERROR_TOAST
          );
        } else {
          throw error;
        }
      }

      if (typeof window !== 'undefined') {
        if (selectedTerminalId) {
          window.localStorage.setItem(TERMINAL_ID_STORAGE_KEY, selectedTerminalId);
        } else {
          window.localStorage.removeItem(TERMINAL_ID_STORAGE_KEY);
        }
      }
      setActiveTerminalId(selectedTerminalId);
      await hydrateUser({ suppressGlobalErrors: true });
      await Promise.all([
        hydrateTerminalMeta({ suppressGlobalErrors: true }),
        refreshTenantLocations({ suppressGlobalErrors: true }),
        refreshOperationalContext({
          terminalIdOverride: selectedTerminalId,
          suppressGlobalErrors: true
        }),
        refreshComplianceGate({ suppressGlobalErrors: true })
      ]);
      setFormData((prev) => ({ ...prev, password: '', terminalId: selectedTerminalId }));
      toast.success(selectedTerminalId ? `Terminal unlocked (${selectedTerminalId}).` : 'Terminal unlocked.');
    } catch (error) {
      toast.error(resolveTerminalLoginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLock = () => {
    clearClientSession({
      reason: 'logout',
      broadcast: true,
      emitAuthEvents: true,
      redirectTo: null
    });
    setLocked(true);
    setDrawerOpen(true);
    setTerminalUser(null);
  };

  const handleOpenShift = async () => {
    if (complianceBlockerDetails) {
      toast.error(`${complianceBlockerDetails.title}. ${complianceBlockerDetails.message}`);
      return;
    }
    if (!canTransactPos) {
      toast.error('Your account does not have permission to open a shift.');
      return;
    }
    const terminalId = sanitizeTerminalId(activeTerminalId);
    if (!terminalId) {
      toast.error('Select a terminal ID before opening shift.');
      setDrawerOpen(true);
      return;
    }
    if (registryEnforced && !terminalRegistryLookup.has(terminalId)) {
      toast.error('Active terminal ID is no longer valid. Re-authenticate terminal identity.');
      setDrawerOpen(true);
      return;
    }
    if (!registryEnforced && activeTerminalRegistry.length > 0 && !terminalRegistryLookup.has(terminalId)) {
      toast.warning(`Terminal ID ${terminalId} is not in active registry. Shift open continues in warn mode.`);
    }
    const scopedOperatingLocationId = Number(operatingLocationId);
    if (!Number.isInteger(scopedOperatingLocationId) || scopedOperatingLocationId <= 0) {
      toast.error('Select an operating location before opening shift.');
      return;
    }

    const rawOpeningFloat = String(openShiftForm.openingFloatAmount ?? '').trim();
    const fallbackOpeningFloat = Number(terminalMeta.pettyCashAmount ?? 0);
    const openingFloatAmount = rawOpeningFloat === '' ? fallbackOpeningFloat : Number(rawOpeningFloat);
    if (!Number.isFinite(openingFloatAmount) || openingFloatAmount < 0) {
      toast.error('Opening float must be a non-negative number.');
      return;
    }

    const payload = {
      terminal_id: terminalId,
      location_id: scopedOperatingLocationId,
      opening_float_amount: openingFloatAmount,
      opening_note: String(openShiftForm.openingNote || '').trim() || undefined,
      idempotency_key: createIdempotencyKey('pos-shift-open')
    };
    const queueEntry = {
      intent_id: payload.idempotency_key,
      operation: 'shift_open',
      payload
    };

    if (!isOnline) {
      await enqueueTerminalOperationIntent(queueEntry, 'offline');
      const pendingCount = Number(queueSummary.pending || 0) + 1;
      toast.message(
        `You are offline. Shift-open action was queued and will replay automatically (${pendingCount} queued).`
      );
      return;
    }

    setShiftActionLoading((prev) => ({ ...prev, open: true }));
    try {
      const result = await openTerminalShift(payload);
      toast.success(result?.reused_existing ? 'Existing open shift found and reused.' : 'Terminal shift opened.');
      setOpenShiftForm({ openingFloatAmount: '', openingNote: '' });
      await refreshOperationalContext();
    } catch (error) {
      if (isRetryableTerminalOperationError(error)) {
        await enqueueTerminalOperationIntent(queueEntry, 'network_failure');
        const pendingCount = Number(queueSummary.pending || 0) + 1;
        toast.message(
          `Shift-open action queued after connectivity issue (${pendingCount} queued).`
        );
      } else {
        toast.error(error?.response?.data?.message || 'Failed to open terminal shift.');
      }
    } finally {
      setShiftActionLoading((prev) => ({ ...prev, open: false }));
    }
  };

  const handleSwitchShiftLocation = async ({ targetLocationId, reason }) => {
    if (!activeShiftId) {
      toast.error('No active shift to switch.');
      return;
    }
    if (!canSwitchPosLocation) {
      toast.error('Your account does not have permission to switch shift location.');
      return;
    }
    const normalizedTargetLocationId = Number.parseInt(targetLocationId, 10);
    if (!Number.isInteger(normalizedTargetLocationId) || normalizedTargetLocationId <= 0) {
      toast.error('Select a valid target location.');
      return;
    }
    const normalizedReason = String(reason || '').trim();
    if (normalizedReason.length < 8) {
      toast.error('Switch reason is required (at least 8 characters).');
      return;
    }

    setShiftActionLoading((prev) => ({ ...prev, switchLocation: true }));
    try {
      await switchTerminalShiftLocation(activeShiftId, {
        target_location_id: normalizedTargetLocationId,
        reason: normalizedReason,
        idempotency_key: createIdempotencyKey('pos-shift-switch')
      });
      setOperatingLocationId(normalizedTargetLocationId);
      toast.success('Shift location switched successfully.');
      await Promise.all([
        refreshOperationalContext(),
        refreshIncomingOrders({ silent: true })
      ]);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to switch shift location.');
    } finally {
      setShiftActionLoading((prev) => ({ ...prev, switchLocation: false }));
    }
  };

  const handleRecordCashEvent = async () => {
    if (complianceBlockerDetails) {
      toast.error(`${complianceBlockerDetails.title}. ${complianceBlockerDetails.message}`);
      return;
    }
    if (!activeShiftId) {
      toast.error('Open a shift first before recording cash drawer events.');
      return;
    }
    const amount = Number(cashEventForm.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Cash event amount must be greater than zero.');
      return;
    }
    const reason = String(cashEventForm.reason || '').trim();
    if (reason.length < 3) {
      toast.error('Please provide a short reason (at least 3 characters).');
      return;
    }

    const payload = {
      event_type: cashEventForm.eventType,
      amount,
      reason,
      idempotency_key: createIdempotencyKey('pos-cash-event')
    };
    const queueEntry = {
      intent_id: payload.idempotency_key,
      operation: 'cash_event',
      shift_id: activeShiftId,
      payload
    };

    if (!isOnline) {
      await enqueueTerminalOperationIntent(queueEntry, 'offline');
      const pendingCount = Number(queueSummary.pending || 0) + 1;
      toast.message(
        `You are offline. Cash drawer action was queued and will replay automatically (${pendingCount} queued).`
      );
      return;
    }

    setShiftActionLoading((prev) => ({ ...prev, cashEvent: true }));
    try {
      await recordCashDrawerEvent(activeShiftId, payload);
      toast.success('Cash drawer event recorded.');
      if (payload.event_type === 'cash_in') {
        try {
          await openPosDeviceDrawer({
            idempotency_key: createIdempotencyKey('pos-cash-event-drawer'),
            shift_id: activeShiftId,
            terminal_id: sanitizeTerminalId(activeTerminalId) || undefined,
            reason: 'cash_in_event_recorded'
          });
          toast.success('Cash drawer opened.');
        } catch (drawerError) {
          toast.error(
            drawerError?.response?.data?.message
            || 'Cash event was recorded, but the cash drawer did not open.'
          );
        }
      }
      setCashEventForm((prev) => ({ ...prev, amount: '', reason: '' }));
      await refreshOperationalContext();
    } catch (error) {
      if (isRetryableTerminalOperationError(error)) {
        await enqueueTerminalOperationIntent(queueEntry, 'network_failure');
        const pendingCount = Number(queueSummary.pending || 0) + 1;
        toast.message(
          `Cash drawer action queued after connectivity issue (${pendingCount} queued).`
        );
      } else {
        toast.error(error?.response?.data?.message || 'Failed to record cash drawer event.');
      }
    } finally {
      setShiftActionLoading((prev) => ({ ...prev, cashEvent: false }));
    }
  };

  const handleCloseShift = async () => {
    if (complianceBlockerDetails) {
      toast.error(`${complianceBlockerDetails.title}. ${complianceBlockerDetails.message}`);
      return;
    }
    if (!activeShiftId) {
      toast.error('No active shift to close.');
      return;
    }

    const closingCashAmount = String(closeShiftForm.closingCashAmount || '').trim() === ''
      ? Number(shiftState.cashSummary?.expected_cash_amount || 0)
      : Number(closeShiftForm.closingCashAmount);
    if (!Number.isFinite(closingCashAmount) || closingCashAmount < 0) {
      toast.error('Closing cash must be a non-negative number.');
      return;
    }

    const payload = {
      closing_cash_amount: closingCashAmount,
      closing_note: String(closeShiftForm.closingNote || '').trim() || undefined,
      idempotency_key: createIdempotencyKey('pos-shift-close')
    };
    const queueEntry = {
      intent_id: payload.idempotency_key,
      operation: 'shift_close',
      shift_id: activeShiftId,
      payload
    };

    if (!isOnline) {
      await enqueueTerminalOperationIntent(queueEntry, 'offline');
      const pendingCount = Number(queueSummary.pending || 0) + 1;
      toast.message(
        `You are offline. Shift-close action was queued and will replay automatically (${pendingCount} queued).`
      );
      return;
    }

    setShiftActionLoading((prev) => ({ ...prev, close: true }));
    try {
      await closeTerminalShift(activeShiftId, payload);
      toast.success('Shift closed successfully.');
      setCloseShiftForm({ closingCashAmount: '', closingNote: '' });
      await refreshOperationalContext();
    } catch (error) {
      if (isRetryableTerminalOperationError(error)) {
        await enqueueTerminalOperationIntent(queueEntry, 'network_failure');
        const pendingCount = Number(queueSummary.pending || 0) + 1;
        toast.message(
          `Shift-close action queued after connectivity issue (${pendingCount} queued).`
        );
      } else {
        toast.error(error?.response?.data?.message || 'Failed to close shift.');
      }
    } finally {
      setShiftActionLoading((prev) => ({ ...prev, close: false }));
    }
  };

  const handleIncomingOrderStatusChange = async (posTransactionId, fulfillmentStatus) => {
    const normalizedId = Number.parseInt(posTransactionId, 10);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      toast.error('Invalid order reference.');
      return;
    }

    const nextStatus = String(fulfillmentStatus || '').trim();
    if (!nextStatus) {
      toast.error('Select a valid status update action.');
      return;
    }

    const payload = {
      fulfillment_status: nextStatus,
      idempotency_key: createIdempotencyKey('pos-order-status')
    };
    const queueEntry = {
      intent_id: payload.idempotency_key,
      operation: 'order_status_update',
      pos_transaction_id: normalizedId,
      payload
    };

    if (!isOnline) {
      await enqueueTerminalOperationIntent(queueEntry, 'offline');
      const pendingCount = Number(queueSummary.pending || 0) + 1;
      toast.message(
        `You are offline. Order status update was queued and will replay automatically (${pendingCount} queued).`
      );
      return;
    }

    setIncomingOrderActionState((prev) => ({ ...prev, [normalizedId]: nextStatus }));
    try {
      await updateOnlineOrderStatus(normalizedId, payload);
      toast.success('Online order status updated.');
      await refreshIncomingOrders({ silent: true });
    } catch (error) {
      if (isRetryableTerminalOperationError(error)) {
        await enqueueTerminalOperationIntent(queueEntry, 'network_failure');
        const pendingCount = Number(queueSummary.pending || 0) + 1;
        toast.message(
          `Order status update queued after connectivity issue (${pendingCount} queued).`
        );
      } else {
        toast.error(error?.response?.data?.message || 'Failed to update online order status.');
      }
    } finally {
      setIncomingOrderActionState((prev) => {
        const next = { ...prev };
        delete next[normalizedId];
        return next;
      });
    }
  };

  const handleOpenIncomingOrderReceipt = (posTransactionId) => {
    const normalizedId = Number.parseInt(posTransactionId, 10);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      toast.error('Invalid order reference.');
      return;
    }

    if (incomingReceiptOpeningId !== null) return;

    setIncomingReceiptOpeningId(normalizedId);
    setReceiptReturnViewMode(posViewMode);
    setReceiptRequestId(normalizedId);
    if (workspacePaneRef.current) {
      workspacePaneRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setMobileNavOpen(false);
  };

  const handleOpenIncomingOrderHistory = (order = {}) => {
    const normalizedId = Number.parseInt(order?.pos_transaction_id, 10);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      toast.error('Invalid order reference.');
      return;
    }

    if (incomingHistoryOpeningId !== null) return;

    const query = String(
      order?.tracking_pin
      || order?.invoice_number
      || `#${normalizedId}`
    ).trim();
    if (!query) {
      toast.error('No searchable reference found for this order.');
      return;
    }

    setIncomingHistoryOpeningId(normalizedId);
    setHistoryRequestQuery(query);
    setPosViewMode('history');
    if (workspacePaneRef.current) {
      workspacePaneRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setMobileNavOpen(false);
  };

  const handleCheckoutCompleted = useCallback(async () => {
    await refreshOperationalContext();
    setReportRefreshKey((previous) => previous + 1);
  }, [refreshOperationalContext]);

  const handleCatalogSearchHydrated = useCallback(() => {
    setCatalogSearchPrefill('');
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('catalog_search');
    url.searchParams.delete('catalog_focus');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  const handleSelectViewMode = useCallback((nextMode) => {
    if (locked) {
      setMobileNavOpen(false);
      return;
    }
    if (!activeViewModes.includes(nextMode)) {
      setMobileNavOpen(false);
      return;
    }
    setPosViewMode(nextMode);
    if (workspacePaneRef.current) {
      workspacePaneRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setMobileNavOpen(false);
  }, [activeViewModes, locked]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => {
      setIsDesktopWide(window.innerWidth >= DESKTOP_TERMINAL_BREAKPOINT_PX);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isDesktopWide) {
      setMobileNavOpen(false);
    }
  }, [isDesktopWide]);

  useEffect(() => {
    let active = true;
    const bootstrapQueueStore = async () => {
      await hydrateTerminalOperationQueueStore();
      await pruneTerminalOperationHistory({ keep: QUEUE_HISTORY_LIMIT });
      if (!active) return;
      await refreshTerminalOperationQueue();
    };
    bootstrapQueueStore();
    return () => {
      active = false;
    };
  }, [refreshTerminalOperationQueue]);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      await refreshTerminalOperationQueue();
      await replayQueuedTerminalOperations({ force: true });
    };
    const handleOffline = () => setIsOnline(false);
    const handleServiceWorkerMessage = async (event) => {
      const eventType = String(event?.data?.type || '').trim();
      if (eventType !== 'pos-terminal-replay-requested') return;
      await replayQueuedTerminalOperations({ force: true });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, [refreshTerminalOperationQueue, replayQueuedTerminalOperations]);

  useEffect(() => {
    if (locked) return;
    refreshTerminalOperationQueue();
  }, [locked, refreshTerminalOperationQueue]);

  useEffect(() => {
    if (!isOnline || locked || Number(queueSummary.pending || 0) === 0) return;
    replayQueuedTerminalOperations();
  }, [isOnline, locked, queueSummary.pending, replayQueuedTerminalOperations]);

  useEffect(() => {
    if (!isOnline || locked || replayingQueuedTerminalOperations) return undefined;
    const nextRetryAtMs = queuedTerminalOperations
      .filter((entry) => String(entry?.status || '') === TERMINAL_QUEUE_STATUS.QUEUED)
      .map((entry) => new Date(entry?.next_retry_at || 0).getTime())
      .filter((retryAt) => Number.isFinite(retryAt) && retryAt > Date.now())
      .sort((left, right) => left - right)[0];
    if (!Number.isFinite(nextRetryAtMs) || nextRetryAtMs <= 0) return undefined;

    const waitMs = Math.max(300, nextRetryAtMs - Date.now());
    const timer = window.setTimeout(() => {
      replayQueuedTerminalOperations();
    }, waitMs);
    return () => window.clearTimeout(timer);
  }, [
    isOnline,
    locked,
    queuedTerminalOperations,
    replayingQueuedTerminalOperations,
    replayQueuedTerminalOperations
  ]);

  useEffect(() => {
    if (posViewMode === 'history' && !canViewPos) {
      setPosViewMode('checkout');
    }
  }, [canViewPos, posViewMode]);

  useEffect(() => {
    if (!canViewPos && ['incoming_queue', 'location_scope'].includes(posViewMode)) {
      setPosViewMode('checkout');
    }
  }, [canViewPos, posViewMode]);

  useEffect(() => {
    if (!activeViewModes.includes(posViewMode)) {
      setPosViewMode('checkout');
    }
  }, [activeViewModes, posViewMode]);

  const effectiveSidebarCollapsed = isDesktopWide ? sidebarCollapsed : false;
  const isCheckoutWorkspaceMode = CHECKOUT_VIEW_MODES.includes(posViewMode);
  const isOperationsWorkspaceMode = activeOperationsViewModes.includes(posViewMode);

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100 p-6 text-sm text-slate-500">Loading terminal workspace...</div>}>
      <>
        {showOnboardingReminder && (
          <div className="fixed right-4 top-4 z-[70] max-w-[min(92vw,420px)] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-lg shadow-amber-900/10">
            <span>
              Tenant onboarding is incomplete ({onboardingCompletedCount}/{onboardingRequiredTotal} required checks).
            </span>
            <button
              type="button"
              className="ml-1 font-extrabold underline underline-offset-2"
              onClick={() => setOnboardingSetupOpen(true)}
            >
              Continue in Settings.
            </button>
          </div>
        )}
        <OnboardingSetupModal
          open={onboardingSetupOpen}
          onClose={() => setOnboardingSetupOpen(false)}
          onboarding={terminalUser?.onboarding || null}
          currentUser={terminalUser}
          workflowMode={workflowMode}
          onRefreshUser={hydrateUser}
        />
        <TerminalPageLayout
          locked={locked}
          isOnline={isOnline}
          activeTerminalId={activeTerminalId}
          terminalIdOptions={terminalIdOptions}
          terminalRegistry={activeTerminalRegistry}
          terminalRegistryMode={terminalRegistryMode}
          registryEnforced={registryEnforced}
          headerSubtitle={headerSubtitle}
          mobileNavOpen={mobileNavOpen}
          setMobileNavOpen={setMobileNavOpen}
          isDesktopWide={isDesktopWide}
          canViewPos={canViewPos}
          canAdjustCashDrawer={canAdjustCashDrawer}
          canCloseDay={canCloseDay}
          terminalUser={terminalUser}
          posViewMode={posViewMode}
          isMsmeMode={isMsmeMode}
          shiftState={shiftState}
          incomingOrdersState={incomingOrdersState}
          locationsState={locationsState}
          operatingLocationId={operatingLocationId}
          queueLocationScopeId={queueLocationScopeId}
          handleSelectViewMode={handleSelectViewMode}
          handleLock={handleLock}
          setDrawerOpen={setDrawerOpen}
          effectiveSidebarCollapsed={effectiveSidebarCollapsed}
          isCheckoutWorkspaceMode={isCheckoutWorkspaceMode}
          isOperationsWorkspaceMode={isOperationsWorkspaceMode}
          TERMINAL_SECTION_IDS={TERMINAL_SECTION_IDS}
          workspacePaneRef={workspacePaneRef}
          canTransactPos={canTransactPos}
          terminalMeta={terminalMeta}
          todayDashboard={todayDashboard}
          reportRefreshKey={reportRefreshKey}
          openShiftForm={openShiftForm}
          setOpenShiftForm={setOpenShiftForm}
          cashEventForm={cashEventForm}
          setCashEventForm={setCashEventForm}
          closeShiftForm={closeShiftForm}
          setCloseShiftForm={setCloseShiftForm}
          shiftActionLoading={shiftActionLoading}
          handleOpenShift={handleOpenShift}
          canSwitchPosLocation={canSwitchPosLocation}
          handleSwitchShiftLocation={handleSwitchShiftLocation}
          handleRecordCashEvent={handleRecordCashEvent}
          handleCloseShift={handleCloseShift}
          refreshOperationalContext={refreshOperationalContext}
          setOperatingLocationId={setOperatingLocationId}
          setQueueLocationScopeId={setQueueLocationScopeId}
          incomingOrderActionState={incomingOrderActionState}
          handleIncomingOrderStatusChange={handleIncomingOrderStatusChange}
          handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
          handleOpenIncomingOrderHistory={handleOpenIncomingOrderHistory}
          incomingReceiptOpeningId={incomingReceiptOpeningId}
          incomingHistoryOpeningId={incomingHistoryOpeningId}
          refreshIncomingOrders={refreshIncomingOrders}
          setSidebarCollapsed={setSidebarCollapsed}
          activeShiftId={activeShiftId}
          checkoutBlockedReason={checkoutBlockedReason}
          complianceBlockerDetails={complianceBlockerDetails}
          queuedTerminalOperationCount={queueSummary.pending}
          queuedTerminalBlockedCount={queueSummary.blocked}
          queuedTerminalOperations={filteredQueueEntries}
          queueStatusFilter={queueStatusFilter}
          setQueueStatusFilter={setQueueStatusFilter}
          queueSummary={queueSummary}
          replayingQueuedTerminalOperations={replayingQueuedTerminalOperations}
          handleReplayQueuedTerminalOperations={replayQueuedTerminalOperations}
          handleRetryQueuedOperation={handleRetryQueuedOperation}
          handleResolveQueuedOperation={handleResolveQueuedOperation}
          handleCheckoutCompleted={handleCheckoutCompleted}
          setPosViewMode={setPosViewMode}
          modeChangeNotice={modeChangeNotice}
          dismissModeChangeNotice={dismissModeChangeNotice}
          receiptRequestId={receiptRequestId}
          setReceiptRequestId={setReceiptRequestId}
          receiptReturnViewMode={receiptReturnViewMode}
          setReceiptReturnViewMode={setReceiptReturnViewMode}
          setIncomingReceiptOpeningId={setIncomingReceiptOpeningId}
          historyRequestQuery={historyRequestQuery}
          setHistoryRequestQuery={setHistoryRequestQuery}
          setIncomingHistoryOpeningId={setIncomingHistoryOpeningId}
          catalogSearchPrefill={catalogSearchPrefill}
          onCatalogSearchHydrated={handleCatalogSearchHydrated}
          drawerOpen={drawerOpen}
          formData={formData}
          setFormData={setFormData}
          submitting={submitting}
          handleLogin={handleLogin}
        />
      </>
    </Suspense>
  );
}

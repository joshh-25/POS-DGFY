import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  closeTerminalShift,
  fetchIncomingOnlineOrders,
  fetchPosCatalog,
  fetchCurrentTerminalShift,
  fetchTerminalTodayDashboard,
  openPosDeviceDrawer,
  openTerminalShift,
  switchTerminalShiftLocation,
  recordCashDrawerEvent,
  updateOnlineOrderStatus
} from '../services/posService';
import { login as loginWithCredentials, getCurrentUser as fetchCurrentUser } from '@/services/authService.js';
import {
  completeDgfyLegacyLink,
  getStoredDgfyToken,
  listDgfyAccountCompanies,
  loginDgfyAccount,
  requestDgfyLegacyLinkEmailOtp,
  startDgfyLegacyRegistrationHandoff,
  startDgfyPosSession
} from '@/services/dgfyAuthService.js';
import { trackOnboardingEvent } from '@/services/onboardingService.js';
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
  POS_TERMINAL_LOGIN_ERROR_CODES,
  createTerminalLoginError,
  isCompanyTokenResolutionError,
  normalizeLookupTenantOptions,
  resolveTerminalLoginErrorMessage,
  shouldFallbackToCurrentCompanyTokenAfterLookupError
} from '../utils/terminalUnlockDiagnostics.js';
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
import {
  DEFAULT_TERMINAL_ID_OPTIONS,
  TERMINAL_REGISTRY_MODES,
  normalizeTerminalRegistry,
  resolveLoginTerminalId,
  resolvePreferredTerminalId,
  sanitizeTerminalId
} from '../utils/terminalIdentity.js';

import TerminalPageLayout from '../components/TerminalPageLayout.jsx';
import PosHardwareMessageModal from '../components/PosHardwareMessageModal.jsx';
import OnboardingSetupModal from '../../onboarding/components/OnboardingSetupModal.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { emitPosHardwareMessage, POS_HARDWARE_MESSAGE_EVENT_NAME } from '../utils/posHardwareMessageBus.js';
const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';

const DEFAULT_CURRENCY = 'PHP';
const TERMINAL_ID_STORAGE_KEY = 'pos_terminal_identity_v1';
const TERMINAL_LOCK_STORAGE_KEY = 'pos_terminal_locked_v1';
const ONLINE_ORDER_POLL_INTERVAL_MS = 12000;
const QUEUE_HISTORY_LIMIT = 250;
const TERMINAL_OPERATION_MAX_RETRIES = 5;
const TERMINAL_OPERATION_REPLAY_BATCH_SIZE = 25;
const DESKTOP_TERMINAL_BREAKPOINT_PX = IS_DGFY_POS_SURFACE ? 1024 : 1280;
const CHECKOUT_VIEW_MODES = ['checkout', 'history', 'receipt'];
const OPERATIONS_VIEW_MODES = [
  'incoming_queue',
  'settings_profile',
  'settings_pos',
  'settings_storefront',
  'shift_controls',
  'cash_drawer',
  'close_shift',
  'reports',
  'items',
  'terminal_setup'
];
const MSME_OPERATIONS_VIEW_MODES = ['shift_controls', 'close_shift', 'items', 'settings_profile', 'settings_pos', 'settings_storefront'];
const TERMINAL_SECTION_IDS = {
  checkoutWorkspace: 'pos-checkout-workspace',
  terminalSetup: 'pos-section-terminal-setup',
  activeShift: 'pos-section-active-shift',
  cashDrawer: 'pos-section-cash-drawer',
  closeShift: 'pos-section-close-shift',
  locationScope: 'pos-section-location-scope',
  incomingOrders: 'pos-section-incoming-orders',
  reports: 'pos-section-reports',
  items: 'pos-section-items'
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

const readStoredTerminalId = () => {
  if (typeof window === 'undefined') return '';
  return sanitizeTerminalId(window.localStorage.getItem(TERMINAL_ID_STORAGE_KEY) || '');
};

const readStoredTerminalLock = () => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(TERMINAL_LOCK_STORAGE_KEY) === '1';
};

const setStoredTerminalLock = (locked) => {
  if (typeof window === 'undefined') return;
  if (locked) {
    window.localStorage.setItem(TERMINAL_LOCK_STORAGE_KEY, '1');
  } else {
    window.localStorage.removeItem(TERMINAL_LOCK_STORAGE_KEY);
  }
};

const readInitialTerminalId = () => resolvePreferredTerminalId(
  [],
  readStoredTerminalId(),
  { registryMode: 'warn' }
);

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

const lookupCompanyToken = async (email, preferredCompanyToken = '') => {
  const response = await api.post('/auth/lookup', { email }, { skipGlobalErrorToast: true });
  const tenants = normalizeLookupTenantOptions(response?.data?.data);
  const normalizedPreferred = String(preferredCompanyToken || '').trim();
  if (normalizedPreferred && tenants.some((tenant) => tenant?.company_token === normalizedPreferred)) {
    return normalizedPreferred;
  }
  if (tenants.length === 1) {
    return tenants[0]?.company_token || null;
  }
  if (tenants.length > 1) {
    throw createTerminalLoginError(
      'This email belongs to multiple companies. Sign in from SKUpervisor once, then reopen POS for the selected company.',
      POS_TERMINAL_LOGIN_ERROR_CODES.MULTIPLE_TENANTS
    );
  }
  return null;
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
  const [locked, setLocked] = useState(() => readStoredTerminalLock() || !getAccessToken());
  const [drawerOpen, setDrawerOpen] = useState(() => readStoredTerminalLock() || !getAccessToken());
  const [loadingUser, setLoadingUser] = useState(false);
  const [terminalUser, setTerminalUser] = useState(null);
  const [onboardingSetupOpen, setOnboardingSetupOpen] = useState(false);
  const [onboardingDismissedThisSession, setOnboardingDismissedThisSession] = useState(false);
  const [closeShiftConfirmOpen, setCloseShiftConfirmOpen] = useState(false);
  const [hardwareMessage, setHardwareMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const onboardingReminderTrackedRef = useRef(false);
  const [activeTerminalId, setActiveTerminalId] = useState(() => readInitialTerminalId());
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
    dgfyTenantId: '',
    terminalId: readInitialTerminalId()
  });
  const [terminalUnlockRequired, setTerminalUnlockRequired] = useState(false);
  const [terminalUnlockModalOpen, setTerminalUnlockModalOpen] = useState(false);
  const [terminalUnlockForm, setTerminalUnlockForm] = useState({
    terminalId: readInitialTerminalId(),
    terminalPassword: '',
    openingFloatAmount: '',
    openingNote: ''
  });
  const [dgfyPosState, setDgfyPosState] = useState({
    authenticated: false,
    account: null,
    companies: [],
    loadingCompanies: false
  });
  const [legacyLinkState, setLegacyLinkState] = useState({
    otpSent: false,
    code: '',
    loading: false
  });
  const [legacyDgfyLinkBannerDismissed, setLegacyDgfyLinkBannerDismissed] = useState(false);

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
  const [itemsStockFilterPreset, setItemsStockFilterPreset] = useState('');
  const [stockAlertSummary, setStockAlertSummary] = useState({
    open: false,
    almostOutOfStock: [],
    outOfStock: []
  });
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
    return baseModes.filter((mode) => mode !== 'incoming_queue');
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
  const canCreateItems = hasPermission('items:create');
  const canEditItems = hasPermission('items:edit');
  const canDeleteItems = hasPermission('items:delete');
  const onboardingState = String(terminalUser?.onboarding?.tenant_onboarding_state || 'not_started').trim().toLowerCase();
  const onboardingProgress = terminalUser?.onboarding?.tenant_onboarding_progress?.checklist_snapshot || null;
  const showOnboardingReminder = !locked && terminalUser?.is_master_admin === true && onboardingState !== 'completed';
  const onboardingCompletedCount = Number(onboardingProgress?.completed_required_count || 0);
  const onboardingRequiredTotal = Number(onboardingProgress?.required_total || 0);

  useEffect(() => {
    if (!showOnboardingReminder) {
      onboardingReminderTrackedRef.current = false;
      setOnboardingDismissedThisSession(false);
      return;
    }

    if (!onboardingReminderTrackedRef.current) {
      onboardingReminderTrackedRef.current = true;
      trackOnboardingEvent({
        eventKey: 'reminder_shown',
        metadata: { surface: 'pos_terminal' }
      }).catch(() => {});
    }

    if (onboardingDismissedThisSession) return;
    setOnboardingSetupOpen(true);
  }, [onboardingDismissedThisSession, showOnboardingReminder]);

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
        readStoredTerminalId(),
        { registryMode: normalizedRegistryMode }
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
      const preferredTerminalId = resolvePreferredTerminalId(
        [],
        readStoredTerminalId(),
        { registryMode: 'warn' }
      );
      if (preferredTerminalId) {
        setActiveTerminalId((prev) => (prev === preferredTerminalId ? prev : preferredTerminalId));
        setFormData((prev) => (
          prev.terminalId === preferredTerminalId
            ? prev
            : { ...prev, terminalId: preferredTerminalId }
        ));
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(TERMINAL_ID_STORAGE_KEY, preferredTerminalId);
        }
      }
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
      return { shift: null, cashSummary: null };
    }
    const terminalId = sanitizeTerminalId(terminalIdOverride || activeTerminalId);
    if (!terminalId) {
      setShiftState((prev) => ({ ...prev, loading: false, shift: null, cashSummary: null }));
      setTodayDashboard((prev) => ({ ...prev, loading: false, businessDate: null, salesSummary: null }));
      return { shift: null, cashSummary: null };
    }
    const scopedOperatingLocationId = Number.isInteger(Number(operatingLocationId))
      ? Number(operatingLocationId)
      : null;
    setShiftState((prev) => ({ ...prev, loading: true }));
    setTodayDashboard((prev) => ({ ...prev, loading: true }));
    try {
      const currentShiftParams = scopedOperatingLocationId
        ? { terminal_id: terminalId, location_id: scopedOperatingLocationId }
        : { terminal_id: terminalId };
      const currentShiftResult = await fetchCurrentTerminalShift(
        currentShiftParams,
        suppressGlobalErrors ? SUPPRESS_GLOBAL_ERROR_TOAST : {}
      );
      const shiftPayload = currentShiftResult?.shift || null;
      const cashSummary = currentShiftResult?.cash_summary || null;
      const shiftLocationId = Number(shiftPayload?.location_id);
      const effectiveLocationId = Number.isInteger(shiftLocationId) && shiftLocationId > 0
        ? shiftLocationId
        : scopedOperatingLocationId;
      const dashboardResult = effectiveLocationId
        ? await fetchTerminalTodayDashboard(
          { terminal_id: terminalId, location_id: effectiveLocationId },
          suppressGlobalErrors ? SUPPRESS_GLOBAL_ERROR_TOAST : {}
        )
        : null;
      const activeShift = dashboardResult?.active_shift || shiftPayload;
      const activeShiftSummary = dashboardResult?.active_shift_cash_summary || cashSummary;
      const readinessSummary = dashboardResult?.location_binding_readiness || currentShiftResult?.location_binding_readiness || null;

      setShiftState({
        loading: false,
        shift: activeShift,
        cashSummary: activeShiftSummary
      });
      const activeShiftLocationId = Number(activeShift?.location_id);
      if (Number.isInteger(activeShiftLocationId) && activeShiftLocationId > 0 && activeShiftLocationId !== scopedOperatingLocationId) {
        setOperatingLocationId(activeShiftLocationId);
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
      return { shift: activeShift, cashSummary: activeShiftSummary };
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

    const candidates = (await getReplayCandidateEntries({ limit: TERMINAL_OPERATION_REPLAY_BATCH_SIZE }))
      .filter((candidate) => String(candidate?.operation || '').trim() !== 'checkout');
    if (!Array.isArray(candidates) || candidates.length === 0) {
      await refreshTerminalOperationQueue();
      if (toastIfEmpty) {
        toast.message('No pending operational sync tasks to replay.');
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
    if (readStoredTerminalLock()) {
      setTerminalUser(null);
      setLocked(true);
      setDrawerOpen(true);
      return;
    }

    let token = getAccessToken();
    if (IS_DGFY_POS_SURFACE && !token) {
      setTerminalUser(null);
      setLocked(true);
      setDrawerOpen(true);
      return;
    }
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
    setTerminalUnlockForm((prev) => (
      prev.terminalId === activeTerminalId
        ? prev
        : { ...prev, terminalId: activeTerminalId }
    ));
  }, [activeTerminalId]);

  useEffect(() => {
    if (!registryEnforced) return;
    const preferredTerminalId = resolvePreferredTerminalId(
      activeTerminalRegistry,
      activeTerminalId,
      { registryMode: terminalRegistryMode }
    );
    if (!preferredTerminalId || preferredTerminalId === activeTerminalId) return;

    setActiveTerminalId(preferredTerminalId);
    setFormData((prev) => (
      prev.terminalId === preferredTerminalId
        ? prev
        : { ...prev, terminalId: preferredTerminalId }
    ));
    setTerminalUnlockForm((prev) => (
      prev.terminalId === preferredTerminalId
        ? prev
        : { ...prev, terminalId: preferredTerminalId }
    ));
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TERMINAL_ID_STORAGE_KEY, preferredTerminalId);
    }
  }, [activeTerminalId, activeTerminalRegistry, registryEnforced, terminalRegistryMode]);

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
  const requiresOpenShift = !locked && !shiftState.loading && !activeShiftId;
  const showLegacyDgfyLinkBanner = terminalUser
    && terminalUser.dgfy_link_status
    && terminalUser.dgfy_link_status !== 'linked'
    && !legacyDgfyLinkBannerDismissed;

  const handleRequestLegacyLinkOtp = async () => {
    setLegacyLinkState((prev) => ({ ...prev, loading: true }));
    try {
      await requestDgfyLegacyLinkEmailOtp();
      setLegacyLinkState((prev) => ({ ...prev, otpSent: true }));
      toast.success('DGFY linking code sent to your IMS/POS email.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to send DGFY linking code.');
    } finally {
      setLegacyLinkState((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleCompleteLegacyLink = async () => {
    const code = String(legacyLinkState.code || '').trim();
    if (!code) {
      toast.error('Enter the DGFY linking code.');
      return;
    }
    if (!getStoredDgfyToken()) {
      toast.error('Sign in with your DGFY account first, then complete linking.');
      return;
    }
    setLegacyLinkState((prev) => ({ ...prev, loading: true }));
    try {
      await completeDgfyLegacyLink({ emailOtpCode: code });
      await hydrateUser({ suppressGlobalErrors: true });
      setLegacyLinkState({ otpSent: false, code: '', loading: false });
      toast.success('DGFY account linked to this IMS/POS user.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to link DGFY account.');
      setLegacyLinkState((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleStartLegacyRegistration = async () => {
    try {
      const payload = await startDgfyLegacyRegistrationHandoff();
      const url = payload?.return_to || '/dgfy/auth?intent=legacy-link';
      if (typeof window !== 'undefined') {
        window.location.href = url;
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to start DGFY registration.');
    }
  };

  const resolveSelectedLoginTerminalId = () => resolveLoginTerminalId({
      selectedTerminalId: formData.terminalId,
      registryEnforced,
      registryEntries: activeTerminalRegistry,
      registryMode: terminalRegistryMode
    });

  const validateSelectedTerminalForUnlock = (selectedTerminalId) => {
    const registryEntry = terminalRegistryLookup.get(selectedTerminalId);
    if (registryEnforced && activeTerminalRegistry.length === 0) {
      toast.error('No active terminals configured. Add one in Settings > POS Setup > Terminal Registry.');
      return false;
    }
    if (registryEnforced && !selectedTerminalId) {
      toast.error('Terminal ID is required when registry enforcement is enabled.');
      return false;
    }
    if (registryEnforced && !registryEntry) {
      toast.error('Select an active terminal from the configured registry.');
      return false;
    }
    if (!registryEnforced && selectedTerminalId && !registryEntry && activeTerminalRegistry.length > 0) {
      toast.warning(`Terminal ID ${selectedTerminalId} is not in the active registry. Continuing in warn mode.`);
    }
    return true;
  };

  const notifyStockAlertsAfterUnlock = useCallback(async () => {
    try {
      const data = await fetchPosCatalog({ limit: 200 });
      const catalogItems = Array.isArray(data) ? data : [];
      const summary = catalogItems.reduce((accumulator, item) => {
        const stockQuantity = Number(item?.current_stock || 0);
        const threshold = Number(item?.min_threshold);
        const lowStockThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 5;
        const itemLabel = String(item?.name || item?.sku_code || `Item #${item?.item_id || ''}`).trim();

        if (stockQuantity <= 0) {
          accumulator.outOfStock.push(itemLabel);
        } else if (stockQuantity <= lowStockThreshold) {
          accumulator.almostOutOfStock.push(itemLabel);
        }

        return accumulator;
      }, { almostOutOfStock: [], outOfStock: [] });

      if (summary.almostOutOfStock.length === 0 && summary.outOfStock.length === 0) {
        setStockAlertSummary({ open: false, almostOutOfStock: [], outOfStock: [] });
        return;
      }

      setStockAlertSummary({
        open: true,
        almostOutOfStock: summary.almostOutOfStock,
        outOfStock: summary.outOfStock
      });
    } catch {
      // Inventory alert load failures must not block terminal unlock.
    }
  }, []);

  const completeTerminalUnlock = async (selectedTerminalId, { operatingLocationIdOverride = null } = {}) => {
    if (typeof window !== 'undefined') {
      if (selectedTerminalId) {
        window.localStorage.setItem(TERMINAL_ID_STORAGE_KEY, selectedTerminalId);
      } else {
        window.localStorage.removeItem(TERMINAL_ID_STORAGE_KEY);
      }
    }
    setStoredTerminalLock(false);
    setActiveTerminalId(selectedTerminalId);
    if (Number.isInteger(Number(operatingLocationIdOverride)) && Number(operatingLocationIdOverride) > 0) {
      setOperatingLocationId(Number(operatingLocationIdOverride));
    }
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
    setTerminalUnlockRequired(false);
    setTerminalUnlockForm({
      terminalId: selectedTerminalId,
      terminalPassword: '',
      openingFloatAmount: '',
      openingNote: ''
    });
    setTerminalUnlockModalOpen(false);
    await notifyStockAlertsAfterUnlock();
  };

  const handleDgfyPosLogin = async (event) => {
    event.preventDefault();
    const email = String(formData.email || '').trim();
    const password = String(formData.password || '');

    setSubmitting(true);
    try {
      let token = '';
      if (!dgfyPosState.authenticated) {
        if (!email || !password) {
          toast.error('DGFY email and password are required.');
          return;
        }
        const loginResult = await loginDgfyAccount({ email, password });
        token = loginResult?.token || '';
        setDgfyPosState((prev) => ({
          ...prev,
          authenticated: true,
          account: loginResult?.account || null,
          companies: []
        }));
      } else {
        token = getStoredDgfyToken();
      }

      setDgfyPosState((prev) => ({ ...prev, loadingCompanies: true }));
      const companiesResult = await listDgfyAccountCompanies(token);
      const acceptedCompanies = [
        ...(Array.isArray(companiesResult?.owned_companies) ? companiesResult.owned_companies : []),
        ...(Array.isArray(companiesResult?.invited_companies) ? companiesResult.invited_companies : [])
      ].filter((company) => company?.can_switch);
      const selectedTenantId = String(formData.dgfyTenantId || '').trim()
        || (acceptedCompanies.length === 1 ? String(acceptedCompanies[0]?.tenant_id || '') : '');
      setDgfyPosState((prev) => ({
        ...prev,
        authenticated: true,
        companies: acceptedCompanies,
        loadingCompanies: false
      }));
      if (!selectedTenantId) {
        toast.message(acceptedCompanies.length > 0 ? 'Select the company to continue.' : 'No accessible company was returned for this account.');
        return;
      }
      setFormData((prev) => ({ ...prev, dgfyTenantId: selectedTenantId }));
      setTerminalUnlockForm((prev) => ({
        ...prev,
        terminalId: resolveSelectedLoginTerminalId()
      }));
      setTerminalUnlockModalOpen(true);
    } catch (error) {
      setDgfyPosState((prev) => ({ ...prev, loadingCompanies: false }));
      toast.error(resolveTerminalLoginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTerminalUnlockSubmit = async (event) => {
    event.preventDefault();
    const selectedTenantId = String(formData.dgfyTenantId || '').trim();
    const selectedTerminalId = sanitizeTerminalId(terminalUnlockForm.terminalId || resolveSelectedLoginTerminalId());
    const terminalPassword = String(terminalUnlockForm.terminalPassword || '');
    const rawOpeningFloat = String(terminalUnlockForm.openingFloatAmount ?? '').trim();
    const openingFloatAmount = Number(rawOpeningFloat);

    if (!selectedTenantId) {
      toast.error('Select the company before unlocking the terminal.');
      setTerminalUnlockModalOpen(false);
      return;
    }
    if (!validateSelectedTerminalForUnlock(selectedTerminalId)) return;
    if (!terminalPassword.trim()) {
      toast.error('Terminal password is required.');
      return;
    }
    if (rawOpeningFloat === '') {
      toast.error('Opening cash amount is required.');
      return;
    }
    if (!Number.isFinite(openingFloatAmount) || openingFloatAmount < 0) {
      toast.error('Opening float must be a non-negative number.');
      return;
    }

    setSubmitting(true);
    try {
      const session = await startDgfyPosSession({
        tenantId: selectedTenantId,
        terminalId: selectedTerminalId,
        terminalPassword
      });
      const registryLocationId = Number(session?.pos?.terminal_identity_policy?.registry_entry?.location_id || 0);
      const resolvedLocationId = Number.isInteger(registryLocationId) && registryLocationId > 0
        ? registryLocationId
        : Number(operatingLocationId || 0);

      if (!Number.isInteger(resolvedLocationId) || resolvedLocationId <= 0) {
        toast.error('This terminal has no assigned store location. Set the location in POS Setup > Terminal Registry.');
        return;
      }

      await openTerminalShift({
        terminal_id: selectedTerminalId,
        location_id: resolvedLocationId,
        opening_float_amount: openingFloatAmount,
        opening_note: String(terminalUnlockForm.openingNote || '').trim() || undefined,
        idempotency_key: createIdempotencyKey('pos-shift-open')
      });

      await completeTerminalUnlock(selectedTerminalId, {
        operatingLocationIdOverride: resolvedLocationId
      });
      toast.success('POS unlocked and shift opened successfully.');
    } catch (error) {
      toast.error(resolveTerminalLoginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const performLegacyTerminalUnlock = async ({ email, password, selectedTerminalId }) => {
    const currentCompanyToken = String(getCompanyToken() || '').trim();
    let resolvedCompanyToken = '';
    try {
      resolvedCompanyToken = String(await lookupCompanyToken(email, currentCompanyToken) || '').trim();
    } catch (lookupError) {
      if (!currentCompanyToken || !shouldFallbackToCurrentCompanyTokenAfterLookupError(lookupError)) {
        throw lookupError;
      }
      resolvedCompanyToken = currentCompanyToken;
    }
    if (!resolvedCompanyToken) {
      throw createTerminalLoginError(
        'Unable to resolve company token for this account.',
        POS_TERMINAL_LOGIN_ERROR_CODES.COMPANY_TOKEN_UNRESOLVED
      );
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
          throw createTerminalLoginError(
            'Unable to resolve company token for this account.',
            POS_TERMINAL_LOGIN_ERROR_CODES.COMPANY_TOKEN_UNRESOLVED
          );
        }
        await loginWithCredentials(
          { email, password, companyToken: resolvedCompanyToken },
          SUPPRESS_GLOBAL_ERROR_TOAST
        );
        return completeTerminalUnlock(selectedTerminalId);
      }
      throw error;
    }

    return completeTerminalUnlock(selectedTerminalId);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    const email = String(formData.email || '').trim();
    const password = String(formData.password || '');
    const selectedTerminalId = resolveSelectedLoginTerminalId();

    if (!email || !password) {
      toast.error('Email and password are required.');
      return;
    }
    if (!validateSelectedTerminalForUnlock(selectedTerminalId)) return;

    setSubmitting(true);
    try {
      await performLegacyTerminalUnlock({ email, password, selectedTerminalId });
    } catch (error) {
      toast.error(resolveTerminalLoginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLock = () => {
    setStoredTerminalLock(true);
    clearClientSession({
      reason: 'logout',
      broadcast: true,
      emitAuthEvents: true,
      redirectTo: null
    });
    setLocked(true);
    setDrawerOpen(true);
    setPosViewMode('checkout');
    setMobileNavOpen(false);
    setTerminalUser(null);
    setTerminalUnlockRequired(false);
    setTerminalUnlockModalOpen(false);
    setStockAlertSummary({ open: false, almostOutOfStock: [], outOfStock: [] });
  };

  const dismissStockAlertSummary = useCallback(() => {
    setStockAlertSummary((current) => ({ ...current, open: false }));
  }, []);

  const handleViewStockAlertItems = useCallback(() => {
    setStockAlertSummary((current) => ({ ...current, open: false }));
    setItemsStockFilterPreset('out_of_stock');
    setPosViewMode('items');
  }, []);

  const handleItemsStockFilterPresetApplied = useCallback(() => {
    setItemsStockFilterPreset('');
  }, []);

  const handleOpenShift = async () => {
    if (complianceBlockerDetails) {
      toast.error(`${complianceBlockerDetails.title}. ${complianceBlockerDetails.message}`);
      return;
    }
    if (terminalUnlockRequired) {
      setTerminalUnlockModalOpen(true);
      toast.error('Unlock the terminal before opening a new shift.');
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
    if (rawOpeningFloat === '') {
      toast.error('Opening cash amount is required.');
      return;
    }
    const openingFloatAmount = Number(rawOpeningFloat);
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
      await openTerminalShift(payload);
      toast.success('Shift opened successfully.');
      setOpenShiftForm({ openingFloatAmount: '', openingNote: '' });
      await refreshOperationalContext();
      setPosViewMode('checkout');
      setMobileNavOpen(false);
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
      setCloseShiftConfirmOpen(false);
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

  const handleCloseShift = () => {
    if (complianceBlockerDetails) {
      toast.error(`${complianceBlockerDetails.title}. ${complianceBlockerDetails.message}`);
      return;
    }
    if (!activeShiftId) {
      toast.error('No active shift to close.');
      return;
    }
    setCloseShiftConfirmOpen(true);
  };

  const handleConfirmCloseShift = async () => {
    if (complianceBlockerDetails) {
      toast.error(`${complianceBlockerDetails.title}. ${complianceBlockerDetails.message}`);
      return;
    }
    if (!activeShiftId) {
      toast.error('No active shift to close.');
      setCloseShiftConfirmOpen(false);
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
      setCloseShiftConfirmOpen(false);
      const pendingCount = Number(queueSummary.pending || 0) + 1;
      toast.message(
        `You are offline. Shift-close action was queued and will replay automatically (${pendingCount} queued).`
      );
      return;
    }

    setShiftActionLoading((prev) => ({ ...prev, close: true }));
    try {
      await closeTerminalShift(activeShiftId, payload);
      toast.success('Shift closed successfully. Unlock the terminal to start the next shift.');
      setCloseShiftConfirmOpen(false);
      setCloseShiftForm({ closingCashAmount: '', closingNote: '' });
      setShiftState({
        loading: false,
        shift: null,
        cashSummary: null
      });
      setTerminalUnlockRequired(true);
      setTerminalUnlockForm({
        terminalId: sanitizeTerminalId(activeTerminalId) || resolveSelectedLoginTerminalId(),
        terminalPassword: '',
        openingFloatAmount: '',
        openingNote: ''
      });
      setTerminalUnlockModalOpen(true);
      setMobileNavOpen(false);
      setPosViewMode('checkout');
      await refreshOperationalContext();
    } catch (error) {
      if (isRetryableTerminalOperationError(error)) {
        await enqueueTerminalOperationIntent(queueEntry, 'network_failure');
        setCloseShiftConfirmOpen(false);
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
    if (requiresOpenShift) {
      toast.error('You cannot use the POS because the shift is closed.');
      setMobileNavOpen(false);
      return;
    }
    setPosViewMode(nextMode);
    if (workspacePaneRef.current) {
      workspacePaneRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setMobileNavOpen(false);
  }, [activeViewModes, locked, requiresOpenShift]);

  const handleHardwareMessageOpenChange = useCallback((open) => {
    if (!open) {
      setHardwareMessage(null);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleHardwareMessage = (event) => {
      setHardwareMessage(event.detail || null);
    };
    window.addEventListener(POS_HARDWARE_MESSAGE_EVENT_NAME, handleHardwareMessage);
    return () => window.removeEventListener(POS_HARDWARE_MESSAGE_EVENT_NAME, handleHardwareMessage);
  }, []);

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
    if (posViewMode === 'history' && !canViewPos) {
      setPosViewMode('checkout');
    }
  }, [canViewPos, posViewMode]);

  useEffect(() => {
    if (!canViewPos && ['incoming_queue'].includes(posViewMode)) {
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
  const shiftOpeningModalOpen = !drawerOpen && !terminalUnlockModalOpen && !terminalUnlockRequired && requiresOpenShift && canViewPos;
  const openingCashAmountText = String(openShiftForm.openingFloatAmount ?? '').trim();
  const openingCashAmountNumber = Number(openingCashAmountText);
  const canSubmitOpenShift = (
    openingCashAmountText !== ''
    && Number.isFinite(openingCashAmountNumber)
    && openingCashAmountNumber >= 0
  );
  const handleShiftOpeningModalOpenChange = useCallback((open) => {
    if (open === false && shiftOpeningModalOpen) {
      toast.message('Please open your shift before using the POS.');
    }
  }, [shiftOpeningModalOpen]);
  const handleShiftOpeningModalSubmit = useCallback((event) => {
    event.preventDefault();
    handleOpenShift();
  }, [handleOpenShift]);

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100 p-6 text-sm text-slate-500">Loading terminal workspace...</div>}>
      <>
        <Dialog open={terminalUnlockModalOpen} onOpenChange={(open) => {
          if (submitting) return;
          if (open === false && terminalUnlockRequired) {
            toast.message('Unlock the terminal to continue.');
            return;
          }
          setTerminalUnlockModalOpen(open);
        }}>
          <DialogContent className="max-w-md border border-slate-200 p-0 shadow-2xl">
            <form onSubmit={handleTerminalUnlockSubmit}>
              <DialogHeader className="border-b border-slate-100 px-5 py-4">
                <DialogTitle className="text-lg font-extrabold text-[#0F172A]">Unlock Terminal</DialogTitle>
                <DialogDescription className="text-sm text-slate-600">
                  Choose the registered POS terminal, enter its password, and start the shift.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 px-5 py-5">
                <div className="grid gap-2">
                  <Label htmlFor="terminal-unlock-terminal-id" className="text-xs font-extrabold text-[#0F172A]">
                    Terminal ID
                  </Label>
                  {activeTerminalRegistry.length > 0 ? (
                    <select
                      id="terminal-unlock-terminal-id"
                      value={terminalUnlockForm.terminalId || ''}
                      onChange={(event) => setTerminalUnlockForm((prev) => ({ ...prev, terminalId: event.target.value }))}
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none focus:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
                      disabled={submitting}
                      required
                    >
                      <option value="">Select registered terminal</option>
                      {activeTerminalRegistry.map((entry) => (
                        <option key={entry.terminal_id} value={entry.terminal_id}>
                          {entry.label ? `${entry.label} (${entry.terminal_id})` : entry.terminal_id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <Input
                        id="terminal-unlock-terminal-id"
                        value={terminalUnlockForm.terminalId || ''}
                        onChange={(event) => setTerminalUnlockForm((prev) => ({ ...prev, terminalId: event.target.value }))}
                        placeholder="COUNTER-01"
                        list="terminal-unlock-terminal-options"
                        autoComplete="off"
                        className="h-11 rounded-lg border-slate-200 px-3 text-[13px] font-semibold uppercase tracking-wide text-[#0F172A]"
                        disabled={submitting}
                        required
                      />
                      <datalist id="terminal-unlock-terminal-options">
                        {terminalIdOptions.map((terminalId) => (
                          <option key={terminalId} value={terminalId} />
                        ))}
                      </datalist>
                    </>
                  )}
                  <p className="text-[11px] text-[#64748B]">
                    Enter the registered terminal ID from POS Setup. Example: `COUNTER-01`.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="terminal-unlock-password" className="text-xs font-extrabold text-[#0F172A]">
                    Terminal Password
                  </Label>
                  <Input
                    id="terminal-unlock-password"
                    type="password"
                    value={terminalUnlockForm.terminalPassword}
                    onChange={(event) => setTerminalUnlockForm((prev) => ({ ...prev, terminalPassword: event.target.value }))}
                    placeholder="Enter terminal password"
                    disabled={submitting}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="terminal-unlock-opening-cash" className="text-xs font-extrabold text-[#0F172A]">
                    Opening Cash
                  </Label>
                  <Input
                    id="terminal-unlock-opening-cash"
                    type="number"
                    min="0"
                    step="0.01"
                    value={terminalUnlockForm.openingFloatAmount}
                    onChange={(event) => setTerminalUnlockForm((prev) => ({ ...prev, openingFloatAmount: event.target.value }))}
                    placeholder="0.00"
                    disabled={submitting}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="terminal-unlock-opening-note" className="text-xs font-extrabold text-[#0F172A]">
                    Opening Note
                  </Label>
                  <Input
                    id="terminal-unlock-opening-note"
                    value={terminalUnlockForm.openingNote}
                    onChange={(event) => setTerminalUnlockForm((prev) => ({ ...prev, openingNote: event.target.value }))}
                    placeholder="Optional"
                    disabled={submitting}
                  />
                </div>
              </div>
              <DialogFooter className="border-t border-slate-100 px-5 py-4">
                <Button
                  type="submit"
                  className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
                  disabled={submitting}
                >
                  {submitting ? 'Unlocking...' : 'Unlock POS'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={shiftOpeningModalOpen} onOpenChange={handleShiftOpeningModalOpenChange}>
          <DialogContent className="max-w-md border border-slate-200 p-0 shadow-2xl">
            <form onSubmit={handleShiftOpeningModalSubmit}>
              <DialogHeader className="border-b border-slate-100 px-5 py-4">
                <DialogTitle className="text-lg font-extrabold text-[#0F172A]">Open Shift</DialogTitle>
                <DialogDescription className="text-sm text-slate-600">
                  Please open your shift before using the POS.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 px-5 py-5">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  Shift Closed. Sales, payments, receipt printing, and transaction changes are blocked.
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shift-opening-cash-amount" className="text-xs font-extrabold text-[#0F172A]">
                    Opening Cash
                  </Label>
                  <Input
                    id="shift-opening-cash-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    autoFocus
                    value={openShiftForm.openingFloatAmount}
                    onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingFloatAmount: event.target.value }))}
                    placeholder="0.00"
                    disabled={shiftActionLoading.open}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shift-opening-note" className="text-xs font-extrabold text-[#0F172A]">
                    Opening Note
                  </Label>
                  <Input
                    id="shift-opening-note"
                    value={openShiftForm.openingNote}
                    onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingNote: event.target.value }))}
                    placeholder="Optional"
                    disabled={shiftActionLoading.open}
                  />
                </div>
              </div>
              <DialogFooter className="border-t border-slate-100 px-5 py-4">
                <Button
                  type="submit"
                  className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
                  disabled={shiftActionLoading.open || !canTransactPos || !canSubmitOpenShift}
                >
                  {shiftActionLoading.open ? 'Opening...' : 'Open Shift'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {showOnboardingReminder && (
          <div className="fixed right-4 top-4 z-[70] max-w-[min(92vw,420px)] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-lg shadow-amber-900/10">
            <span>
              Tenant onboarding is incomplete ({onboardingCompletedCount}/{onboardingRequiredTotal} required checks).
            </span>
            <button
              type="button"
              className="ml-1 font-extrabold underline underline-offset-2"
              onClick={() => {
                setOnboardingDismissedThisSession(false);
                setOnboardingSetupOpen(true);
              }}
            >
              Continue POS setup.
            </button>
          </div>
        )}
        {showLegacyDgfyLinkBanner && (
          <div className="fixed left-4 top-4 z-[70] max-w-[min(92vw,460px)] rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 pr-10 text-xs text-amber-950 shadow-lg shadow-amber-900/10">
            <button
              type="button"
              aria-label="Dismiss DGFY account link reminder"
              onClick={() => setLegacyDgfyLinkBannerDismissed(true)}
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full border border-amber-300 bg-white text-sm font-extrabold leading-none text-amber-950 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 focus:ring-offset-amber-50"
            >
              x
            </button>
            <div className="font-extrabold">Create or link your DGFY account</div>
            <p className="mt-1 leading-5">
              Create or link your DGFY account to keep IMS/POS access after June 17, 2027.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRequestLegacyLinkOtp}
                disabled={legacyLinkState.loading}
                className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-extrabold text-amber-950 hover:bg-amber-100 disabled:opacity-60"
              >
                {legacyLinkState.otpSent ? 'Resend code' : 'Send link code'}
              </button>
              <button
                type="button"
                onClick={handleStartLegacyRegistration}
                className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-extrabold text-amber-950 hover:bg-amber-100"
              >
                Create DGFY account
              </button>
            </div>
            {legacyLinkState.otpSent && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={legacyLinkState.code}
                  onChange={(event) => setLegacyLinkState((prev) => ({ ...prev, code: event.target.value }))}
                  placeholder="6-digit code"
                  className="h-8 w-32 rounded-md border border-amber-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-amber-500"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={handleCompleteLegacyLink}
                  disabled={legacyLinkState.loading}
                  className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-amber-800 disabled:opacity-60"
                >
                  Link account
                </button>
              </div>
            )}
          </div>
        )}
        <OnboardingSetupModal
          open={onboardingSetupOpen}
          onClose={() => {
            setOnboardingSetupOpen(false);
            setOnboardingDismissedThisSession(true);
            trackOnboardingEvent({
              eventKey: 'reminder_dismissed',
              metadata: { surface: 'pos_terminal' }
            }).catch(() => {});
          }}
          onboarding={terminalUser?.onboarding || null}
          currentUser={terminalUser}
          workflowMode={workflowMode}
          onRefreshUser={hydrateUser}
        />
        <PosHardwareMessageModal
          open={Boolean(hardwareMessage)}
          message={hardwareMessage}
          onOpenChange={handleHardwareMessageOpenChange}
        />
        <Dialog open={closeShiftConfirmOpen} onOpenChange={setCloseShiftConfirmOpen}>
          <DialogContent className="border border-slate-200 bg-white shadow-2xl sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-slate-950">Close Shift</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-600">
                Are you sure you want to close this shift?
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-950">
              Confirm the cash count and note before closing. Offline or retryable failures will still be queued for replay.
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCloseShiftConfirmOpen(false)}
                disabled={shiftActionLoading.close}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmCloseShift}
                disabled={shiftActionLoading.close}
                className="bg-[#1A4E8D] font-bold text-white hover:bg-[#143F73]"
              >
                {shiftActionLoading.close ? 'Closing...' : 'Close shift'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={stockAlertSummary.open}
          onOpenChange={(open) => {
            if (!open) dismissStockAlertSummary();
          }}
        >
          <DialogContent className="border border-slate-200 bg-white shadow-2xl sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-slate-950">Stock Alert</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-600">
                POS inventory needs attention before the next selling session.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              {stockAlertSummary.outOfStock.length > 0 ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                  <p className="text-sm font-extrabold text-rose-700">
                    {stockAlertSummary.outOfStock.length} item{stockAlertSummary.outOfStock.length === 1 ? '' : 's'} out of stock
                  </p>
                  <p className="mt-1 text-xs leading-5 text-rose-700">
                    {stockAlertSummary.outOfStock.slice(0, 4).join(', ')}
                    {stockAlertSummary.outOfStock.length > 4 ? ` and ${stockAlertSummary.outOfStock.length - 4} more.` : ''}
                  </p>
                </div>
              ) : null}
              {stockAlertSummary.almostOutOfStock.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-extrabold text-amber-800">
                    {stockAlertSummary.almostOutOfStock.length} item{stockAlertSummary.almostOutOfStock.length === 1 ? '' : 's'} almost out of stock
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    {stockAlertSummary.almostOutOfStock.slice(0, 4).join(', ')}
                    {stockAlertSummary.almostOutOfStock.length > 4 ? ` and ${stockAlertSummary.almostOutOfStock.length - 4} more.` : ''}
                  </p>
                </div>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={dismissStockAlertSummary}>
                Dismiss
              </Button>
              <Button
                type="button"
                onClick={handleViewStockAlertItems}
                className="bg-[#1A4E8D] font-bold text-white hover:bg-[#143F73]"
              >
                View Items
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
          canCreateItems={canCreateItems}
          canEditItems={canEditItems}
          canDeleteItems={canDeleteItems}
          itemsStockFilterPreset={itemsStockFilterPreset}
          onItemsStockFilterPresetApplied={handleItemsStockFilterPresetApplied}
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
          refreshTerminalUser={hydrateUser}
          refreshTerminalMeta={hydrateTerminalMeta}
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
          terminalUnlockModalOpen={terminalUnlockModalOpen}
          formData={formData}
          setFormData={setFormData}
          dgfyPosState={dgfyPosState}
          submitting={submitting}
          handleLogin={handleDgfyPosLogin}
          handleLegacyLogin={handleLogin}
        />
      </>
    </Suspense>
  );
}

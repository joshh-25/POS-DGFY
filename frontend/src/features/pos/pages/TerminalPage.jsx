import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import {
  login as loginWithCredentials,
  loginCashier as loginCashierWithCredentials,
  getCurrentUser as fetchCurrentUser
} from '@/services/authService.js';
import {
  clearDgfySession,
  completeDgfyLegacyLink,
  getStoredDgfyToken,
  listDgfyAccountCompanies,
  loginDgfyAccount,
  logoutDgfyAccount,
  requestDgfyLegacyLinkEmailOtp,
  startDgfyPosSession,
  startDgfyTenantSession,
  startDgfyLegacyRegistrationHandoff
} from '@/services/dgfyAuthService.js';
import { resolvePosTerminalUrl, resolveStorefrontAccountUrl } from '@/src/features/dgfyRouteHelpers.js';
import { getAllSettings, getCompanyInfo, verifyPosSettingsAccessPin } from '@/services/settingsService.js';
import { getAllUsers } from '@/services/userService.js';
import { listTenantLocations } from '@/services/tenantLocationService.js';
import api from '@/services/api.js';
import { clearClientSession } from '@/services/sessionCleanup.js';
import { clearBrowserSession, getAccessToken, getCompanyToken, refreshBrowserSession } from '@/services/browserSession.js';
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
import {
  buildTenantSetupSearch,
  clearTenantSetupSearch,
  getNextTenantSetupStep,
  getPreviousTenantSetupStep,
  POS_TERMINAL_SETUP_FLOW_QUERY_KEY,
  POS_TERMINAL_SETUP_FLOW_VALUE,
  POS_TERMINAL_SETUP_STEP_QUERY_KEY,
  POS_TERMINAL_SETUP_STEPS,
  isTenantSetupFlowRequested,
  resolveProfileSetupReadiness,
  resolvePosSetupReadiness,
  resolveStarterItemSetupReadiness,
  resolveStorefrontSetupReadiness,
  resolveTenantSetupStep,
  resolveTenantSetupStepValue,
  resolveTenantSetupViewMode
} from '../utils/setupFlow.js';

import PosHardwareMessageModal from '../components/PosHardwareMessageModal.jsx';
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
const TerminalPageLayout = lazy(() => import('../components/TerminalPageLayout.jsx'));
const PosTenantSetupModal = lazy(() => import('../components/PosTenantSetupModal.jsx'));

const DEFAULT_CURRENCY = 'PHP';
const TERMINAL_ID_STORAGE_KEY = 'pos_terminal_identity_v1';
const TERMINAL_LOCK_STORAGE_KEY = 'pos_terminal_locked_v1';
const TERMINAL_LOCK_REASON_STORAGE_KEY = 'pos_terminal_lock_reason_v1';
const TERMINAL_ADMIN_LOCK_CONTEXT_STORAGE_KEY = 'pos_terminal_admin_lock_context_v1';
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
const MSME_OPERATIONS_VIEW_MODES = ['shift_controls', 'close_shift', 'items', 'reports', 'settings_profile', 'settings_pos', 'settings_storefront'];
const SETTINGS_VIEW_MODES = new Set(['settings_profile', 'settings_pos', 'settings_storefront', 'terminal_setup']);
const SHIFT_EXEMPT_VIEW_MODES = new Set([...SETTINGS_VIEW_MODES, 'reports', 'items']);
const PIN_PROTECTED_VIEW_MODES = new Set([...SETTINGS_VIEW_MODES, 'items']);
const CASHIER_ALLOWED_VIEW_MODES = new Set([
  ...CHECKOUT_VIEW_MODES,
  'incoming_queue',
  'items',
  'shift_controls',
  'cash_drawer',
  'close_shift'
]);
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

const readStoredTerminalLockReason = () => {
  if (typeof window === 'undefined') return '';
  return String(window.localStorage.getItem(TERMINAL_LOCK_REASON_STORAGE_KEY) || '').trim();
};

const setStoredTerminalLock = (locked) => {
  if (typeof window === 'undefined') return;
  if (locked) {
    window.localStorage.setItem(TERMINAL_LOCK_STORAGE_KEY, '1');
  } else {
    window.localStorage.removeItem(TERMINAL_LOCK_STORAGE_KEY);
    window.localStorage.removeItem(TERMINAL_LOCK_REASON_STORAGE_KEY);
    window.localStorage.removeItem(TERMINAL_ADMIN_LOCK_CONTEXT_STORAGE_KEY);
  }
};

const setStoredTerminalLockReason = (reason) => {
  if (typeof window === 'undefined') return;
  const normalizedReason = String(reason || '').trim();
  if (normalizedReason) {
    window.localStorage.setItem(TERMINAL_LOCK_REASON_STORAGE_KEY, normalizedReason);
    return;
  }
  window.localStorage.removeItem(TERMINAL_LOCK_REASON_STORAGE_KEY);
};

const readStoredAdminLockContext = () => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TERMINAL_ADMIN_LOCK_CONTEXT_STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return {
      identifier: String(parsed.identifier || '').trim(),
      companyToken: String(parsed.companyToken || '').trim(),
      terminalId: sanitizeTerminalId(parsed.terminalId || '')
    };
  } catch {
    return null;
  }
};

const setStoredAdminLockContext = (context = null) => {
  if (typeof window === 'undefined') return;
  if (!context) {
    window.localStorage.removeItem(TERMINAL_ADMIN_LOCK_CONTEXT_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(TERMINAL_ADMIN_LOCK_CONTEXT_STORAGE_KEY, JSON.stringify({
    identifier: String(context.identifier || '').trim(),
    companyToken: String(context.companyToken || '').trim(),
    terminalId: sanitizeTerminalId(context.terminalId || '')
  }));
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
const POS_ONBOARDING_ENTRY_SEARCH = buildTenantSetupSearch('', POS_TERMINAL_SETUP_STEPS.PROFILE);

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

const buildTenantSetupStateSnapshot = ({
  settingsPayload = {},
  companyPayload = {},
  usersPayload = [],
  locationsPayload = [],
  itemsPayload = []
} = {}) => {
  const profileRequirements = resolveProfileSetupReadiness(companyPayload, settingsPayload);
  const posRequirements = resolvePosSetupReadiness(settingsPayload, usersPayload);
  const storefrontRequirements = resolveStorefrontSetupReadiness(settingsPayload, locationsPayload);
  const starterItemRequirements = resolveStarterItemSetupReadiness(itemsPayload);

  return {
    loading: false,
    profileReady: profileRequirements.ready,
    posSetupReady: posRequirements.ready,
    storefrontSetupReady: storefrontRequirements.ready,
    starterItemReady: starterItemRequirements.ready,
    profileRequirements,
    posRequirements,
    storefrontRequirements,
    starterItemRequirements,
    tenantUsers: Array.isArray(usersPayload) ? usersPayload : []
  };
};

export default function TerminalPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { workflowMode, modeChangeNotice, dismissModeChangeNotice } = useWorkflowMode();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('posTerminalSidebarCollapsed');
    return stored === '1';
  });
  const [locked, setLocked] = useState(() => readStoredTerminalLock() || !getAccessToken());
  const [drawerOpen, setDrawerOpen] = useState(() => readStoredTerminalLock() || !getAccessToken());
  const [loadingUser, setLoadingUser] = useState(false);
  const [terminalUser, setTerminalUser] = useState(null);
  const [tenantSetupModalOpen, setTenantSetupModalOpen] = useState(false);
  const [tenantSetupDismissedThisSession, setTenantSetupDismissedThisSession] = useState(false);
  const [closeShiftConfirmOpen, setCloseShiftConfirmOpen] = useState(false);
  const [hardwareMessage, setHardwareMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTerminalId, setActiveTerminalId] = useState(() => readInitialTerminalId());
  const [terminalRegistry, setTerminalRegistry] = useState([]);
  const [terminalRegistryMode, setTerminalRegistryMode] = useState('warn');
  const [terminalMeta, setTerminalMeta] = useState({
    loading: true,
    pettyCashSymbol: DEFAULT_CURRENCY,
    pettyCashAmount: 0,
    activeDiscountCount: 0,
    enabledFeeMethods: [],
    locationBindingReadiness: null,
    settingsAccessPinEnabled: false
  });
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    dgfyTenantId: '',
    terminalId: readInitialTerminalId()
  });
  const [terminalUnlockRequired, setTerminalUnlockRequired] = useState(false);
  const [terminalUnlockModalOpen, setTerminalUnlockModalOpen] = useState(false);
  const [terminalUnlockMode, setTerminalUnlockMode] = useState(() => {
    const storedReason = readStoredTerminalLockReason();
    if (storedReason === 'admin_reunlock') return 'admin_reunlock';
    if (storedReason === 'terminal_reunlock') return 'cashier_resume';
    if (storedReason === 'shift_start_required') return 'shift_start';
    return 'shift_start';
  });
  const [terminalUnlockForm, setTerminalUnlockForm] = useState({
    terminalId: readInitialTerminalId(),
    terminalPassword: '',
    cashierEmail: '',
    cashierPassword: '',
    openingFloatAmount: '',
    openingNote: ''
  });
  const [cashierResumeContext, setCashierResumeContext] = useState(null);
  const [cashierResumeForm, setCashierResumeForm] = useState({
    identifier: '',
    password: ''
  });
  const [adminReauthContext, setAdminReauthContext] = useState(() => readStoredAdminLockContext());
  const [adminReauthForm, setAdminReauthForm] = useState(() => {
    const context = readStoredAdminLockContext();
    return {
      identifier: context?.identifier || '',
      password: ''
    };
  });
  const [settingsAccessPinModalOpen, setSettingsAccessPinModalOpen] = useState(false);
  const [settingsAccessPinSubmitting, setSettingsAccessPinSubmitting] = useState(false);
  const [settingsAccessPinValue, setSettingsAccessPinValue] = useState('');
  const [settingsAccessPinVerified, setSettingsAccessPinVerified] = useState(false);
  const [pendingSettingsViewMode, setPendingSettingsViewMode] = useState('');
  const [dgfyPosState, setDgfyPosState] = useState({
    authenticated: false,
    account: null,
    companies: [],
    loadingCompanies: false
  });
  const [adminShiftPromptSkipped, setAdminShiftPromptSkipped] = useState(false);
  const [cashierUnlockSession, setCashierUnlockSession] = useState(null);
  const [dgfyAdminBypassActive, setDgfyAdminBypassActive] = useState(false);
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
  const [setupFlowState, setSetupFlowState] = useState({
    loading: true,
    profileReady: false,
    posSetupReady: false,
    storefrontSetupReady: false,
    starterItemReady: false,
    profileRequirements: {
      ready: false,
      companyNameReady: false,
      companyName: ''
    },
    posRequirements: {
      ready: false,
      terminalRegistryReady: false,
      cashierReady: false
    },
    storefrontRequirements: {
      ready: false,
      coverImageReady: false,
      profileImageReady: false,
      locationReady: false,
      primaryLocationId: null,
      coverImageUrl: '',
      profileImageUrl: ''
    },
    starterItemRequirements: {
      ready: false,
      starterItemReady: false,
      starterItemId: null
    },
    tenantUsers: []
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
    const queueScopedModes = modePosDefaults.show_online_queue !== false
      ? baseModes
      : baseModes.filter((mode) => mode !== 'incoming_queue');
    const normalizedRole = String(terminalUser?.role || '').trim().toLowerCase();
    if (normalizedRole === 'cashier') {
      return queueScopedModes.filter((mode) => CASHIER_ALLOWED_VIEW_MODES.has(mode));
    }
    return queueScopedModes;
  }, [isMsmeMode, modePosDefaults.show_online_queue, terminalUser?.role]);
  const activeViewModes = useMemo(
    () => [...CHECKOUT_VIEW_MODES, ...activeOperationsViewModes],
    [activeOperationsViewModes]
  );

  const permissions = useMemo(() => parseUserPermissions(terminalUser), [terminalUser]);
  const activeTerminalRegistry = useMemo(
    () => (Array.isArray(terminalRegistry) ? terminalRegistry.filter((entry) => entry?.is_active !== false) : []),
    [terminalRegistry]
  );
  const locationNameLookup = useMemo(() => {
    const lookup = new Map();
    const activeLocations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
    activeLocations.forEach((location) => {
      const locationId = Number(location?.location_id || 0);
      if (locationId > 0) {
        lookup.set(locationId, String(location?.name || '').trim());
      }
    });
    return lookup;
  }, [locationsState?.locations]);
  const terminalRegistryLookup = useMemo(() => {
    const lookup = new Map();
    activeTerminalRegistry.forEach((entry) => {
      lookup.set(String(entry.terminal_id || ''), entry);
    });
    return lookup;
  }, [activeTerminalRegistry]);
  const registryEnforced = terminalRegistryMode === 'enforce';
  const settingsAccessPinEnabled = terminalMeta.settingsAccessPinEnabled === true;
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
    if (String(terminalUser.role || '').trim().toLowerCase() === 'admin') return true;
    return permissions.includes(permission);
  }, [permissions, terminalUser]);
  const normalizedTerminalRole = String(terminalUser?.role || '').trim().toLowerCase();
  const isCashierRole = normalizedTerminalRole === 'cashier';
  const userIsAdminLike = terminalUser?.is_master_admin === true
    || normalizedTerminalRole === 'admin';

  const canViewPos = hasPermission('pos:view');
  const canTransactPos = hasPermission('pos:transact');
  const canSwitchPosLocation = hasPermission('pos:switch_location');
  const canAdjustCashDrawer = hasPermission('pos:cash_drawer_adjust');
  const canCloseShift = hasPermission('pos:shift_close') || hasPermission('pos:close_day');
  const canCloseDay = hasPermission('pos:close_day');
  const canCreateItems = hasPermission('items:create');
  const canAccessSettingsDirectly = userIsAdminLike || dgfyAdminBypassActive;
  const canAdminBypassShiftPrompt = userIsAdminLike || dgfyAdminBypassActive;
  const canEditItems = hasPermission('items:edit');
  const canDeleteItems = hasPermission('items:delete');
  const setupFlowSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const tenantSetupFlowRequested = useMemo(
    () => isTenantSetupFlowRequested(setupFlowSearchParams),
    [setupFlowSearchParams]
  );
  const requestedTenantSetupStep = String(
    setupFlowSearchParams.get(POS_TERMINAL_SETUP_STEP_QUERY_KEY) || POS_TERMINAL_SETUP_STEPS.PROFILE
  ).trim().toLowerCase();
  const tenantSetupIncomplete = !setupFlowState.loading
    && !locked
    && terminalUser?.is_master_admin === true
    && (!setupFlowState.profileReady || !setupFlowState.storefrontSetupReady || !setupFlowState.starterItemReady || !setupFlowState.posSetupReady);
  const tenantSetupRequestedOrRequired = tenantSetupFlowRequested || tenantSetupIncomplete;
  const tenantSetupStep = useMemo(() => resolveTenantSetupStep({
    requested: tenantSetupRequestedOrRequired,
    locked,
    isMasterAdmin: terminalUser?.is_master_admin === true,
    requestedStep: requestedTenantSetupStep,
    profileReady: setupFlowState.profileReady,
    posSetupReady: setupFlowState.posSetupReady,
    storefrontSetupReady: setupFlowState.storefrontSetupReady,
    starterItemReady: setupFlowState.starterItemReady
  }), [
    locked,
    requestedTenantSetupStep,
    setupFlowState.profileReady,
    setupFlowState.posSetupReady,
    setupFlowState.starterItemReady,
    setupFlowState.storefrontSetupReady,
    tenantSetupRequestedOrRequired,
    terminalUser?.is_master_admin
  ]);
  const setupFlowActive = tenantSetupIncomplete
    && tenantSetupStep !== POS_TERMINAL_SETUP_STEPS.COMPLETE;

  const replaceTenantSetupQuery = useCallback((nextStep = '') => {
    const normalizedStep = resolveTenantSetupStepValue(nextStep || tenantSetupStep);
    navigate({
      pathname: location.pathname,
      search: buildTenantSetupSearch(location.search, normalizedStep),
      hash: location.hash
    }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate, tenantSetupStep]);

  const clearTenantSetupQueryState = useCallback(() => {
    navigate({
      pathname: location.pathname,
      search: clearTenantSetupSearch(location.search),
      hash: location.hash
    }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  const openTenantSetupStep = useCallback((step = '') => {
    const normalizedStep = resolveTenantSetupStepValue(step || tenantSetupStep);
    replaceTenantSetupQuery(normalizedStep);
    setPosViewMode(resolveTenantSetupViewMode(normalizedStep));
  }, [replaceTenantSetupQuery, tenantSetupStep]);

  const resumeTenantSetupFlow = useCallback((step = '') => {
    setTenantSetupDismissedThisSession(false);
    openTenantSetupStep(step || tenantSetupStep || POS_TERMINAL_SETUP_STEPS.PROFILE);
    setTenantSetupModalOpen(true);
  }, [openTenantSetupStep, tenantSetupStep]);

  const hydrateTenantSetupState = useCallback(async ({ suppressGlobalErrors = false } = {}) => {
    if (locked || terminalUser?.is_master_admin !== true) {
      setSetupFlowState({
        loading: false,
        profileReady: false,
        posSetupReady: false,
        storefrontSetupReady: false,
        starterItemReady: false,
        profileRequirements: {
          ready: false,
          companyNameReady: false,
          companyName: ''
        },
        posRequirements: {
          ready: false,
          terminalRegistryReady: false,
          cashierReady: false
        },
        storefrontRequirements: {
          ready: false,
          coverImageReady: false,
          profileImageReady: false,
          locationReady: false,
          primaryLocationId: null,
          coverImageUrl: '',
          profileImageUrl: ''
        },
        starterItemRequirements: {
          ready: false,
          starterItemReady: false,
          starterItemId: null
        },
        tenantUsers: []
      });
      return;
    }

    setSetupFlowState((prev) => ({ ...prev, loading: true }));
    try {
      const requestConfig = suppressGlobalErrors ? SUPPRESS_GLOBAL_ERROR_TOAST : {};
      const [settingsPayload, companyPayload, usersPayload, locationsPayload, itemsPayload] = await Promise.all([
        getAllSettings({
          force: true,
          requestConfig
        }),
        getCompanyInfo().catch(() => null),
        getAllUsers({ include_invitations: true }).catch(() => []),
        listTenantLocations({ include_inactive: false }).catch(() => []),
        fetchPosCatalog({ limit: 1 }).catch(() => [])
      ]);
      const profileRequirements = resolveProfileSetupReadiness(companyPayload, settingsPayload);
      const posRequirements = resolvePosSetupReadiness(settingsPayload, usersPayload);
      const storefrontRequirements = resolveStorefrontSetupReadiness(settingsPayload, locationsPayload);
      const starterItemRequirements = resolveStarterItemSetupReadiness(itemsPayload);
      setSetupFlowState({
        loading: false,
        profileReady: profileRequirements.ready,
        posSetupReady: posRequirements.ready,
        storefrontSetupReady: storefrontRequirements.ready,
        starterItemReady: starterItemRequirements.ready,
        profileRequirements,
        posRequirements,
        storefrontRequirements,
        starterItemRequirements,
        tenantUsers: Array.isArray(usersPayload) ? usersPayload : []
      });
    } catch {
      setSetupFlowState((prev) => ({ ...prev, loading: false }));
    }
  }, [locked, terminalUser?.is_master_admin]);

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

  const resetSettingsAccessPinState = useCallback(() => {
    setSettingsAccessPinModalOpen(false);
    setSettingsAccessPinSubmitting(false);
    setSettingsAccessPinValue('');
    setSettingsAccessPinVerified(false);
    setPendingSettingsViewMode('');
  }, []);

  const commitViewModeSelection = useCallback((nextMode) => {
    setPosViewMode(nextMode);
    if (workspacePaneRef.current) {
      workspacePaneRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setMobileNavOpen(false);
  }, []);

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
      const terminalSelectionMode = setupFlowActive && normalizedRegistry.length === 0
        ? 'enforce'
        : normalizedRegistryMode;

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
        { registryMode: terminalSelectionMode }
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
      } else if (setupFlowActive) {
        setActiveTerminalId('');
        setFormData((prev) => ({ ...prev, terminalId: '' }));
        setTerminalUnlockForm((prev) => ({ ...prev, terminalId: '' }));
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(TERMINAL_ID_STORAGE_KEY);
        }
      }

      setTerminalMeta({
        loading: false,
        pettyCashSymbol,
        pettyCashAmount: Number.isFinite(pettyCashAmount) ? pettyCashAmount : 0,
        activeDiscountCount,
        enabledFeeMethods,
        locationBindingReadiness: null,
        settingsAccessPinEnabled: allSettings?.pos_settings_access_pin_enabled?.value === true
      });
    } catch {
      setTerminalRegistry([]);
      setTerminalRegistryMode('warn');
      const preferredTerminalId = resolvePreferredTerminalId(
        [],
        readStoredTerminalId(),
        { registryMode: setupFlowActive ? 'enforce' : 'warn' }
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
      } else if (setupFlowActive) {
        setActiveTerminalId('');
        setFormData((prev) => ({ ...prev, terminalId: '' }));
        setTerminalUnlockForm((prev) => ({ ...prev, terminalId: '' }));
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(TERMINAL_ID_STORAGE_KEY);
        }
      }
      setTerminalMeta((prev) => ({ ...prev, loading: false, settingsAccessPinEnabled: false }));
    }
  }, [setupFlowActive]);

  const refreshOperationalContext = useCallback(async ({
    terminalIdOverride = null,
    operatingLocationIdOverride = null,
    suppressGlobalErrors = false,
    allowWhileLocked = false
  } = {}) => {
    if ((!allowWhileLocked && locked) || !canViewPos) {
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
    const scopedOperatingLocationId = Number.isInteger(Number(operatingLocationIdOverride || operatingLocationId))
      ? Number(operatingLocationIdOverride || operatingLocationId)
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
    const storedLockActiveAtStart = readStoredTerminalLock();
    const storedReasonAtStart = readStoredTerminalLockReason();
    if (storedLockActiveAtStart && ['full_auth', 'shift_closed'].includes(storedReasonAtStart)) {
      clearBrowserSession();
      resetSettingsAccessPinState();
      setTerminalUser(null);
      setDgfyAdminBypassActive(false);
      setLocked(true);
      setDrawerOpen(true);
      setTerminalUnlockRequired(false);
      setTerminalUnlockModalOpen(false);
      setLoadingUser(false);
      return;
    }

    let token = getAccessToken();
    if (!token) {
      try {
        token = await refreshBrowserSession();
      } catch {
        token = '';
      }
    }
    if (!token) {
      if (readStoredTerminalLockReason() === 'shift_closed') {
        setStoredTerminalLock(true);
        setStoredTerminalLockReason('full_auth');
      }
      resetSettingsAccessPinState();
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
        resetSettingsAccessPinState();
        setTerminalUser(null);
        setLocked(true);
        setDrawerOpen(true);
        return;
      }
      const storedTerminalId = sanitizeTerminalId(readStoredTerminalId() || activeTerminalId);
      const storedReason = readStoredTerminalLockReason();
      const storedLockActive = readStoredTerminalLock();
      const userIsAdmin = user?.is_master_admin === true;

      setTerminalUser(user);
      setDgfyAdminBypassActive(userIsAdmin && !storedLockActive);

      if (storedLockActive) {
        resetSettingsAccessPinState();
        setLocked(true);
        if (storedReason === 'admin_reunlock') {
          const storedAdminContext = readStoredAdminLockContext();
          setAdminReauthContext(storedAdminContext);
          setAdminReauthForm({
            identifier: storedAdminContext?.identifier || String(user?.email || user?.username || '').trim(),
            password: ''
          });
          setTerminalUnlockMode('admin_reunlock');
          setTerminalUnlockRequired(false);
          setTerminalUnlockModalOpen(true);
          setDrawerOpen(false);
          return;
        }
        if (storedReason === 'terminal_reunlock' && cashierResumeContext?.shiftId) {
          setTerminalUnlockMode('cashier_resume');
          setTerminalUnlockRequired(false);
          setTerminalUnlockModalOpen(true);
          setDrawerOpen(false);
          return;
        }
        if (storedReason === 'shift_start_required') {
          setTerminalUnlockMode('shift_start');
          setTerminalUnlockRequired(true);
          setTerminalUnlockModalOpen(true);
          setDrawerOpen(false);
          return;
        }
        setStoredTerminalLockReason(storedReason === 'shift_closed' ? 'shift_closed' : 'full_auth');
        setCashierUnlockSession(null);
        setCashierResumeContext(null);
        setCashierResumeForm({ identifier: '', password: '' });
        setAdminReauthContext(null);
        setAdminReauthForm({ identifier: '', password: '' });
        setTerminalUnlockRequired(false);
        setTerminalUnlockModalOpen(false);
        setDrawerOpen(true);
        return;
      }

      setLocked(false);
      setDrawerOpen(false);
      if (tenantSetupFlowRequested) {
        setStoredTerminalLock(false);
        setStoredTerminalLockReason('');
      }
      if (
        IS_DGFY_POS_SURFACE
        && !userIsAdmin
        && storedTerminalId
        && !storedLockActive
        && storedReason !== 'full_auth'
        && storedReason !== 'shift_closed'
        && storedReason !== 'terminal_reunlock'
      ) {
        const storedRegistryEntry = terminalRegistryLookup.get(storedTerminalId);
        const storedLocationId = Number(storedRegistryEntry?.location_id || 0);
        if (!storedRegistryEntry || !Number.isInteger(storedLocationId) || storedLocationId <= 0) {
          setStoredTerminalLock(true);
          setStoredTerminalLockReason('full_auth');
          setTerminalUnlockRequired(false);
          setTerminalUnlockModalOpen(false);
          setDrawerOpen(true);
          return;
        }
        const operationalContext = await refreshOperationalContext({
          terminalIdOverride: storedTerminalId,
          operatingLocationIdOverride: storedLocationId,
          suppressGlobalErrors: true,
          allowWhileLocked: true
        });
        if (operationalContext?.shift) {
          setStoredTerminalLock(false);
          setStoredTerminalLockReason('');
          setTerminalUnlockRequired(false);
          setTerminalUnlockModalOpen(false);
          setDrawerOpen(false);
          setActiveTerminalId(storedTerminalId);
          setFormData((prev) => ({ ...prev, terminalId: storedTerminalId }));
          const restoredLocationId = Number(operationalContext.shift.location_id || 0);
          if (Number.isInteger(restoredLocationId) && restoredLocationId > 0) {
            setOperatingLocationId(restoredLocationId);
          }
        }
      }
    } catch {
      resetSettingsAccessPinState();
      setTerminalUser(null);
      setLocked(true);
      setDrawerOpen(true);
    } finally {
      setLoadingUser(false);
    }
  }, [activeTerminalId, cashierResumeContext?.shiftId, refreshOperationalContext, resetSettingsAccessPinState, tenantSetupFlowRequested]);

  useEffect(() => {
    hydrateUser();
  }, [hydrateUser]);

  useEffect(() => {
    if (!locked) {
      hydrateTerminalMeta();
      return;
    }
    setTerminalMeta((prev) => ({ ...prev, loading: false, settingsAccessPinEnabled: false }));
  }, [hydrateTerminalMeta, locked]);

  useEffect(() => {
    hydrateTenantSetupState({ suppressGlobalErrors: true });
  }, [hydrateTenantSetupState]);

  useEffect(() => {
    if (!locked) {
      refreshOperationalContext();
    }
  }, [locked, refreshOperationalContext]);

  useEffect(() => {
    if (setupFlowState.loading || !tenantSetupFlowRequested || locked || terminalUser?.is_master_admin !== true) return;

    if (tenantSetupStep === POS_TERMINAL_SETUP_STEPS.COMPLETE) {
      clearTenantSetupQueryState();
      toast.success('Tenant onboarding, POS Setup, and Storefront Setup are complete.');
      return;
    }

    openTenantSetupStep(tenantSetupStep);
  }, [
    clearTenantSetupQueryState,
    locked,
    openTenantSetupStep,
    setupFlowState.loading,
    tenantSetupFlowRequested,
    tenantSetupStep,
    terminalUser?.is_master_admin
  ]);

  useEffect(() => {
    if (locked || readStoredTerminalLock()) {
      setTenantSetupModalOpen(false);
      return;
    }
    if (setupFlowState.loading) {
      setTenantSetupModalOpen(false);
      return;
    }
    if (!setupFlowActive) {
      setTenantSetupModalOpen(false);
      setTenantSetupDismissedThisSession(false);
      return;
    }
    if (!tenantSetupFlowRequested) {
      openTenantSetupStep(tenantSetupStep);
    }
    setTenantSetupDismissedThisSession(false);
    setTenantSetupModalOpen(true);
  }, [locked, openTenantSetupStep, setupFlowActive, setupFlowState.loading, tenantSetupFlowRequested, tenantSetupStep]);

  useEffect(() => {
    if (locked || terminalUser?.is_master_admin !== true) return;
    if (!readStoredTerminalLock()) return;

    const storedLockReason = readStoredTerminalLockReason();
    resetSettingsAccessPinState();
    setLocked(true);
    setDrawerOpen(!(storedLockReason === 'terminal_reunlock' || storedLockReason === 'shift_start_required' || storedLockReason === 'admin_reunlock'));
  }, [
    locked,
    resetSettingsAccessPinState,
    terminalUser?.is_master_admin
  ]);

  useEffect(() => {
    if (!locked) {
      refreshTenantLocations();
    }
  }, [locked, refreshTenantLocations]);

  useEffect(() => {
    if (!locked || !readStoredTerminalLock()) return;
    const storedLockReason = readStoredTerminalLockReason();
    if (storedLockReason === 'full_auth' || storedLockReason === 'shift_closed') {
      setTerminalUnlockRequired(false);
      setTerminalUnlockModalOpen(false);
      setDrawerOpen(true);
      return;
    }
    if (storedLockReason !== 'terminal_reunlock' && storedLockReason !== 'shift_start_required' && storedLockReason !== 'admin_reunlock') return;

    if (storedLockReason === 'admin_reunlock') {
      const storedAdminContext = readStoredAdminLockContext();
      setAdminReauthContext(storedAdminContext);
      setAdminReauthForm({
        identifier: storedAdminContext?.identifier || '',
        password: ''
      });
      setTerminalUnlockMode('admin_reunlock');
      setTerminalUnlockRequired(false);
      setTerminalUnlockModalOpen(true);
      setDrawerOpen(false);
      return;
    }

    const canResumeLockedShiftInThisTab = (
      storedLockReason === 'terminal_reunlock'
      && Boolean(cashierResumeContext?.shiftId)
    );

    // Browser refresh loses the in-memory resume context. Never restore a
    // privileged unlock step without either a token or same-tab shift context.
    if (!getAccessToken() && !canResumeLockedShiftInThisTab) {
      setStoredTerminalLockReason('full_auth');
      setCashierUnlockSession(null);
      setCashierResumeContext(null);
      setCashierResumeForm({ identifier: '', password: '' });
      setTerminalUnlockRequired(false);
      setTerminalUnlockModalOpen(false);
      setDrawerOpen(true);
      return;
    }

    setTerminalUnlockMode(storedLockReason === 'terminal_reunlock' ? 'cashier_resume' : 'shift_start');
    setTerminalUnlockRequired(storedLockReason === 'shift_start_required');
    setTerminalUnlockForm((prev) => ({
      terminalId: sanitizeTerminalId(prev.terminalId) || sanitizeTerminalId(activeTerminalId) || readInitialTerminalId(),
      terminalPassword: '',
      cashierEmail: storedLockReason === 'shift_start_required' ? prev.cashierEmail : '',
      cashierPassword: '',
      openingFloatAmount: storedLockReason === 'shift_start_required' ? prev.openingFloatAmount : '',
      openingNote: storedLockReason === 'shift_start_required' ? prev.openingNote : ''
    }));
    setTerminalUnlockModalOpen(true);
    setDrawerOpen(false);
  }, [activeTerminalId, cashierResumeContext?.shiftId, locked]);

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
      resetSettingsAccessPinState();
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
  }, [resetSettingsAccessPinState]);

  useEffect(() => {
    if (settingsAccessPinEnabled) return;
    setSettingsAccessPinVerified(false);
    setSettingsAccessPinModalOpen(false);
    setPendingSettingsViewMode('');
    setSettingsAccessPinValue('');
  }, [settingsAccessPinEnabled]);

  useEffect(() => {
    if (!locked) return;
    resetSettingsAccessPinState();
  }, [locked, resetSettingsAccessPinState]);

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
    if (!canTransactPos) return 'Your account does not have POS transact permission.';
    if (!shiftState.shift) return 'Open a shift before checkout.';
    return '';
  }, [canTransactPos, locked, shiftState.shift]);

  const activeShiftId = shiftState?.shift?.pos_terminal_shift_id || null;
  const requiresOpenShift = !locked && !shiftState.loading && !activeShiftId;
  const shiftOpenPromptBlockedBySetup = setupFlowActive || !setupFlowState.posRequirements.terminalRegistryReady;
  const suppressAdminShiftPrompt = canAdminBypassShiftPrompt && adminShiftPromptSkipped;
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
    if (activeTerminalRegistry.length === 0) {
      toast.error('No active terminals configured. Add one in Settings > POS Setup > Terminal Registry.');
      return false;
    }
    if (!selectedTerminalId) {
      toast.error('Select an active terminal before opening a shift.');
      return false;
    }
    if (!registryEntry) {
      toast.error('Select an active terminal from the configured registry.');
      return false;
    }
    if (terminalUnlockMode !== 'relock' && registryEntry && Number(registryEntry.location_id || 0) <= 0) {
      toast.error('This terminal has no assigned store location. Set the location in POS Setup > Terminal Registry.');
      return false;
    }
    return true;
  };

  const notifyStockAlertsAfterUnlock = useCallback(async () => {
    try {
      const data = await fetchPosCatalog({ limit: 200 });
      const catalogItems = Array.isArray(data) ? data : [];
      const summary = catalogItems.reduce((accumulator, item) => {
        if (item?.pos_always_available === true) {
          return accumulator;
        }
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
    setStoredTerminalLockReason('');
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
        operatingLocationIdOverride,
        suppressGlobalErrors: true
      })
    ]);
    setFormData((prev) => ({ ...prev, password: '', terminalId: selectedTerminalId }));
    setCashierUnlockSession(null);
    setCashierResumeContext(null);
    setCashierResumeForm({ identifier: '', password: '' });
    setAdminReauthContext(null);
    setAdminReauthForm({ identifier: '', password: '' });
    setTerminalUnlockRequired(false);
    setTerminalUnlockMode('shift_start');
    setTerminalUnlockForm({
      terminalId: selectedTerminalId,
      terminalPassword: '',
      cashierEmail: '',
      cashierPassword: '',
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
    const continuingAfterCompanyPicker = dgfyPosState.authenticated === true;

    setSubmitting(true);
    try {
      setCashierUnlockSession(null);
      setDgfyAdminBypassActive(false);
      if (!email || !password) {
        toast.error('DGFY email and password are required.');
        return;
      }
      const loginResult = await loginDgfyAccount({ email, password });
      const token = loginResult?.token || '';
      const resolvedAccount = loginResult?.account || null;
      if (!token) {
        toast.error('Unable to start DGFY session. Sign in again.');
        return;
      }
      setDgfyPosState((prev) => ({
        ...prev,
        authenticated: true,
        account: resolvedAccount,
        companies: []
      }));

      setDgfyPosState((prev) => ({ ...prev, loadingCompanies: true }));
      const companiesResult = await listDgfyAccountCompanies(token);
      const acceptedCompanies = [
        ...(Array.isArray(companiesResult?.owned_companies) ? companiesResult.owned_companies : []),
        ...(Array.isArray(companiesResult?.invited_companies) ? companiesResult.invited_companies : [])
      ].filter((company) => company?.can_switch);
      const selectedTenantId = String(formData.dgfyTenantId || '').trim()
        || (acceptedCompanies.length === 1 ? String(acceptedCompanies[0]?.tenant_id || '') : '');
      if (selectedTenantId) {
        setFormData((prev) => ({ ...prev, dgfyTenantId: selectedTenantId }));
      }
      setDgfyPosState((prev) => ({
        ...prev,
        authenticated: true,
        account: resolvedAccount || prev.account || null,
        companies: acceptedCompanies,
        loadingCompanies: false
      }));
      if (!selectedTenantId) {
        if (acceptedCompanies.length === 0) {
          toast.message('No registered business was found for this account. Opening your DGFY customer dashboard.');
          if (typeof window !== 'undefined') {
            window.location.href = resolveStorefrontAccountUrl();
          }
          return;
        }
        toast.message('Select the company to continue.');
        return;
      }
      if (!continuingAfterCompanyPicker) {
        toast.message('Confirm the company, then continue to POS.');
        return;
      }
      const selectedTenantSession = await startDgfyTenantSession({
        tenantId: selectedTenantId
      }, token);
      const fallbackSelectedTenantUser = selectedTenantSession
        ? {
            user_id: selectedTenantSession.user_id,
            username: selectedTenantSession.username,
            email: selectedTenantSession.email,
            phone_number: selectedTenantSession.phone_number || null,
            role: selectedTenantSession.role,
            permissions: Array.isArray(selectedTenantSession.permissions) ? selectedTenantSession.permissions : [],
            is_active: true,
            is_master_admin: selectedTenantSession.is_master_admin === true
          }
        : null;

      const [selectedTenantUser, selectedTenantSettings, selectedTenantCompany, selectedTenantUsers, selectedTenantLocations, selectedTenantItems] = await Promise.all([
        fetchCurrentUser(SUPPRESS_GLOBAL_ERROR_TOAST).catch(() => null),
        getAllSettings({
          force: true,
          requestConfig: SUPPRESS_GLOBAL_ERROR_TOAST
        }).catch(() => ({})),
        getCompanyInfo().catch(() => null),
        getAllUsers({ include_invitations: true }).catch(() => []),
        listTenantLocations({ include_inactive: false }).catch(() => []),
        fetchPosCatalog({ limit: 1 }).catch(() => [])
      ]);
      const effectiveSelectedTenantUser = selectedTenantUser || fallbackSelectedTenantUser;
      const selectedTenantUsersForReadiness = Array.isArray(selectedTenantUsers) && selectedTenantUsers.length > 0
        ? selectedTenantUsers
        : (effectiveSelectedTenantUser ? [effectiveSelectedTenantUser] : []);
      const selectedUserIsAdmin = effectiveSelectedTenantUser?.is_master_admin === true
        || String(effectiveSelectedTenantUser?.role || '').trim().toLowerCase() === 'admin';
      const selectedTenantSetupState = buildTenantSetupStateSnapshot({
        settingsPayload: selectedTenantSettings || {},
        companyPayload: selectedTenantCompany || {},
        usersPayload: selectedTenantUsersForReadiness,
        locationsPayload: selectedTenantLocations,
        itemsPayload: selectedTenantItems
      });
      const selectedTenantSetupStep = resolveTenantSetupStep({
        requested: true,
        locked: false,
        isMasterAdmin: effectiveSelectedTenantUser?.is_master_admin === true,
        requestedStep: POS_TERMINAL_SETUP_STEPS.PROFILE,
        profileReady: selectedTenantSetupState.profileReady,
        posSetupReady: selectedTenantSetupState.posSetupReady,
        storefrontSetupReady: selectedTenantSetupState.storefrontSetupReady,
        starterItemReady: selectedTenantSetupState.starterItemReady
      });

      setTerminalUser(effectiveSelectedTenantUser);
      setDgfyAdminBypassActive(selectedUserIsAdmin);
      setAdminShiftPromptSkipped(false);
      setSetupFlowState(selectedTenantSetupState);
      const selectedTenantRegistry = normalizeTerminalRegistry(selectedTenantSettings?.pos_terminal_registry?.value || []);
      const selectedTenantRegistryModeRaw = String(selectedTenantSettings?.pos_terminal_registry_mode?.value || '')
        .trim()
        .toLowerCase();
      const selectedTenantRegistryMode = TERMINAL_REGISTRY_MODES.has(selectedTenantRegistryModeRaw)
        ? selectedTenantRegistryModeRaw
        : 'warn';
      const selectedTenantActiveRegistry = selectedTenantRegistry.filter((entry) => entry?.is_active !== false);
      setTerminalRegistry(selectedTenantRegistry);
      setTerminalRegistryMode(selectedTenantRegistryMode);
      setLocked(false);
      setDrawerOpen(false);
      if (
        effectiveSelectedTenantUser?.is_master_admin === true
        && selectedTenantSetupStep !== POS_TERMINAL_SETUP_STEPS.COMPLETE
      ) {
        setStoredTerminalLock(false);
        setStoredTerminalLockReason('');
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(TERMINAL_ID_STORAGE_KEY);
        }
        setActiveTerminalId('');
        setTerminalRegistry([]);
        setFormData((prev) => ({ ...prev, terminalId: '' }));
        setTerminalUnlockForm((prev) => ({ ...prev, terminalId: '' }));
        setTerminalUnlockRequired(false);
        setTerminalUnlockModalOpen(false);
        const posOnboardingUrl = resolvePosTerminalUrl(POS_ONBOARDING_ENTRY_SEARCH);
        try {
          const targetUrl = new URL(posOnboardingUrl, window.location.origin);
          if (targetUrl.origin !== window.location.origin) {
            window.location.assign(targetUrl.toString());
            return;
          }
        } catch {
          // Fall through to in-app navigation when URL parsing is unavailable.
        }
        navigate({
          pathname: '/terminal',
          search: POS_ONBOARDING_ENTRY_SEARCH
        }, { replace: true });
        return;
      }
      if (selectedUserIsAdmin) {
        setStoredTerminalLock(false);
        setStoredTerminalLockReason('');
        setTerminalUnlockRequired(false);
        setTerminalUnlockMode('shift_start');
        setTerminalUnlockModalOpen(false);
        setDrawerOpen(false);
        toast.success('DGFY administrator access opened. Open a shift to start selling.');
        return;
      }
      if (!selectedTenantSetupState.posSetupReady) {
        setTerminalUnlockModalOpen(false);
        toast.error('POS setup is incomplete. An active terminal and cashier account are required before terminal unlock.');
        return;
      }
      const selectedTerminalId = resolvePreferredTerminalId(
        selectedTenantActiveRegistry,
        sanitizeTerminalId(formData.terminalId) || readStoredTerminalId(),
        { registryMode: selectedTenantRegistryMode }
      );
      const selectedTenantRegistryEntry = selectedTenantActiveRegistry.find((entry) => String(entry?.terminal_id || '') === selectedTerminalId);
      if (selectedTenantActiveRegistry.length === 0) {
        setTerminalUnlockModalOpen(false);
        toast.error('No active terminals configured. Add one in Settings > POS Setup > Terminal Registry.');
        return;
      }
      if (!selectedTerminalId || !selectedTenantRegistryEntry) {
        setTerminalUnlockModalOpen(false);
        toast.error('Select an active terminal before opening a shift.');
        return;
      }
      const selectedLocationId = Number(selectedTenantRegistryEntry?.location_id || 0);
      if (!Number.isInteger(selectedLocationId) || selectedLocationId <= 0) {
        setTerminalUnlockModalOpen(false);
        toast.error('This terminal has no assigned store location. Set the location in POS Setup > Terminal Registry.');
        return;
      }
      if (Number.isInteger(selectedLocationId) && selectedLocationId > 0) {
        setOperatingLocationId(selectedLocationId);
      }
      setCashierUnlockSession({
        source: 'dgfy_pos',
        email: String(effectiveSelectedTenantUser?.email || email).trim(),
        userId: effectiveSelectedTenantUser?.user_id || selectedTenantSession?.user_id || null,
        role: effectiveSelectedTenantUser?.role || selectedTenantSession?.role || 'cashier',
        permissions: Array.isArray(effectiveSelectedTenantUser?.permissions) ? effectiveSelectedTenantUser.permissions : [],
        tenantId: selectedTenantId,
        companyToken: selectedTenantSession?.company?.token || getCompanyToken() || '',
        terminalId: selectedTerminalId
      });
      setTerminalUnlockForm((prev) => ({
        ...prev,
        terminalId: selectedTerminalId
      }));
      setTerminalUnlockModalOpen(true);
    } catch (error) {
      setDgfyPosState((prev) => ({ ...prev, loadingCompanies: false }));
      toast.error(resolveTerminalLoginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resetDgfyPosIdentity = useCallback(({ nextEmail = '', revokeServerSession = false } = {}) => {
    const activeDgfyToken = getStoredDgfyToken();
    if (revokeServerSession && (dgfyPosState.authenticated || activeDgfyToken)) {
      logoutDgfyAccount(activeDgfyToken).catch(() => clearDgfySession());
    } else {
      clearDgfySession();
    }
    clearBrowserSession();
    setDgfyPosState({
      authenticated: false,
      account: null,
      companies: [],
      loadingCompanies: false
    });
    setFormData((previous) => ({
      ...previous,
      email: nextEmail,
      password: '',
      dgfyTenantId: ''
    }));
    setCashierUnlockSession(null);
    setDgfyAdminBypassActive(false);
  }, [dgfyPosState.authenticated]);

  const handleDgfyPosIdentityChange = useCallback((nextEmail) => {
    const normalizedCurrent = String(formData.email || '').trim().toLowerCase();
    const normalizedNext = String(nextEmail || '').trim().toLowerCase();
    if (dgfyPosState.authenticated && normalizedNext !== normalizedCurrent) {
      resetDgfyPosIdentity({ nextEmail, revokeServerSession: true });
      return;
    }
    setFormData((previous) => ({ ...previous, email: nextEmail }));
  }, [dgfyPosState.authenticated, formData.email, resetDgfyPosIdentity]);

  const handleUseDifferentDgfyAccount = useCallback(() => {
    resetDgfyPosIdentity({ nextEmail: '', revokeServerSession: true });
  }, [resetDgfyPosIdentity]);

  const authenticateCashierCredentials = async ({ identifier, password, companyTokenHint = '' }) => {
    const normalizedIdentifier = String(identifier || '').trim();
    const normalizedPassword = String(password || '');
    const currentCompanyToken = String(companyTokenHint || getCompanyToken() || '').trim();
    let resolvedCompanyToken = '';
    if (normalizedIdentifier.includes('@')) {
      try {
        resolvedCompanyToken = String(await lookupCompanyToken(normalizedIdentifier, currentCompanyToken) || '').trim();
      } catch (lookupError) {
        if (!currentCompanyToken || !shouldFallbackToCurrentCompanyTokenAfterLookupError(lookupError)) {
          throw lookupError;
        }
        resolvedCompanyToken = currentCompanyToken;
      }
    } else {
      resolvedCompanyToken = currentCompanyToken;
    }
    if (!resolvedCompanyToken) {
      throw createTerminalLoginError(
        'Username login requires this POS to be linked to its company. Sign in as the company admin once, or use the cashier email.',
        POS_TERMINAL_LOGIN_ERROR_CODES.COMPANY_TOKEN_UNRESOLVED
      );
    }

    await loginCashierWithCredentials(
      { identifier: normalizedIdentifier, password: normalizedPassword, companyToken: resolvedCompanyToken },
      SUPPRESS_GLOBAL_ERROR_TOAST
    );
    const cashierUser = await fetchCurrentUser(SUPPRESS_GLOBAL_ERROR_TOAST);
    if (String(cashierUser?.role || '').trim().toLowerCase() !== 'cashier') {
      clearClientSession({
        reason: 'logout',
        broadcast: true,
        emitAuthEvents: true,
        redirectTo: null
      });
      throw createTerminalLoginError('This login is only for POS cashier accounts. Use DGFY sign in for admin accounts.');
    }

    return { cashierUser, companyToken: resolvedCompanyToken };
  };

  const handleCashierResumeSubmit = async (event) => {
    event.preventDefault();
    const identifier = String(cashierResumeForm.identifier || '').trim();
    const password = String(cashierResumeForm.password || '');

    if (!identifier || !password) {
      toast.error('Cashier username/email and password are required to continue this shift.');
      return;
    }
    if (!cashierResumeContext?.shiftId) {
      toast.error('No locked shift was found. Please sign in again.');
      setTerminalUnlockModalOpen(false);
      setDrawerOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const { cashierUser } = await authenticateCashierCredentials({
        identifier,
        password,
        companyTokenHint: cashierResumeContext.companyToken
      });
      const expectedCashierId = Number(cashierResumeContext.cashierId || 0);
      const authenticatedCashierId = Number(cashierUser?.user_id || 0);
      if (
        Number.isInteger(expectedCashierId)
        && expectedCashierId > 0
        && authenticatedCashierId !== expectedCashierId
      ) {
        clearClientSession({
          reason: 'logout',
          broadcast: true,
          emitAuthEvents: true,
          redirectTo: null
        });
        toast.error('Only the cashier who opened this shift can continue it. Close the current shift before another cashier signs in.');
        return;
      }

      setTerminalUser(cashierUser);
      await completeTerminalUnlock(cashierResumeContext.terminalId || activeTerminalId, {
        operatingLocationIdOverride: cashierResumeContext.locationId
      });
      toast.success('Cashier verified. Shift resumed.');
    } catch (error) {
      toast.error(resolveTerminalLoginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminReauthSubmit = async (event) => {
    event.preventDefault();
    const identifier = String(adminReauthForm.identifier || '').trim();
    const password = String(adminReauthForm.password || '');
    const companyTokenHint = String(adminReauthContext?.companyToken || getCompanyToken() || '').trim();
    const terminalId = sanitizeTerminalId(adminReauthContext?.terminalId || activeTerminalId || readStoredTerminalId());

    if (!identifier || !password) {
      toast.error('Admin username/email and password are required to unlock POS.');
      return;
    }

    setSubmitting(true);
    try {
      let resolvedCompanyToken = companyTokenHint;
      if (identifier.includes('@')) {
        try {
          resolvedCompanyToken = String(await lookupCompanyToken(identifier, companyTokenHint) || '').trim();
        } catch (lookupError) {
          if (!companyTokenHint || !shouldFallbackToCurrentCompanyTokenAfterLookupError(lookupError)) {
            throw lookupError;
          }
          resolvedCompanyToken = companyTokenHint;
        }
      }
      if (!resolvedCompanyToken) {
        throw createTerminalLoginError(
          'Username login requires this POS to be linked to its company. Use the admin email or sign in from POS login.',
          POS_TERMINAL_LOGIN_ERROR_CODES.COMPANY_TOKEN_UNRESOLVED
        );
      }

      await loginWithCredentials(
        { email: identifier, password, companyToken: resolvedCompanyToken },
        SUPPRESS_GLOBAL_ERROR_TOAST
      );
      const adminUser = await fetchCurrentUser(SUPPRESS_GLOBAL_ERROR_TOAST);
      const userIsAdmin = adminUser?.is_master_admin === true
        || String(adminUser?.role || '').trim().toLowerCase() === 'admin';
      if (!userIsAdmin) {
        clearClientSession({
          reason: 'logout',
          broadcast: true,
          emitAuthEvents: true,
          redirectTo: null
        });
        throw createTerminalLoginError('Only a company admin can unlock this admin-locked POS.');
      }

      setStoredTerminalLock(false);
      setStoredTerminalLockReason('');
      setStoredAdminLockContext(null);
      setTerminalUser(adminUser);
      setDgfyAdminBypassActive(true);
      setLocked(false);
      setDrawerOpen(false);
      setTerminalUnlockRequired(false);
      setTerminalUnlockModalOpen(false);
      setTerminalUnlockMode('shift_start');
      setAdminReauthContext(null);
      setAdminReauthForm({ identifier: '', password: '' });
      setFormData((prev) => ({ ...prev, password: '', terminalId: terminalId || prev.terminalId }));
      if (terminalId) {
        setActiveTerminalId(terminalId);
      }
      await Promise.all([
        hydrateTerminalMeta({ suppressGlobalErrors: true }),
        refreshTenantLocations({ suppressGlobalErrors: true })
      ]);
      toast.success('Admin verified. POS unlocked.');
    } catch (error) {
      toast.error(resolveTerminalLoginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resolveTenantIdForTerminalUnlock = useCallback(async () => {
    const selectedTenantId = String(formData.dgfyTenantId || '').trim();
    if (selectedTenantId) return selectedTenantId;

    const currentCompanyToken = String(getCompanyToken() || '').trim();
    const dgfyToken = String(getStoredDgfyToken() || '').trim();
    if (!dgfyToken) return '';

    const companiesResult = await listDgfyAccountCompanies(dgfyToken);
    const acceptedCompanies = [
      ...(Array.isArray(companiesResult?.owned_companies) ? companiesResult.owned_companies : []),
      ...(Array.isArray(companiesResult?.invited_companies) ? companiesResult.invited_companies : [])
    ].filter((company) => company?.can_switch);

    const matchedCompany = acceptedCompanies.find((company) => String(company?.company_token || '').trim() === currentCompanyToken)
      || (acceptedCompanies.length === 1 ? acceptedCompanies[0] : null);
    const recoveredTenantId = String(matchedCompany?.tenant_id || '').trim();

    setDgfyPosState((prev) => ({
      ...prev,
      authenticated: true,
      companies: acceptedCompanies,
      loadingCompanies: false
    }));

    if (recoveredTenantId) {
      setFormData((prev) => ({ ...prev, dgfyTenantId: recoveredTenantId }));
    }

    return recoveredTenantId;
  }, [formData.dgfyTenantId]);

  const handleTerminalUnlockSubmit = async (event) => {
    event.preventDefault();
    const cashierSessionActive = Boolean(cashierUnlockSession?.email);
    const dgfyCashierSessionActive = cashierUnlockSession?.source === 'dgfy_pos';
    const selectedTenantId = cashierSessionActive
      ? String(cashierUnlockSession?.tenantId || '').trim()
      : await resolveTenantIdForTerminalUnlock();
    const selectedTerminalId = sanitizeTerminalId(terminalUnlockForm.terminalId || resolveSelectedLoginTerminalId());
    const requiresOpeningCash = terminalUnlockMode !== 'relock';
    const rawOpeningFloat = String(terminalUnlockForm.openingFloatAmount ?? '').trim();
    const openingFloatAmount = Number(rawOpeningFloat);
    const selectedRegistryEntry = terminalRegistryLookup.get(selectedTerminalId);

    if (!selectedTenantId) {
      toast.error('Select the company before unlocking the terminal.');
      return;
    }
    if (!validateSelectedTerminalForUnlock(selectedTerminalId)) return;
    if (!cashierSessionActive && requiresOpeningCash && !String(terminalUnlockForm.cashierEmail || '').trim()) {
      toast.error('Cashier email is required.');
      return;
    }
    if (!cashierSessionActive && requiresOpeningCash && !String(terminalUnlockForm.cashierPassword || '').trim()) {
      toast.error('Cashier password is required.');
      return;
    }
    if (requiresOpeningCash && rawOpeningFloat === '') {
      toast.error('Opening cash amount is required.');
      return;
    }
    if (requiresOpeningCash && (!Number.isFinite(openingFloatAmount) || openingFloatAmount < 0)) {
      toast.error('Opening float must be a non-negative number.');
      return;
    }

    setSubmitting(true);
    try {
      const resolvedCompanyToken = String(
        cashierUnlockSession?.companyToken
        || getCompanyToken()
        || ''
      ).trim();
      const registryLocationId = Number(selectedRegistryEntry?.location_id || 0);
      const resolvedLocationId = Number.isInteger(registryLocationId) && registryLocationId > 0
        ? registryLocationId
        : Number(operatingLocationId || 0);

      if (!Number.isInteger(resolvedLocationId) || resolvedLocationId <= 0) {
        toast.error('This terminal has no assigned store location. Set the location in POS Setup > Terminal Registry.');
        return;
      }

      if (requiresOpeningCash) {
        if (!cashierSessionActive && !resolvedCompanyToken) {
          toast.error('Unable to resolve the selected company session for cashier sign-in.');
          return;
        }
        if (dgfyCashierSessionActive) {
          const dgfyToken = getStoredDgfyToken();
          if (!dgfyToken) {
            toast.error('Your DGFY account session expired. Sign in again to unlock the terminal.');
            return;
          }
          const posSession = await startDgfyPosSession({
            tenantId: selectedTenantId,
            terminalId: selectedTerminalId
          }, dgfyToken);
          const nextTerminalUser = {
            user_id: posSession?.user_id || cashierUnlockSession?.userId || null,
            username: posSession?.username || cashierUnlockSession?.email || '',
            email: posSession?.email || cashierUnlockSession?.email || '',
            role: posSession?.role || cashierUnlockSession?.role || 'cashier',
            permissions: Array.isArray(posSession?.permissions)
              ? posSession.permissions
              : (Array.isArray(cashierUnlockSession?.permissions) ? cashierUnlockSession.permissions : []),
            is_active: true,
            is_master_admin: posSession?.is_master_admin === true
          };
          setTerminalUser(nextTerminalUser);
          setCashierUnlockSession((prev) => ({
            ...(prev || {}),
            source: 'dgfy_pos',
            email: nextTerminalUser.email,
            userId: nextTerminalUser.user_id,
            role: nextTerminalUser.role,
            permissions: nextTerminalUser.permissions,
            tenantId: selectedTenantId,
            terminalId: selectedTerminalId,
            companyToken: posSession?.company?.token || prev?.companyToken || getCompanyToken() || ''
          }));
        } else if (!cashierSessionActive) {
          await loginWithCredentials({
            email: String(terminalUnlockForm.cashierEmail || '').trim(),
            password: String(terminalUnlockForm.cashierPassword || ''),
            companyToken: resolvedCompanyToken
          });
        }
        await openTerminalShift({
          terminal_id: selectedTerminalId,
          location_id: resolvedLocationId,
          opening_float_amount: openingFloatAmount,
          opening_note: String(terminalUnlockForm.openingNote || '').trim() || undefined,
          idempotency_key: createIdempotencyKey('pos-shift-open')
        });
      }

      await completeTerminalUnlock(selectedTerminalId, {
        operatingLocationIdOverride: resolvedLocationId
      });
      toast.success(
        requiresOpeningCash
          ? 'POS unlocked and cashier shift opened successfully.'
          : 'Terminal unlocked successfully.'
      );
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

  const handleLock = async () => {
    const hasOpenShift = Boolean(activeShiftId);
    const adminLock = terminalUser?.is_master_admin === true || dgfyAdminBypassActive;
    const selectedTerminalId = sanitizeTerminalId(activeTerminalId) || resolveSelectedLoginTerminalId();
    const activeShiftCashierId = Number(shiftState?.shift?.cashier_id || terminalUser?.user_id || 0);
    const activeShiftLocationId = Number(shiftState?.shift?.location_id || operatingLocationId || 0);
    const activeCompanyToken = String(getCompanyToken() || '').trim();
    const activeDgfyToken = String(getStoredDgfyToken() || '').trim();
    resetSettingsAccessPinState();
    setDgfyAdminBypassActive(false);
    setAdminShiftPromptSkipped(false);

    if (adminLock) {
      setStoredTerminalLock(true);
      setStoredTerminalLockReason('full_auth');
      setStoredAdminLockContext(null);
      setAdminReauthContext(null);
      setAdminReauthForm({ identifier: '', password: '' });
      setTenantSetupModalOpen(false);
      setTenantSetupDismissedThisSession(true);
      setCashierUnlockSession(null);
      setCashierResumeContext(null);
      setCashierResumeForm({ identifier: '', password: '' });
      setDgfyPosState({
        authenticated: false,
        account: null,
        companies: [],
        loadingCompanies: false
      });
      setFormData({
        email: '',
        password: '',
        dgfyTenantId: '',
        terminalId: selectedTerminalId
      });
      setLocked(true);
      setDrawerOpen(true);
      setTerminalUser(null);
      setPosViewMode('checkout');
      setMobileNavOpen(false);
      setTerminalUnlockRequired(false);
      setTerminalUnlockMode('full_auth');
      setTerminalUnlockForm({
        terminalId: selectedTerminalId,
        terminalPassword: '',
        cashierEmail: '',
        cashierPassword: '',
        openingFloatAmount: '',
        openingNote: ''
      });
      setTerminalUnlockModalOpen(false);
      setStockAlertSummary({ open: false, almostOutOfStock: [], outOfStock: [] });
      await Promise.allSettled([
        api.post('/auth/logout'),
        logoutDgfyAccount(activeDgfyToken)
      ]);
      clearDgfySession();
      clearClientSession({
        reason: 'terminal_lock',
        broadcast: true,
        emitAuthEvents: true,
        redirectTo: null
      });
      return;
    }

    if (hasOpenShift && !adminLock) {
      setStoredTerminalLock(true);
      setStoredTerminalLockReason('terminal_reunlock');
      setStoredAdminLockContext(null);
      setCashierResumeContext({
        shiftId: activeShiftId,
        cashierId: Number.isInteger(activeShiftCashierId) && activeShiftCashierId > 0 ? activeShiftCashierId : null,
        cashierEmail: String(terminalUser?.email || '').trim(),
        cashierUsername: String(terminalUser?.username || '').trim(),
        terminalId: selectedTerminalId,
        locationId: Number.isInteger(activeShiftLocationId) && activeShiftLocationId > 0 ? activeShiftLocationId : null,
        companyToken: activeCompanyToken
      });
      setCashierResumeForm({
        identifier: String(terminalUser?.email || terminalUser?.username || '').trim(),
        password: ''
      });
      clearBrowserSession();
      setLocked(true);
      setDrawerOpen(false);
      setPosViewMode('checkout');
      setMobileNavOpen(false);
      setTerminalUnlockRequired(false);
      setTerminalUnlockMode('cashier_resume');
      setTerminalUnlockForm({
        terminalId: selectedTerminalId,
        terminalPassword: '',
        cashierEmail: '',
        cashierPassword: '',
        openingFloatAmount: '',
        openingNote: ''
      });
      setTerminalUnlockModalOpen(true);
      setStockAlertSummary({ open: false, almostOutOfStock: [], outOfStock: [] });
      return;
    }

    setStoredTerminalLock(true);
    setStoredTerminalLockReason('full_auth');
    setStoredAdminLockContext(null);
    setTenantSetupModalOpen(false);
    setTenantSetupDismissedThisSession(true);
    setCashierUnlockSession(null);
    setCashierResumeContext(null);
    setCashierResumeForm({ identifier: '', password: '' });
    setAdminReauthContext(null);
    setAdminReauthForm({ identifier: '', password: '' });
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
    setTerminalUnlockMode('shift_start');
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
    const registryEntry = terminalRegistryLookup.get(terminalId);
    if (!terminalId) {
      toast.error('Select a terminal ID before opening shift.');
      setDrawerOpen(true);
      return;
    }
    if (!registryEntry) {
      toast.error('Select an active registered terminal before opening shift.');
      setDrawerOpen(true);
      return;
    }
    const registryLocationId = Number(registryEntry.location_id || 0);
    const scopedOperatingLocationId = Number.isInteger(registryLocationId) && registryLocationId > 0
      ? registryLocationId
      : Number(operatingLocationId);
    if (!Number.isInteger(scopedOperatingLocationId) || scopedOperatingLocationId <= 0) {
      toast.error('This terminal has no assigned store location. Set the location in POS Setup > Terminal Registry.');
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
      setAdminShiftPromptSkipped(false);
      setOpenShiftForm({ openingFloatAmount: '', openingNote: '' });
      await refreshOperationalContext({
        terminalIdOverride: terminalId,
        operatingLocationIdOverride: scopedOperatingLocationId
      });
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
    if (!activeShiftId) {
      toast.error('No active shift to close.');
      return;
    }
    setCloseShiftConfirmOpen(true);
  };

  const handleConfirmCloseShift = async () => {
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
      toast.message(`You are offline. Shift close was queued and cashier login is required for the next shift (${pendingCount} queued).`);
      setCloseShiftForm({ closingCashAmount: '', closingNote: '' });
      setShiftState({
        loading: false,
        shift: null,
        cashSummary: null
      });
      setCashierUnlockSession(null);
      setCashierResumeContext(null);
      setCashierResumeForm({ identifier: '', password: '' });
      clearClientSession({
        reason: 'shift_close_queued',
        broadcast: true,
        emitAuthEvents: true,
        redirectTo: null
      });
      setTerminalUnlockRequired(false);
      setTerminalUnlockMode('shift_start');
      setStoredTerminalLock(true);
      setStoredTerminalLockReason('shift_closed');
      setLocked(true);
      setTerminalUnlockForm({
        terminalId: sanitizeTerminalId(activeTerminalId) || resolveSelectedLoginTerminalId(),
        terminalPassword: '',
        cashierEmail: '',
        cashierPassword: '',
        openingFloatAmount: '',
        openingNote: ''
      });
      setTerminalUnlockModalOpen(false);
      setDrawerOpen(true);
      setMobileNavOpen(false);
      setPosViewMode('checkout');
      return;
    }

    const preserveAdminNavigation = canAdminBypassShiftPrompt;

    setShiftActionLoading((prev) => ({ ...prev, close: true }));
    try {
      await closeTerminalShift(activeShiftId, payload);
      if (preserveAdminNavigation) {
        toast.success('Shift closed successfully.');
        setCloseShiftConfirmOpen(false);
        setCloseShiftForm({ closingCashAmount: '', closingNote: '' });
        setShiftState({
          loading: false,
          shift: null,
          cashSummary: null
        });
        setAdminShiftPromptSkipped(true);
        setDgfyAdminBypassActive(true);
        await refreshOperationalContext();
        setMobileNavOpen(false);
        setPosViewMode('shift_controls');
        return;
      }
      toast.success('Shift closed successfully. Cashier login is required for the next shift.');
      setCloseShiftConfirmOpen(false);
      setCloseShiftForm({ closingCashAmount: '', closingNote: '' });
      setShiftState({
        loading: false,
        shift: null,
        cashSummary: null
      });
      setCashierUnlockSession(null);
      setCashierResumeContext(null);
      setCashierResumeForm({ identifier: '', password: '' });
      clearClientSession({
        reason: 'shift_closed',
        broadcast: true,
        emitAuthEvents: true,
        redirectTo: null
      });
      setTerminalUnlockRequired(false);
      setTerminalUnlockMode('shift_start');
      setStoredTerminalLock(true);
      setStoredTerminalLockReason('shift_closed');
      setLocked(true);
      setTerminalUnlockForm({
        terminalId: sanitizeTerminalId(activeTerminalId) || resolveSelectedLoginTerminalId(),
        terminalPassword: '',
        cashierEmail: '',
        cashierPassword: '',
        openingFloatAmount: '',
        openingNote: ''
      });
      setTerminalUnlockModalOpen(false);
      setDrawerOpen(true);
      setMobileNavOpen(false);
      setPosViewMode('checkout');
    } catch (error) {
      if (isRetryableTerminalOperationError(error)) {
        await enqueueTerminalOperationIntent(queueEntry, 'network_failure');
        setCloseShiftConfirmOpen(false);
        const pendingCount = Number(queueSummary.pending || 0) + 1;
        toast.message(
          `Shift close was queued after a connectivity issue. Cashier login is required for the next shift (${pendingCount} queued).`
        );
        setCloseShiftForm({ closingCashAmount: '', closingNote: '' });
        setShiftState({
          loading: false,
          shift: null,
          cashSummary: null
        });
        setCashierUnlockSession(null);
        setCashierResumeContext(null);
        setCashierResumeForm({ identifier: '', password: '' });
        clearClientSession({
          reason: 'shift_close_queued',
          broadcast: true,
          emitAuthEvents: true,
          redirectTo: null
        });
        setTerminalUnlockRequired(false);
        setTerminalUnlockMode('shift_start');
        setStoredTerminalLock(true);
        setStoredTerminalLockReason('shift_closed');
        setLocked(true);
        setTerminalUnlockForm({
          terminalId: sanitizeTerminalId(activeTerminalId) || resolveSelectedLoginTerminalId(),
          terminalPassword: '',
          cashierEmail: '',
          cashierPassword: '',
          openingFloatAmount: '',
          openingNote: ''
        });
        setTerminalUnlockModalOpen(false);
        setDrawerOpen(true);
        setMobileNavOpen(false);
        setPosViewMode('checkout');
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
      if (isCashierRole) {
        toast.error('Cashier access is limited to Sell, History, Items, Orders, and Shift.');
      }
      setMobileNavOpen(false);
      return;
    }
    const isSettingsViewMode = SETTINGS_VIEW_MODES.has(nextMode);
    const isShiftExemptViewMode = SHIFT_EXEMPT_VIEW_MODES.has(nextMode);
    const isPinProtectedViewMode = PIN_PROTECTED_VIEW_MODES.has(nextMode);
    if (setupFlowActive) {
      const allowedSetupModes = new Set(['settings_profile', 'settings_pos', 'settings_storefront']);
      if (!allowedSetupModes.has(nextMode)) {
        toast.error(
          tenantSetupStep === POS_TERMINAL_SETUP_STEPS.PROFILE
            ? 'Finish tenant onboarding in POS Settings before opening the rest of the POS.'
            : (
          tenantSetupStep === POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP
            ? 'Finish Storefront Setup before opening the rest of the POS.'
            : 'Finish POS Setup before opening the rest of the POS.')
        );
        if (!tenantSetupDismissedThisSession) {
          resumeTenantSetupFlow();
        }
        setMobileNavOpen(false);
        return;
      }
    }
    if (requiresOpenShift && !isSettingsViewMode && !isShiftExemptViewMode && !canAdminBypassShiftPrompt) {
      toast.error('You cannot use the POS because the shift is closed.');
      setMobileNavOpen(false);
      return;
    }
    if (isPinProtectedViewMode && !canAccessSettingsDirectly) {
      if (!settingsAccessPinEnabled) {
        toast.error('POS access PIN is not configured by the main branch admin.');
        setMobileNavOpen(false);
        return;
      }
      if (!settingsAccessPinVerified) {
        setPendingSettingsViewMode(nextMode);
        setSettingsAccessPinValue('');
        setSettingsAccessPinModalOpen(true);
        setMobileNavOpen(false);
        return;
      }
    }
    commitViewModeSelection(nextMode);
  }, [
    activeViewModes,
    canAccessSettingsDirectly,
    canAdminBypassShiftPrompt,
    commitViewModeSelection,
    isCashierRole,
    locked,
    requiresOpenShift,
    resumeTenantSetupFlow,
    settingsAccessPinEnabled,
    settingsAccessPinVerified,
    setupFlowActive,
    tenantSetupDismissedThisSession,
    tenantSetupStep
  ]);

  const handleSettingsAccessPinSubmit = useCallback(async (event) => {
    event.preventDefault();
    const normalizedPin = String(settingsAccessPinValue || '').trim();
    if (!normalizedPin) {
      toast.error('Enter the POS access PIN to continue.');
      return;
    }

    setSettingsAccessPinSubmitting(true);
    try {
      await verifyPosSettingsAccessPin(normalizedPin);
      await hydrateTerminalMeta({ suppressGlobalErrors: true });
      setSettingsAccessPinVerified(true);
      setSettingsAccessPinModalOpen(false);
      setSettingsAccessPinValue('');
      const nextMode = String(pendingSettingsViewMode || 'settings_profile').trim() || 'settings_profile';
      setPendingSettingsViewMode('');
      commitViewModeSelection(nextMode);
      toast.success('POS tools unlocked for this session.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Invalid POS access PIN.');
    } finally {
      setSettingsAccessPinSubmitting(false);
    }
  }, [commitViewModeSelection, hydrateTerminalMeta, pendingSettingsViewMode, settingsAccessPinValue]);

  const handleHardwareMessageOpenChange = useCallback((open) => {
    if (!open) {
      setHardwareMessage(null);
    }
  }, []);

  const handlePosSetupSaved = useCallback(async () => {
    await hydrateTenantSetupState({ suppressGlobalErrors: true });
  }, [hydrateTenantSetupState]);

  const handleStorefrontSetupSaved = useCallback(async () => {
    await hydrateTenantSetupState({ suppressGlobalErrors: true });
  }, [hydrateTenantSetupState]);

  const handleTenantSetupDataChanged = useCallback(async () => {
    await Promise.all([
      hydrateTenantSetupState({ suppressGlobalErrors: true }),
      hydrateTerminalMeta({ suppressGlobalErrors: true }),
      refreshTenantLocations({ suppressGlobalErrors: true }),
      hydrateUser({ suppressGlobalErrors: true })
    ]);
  }, [hydrateTenantSetupState, hydrateTerminalMeta, hydrateUser, refreshTenantLocations]);

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
  const shiftOpeningModalOpen = (
    !drawerOpen
    && !terminalUnlockModalOpen
    && !terminalUnlockRequired
    && requiresOpenShift
    && canViewPos
    && !shiftOpenPromptBlockedBySetup
    && !suppressAdminShiftPrompt
  );
  const openingCashAmountText = String(openShiftForm.openingFloatAmount ?? '').trim();
  const openingCashAmountNumber = Number(openingCashAmountText);
  const canSubmitOpenShift = (
    openingCashAmountText !== ''
    && Number.isFinite(openingCashAmountNumber)
    && openingCashAmountNumber >= 0
  );
  const handleShiftOpeningModalOpenChange = useCallback((open) => {
    if (open === false && shiftOpeningModalOpen) {
      toast.message('No open shift is active. Enter opening cash to start a new shift.');
    }
  }, [shiftOpeningModalOpen]);
  const handleShiftOpeningModalSubmit = useCallback((event) => {
    event.preventDefault();
    handleOpenShift();
  }, [handleOpenShift]);
  const handleSkipShiftOpeningForAdmin = useCallback(() => {
    setAdminShiftPromptSkipped(true);
    setPosViewMode('shift_controls');
    toast.message('Admin navigation mode active. Open a shift to start selling or close an active cashier shift.');
  }, []);

  const cashierResumeUnlock = terminalUnlockMode === 'cashier_resume';
  const adminReauthUnlock = terminalUnlockMode === 'admin_reunlock';

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100 p-6 text-sm text-slate-500">Loading terminal workspace...</div>}>
      <>
        <Dialog open={terminalUnlockModalOpen} onOpenChange={(open) => {
          if (submitting) return;
          if (open === false && (terminalUnlockRequired || terminalUnlockMode === 'relock' || cashierResumeUnlock || adminReauthUnlock)) {
            toast.message('Unlock the terminal to continue.');
            return;
          }
          setTerminalUnlockModalOpen(open);
        }}>
          <DialogContent className="max-w-md border border-slate-200 p-0 shadow-2xl">
            <form onSubmit={adminReauthUnlock ? handleAdminReauthSubmit : (cashierResumeUnlock ? handleCashierResumeSubmit : handleTerminalUnlockSubmit)}>
              <DialogHeader className="border-b border-slate-100 px-5 py-4">
                <DialogTitle className="text-lg font-extrabold text-[#0F172A]">
                  {adminReauthUnlock ? 'Admin Unlock' : (cashierResumeUnlock ? 'Continue Shift' : 'Unlock Terminal')}
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-600">
                  {adminReauthUnlock
                    ? 'Enter the admin credentials to unlock POS. Cashier and terminal credentials are not required.'
                    : cashierResumeUnlock
                    ? 'Enter the cashier credentials for the open shift. Terminal password is not required.'
                    : terminalUnlockMode === 'relock'
                    ? 'Reauthenticate the current DGFY operator to resume this terminal.'
                    : cashierUnlockSession?.email
                    ? 'Choose the registered POS terminal and start the cashier shift from this logged-in device.'
                    : 'Choose the registered POS terminal, sign in the cashier, and start the shift from this logged-in device.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 px-5 py-5">
                {adminReauthUnlock ? (
                  <>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-[#1A4E8D]">
                      Admin lock: {adminReauthContext?.identifier || 'Company admin'}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="admin-reauth-identifier" className="text-xs font-extrabold text-[#0F172A]">
                        Admin Email
                      </Label>
                      <Input
                        id="admin-reauth-identifier"
                        type="email"
                        value={adminReauthForm.identifier}
                        onChange={(event) => setAdminReauthForm((prev) => ({ ...prev, identifier: event.target.value }))}
                        placeholder="admin@company.com"
                        autoComplete="username"
                        disabled={submitting}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="admin-reauth-password" className="text-xs font-extrabold text-[#0F172A]">
                        Admin Password
                      </Label>
                      <Input
                        id="admin-reauth-password"
                        type="password"
                        value={adminReauthForm.password}
                        onChange={(event) => setAdminReauthForm((prev) => ({ ...prev, password: event.target.value }))}
                        placeholder="Enter admin password"
                        autoComplete="current-password"
                        disabled={submitting}
                        required
                      />
                      <p className="text-[11px] text-[#64748B]">
                        Only a company admin can unlock an admin-locked POS.
                      </p>
                    </div>
                  </>
                ) : cashierResumeUnlock ? (
                  <>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-[#1A4E8D]">
                      Open shift: {cashierResumeContext?.cashierEmail || cashierResumeContext?.cashierUsername || 'Current cashier'}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cashier-resume-identifier" className="text-xs font-extrabold text-[#0F172A]">
                        Cashier Username or Email
                      </Label>
                      <Input
                        id="cashier-resume-identifier"
                        type="text"
                        value={cashierResumeForm.identifier}
                        onChange={(event) => setCashierResumeForm((prev) => ({ ...prev, identifier: event.target.value }))}
                        placeholder="cashier username or email"
                        autoComplete="username"
                        disabled={submitting}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cashier-resume-password" className="text-xs font-extrabold text-[#0F172A]">
                        Cashier Password
                      </Label>
                      <Input
                        id="cashier-resume-password"
                        type="password"
                        value={cashierResumeForm.password}
                        onChange={(event) => setCashierResumeForm((prev) => ({ ...prev, password: event.target.value }))}
                        placeholder="Enter cashier password"
                        autoComplete="current-password"
                        disabled={submitting}
                        required
                      />
                      <p className="text-[11px] text-[#64748B]">
                        Only the cashier who owns this open shift can continue it.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                  <div className="grid gap-2">
                  <Label htmlFor="terminal-unlock-terminal-id" className="text-xs font-extrabold text-[#0F172A]">
                    Terminal ID
                  </Label>
                  {activeTerminalRegistry.length > 0 ? (
                    <>
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
                            {entry.label
                              ? `${entry.label} (${entry.terminal_id})${locationNameLookup.get(Number(entry.location_id || 0)) ? ` - ${locationNameLookup.get(Number(entry.location_id || 0))}` : ''}`
                              : `${entry.terminal_id}${locationNameLookup.get(Number(entry.location_id || 0)) ? ` - ${locationNameLookup.get(Number(entry.location_id || 0))}` : ''}`}
                          </option>
                        ))}
                      </select>
                      {activeTerminalRegistry.length > 1 ? (
                        <p className="text-[11px] font-medium text-[#64748B]">
                          {activeTerminalRegistry.length} registered terminals available. A location may have multiple counters; choose the counter you are operating.
                        </p>
                      ) : null}
                    </>
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
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                  Authorized DGFY users can open shifts from any logged-in device when the selected terminal is active and assigned to their allowed location.
                </div>
                  </>
                )}
                {!adminReauthUnlock && !cashierResumeUnlock && terminalUnlockMode !== 'relock' ? (
                  <>
                    {cashierUnlockSession?.email ? (
                      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-[#1A4E8D]">
                        Cashier signed in: {cashierUnlockSession.email}
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-2">
                          <Label htmlFor="terminal-unlock-cashier-email" className="text-xs font-extrabold text-[#0F172A]">
                            Cashier Email
                          </Label>
                          <Input
                            id="terminal-unlock-cashier-email"
                            type="email"
                            value={terminalUnlockForm.cashierEmail}
                            onChange={(event) => setTerminalUnlockForm((prev) => ({ ...prev, cashierEmail: event.target.value }))}
                            placeholder="cashier@store.com"
                            disabled={submitting}
                            required
                          />
                          <p className="text-[11px] text-[#64748B]">
                            The cashier account signed in here becomes the owner of shift, sales, and cash drawer records.
                          </p>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="terminal-unlock-cashier-password" className="text-xs font-extrabold text-[#0F172A]">
                            Cashier Password
                          </Label>
                          <Input
                            id="terminal-unlock-cashier-password"
                            type="password"
                            value={terminalUnlockForm.cashierPassword}
                            onChange={(event) => setTerminalUnlockForm((prev) => ({ ...prev, cashierPassword: event.target.value }))}
                            placeholder="Enter cashier password"
                            disabled={submitting}
                            required
                          />
                        </div>
                      </>
                    )}
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
                  </>
                ) : null}
              </div>
              <DialogFooter className="border-t border-slate-100 px-5 py-4">
                {canAdminBypassShiftPrompt && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSkipShiftOpeningForAdmin}
                    disabled={shiftActionLoading.open}
                  >
                    Skip for Admin
                  </Button>
                )}
                <Button
                  type="submit"
                  className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
                  disabled={submitting}
                >
                  {submitting
                    ? (adminReauthUnlock ? 'Checking admin...' : (cashierResumeUnlock ? 'Checking cashier...' : 'Unlocking...'))
                    : (adminReauthUnlock ? 'Unlock as Admin' : (cashierResumeUnlock ? 'Continue Shift' : 'Unlock POS'))}
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
                  No open shift is active. Enter opening cash to start a new shift before using POS.
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
                {canAdminBypassShiftPrompt && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSkipShiftOpeningForAdmin}
                    disabled={shiftActionLoading.open}
                  >
                    Skip for Admin
                  </Button>
                )}
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
        {setupFlowActive && (
          <div className="fixed left-4 top-4 z-[72] max-w-[min(92vw,460px)] rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-950 shadow-lg shadow-blue-900/10">
            {tenantSetupStep === POS_TERMINAL_SETUP_STEPS.PROFILE
              ? 'Finish tenant onboarding in POS Settings first. The rest of POS remains limited until setup is complete.'
              : (tenantSetupStep === POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP
                ? 'Finish Storefront Setup next. Add the company icon and cover image to continue.'
                : `Finish POS Setup next. Missing: ${
                  [
                    setupFlowState.posRequirements.terminalRegistryReady ? null : 'registered terminal with password and store',
                    setupFlowState.posRequirements.cashierReady ? null : 'provisioned cashier access'
                  ].filter(Boolean).join(', ')
                }.`)}
          </div>
        )}
        {setupFlowActive && (
          <div className="fixed right-4 top-4 z-[70] max-w-[min(92vw,420px)] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-lg shadow-amber-900/10">
            <span>
              Tenant onboarding still needs to be finished before the full POS becomes available.
            </span>
            <button
              type="button"
              className="ml-1 font-extrabold underline underline-offset-2"
              onClick={() => resumeTenantSetupFlow()}
            >
              Continue onboarding.
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
        <PosTenantSetupModal
          open={tenantSetupModalOpen}
          currentStep={tenantSetupStep}
          companyName={setupFlowState.profileRequirements.companyName}
          profileData={{
            username: terminalUser?.username || '',
            email: terminalUser?.email || '',
            phoneNumber: terminalUser?.phone_number || ''
          }}
          posRequirements={setupFlowState.posRequirements}
          storefrontRequirements={setupFlowState.storefrontRequirements}
          starterItemRequirements={setupFlowState.starterItemRequirements}
          workflowMode={workflowMode}
          terminalRegistry={terminalRegistry}
          terminalLocations={locationsState.locations}
          tenantUsers={setupFlowState.tenantUsers}
          onOpenSettingsStep={openTenantSetupStep}
          onStepSelect={openTenantSetupStep}
          onBack={() => {
            const previousStep = getPreviousTenantSetupStep(tenantSetupStep);
            if (previousStep) {
              openTenantSetupStep(previousStep);
            }
          }}
          onContinue={() => {
            const nextStep = getNextTenantSetupStep(tenantSetupStep);
            if (tenantSetupStep === POS_TERMINAL_SETUP_STEPS.PROFILE) {
              openTenantSetupStep(nextStep);
              return;
            }
            if (tenantSetupStep === POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP) {
              if (!setupFlowState.storefrontSetupReady) {
                toast.error('Finish Storefront Setup before continuing to POS Setup.');
                openTenantSetupStep(POS_TERMINAL_SETUP_STEPS.STOREFRONT_SETUP);
                return;
              }
              openTenantSetupStep(nextStep);
              return;
            }
            if (tenantSetupStep === POS_TERMINAL_SETUP_STEPS.STARTER_ITEM) {
              if (!setupFlowState.starterItemReady) {
                toast.error('Create at least one starter item before continuing to POS Setup.');
                openTenantSetupStep(POS_TERMINAL_SETUP_STEPS.STARTER_ITEM);
                return;
              }
              openTenantSetupStep(nextStep);
              return;
            }
            if (!setupFlowState.posSetupReady) {
              toast.error('Finish POS Setup before opening the full POS.');
              openTenantSetupStep(POS_TERMINAL_SETUP_STEPS.POS_SETUP);
              return;
            }
            replaceTenantSetupQuery(POS_TERMINAL_SETUP_STEPS.COMPLETE);
            setTenantSetupModalOpen(false);
          }}
          onSkip={() => {
            setTenantSetupModalOpen(false);
            setTenantSetupDismissedThisSession(true);
            toast.message('Finish tenant onboarding in POS Settings to unlock the rest of the POS.');
          }}
          onSetupDataChanged={handleTenantSetupDataChanged}
        />
        <PosHardwareMessageModal
          open={Boolean(hardwareMessage)}
          message={hardwareMessage}
          onOpenChange={handleHardwareMessageOpenChange}
        />
        <Dialog
          open={settingsAccessPinModalOpen}
          onOpenChange={(open) => {
            if (settingsAccessPinSubmitting) return;
            setSettingsAccessPinModalOpen(open);
            if (!open) {
              setSettingsAccessPinValue('');
              setPendingSettingsViewMode('');
            }
          }}
        >
          <DialogContent className="border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-md">
            <form onSubmit={handleSettingsAccessPinSubmit}>
              <DialogHeader className="border-b border-slate-100 px-5 py-4">
                <DialogTitle className="text-lg font-extrabold text-slate-950">Enter POS Access PIN</DialogTitle>
                <DialogDescription className="text-sm leading-6 text-slate-600">
                  Main branch admin protected Settings, Reports, and Items with a branch PIN. Enter it to continue for this session.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 px-5 py-5">
                <div className="grid gap-2">
                  <Label htmlFor="settings-access-pin" className="text-xs font-extrabold text-[#0F172A]">
                    POS Access PIN
                  </Label>
                  <Input
                    id="settings-access-pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={settingsAccessPinValue}
                    onChange={(event) => setSettingsAccessPinValue(event.target.value)}
                    placeholder="Enter 4 to 12 digit PIN"
                    disabled={settingsAccessPinSubmitting}
                    required
                  />
                  <p className="text-[11px] text-[#64748B]">
                    This unlock only lasts until the terminal is locked or the session ends.
                  </p>
                </div>
              </div>
              <DialogFooter className="border-t border-slate-100 gap-2 px-5 py-4 sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSettingsAccessPinModalOpen(false);
                    setSettingsAccessPinValue('');
                    setPendingSettingsViewMode('');
                  }}
                  disabled={settingsAccessPinSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#1A4E8D] font-bold text-white hover:bg-[#143F73]"
                  disabled={settingsAccessPinSubmitting}
                >
                  {settingsAccessPinSubmitting ? 'Verifying...' : 'Unlock POS Tools'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
          onboardingRestricted={setupFlowActive}
          canCreateItems={canCreateItems}
          canEditItems={canEditItems}
          canDeleteItems={canDeleteItems}
          itemsStockFilterPreset={itemsStockFilterPreset}
          onItemsStockFilterPresetApplied={handleItemsStockFilterPresetApplied}
          canAdjustCashDrawer={canAdjustCashDrawer}
          canCloseDay={canCloseShift}
          canAdminBypassShiftPrompt={canAdminBypassShiftPrompt}
          terminalUser={terminalUser}
          posViewMode={posViewMode}
          workflowMode={workflowMode}
          isMsmeMode={isMsmeMode}
          shiftState={shiftState}
          incomingOrdersState={incomingOrdersState}
          locationsState={locationsState}
          operatingLocationId={operatingLocationId}
          queueLocationScopeId={queueLocationScopeId}
          handleSelectViewMode={handleSelectViewMode}
          settingsEntryViewMode={
            setupFlowActive
              ? resolveTenantSetupViewMode(tenantSetupStep)
              : 'settings_profile'
          }
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
          onPosSetupSaved={handlePosSetupSaved}
          onStorefrontSetupSaved={handleStorefrontSetupSaved}
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
          handleIdentityChange={handleDgfyPosIdentityChange}
          handleUseDifferentAccount={handleUseDifferentDgfyAccount}
          handleLegacyLogin={handleLogin}
        />
      </>
    </Suspense>
  );
}

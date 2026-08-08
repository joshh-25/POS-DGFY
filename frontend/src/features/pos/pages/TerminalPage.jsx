import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
  closeTerminalShift,
  forceCloseStaleTerminalShift,
  fetchAdminLocationMonitor,
  fetchIncomingOnlineOrders,
  fetchPosCatalog,
  fetchPosSettingsBootstrap,
  fetchPosTransactionById,
  fetchCurrentTerminalShift,
  fetchTerminalTodayDashboard,
  closePosDay,
  openPosDeviceDrawer,
  openTerminalShift,
  switchTerminalShiftLocation,
  recordCashDrawerEvent,
  collectCashPickupOrder,
  collectCashDeliveryOrder,
  updateDeliveryJobStatus,
  updateOnlineOrderStatus
} from '../services/posService';
import {
  login as loginWithCredentials,
  getCurrentUser as fetchCurrentUser
} from '@/services/authService.js';
import {
  activateDgfyTenantSession,
  clearDgfySession,
  completeDgfyLegacyLink,
  getStoredDgfyToken,
  listDgfyAccountCompanies,
  listDgfyAccountCompaniesForTenantSession,
  loginDgfyAccount,
  logoutDgfyAccount,
  requestDgfyLegacyLinkEmailOtp,
  startDgfyPosSession,
  startDgfyTenantSession,
  startDgfyLegacyRegistrationHandoff,
  switchDgfyCompanyForTenantSession
} from '@/services/dgfyAuthService.js';
import { resolvePosTerminalUrl, resolveStorefrontAccountUrl } from '@/src/features/dgfyRouteHelpers.js';
import { mergeCurrentCompanyWithMemberships } from '@/src/utils/companySwitcherRows.js';
import { getAllSettings, getCompanyInfo, verifyPosSettingsAccessPin } from '@/services/settingsService.js';
import { createItem } from '@/services/itemService.js';
import { completeOnboarding } from '@/services/onboardingService.js';
import { updatePosCatalogOverride } from '@/services/posCatalogService.js';
import { getAllUsers } from '@/services/userService.js';
import { listTenantLocations } from '@/services/tenantLocationService.js';
import api, { onApiOutcome } from '@/services/api.js';
import { clearClientSession } from '@/services/sessionCleanup.js';
import {
  clearBrowserSession,
  getAccessToken,
  getCompanyToken,
  preparePosCompanySwitchHandoff,
  refreshBrowserSession
} from '@/services/browserSession.js';
import { useWorkflowMode } from '../../settings/WorkflowModeContext.jsx';
import { getWorkflowModeLabel, isMsmeWorkflowMode } from '../../settings/workflowMode.js';
import { resolveBusinessModePosDefaults } from '../../settings/businessModeTemplates.js';
import {
  POS_TERMINAL_LOGIN_ERROR_CODES,
  classifyTerminalLoginFailure,
  createTerminalLoginError,
  isCompanyTokenResolutionError,
  normalizeLookupTenantOptions,
  resolveTerminalLoginErrorMessage,
  shouldFallbackToCurrentCompanyTokenAfterLookupError
} from '../utils/terminalUnlockDiagnostics.js';
import {
  captureTerminalFlowFailure,
  resetSentryIdentity,
  setSentryContext
} from '../../../observability/sentryClient.js';
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
import { consumeManualPosSyncAttempt, getManualPosSyncPolicy } from '../services/manualPosSyncPolicyStore.js';
import {
  DEFAULT_TERMINAL_ID_OPTIONS,
  TERMINAL_REGISTRY_MODES,
  normalizeTerminalRegistry,
  resolveLoginTerminalId,
  resolvePreferredTerminalId,
  sanitizeTerminalId
} from '../utils/terminalIdentity.js';
import { isShiftOwnedByUser } from '../utils/shiftOwnership.js';
import { resolveTerminalShiftEntryDecision } from '../utils/terminalShiftEntryDecision.js';
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
import { openDrawerWithIminBridge } from '../utils/iminHardwareBridge.js';
import { usePosHardware } from '../hardware/usePosHardware.js';
import ShiftCloseSummaryPrintView from '../components/ShiftCloseSummaryPrintView.jsx';
import ZReadingPrintView from '../components/ZReadingPrintView.jsx';
import {
  blurActiveTerminalEditor,
  restoreTerminalViewportAfterUnlock
} from '../utils/terminalViewportRecovery.js';

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
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';
const TerminalPageLayout = lazyWithChunkRetry(() => import('../components/TerminalPageLayout.jsx'));
const PosTenantSetupModal = lazyWithChunkRetry(() => import('../components/PosTenantSetupModal.jsx'));
const PosHardwareMessageModal = lazyWithChunkRetry(() => import('../components/PosHardwareMessageModal.jsx'));
const OnlineOrderDetailsModal = lazyWithChunkRetry(() => import('../components/OnlineOrderDetailsModal.jsx'));
const OnlineOrderReceiptModal = lazyWithChunkRetry(() => import('../components/OnlineOrderReceiptModal.jsx'));

const DEFAULT_CURRENCY = 'PHP';
const TERMINAL_ID_STORAGE_KEY = 'pos_terminal_identity_v1';
const POS_LAST_VIEW_STORAGE_PREFIX = 'pos_terminal_last_view_v1';
const POS_VIEW_MODE_QUERY_KEY = 'view';
const ONLINE_ORDER_SOUND_ENABLED_STORAGE_KEY = 'pos_online_order_sound_enabled_v1';
const TERMINAL_LOCK_STORAGE_KEY = 'pos_terminal_locked_v1';
const TERMINAL_LOCK_REASON_STORAGE_KEY = 'pos_terminal_lock_reason_v1';
const TERMINAL_ADMIN_LOCK_CONTEXT_STORAGE_KEY = 'pos_terminal_admin_lock_context_v1';
const ONLINE_ORDER_POLL_INTERVAL_MS = 12000;
// Below both the poll cadence's tolerance and nginx's 60s proxy_read_timeout
// (which matches api.js's global 60s axios default). Without this override,
// a slow backend response races the client timeout against the proxy's, so
// the same underlying slowness surfaces nondeterministically as an axios
// timeout, a "Network Error", or a 504 -- three different Sentry issues for
// one condition. Capping here keeps the failure deterministic (a clean
// ECONNABORTED) without touching the global default other call sites rely on
// (uploads, report generation).
const ONLINE_ORDER_POLL_TIMEOUT_MS = 20000;
const QUEUE_HISTORY_LIMIT = 250;
const TERMINAL_OPERATION_MAX_RETRIES = 5;
const TERMINAL_OPERATION_REPLAY_BATCH_SIZE = 25;
const DESKTOP_TERMINAL_BREAKPOINT_PX = IS_DGFY_POS_SURFACE ? 1024 : 1280;

const normalizeAccessibleCompanies = (payload = {}) => {
  const candidates = [
    ...(Array.isArray(payload?.companies) ? payload.companies : []),
    ...(Array.isArray(payload?.owned_companies) ? payload.owned_companies : []),
    ...(Array.isArray(payload?.invited_companies) ? payload.invited_companies : [])
  ];
  const seenTenantIds = new Set();

  return candidates.filter((company) => {
    const tenantId = String(company?.tenant_id || '').trim();
    if (!tenantId || seenTenantIds.has(tenantId)) return false;
    seenTenantIds.add(tenantId);
    return true;
  });
};
const CHECKOUT_VIEW_MODES = ['checkout', 'history', 'receipt'];
const OPERATIONS_VIEW_MODES = [
  'incoming_queue',
  'settings_profile',
  'settings_pos',
  'settings_storefront',
  'settings_affiliates',
  'shift_controls',
  'cash_drawer',
  'close_shift',
  'reports',
  'items',
  'terminal_setup'
];
const MSME_OPERATIONS_VIEW_MODES = ['shift_controls', 'close_shift', 'items', 'reports', 'settings_profile', 'settings_pos', 'settings_storefront', 'settings_affiliates'];
const SETTINGS_VIEW_MODES = new Set(['settings_profile', 'settings_pos', 'settings_storefront', 'settings_affiliates', 'terminal_setup']);
const SHIFT_EXEMPT_VIEW_MODES = new Set([...SETTINGS_VIEW_MODES, 'reports', 'items', 'history']);
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
  items: 'pos-section-items',
  affiliates: 'pos-section-affiliates'
};
const RETRYABLE_TERMINAL_OPERATION_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

const createIdempotencyKey = (prefix = 'pos-terminal') => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

// Short, screen-readable code shown on the inline Open Shift failure panel
// so a cashier can read it off the terminal and a supervisor can find the
// matching Sentry event by searching `pos_error_ref:<code>` -- see
// captureTerminalFlowFailure in observability/sentryClient.js.
const createTerminalErrorRef = () => {
  const raw = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return raw.slice(0, 8).toUpperCase();
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

const buildPosLastViewStorageKey = ({ userId, companyToken, terminalId } = {}) => {
  const userScope = String(userId || 'anonymous').trim() || 'anonymous';
  const companyScope = String(companyToken || 'default').trim() || 'default';
  const terminalScope = sanitizeTerminalId(terminalId || '') || 'unassigned';
  return `${POS_LAST_VIEW_STORAGE_PREFIX}:${encodeURIComponent(companyScope)}:${encodeURIComponent(userScope)}:${encodeURIComponent(terminalScope)}`;
};

const readStoredPosView = (storageKey) => {
  if (typeof window === 'undefined' || !storageKey) return '';
  return String(window.localStorage.getItem(storageKey) || '').trim();
};

const writeStoredPosView = (storageKey, viewMode) => {
  if (typeof window === 'undefined' || !storageKey) return;
  window.localStorage.setItem(storageKey, String(viewMode || '').trim());
};

const readRequestedPosView = () => {
  if (typeof window === 'undefined') return '';
  return String(new URLSearchParams(window.location.search).get(POS_VIEW_MODE_QUERY_KEY) || '').trim();
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
  const onboardingState = String(
    settingsPayload?.tenant_onboarding_state?.value || 'not_started'
  ).trim().toLowerCase();

  return {
    loading: false,
    onboardingState,
    onboardingCompleted: onboardingState === 'completed',
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
  const [onlineOrderSoundEnabled, setOnlineOrderSoundEnabled] = useState(() => {
    const stored = String(localStorage.getItem(ONLINE_ORDER_SOUND_ENABLED_STORAGE_KEY) || '').trim().toLowerCase();
    if (!stored) return true;
    return stored !== '0' && stored !== 'false' && stored !== 'off';
  });
  // Never render protected POS workspaces from a merely persisted token. The
  // session must be validated by hydrateUser before bootstrap requests run.
  const [locked, setLocked] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(() => readStoredTerminalLock());
  const [terminalLayoutEpoch, setTerminalLayoutEpoch] = useState(0);
  const terminalLayoutLockedRef = useRef(locked);
  const [loadingUser, setLoadingUser] = useState(true);
  const [terminalStartupReady, setTerminalStartupReady] = useState(false);
  const initialUserHydrationStartedRef = useRef(false);
  const [terminalUser, setTerminalUser] = useState(null);
  const [tenantSetupModalOpen, setTenantSetupModalOpen] = useState(false);
  const [tenantSetupDismissedThisSession, setTenantSetupDismissedThisSession] = useState(false);
  const [closeShiftConfirmOpen, setCloseShiftConfirmOpen] = useState(false);
  const [closedShiftReport, setClosedShiftReport] = useState(null);
  const [closedShiftReportOpen, setClosedShiftReportOpen] = useState(false);
  const [closedShiftReportAutoPrint, setClosedShiftReportAutoPrint] = useState(false);
  const [zReadingReport, setZReadingReport] = useState(null);
  const [zReadingPrintOpen, setZReadingPrintOpen] = useState(false);
  const [zReadingPrintAutoPrint, setZReadingPrintAutoPrint] = useState(false);
  const [zReadingPrintState, setZReadingPrintState] = useState('idle');
  const [zReadingCloseConfirmOpen, setZReadingCloseConfirmOpen] = useState(false);
  const [zReadingClosePin, setZReadingClosePin] = useState('');
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
    storefrontSlug: '',
    locationBindingReadiness: null,
    settingsAccessPinEnabled: false
  });
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberDevice: false,
    dgfyTenantId: '',
    terminalId: readInitialTerminalId()
  });
  const [emailCompanyLookup, setEmailCompanyLookup] = useState({
    status: 'idle',
    email: '',
    companies: [],
    message: ''
  });
  const [terminalUnlockRequired, setTerminalUnlockRequired] = useState(false);
  const [terminalUnlockModalOpen, setTerminalUnlockModalOpen] = useState(false);
  // Persistent inline failure surfaced in the Open Shift dialogs, replacing
  // reliance on the auto-dismissing top-right toast for a failure the
  // cashier needs to actually read and possibly relay to a supervisor. See
  // reportTerminalFailure below, which is what populates this.
  const [unlockFailure, setUnlockFailure] = useState(null);
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
  const [companySwitching, setCompanySwitching] = useState(false);
  const [adminShiftPromptSkipped, setAdminShiftPromptSkipped] = useState(false);
  const [cashierUnlockSession, setCashierUnlockSession] = useState(null);
  const [dgfyAdminBypassActive, setDgfyAdminBypassActive] = useState(false);
  const [legacyLinkState, setLegacyLinkState] = useState({
    otpSent: false,
    code: '',
    loading: false
  });
  const [legacyDgfyLinkBannerDismissed, setLegacyDgfyLinkBannerDismissed] = useState(false);
  const posHardware = usePosHardware();

  const [shiftState, setShiftState] = useState({
    loading: false,
    shift: null,
    cashSummary: null,
    salesSummary: null
  });
  const [todayDashboard, setTodayDashboard] = useState({
    loading: false,
    businessDate: null,
    salesSummary: null
  });
  const [reportRefreshKey, setReportRefreshKey] = useState(0);
  const [employeeCreditReportRefreshKey, setEmployeeCreditReportRefreshKey] = useState(0);
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
    close: false,
    zReading: false,
    staleRecovery: false
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
  const [adminLocationMonitorState, setAdminLocationMonitorState] = useState({
    loading: false,
    orders: [],
    terminalShifts: [],
    errorMessage: ''
  });
  const [adminTerminalSwitching, setAdminTerminalSwitching] = useState(false);
  const [incomingOrderActionState, setIncomingOrderActionState] = useState({});
  const [cashCollectionOrder, setCashCollectionOrder] = useState(null);
  const [cashReceivedInput, setCashReceivedInput] = useState('');
  const [cashCollectionSaving, setCashCollectionSaving] = useState(false);
  const [receiptRequestId, setReceiptRequestId] = useState(null);
  const [incomingReceiptOpeningId, setIncomingReceiptOpeningId] = useState(null);
  const [receiptReturnViewMode, setReceiptReturnViewMode] = useState(null);
  const [historyRequestQuery, setHistoryRequestQuery] = useState('');
  const [incomingOrderModalOpen, setIncomingOrderModalOpen] = useState(false);
  const [incomingOrderReceiptOpen, setIncomingOrderReceiptOpen] = useState(false);
  const [incomingOrderDetail, setIncomingOrderDetail] = useState(null);
  const [incomingOrderPrintLoading, setIncomingOrderPrintLoading] = useState(false);
  const [catalogSearchPrefill, setCatalogSearchPrefill] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return String(params.get('catalog_search') || '').trim();
  });
  const [queuedTerminalOperations, setQueuedTerminalOperations] = useState([]);
  const [manualSyncPolicy, setManualSyncPolicy] = useState(() => getManualPosSyncPolicy());
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
  const [posViewMode, setPosViewMode] = useState(() => readRequestedPosView() || 'checkout');
  const hasInitializedPosViewRef = useRef(false);
  const previousSetupFlowActiveRef = useRef(null);
  const tenantSetupCompletionInFlightRef = useRef(false);
  const [tenantSetupFinishing, setTenantSetupFinishing] = useState(false);
  const [itemsStockFilterPreset, setItemsStockFilterPreset] = useState('');
  const [stockAlertSummary, setStockAlertSummary] = useState({
    open: false,
    almostOutOfStock: [],
    outOfStock: []
  });
  const [setupFlowState, setSetupFlowState] = useState({
    loading: true,
    onboardingState: 'not_started',
    onboardingCompleted: false,
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
  // `isOnline` above only tells us the device has *a* network interface --
  // on Android that's true whenever any Wi-Fi/data connection exists, even
  // one that cannot reach pos.dev.dgfy.ph. This tracks whether the most
  // recent real API call actually got a response, which is what the
  // Online/Offline indicator should mean. Defaults true so the dot doesn't
  // flash "Offline" before the first request completes. Display-only --
  // every existing `if (!isOnline)` gate elsewhere in this file is left
  // reading the network-interface signal unchanged.
  const [apiReachable, setApiReachable] = useState(true);
  useEffect(() => {
    const unsubscribe = onApiOutcome((entry) => {
      setApiReachable(entry.kind !== 'network');
    });
    return unsubscribe;
  }, []);
  const workspacePaneRef = useRef(null);
  const replayingQueueRef = useRef(false);
  const [isDesktopWide, setIsDesktopWide] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= DESKTOP_TERMINAL_BREAKPOINT_PX;
  });

  useEffect(() => {
    if (!closedShiftReportOpen || !closedShiftReport || !closedShiftReportAutoPrint || typeof window === 'undefined' || typeof window.print !== 'function') return undefined;
    const timer = window.setTimeout(() => window.print(), 120);
    return () => window.clearTimeout(timer);
  }, [closedShiftReport, closedShiftReportAutoPrint, closedShiftReportOpen]);

  useEffect(() => {
    if (!zReadingPrintOpen || !zReadingReport || !zReadingPrintAutoPrint || typeof window === 'undefined' || typeof window.print !== 'function') return undefined;
    const timer = window.setTimeout(() => window.print(), 120);
    return () => window.clearTimeout(timer);
  }, [zReadingPrintAutoPrint, zReadingPrintOpen, zReadingReport]);

  const isMsmeMode = isMsmeWorkflowMode(workflowMode);
  const activeTenantId = String(terminalUser?.company?.id || '').trim();
  const offlinePosScope = useMemo(() => ({
    tenantId: activeTenantId,
    terminalId: activeTerminalId,
    locationId: shiftState?.shift?.location_id || operatingLocationId,
    userId: terminalUser?.user_id || terminalUser?.id || terminalUser?.email
  }), [
    activeTerminalId,
    activeTenantId,
    operatingLocationId,
    shiftState?.shift?.location_id,
    terminalUser?.email,
    terminalUser?.id,
    terminalUser?.user_id
  ]);

  useEffect(() => {
    setManualSyncPolicy(getManualPosSyncPolicy(offlinePosScope));
  }, [offlinePosScope]);
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
    return permissions.includes(permission);
  }, [permissions, terminalUser]);
  const normalizedTerminalRole = String(terminalUser?.role || '').trim().toLowerCase();
  const isCashierRole = normalizedTerminalRole === 'cashier';

  const canViewPos = hasPermission('pos:view');
  const canTransactPos = hasPermission('pos:transact');
  const canSwitchPosLocation = hasPermission('pos:switch_location');
  const canAdjustCashDrawer = hasPermission('pos:cash_drawer_adjust');
  const canCloseShift = hasPermission('pos:shift_close') || hasPermission('pos:close_day');
  const canCloseDay = hasPermission('pos:close_day');
  const canCreateItems = hasPermission('items:create');
  const canAccessSettingsDirectly = hasPermission('settings:view') || dgfyAdminBypassActive;
  const canAdminBypassShiftPrompt = hasPermission('settings:view') || dgfyAdminBypassActive;
  const isMasterAdminOperator = terminalUser?.is_master_admin === true;
  const canOpenShift = canTransactPos && (!canAdminBypassShiftPrompt || isMasterAdminOperator);
  const canEditItems = hasPermission('items:edit');
  const canDeleteItems = hasPermission('items:delete');
  const canManageCategories = hasPermission('categories:manage');

  useEffect(() => {
    if (locked || !isOnline) return undefined;

    let cancelled = false;
    setDgfyPosState((previous) => ({ ...previous, loadingCompanies: true }));
    listDgfyAccountCompaniesForTenantSession()
      .then((payload) => {
        if (cancelled) return;
        setDgfyPosState((previous) => ({
          ...previous,
          authenticated: true,
          companies: normalizeAccessibleCompanies(payload),
          loadingCompanies: false
        }));
      })
      .catch(() => {
        if (cancelled) return;
        // A legacy IMS account may not have DGFY memberships. Keep its profile usable.
        setDgfyPosState((previous) => ({ ...previous, loadingCompanies: false }));
      });

    return () => {
      cancelled = true;
    };
  }, [isOnline, locked, terminalUser?.user_id]);
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
    && !setupFlowState.onboardingCompleted
    && (!setupFlowState.profileReady || !setupFlowState.storefrontSetupReady || !setupFlowState.starterItemReady || !setupFlowState.posSetupReady);
  const tenantSetupRequestedOrRequired = !setupFlowState.onboardingCompleted
    && (tenantSetupFlowRequested || tenantSetupIncomplete);
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
  const setupFlowActive = tenantSetupRequestedOrRequired
    && tenantSetupStep !== POS_TERMINAL_SETUP_STEPS.COMPLETE;
  const terminalStartupLoading = !terminalStartupReady || (
    !locked
    && terminalUser?.is_master_admin === true
    && setupFlowState.loading
  );
  const posLastViewStorageKey = useMemo(() => buildPosLastViewStorageKey({
    userId: terminalUser?.user_id || terminalUser?.id || terminalUser?.email,
    companyToken: getCompanyToken(),
    terminalId: activeTerminalId
  }), [activeTerminalId, terminalUser?.email, terminalUser?.id, terminalUser?.user_id]);
  const resolveRestorablePosView = useCallback((candidateView) => {
    const normalizedView = String(candidateView || '').trim();
    if (!normalizedView || normalizedView === 'receipt' || !activeViewModes.includes(normalizedView)) return '';
    if (isCashierRole && !CASHIER_ALLOWED_VIEW_MODES.has(normalizedView)) return '';
    if (normalizedView === 'incoming_queue' && !canViewPos) return '';
    if (normalizedView === 'items' && !canViewPos && !canManageCategories) return '';
    return normalizedView;
  }, [activeViewModes, canManageCategories, canViewPos, isCashierRole]);

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

  const updatePosViewQuery = useCallback((viewMode) => {
    if (typeof window === 'undefined') return;
    const normalizedView = String(viewMode || '').trim();
    const url = new URL(window.location.href);
    const params = url.searchParams;
    if (!normalizedView || normalizedView === 'checkout') {
      params.delete(POS_VIEW_MODE_QUERY_KEY);
    } else {
      params.set(POS_VIEW_MODE_QUERY_KEY, normalizedView);
    }
    if (url.href === window.location.href) return;
    // Persist the current POS page for refresh without triggering route navigation.
    window.history.replaceState(window.history.state, '', url);
  }, []);

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

  const hydrateTenantSetupState = useCallback(async ({
    suppressGlobalErrors = false,
    silent = false
  } = {}) => {
    if (locked || terminalUser?.is_master_admin !== true) {
      return;
    }

    if (!silent) {
      setSetupFlowState((prev) => ({ ...prev, loading: true }));
    }
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
        fetchPosCatalog({ limit: 200 }).catch(() => [])
      ]);
      const profileRequirements = resolveProfileSetupReadiness(companyPayload, settingsPayload);
      const posRequirements = resolvePosSetupReadiness(settingsPayload, usersPayload);
      const storefrontRequirements = resolveStorefrontSetupReadiness(settingsPayload, locationsPayload);
      const starterItemRequirements = resolveStarterItemSetupReadiness(itemsPayload);
      const onboardingState = String(
        settingsPayload?.tenant_onboarding_state?.value || 'not_started'
      ).trim().toLowerCase();
      setSetupFlowState((prev) => ({
        loading: silent ? prev.loading : false,
        onboardingState,
        onboardingCompleted: onboardingState === 'completed',
        profileReady: profileRequirements.ready,
        posSetupReady: posRequirements.ready,
        storefrontSetupReady: storefrontRequirements.ready,
        starterItemReady: starterItemRequirements.ready,
        profileRequirements,
        posRequirements,
        storefrontRequirements,
        starterItemRequirements,
        tenantUsers: Array.isArray(usersPayload) ? usersPayload : []
      }));
    } catch {
      if (!silent) {
        setSetupFlowState((prev) => ({ ...prev, loading: false }));
      }
    }
  }, [locked, terminalUser?.is_master_admin]);

  const refreshTerminalOperationQueue = useCallback(async ({ keepResolved = true } = {}) => {
    const entries = await listTerminalOperationQueueEntries({
      includeResolved: keepResolved,
      scope: offlinePosScope,
      limit: QUEUE_HISTORY_LIMIT
    });
    const summary = await getTerminalOperationQueueSummary({ scope: offlinePosScope });
    setQueuedTerminalOperations(entries);
    setQueueSummary(summary);
  }, [offlinePosScope]);

  const enqueueTerminalOperationIntent = useCallback(async (entry, source = 'manual') => {
    const intentId = String(entry?.intent_id || entry?.payload?.idempotency_key || '').trim();
    if (!intentId) return null;
    await persistTerminalOperationIntent({
      ...entry,
      queue_scope: offlinePosScope,
      intent_id: intentId
    }, source);
    await pruneTerminalOperationHistory({ keep: QUEUE_HISTORY_LIMIT });
    await refreshTerminalOperationQueue();
    return intentId;
  }, [offlinePosScope, refreshTerminalOperationQueue]);

  const queueOfflineItemDraft = useCallback(async (payload) => {
    const intentId = createIdempotencyKey('pos-item-draft');
    await enqueueTerminalOperationIntent({
      intent_id: intentId,
      operation: 'item_create',
      payload: { ...payload, offline_draft_intent_id: intentId }
    }, 'offline_item_draft');
    return intentId;
  }, [enqueueTerminalOperationIntent]);

  const resetSettingsAccessPinState = useCallback(() => {
    setSettingsAccessPinModalOpen(false);
    setSettingsAccessPinSubmitting(false);
    setSettingsAccessPinValue('');
    setSettingsAccessPinVerified(false);
    setPendingSettingsViewMode('');
  }, []);

  const commitViewModeSelection = useCallback((nextMode) => {
    setPosViewMode(nextMode);
    const persistableView = resolveRestorablePosView(nextMode);
    if (!setupFlowActive && !setupFlowState.loading && persistableView) {
      writeStoredPosView(posLastViewStorageKey, persistableView);
      updatePosViewQuery(persistableView);
    }
    if (workspacePaneRef.current) {
      workspacePaneRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setMobileNavOpen(false);
  }, [posLastViewStorageKey, resolveRestorablePosView, setupFlowActive, setupFlowState.loading, updatePosViewQuery]);

  const hydrateTerminalMeta = useCallback(async ({ suppressGlobalErrors = false } = {}) => {
    setTerminalMeta((prev) => ({ ...prev, loading: true }));
    try {
      const allSettings = await fetchPosSettingsBootstrap(
        suppressGlobalErrors ? SUPPRESS_GLOBAL_ERROR_TOAST : {}
      );
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
        storefrontSlug: String(allSettings?.store_tenant_slug?.value || '').trim().toLowerCase(),
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
      return { shift: null, cashSummary: null, salesSummary: null };
    }
    const terminalId = sanitizeTerminalId(terminalIdOverride || activeTerminalId);
    if (!terminalId) {
      setShiftState((prev) => ({ ...prev, loading: false, shift: null, cashSummary: null, salesSummary: null }));
      setTodayDashboard((prev) => ({ ...prev, loading: false, businessDate: null, salesSummary: null }));
      return { shift: null, cashSummary: null, salesSummary: null };
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
      const shiftSalesSummary = currentShiftResult?.sales_summary || null;
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
        cashSummary: activeShiftSummary,
        salesSummary: shiftSalesSummary
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

  const refreshTenantLocations = useCallback(async ({
    suppressGlobalErrors = false,
    silent = false
  } = {}) => {
    if (locked) return;
    if (!silent) {
      setLocationsState((prev) => ({ ...prev, loading: true }));
    }
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
      setLocationsState((prev) => ({
        loading: silent ? prev.loading : false,
        locations: activeLocations
      }));

      const fallbackLocationId = activeLocations.length > 0
        ? Number(activeLocations[0].location_id)
        : null;
      const hasOperatingLocation = operatingLocationId
        && activeLocations.some((location) => Number(location.location_id) === Number(operatingLocationId));

      if (!hasOperatingLocation) {
        setOperatingLocationId(fallbackLocationId);
      }
    } catch {
      if (!silent) {
        setLocationsState((prev) => ({ ...prev, loading: false }));
      }
    }
  }, [locked, operatingLocationId]);

  useEffect(() => {
    const shiftLocationId = Number(shiftState?.shift?.location_id || 0);
    const shiftId = Number(shiftState?.shift?.pos_terminal_shift_id || 0);
    const hasActiveShiftLocation = Number.isInteger(shiftLocationId)
      && shiftLocationId > 0
      && Number.isInteger(shiftId)
      && shiftId > 0;
    setQueueLocationScopeId(hasActiveShiftLocation ? shiftLocationId : null);
    setIncomingOrdersState({
      loading: false,
      orders: [],
      accessState: hasActiveShiftLocation ? 'idle' : 'shift_required',
      errorMessage: hasActiveShiftLocation ? '' : 'Open a shift to view orders for this branch.'
    });
  }, [shiftState?.shift?.location_id, shiftState?.shift?.pos_terminal_shift_id]);

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
    if (!isOnline) {
      setIncomingOrdersState((previous) => ({
        ...previous,
        loading: false
      }));
      return;
    }
    const activeQueueShiftId = Number(shiftState?.shift?.pos_terminal_shift_id || 0);
    const activeQueueLocationId = Number(shiftState?.shift?.location_id || 0);
    if (
      !Number.isInteger(activeQueueShiftId)
      || activeQueueShiftId <= 0
      || !Number.isInteger(activeQueueLocationId)
      || activeQueueLocationId <= 0
    ) {
      setIncomingOrdersState({
        loading: false,
        orders: [],
        accessState: 'shift_required',
        errorMessage: 'Open a shift to view orders for this branch.'
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
      const params = {
        shift_id: activeQueueShiftId,
        location_id: activeQueueLocationId
      };
      const payload = await fetchIncomingOnlineOrders(params, {
        skipGlobalErrorToast: silent === true,
        timeout: ONLINE_ORDER_POLL_TIMEOUT_MS
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
          ? (error?.response?.data?.message || 'Incoming orders are limited to the active shift location.')
          : (offline ? 'You are offline. Incoming queue refresh is temporarily unavailable.' : (error?.response?.data?.message || 'Failed to load incoming online orders.'))
      });
      if (!silent && !offline) {
        toast.error(error?.response?.data?.message || 'Failed to load incoming online orders.');
      }
    }
  }, [
    canViewPos,
    isOnline,
    locked,
    shiftState?.shift?.location_id,
    shiftState?.shift?.pos_terminal_shift_id
  ]);

  const refreshAdminLocationMonitor = useCallback(async ({ silent = false } = {}) => {
    const locationId = Number(operatingLocationId || 0);
    if (locked || !canSwitchPosLocation || !isOnline || !Number.isInteger(locationId) || locationId <= 0) {
      setAdminLocationMonitorState({
        loading: false,
        orders: [],
        terminalShifts: [],
        errorMessage: ''
      });
      return;
    }

    if (!silent) {
      setAdminLocationMonitorState((previous) => ({
        ...previous,
        loading: true,
        errorMessage: ''
      }));
    }

    try {
      const payload = await fetchAdminLocationMonitor(
        { location_id: locationId },
        silent ? SUPPRESS_GLOBAL_ERROR_TOAST : {}
      );
      setAdminLocationMonitorState({
        loading: false,
        orders: Array.isArray(payload?.orders) ? payload.orders : [],
        terminalShifts: Array.isArray(payload?.terminal_shifts) ? payload.terminal_shifts : [],
        errorMessage: ''
      });
    } catch (error) {
      const message = error?.response?.data?.message || 'Failed to load the selected branch monitor.';
      setAdminLocationMonitorState({
        loading: false,
        orders: [],
        terminalShifts: [],
        errorMessage: message
      });
      if (!silent) toast.error(message);
    }
  }, [canSwitchPosLocation, isOnline, locked, operatingLocationId]);

  useEffect(() => {
    refreshAdminLocationMonitor({ silent: true });
  }, [refreshAdminLocationMonitor]);

  const printClosedShiftSummary = useCallback(async (closeResult, { reason = 'shift_close_report' } = {}) => {
    const report = closeResult || null;
    const shiftId = Number(report?.shift?.pos_terminal_shift_id || 0);
    if (!report || !Number.isInteger(shiftId) || shiftId <= 0) return false;

    try {
      const outcome = await posHardware.printShiftSummary({
        shiftId,
        shiftSummary: report,
        businessSettings: { pos_business_name: 'DGFY' },
        terminalId: sanitizeTerminalId(activeTerminalId) || report?.shift?.terminal_id || undefined,
        reason,
        idempotencyKey: createIdempotencyKey('pos-shift-summary-print'),
        copies: 1,
        paperWidth: '80mm'
      });
      if (outcome?.success) {
        toast.success('Cashier shift sales summary printed.');
        return true;
      }
      setClosedShiftReportAutoPrint(true);
      setClosedShiftReport(report);
      setClosedShiftReportOpen(true);
      toast.message(outcome?.message || 'No printer is configured. The shift sales summary is opening for browser printing.');
      return false;
    } catch (error) {
      setClosedShiftReportAutoPrint(true);
      setClosedShiftReport(report);
      setClosedShiftReportOpen(true);
      toast.message(error?.response?.data?.message || 'Shift closed. The sales summary is available for browser printing.');
      return false;
    }
  }, [activeTerminalId, posHardware]);

  const printZReading = useCallback(async (report, { reason = 'z_reading_close_day' } = {}) => {
    if (!report?.business_date || !report?.location_id) return false;
    setZReadingPrintState('printing');
    const zReading = {
      business: { pos_business_name: 'DGFY' },
      z_reading: {
        business_date: report.business_date,
        location_id: report.location_id,
        reading_identifier: report.reading_identifier || null,
        generated_at: report.generated_at || null,
        summary: report.summary || {},
        z_counter_value: report.counters?.z_counter || 0,
        reset_counter_value: report.counters?.reset_counter || 0,
        lifetime_grand_total_cents: report.counters?.lifetime_grand_total_cents || 0
      }
    };

    try {
      const outcome = await posHardware.printZReading({
        zReading,
        businessDate: report.business_date,
        locationId: report.location_id,
        businessSettings: { pos_business_name: 'DGFY' },
        terminalId: sanitizeTerminalId(activeTerminalId) || undefined,
        reason,
        idempotencyKey: createIdempotencyKey('pos-z-reading-print'),
        copies: 1,
        paperWidth: '80mm'
      });
      if (outcome?.success) {
        setZReadingPrintState('printed');
        setZReadingPrintAutoPrint(false);
        toast.success(report.snapshot_reused ? 'Existing Z-reading printed again.' : 'Z-reading printed successfully.');
        return true;
      }
      setZReadingPrintState('failed');
      setZReadingPrintAutoPrint(true);
      setZReadingPrintOpen(true);
      toast.message(outcome?.message || 'No printer is configured. The Z-reading is available for browser printing.');
      return false;
    } catch (error) {
      setZReadingPrintState('failed');
      setZReadingPrintAutoPrint(true);
      setZReadingPrintOpen(true);
      toast.message(error?.response?.data?.message || 'The Z-reading was saved, but physical printing failed.');
      return false;
    }
  }, [activeTerminalId, posHardware]);

  const handleCloseDay = useCallback(() => {
    if (locked || !isOnline) {
      toast.error('Reconnect and unlock the terminal before closing the day.');
      return false;
    }
    if (!canCloseDay) {
      toast.error('You need close-day permission to generate a Z-reading.');
      return false;
    }

    setZReadingClosePin('');
    setZReadingCloseConfirmOpen(true);
    return true;
  }, [canCloseDay, isOnline, locked]);

  const confirmCloseDay = useCallback(async () => {
    if (!/^\d{4,12}$/.test(zReadingClosePin)) {
      toast.error('Enter your 4 to 12 digit POS Day Close PIN.');
      return false;
    }

    setShiftActionLoading((previous) => ({ ...previous, zReading: true }));
    setZReadingPrintState('idle');
    try {
      const result = await closePosDay(null, { dayClosePin: zReadingClosePin });
      if (!result?.business_date || !result?.location_id) {
        throw new Error('The backend returned an incomplete Z-reading.');
      }
      setZReadingCloseConfirmOpen(false);
      setZReadingClosePin('');
      setZReadingReport(result);
      setZReadingPrintAutoPrint(false);
      setZReadingPrintOpen(true);
      await printZReading(result);
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to close the day and generate the Z-reading.');
      return false;
    } finally {
      setShiftActionLoading((previous) => ({ ...previous, zReading: false }));
    }
  }, [printZReading, zReadingClosePin]);

  const handleViewShiftSummary = useCallback(() => {
    if (!shiftState?.shift) {
      toast.error('Open a shift before viewing its sales summary.');
      return;
    }
    setClosedShiftReportAutoPrint(false);
    setClosedShiftReport({
      shift: shiftState.shift,
      cash_summary: shiftState.cashSummary || {},
      sales_summary: shiftState.salesSummary || {}
    });
    setClosedShiftReportOpen(true);
  }, [shiftState.cashSummary, shiftState.salesSummary, shiftState.shift]);

  const replayQueuedTerminalOperations = useCallback(async ({
    toastIfEmpty = false,
    force = false
  } = {}) => {
    if (locked || replayingQueueRef.current) return;
    if (!force && !isOnline) return;

    const candidates = (await getReplayCandidateEntries({
      scope: offlinePosScope,
      limit: TERMINAL_OPERATION_REPLAY_BATCH_SIZE
    }))
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
            await markTerminalOperationFailedManualResolution(intentId, {
              error: {
                message: 'Opening a shift requires an online server confirmation.',
                code: 'POS_SHIFT_OPEN_ONLINE_REQUIRED'
              }
            });
            failedManualCount += 1;
            continue;
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
            const closeResult = await closeTerminalShift(shiftId, payload);
            await printClosedShiftSummary(closeResult);
            shouldRefreshOperational = true;
          } else if (operation === 'order_status_update') {
            await markTerminalOperationFailedManualResolution(intentId, {
              error: {
                message: 'Online-order status changes require a live server connection.',
                code: 'POS_ONLINE_ORDER_ACTION_ONLINE_REQUIRED'
              }
            });
            failedManualCount += 1;
            continue;
          } else if (operation === 'item_create') {
            const itemPayload = { ...payload };
            const posAlwaysAvailable = itemPayload.pos_always_available === true;
            delete itemPayload.offline_draft_intent_id;
            delete itemPayload.pos_always_available;
            const createdItem = await createItem(itemPayload);
            const itemId = Number(createdItem?.item_id || createdItem?.id || 0);
            if (!Number.isInteger(itemId) || itemId <= 0) {
              throw new Error('Offline item draft synced without a valid item ID.');
            }
            if (posAlwaysAvailable) {
              await updatePosCatalogOverride(itemId, { pos_always_available: true });
            }
          } else {
            throw new Error(`Unsupported queued operation '${operation}'.`);
          }

          await markTerminalOperationReplayed(intentId);
          replayedCount += 1;
        } catch (error) {
          const errorDetails = resolveTerminalOperationErrorDetails(error);
          if (operation === 'item_create') {
            await markTerminalOperationFailedManualResolution(intentId, { error: errorDetails });
            failedManualCount += 1;
            continue;
          }
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
    offlinePosScope,
    refreshIncomingOrders,
    refreshOperationalContext,
    refreshTerminalOperationQueue,
    printClosedShiftSummary,
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
    toast.message('Queued operation is ready. Press Sync to send it when you are online.');
  }, [refreshTerminalOperationQueue]);

  const handleManualUniversalSync = useCallback(async () => {
    if (locked) return { allowed: false };
    if (!isOnline) {
      toast.error('Reconnect to the internet before syncing pending POS records.');
      return { allowed: false };
    }

    const pendingCandidates = await getReplayCandidateEntries({
      scope: offlinePosScope,
      limit: 1
    });
    if (pendingCandidates.length === 0) {
      await refreshTerminalOperationQueue();
      toast.message('No pending POS records to sync. Your daily sync allowance was not used.');
      return { allowed: false, remaining: manualSyncPolicy.remaining };
    }

    const nextPolicy = consumeManualPosSyncAttempt(offlinePosScope);
    setManualSyncPolicy(nextPolicy);
    if (!nextPolicy.allowed) {
      const resetTime = new Date(nextPolicy.resetAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      toast.error(`Daily sync limit reached. Sync is available again after ${resetTime}.`);
      return { allowed: false };
    }

    await replayQueuedTerminalOperations({ toastIfEmpty: false, force: true });
    return { allowed: true, remaining: nextPolicy.remaining };
  }, [
    isOnline,
    locked,
    manualSyncPolicy.remaining,
    offlinePosScope,
    refreshTerminalOperationQueue,
    replayQueuedTerminalOperations
  ]);

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
      // A full re-lock, not just a lost tenant session -- clear the POS
      // terminal/location tags too, so events captured while the terminal
      // sits locked don't carry the previous cashier's context.
      resetSentryIdentity();
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
        setStoredTerminalLockReason('shift_closed');
      }
      resetSettingsAccessPinState();
      setTerminalUser(null);
      setLocked(true);
      setDrawerOpen(true);
      setLoadingUser(false);
      resetSentryIdentity();
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
      const userCanAccessSettings = user?.is_master_admin === true
        || parseUserPermissions(user).includes('settings:view');

      setTerminalUser(user);
      setDgfyAdminBypassActive(userCanAccessSettings && !storedLockActive);

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
          const [currentShiftResult, currentSettings] = await Promise.all([
            fetchCurrentTerminalShift({}, SUPPRESS_GLOBAL_ERROR_TOAST).catch(() => ({ shift: null })),
            fetchPosSettingsBootstrap(SUPPRESS_GLOBAL_ERROR_TOAST).catch(() => ({}))
          ]);
          const currentRegistry = normalizeTerminalRegistry(currentSettings?.pos_terminal_registry?.value || []);
          const currentActiveRegistry = currentRegistry.filter((entry) => entry?.is_active !== false);
          if (currentRegistry.length > 0) {
            setTerminalRegistry(currentRegistry);
          }
          const currentShift = currentShiftResult?.shift || null;
          if (currentShift) {
            const currentShiftTerminalId = sanitizeTerminalId(currentShift?.terminal_id);
            const currentShiftLocationId = Number(currentShift?.location_id || 0);
            const currentShiftRegistryEntry = currentActiveRegistry.find(
              (entry) => sanitizeTerminalId(entry?.terminal_id) === currentShiftTerminalId
            );
            if (
              currentShiftTerminalId
              && currentShiftRegistryEntry
              && Number.isInteger(currentShiftLocationId)
              && currentShiftLocationId > 0
              && Number(currentShiftRegistryEntry?.location_id || 0) === currentShiftLocationId
            ) {
              setCashierUnlockSession({
                source: 'dgfy_pos',
                email: String(user?.email || user?.username || '').trim(),
                userId: user?.user_id || user?.id || null,
                role: user?.role || 'cashier',
                permissions: parseUserPermissions(user),
                tenantId: String(user?.company?.id || '').trim(),
                companyToken: getCompanyToken() || '',
                terminalId: currentShiftTerminalId,
                activeShift: currentShift
              });
              setOperatingLocationId(currentShiftLocationId);
              setTerminalUnlockForm((prev) => ({ ...prev, terminalId: currentShiftTerminalId }));
              setTerminalUnlockMode('resume_shift');
              setTerminalUnlockRequired(true);
              setTerminalUnlockModalOpen(true);
              setDrawerOpen(false);
              return;
            }
          }
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
        && !userCanAccessSettings
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
  }, [
    activeTerminalId,
    cashierResumeContext?.shiftId,
    refreshOperationalContext,
    resetSettingsAccessPinState,
    tenantSetupFlowRequested,
    terminalRegistryLookup
  ]);

  useEffect(() => {
    if (initialUserHydrationStartedRef.current) return;
    initialUserHydrationStartedRef.current = true;
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

  useLayoutEffect(() => {
    if (setupFlowState.loading || locked || terminalUser?.is_master_admin !== true) return;

    if (setupFlowState.onboardingCompleted) {
      if (tenantSetupFlowRequested) {
        clearTenantSetupQueryState();
      }
      return;
    }

    if (!tenantSetupFlowRequested) return;

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
    setupFlowState.onboardingCompleted,
    setupFlowState.loading,
    tenantSetupFlowRequested,
    tenantSetupStep,
    terminalUser?.is_master_admin
  ]);

  useLayoutEffect(() => {
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
    // Startup readiness is intentionally monotonic. Background session/context
    // hydration must not remount the full-screen restoration view.
    if (loadingUser) return;
    if (locked) {
      setTerminalStartupReady(true);
      return;
    }
    if (!terminalUser) return;
    if (terminalUser.is_master_admin === true && setupFlowState.loading) return;
    setTerminalStartupReady(true);
  }, [loadingUser, locked, setupFlowState.loading, terminalUser]);

  useEffect(() => {
    if (locked || !terminalUser || setupFlowState.loading || terminalMeta.loading) return;

    if (setupFlowActive) {
      previousSetupFlowActiveRef.current = true;
      return;
    }

    if (hasInitializedPosViewRef.current) return;

    const onboardingJustCompleted = previousSetupFlowActiveRef.current === true;
    previousSetupFlowActiveRef.current = false;
    const restoredView = onboardingJustCompleted
      ? ''
      : (
        resolveRestorablePosView(readRequestedPosView())
        || resolveRestorablePosView(readStoredPosView(posLastViewStorageKey))
      );
    const nextView = restoredView || 'checkout';
    hasInitializedPosViewRef.current = true;
    setPosViewMode(nextView);
    writeStoredPosView(posLastViewStorageKey, nextView);
    updatePosViewQuery(nextView);
  }, [
    locked,
    posLastViewStorageKey,
    resolveRestorablePosView,
    setupFlowActive,
    setupFlowState.loading,
    terminalMeta.loading,
    terminalUser,
    updatePosViewQuery
  ]);

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
      setLoadingUser(false);
      setTerminalStartupReady(true);
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
    localStorage.setItem(
      ONLINE_ORDER_SOUND_ENABLED_STORAGE_KEY,
      onlineOrderSoundEnabled ? '1' : '0'
    );
  }, [onlineOrderSoundEnabled]);

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
    const normalizedEmail = String(formData.email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setEmailCompanyLookup({
        status: 'idle',
        email: normalizedEmail,
        companies: [],
        message: ''
      });
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setEmailCompanyLookup({
        status: 'loading',
        email: normalizedEmail,
        companies: [],
        message: ''
      });
      try {
        const response = await api.post('/auth/lookup', { email: normalizedEmail }, { skipGlobalErrorToast: true });
        if (cancelled) return;
        const companies = normalizeLookupTenantOptions(response?.data?.data).map((company) => ({
          ...company,
          company_name: company?.company_name || company?.name || ''
        }));
        if (companies.length === 0) {
          setEmailCompanyLookup({
            status: 'none',
            email: normalizedEmail,
            companies: [],
            message: 'No company was found for this email yet.'
          });
          return;
        }
        setEmailCompanyLookup({
          status: companies.length === 1 ? 'single' : 'multiple',
          email: normalizedEmail,
          companies,
          message: ''
        });
      } catch (error) {
        if (cancelled) return;
        const status = Number(error?.response?.status || 0);
        if (status === 404) {
          setEmailCompanyLookup({
            status: 'none',
            email: normalizedEmail,
            companies: [],
            message: 'No company was found for this email yet.'
          });
          return;
        }
        setEmailCompanyLookup({
          status: 'error',
          email: normalizedEmail,
          companies: [],
          message: 'Company lookup is temporarily unavailable.'
        });
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData.email]);

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
  const companySwitchBlockedReason = activeShiftId
    ? 'Close the active shift before switching companies.'
    : '';
  const requiresOpenShift = !locked && !shiftState.loading && !activeShiftId;
  const shiftOpenPromptBlockedBySetup = setupFlowActive || !setupFlowState.posRequirements.terminalRegistryReady;
  const suppressAdminShiftPrompt = canAdminBypassShiftPrompt && adminShiftPromptSkipped;
  const showLegacyDgfyLinkBanner = terminalUser
    && terminalUser.dgfy_link_status
    && terminalUser.dgfy_link_status !== 'linked'
    && !legacyDgfyLinkBannerDismissed;

  const handleCompanySwitch = useCallback(async (nextTenantId) => {
    const normalizedTenantId = String(nextTenantId || '').trim();
    const currentTenantId = String(terminalUser?.company?.id || '').trim();
    if (!normalizedTenantId || normalizedTenantId === currentTenantId) return;
    if (companySwitchBlockedReason) {
      toast.error(companySwitchBlockedReason);
      return;
    }

    setCompanySwitching(true);
    try {
      await switchDgfyCompanyForTenantSession({ tenantId: normalizedTenantId });
      if (typeof window !== 'undefined') {
        // Terminal and shift-lock state are tenant-owned and must not cross company boundaries.
        setStoredTerminalLock(false);
        window.localStorage.removeItem(TERMINAL_ID_STORAGE_KEY);
        preparePosCompanySwitchHandoff({ tenantId: normalizedTenantId });
        window.location.assign('/terminal');
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to switch companies. Please try again.');
    } finally {
      setCompanySwitching(false);
    }
  }, [companySwitchBlockedReason, terminalUser?.company?.id]);

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

  // Single reporting path for every terminal-unlock / shift-open failure:
  // resolves the operator-facing message the same way the toast always has,
  // classifies whether it was a real network failure, a real HTTP error, or
  // a locally-thrown check (see classifyTerminalLoginFailure), then (a)
  // keeps the toast for at-a-glance visibility, (b) populates the inline
  // panel with a short reference code so the message survives long enough
  // to read and can be relayed to a supervisor, and (c) sends it to Sentry
  // -- including local throws, which never touch axios and were previously
  // invisible in observability entirely.
  const reportTerminalFailure = (error, flow) => {
    const message = resolveTerminalLoginErrorMessage(error);
    const { kind, status, requestPath } = classifyTerminalLoginFailure(error);
    const method = String(error?.config?.method || '').toUpperCase() || '';
    const ref = createTerminalErrorRef();
    toast.error(message);
    setUnlockFailure({ message, method, requestPath, status, ref });
    captureTerminalFlowFailure({ error, flow, ref, requestPath, status, kind });
  };

  // Shared body for the persistent failure block in both Open Shift dialogs
  // (terminalUnlockModalOpen's shift_start mode and the standalone
  // shiftOpeningModalOpen dialog) -- replaces relying on the auto-dismissing
  // top-right toast, which is what made the original iMin incident
  // impossible to read off the device.
  const renderUnlockFailurePanel = () => {
    if (!unlockFailure) return null;
    const metaParts = [
      unlockFailure.method && unlockFailure.requestPath
        ? `${unlockFailure.method} ${unlockFailure.requestPath}`
        : unlockFailure.requestPath,
      unlockFailure.status ? `status ${unlockFailure.status}` : null,
      `ref ${unlockFailure.ref}`
    ].filter(Boolean);
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900" role="alert">
        <p className="font-semibold text-red-950">Could not open shift</p>
        <p className="mt-0.5">{unlockFailure.message}</p>
        <p className="mt-1 font-mono text-[10px] text-red-700">{metaParts.join(' · ')}</p>
      </div>
    );
  };

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
    blurActiveTerminalEditor();
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
    // Tag from this call's own parameters, not `terminalUser`/`operatingLocationId`
    // state -- completeTerminalUnlock is a fresh closure every render, so a
    // state variable read here would still be the value from BEFORE this
    // unlock (the setXxx calls above only just scheduled the update). The
    // parameters are current by definition, so which terminal/location an
    // event actually happened on is always right.
    setSentryContext({
      terminalId: selectedTerminalId || undefined,
      locationId: (Number.isInteger(Number(operatingLocationIdOverride)) && Number(operatingLocationIdOverride) > 0)
        ? Number(operatingLocationIdOverride)
        : undefined
    });
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
    setUnlockFailure(null);
    await notifyStockAlertsAfterUnlock();
  };

  const handleSelectAdminTerminal = async (selectedTerminalId) => {
    if (!canSwitchPosLocation) {
      toast.error('You do not have permission to change the branch terminal context.');
      return false;
    }
    if (activeShiftId) {
      toast.error('Close your active shift before selecting another terminal.');
      return false;
    }

    const terminalId = sanitizeTerminalId(selectedTerminalId);
    const registryEntry = terminalRegistryLookup.get(terminalId);
    const selectedLocationId = Number(operatingLocationId || 0);
    if (!terminalId || !registryEntry || Number(registryEntry.location_id || 0) !== selectedLocationId) {
      toast.error('Select an active terminal assigned to the selected branch.');
      return false;
    }

    const occupiedShift = adminLocationMonitorState.terminalShifts.find(
      (shift) => sanitizeTerminalId(shift?.terminal_id) === terminalId
    );
    const resumesOwnShift = isShiftOwnedByUser(occupiedShift, terminalUser);
    if (occupiedShift && !resumesOwnShift) {
      const cashier = occupiedShift?.cashier?.username || occupiedShift?.cashier?.email || 'another cashier';
      toast.error(`Terminal ${terminalId} is in use by ${cashier}.`);
      return false;
    }

    setAdminTerminalSwitching(true);
    try {
      await completeTerminalUnlock(terminalId, {
        operatingLocationIdOverride: selectedLocationId
      });
      await refreshAdminLocationMonitor({ silent: true });
      toast.success(
        resumesOwnShift
          ? `${terminalId} resumed with your existing shift.`
          : `${terminalId} selected. No shift was opened.`
      );
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to select this terminal.');
      return false;
    } finally {
      setAdminTerminalSwitching(false);
    }
  };

  const handleDgfyPosLogin = async (event) => {
    event.preventDefault();
    const email = String(formData.email || '').trim();
    const password = String(formData.password || '');
    const continuingAfterCompanyPicker = dgfyPosState.authenticated === true;

    setSubmitting(true);
    setUnlockFailure(null);
    try {
      setCashierUnlockSession(null);
      setDgfyAdminBypassActive(false);
      if (!email || !password) {
        toast.error('DGFY email and password are required.');
        return;
      }
      const loginResult = await loginDgfyAccount({
        email,
        password,
        remember_device: formData.rememberDevice === true
      });
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
      }, token, { activate: false });
      if (!String(selectedTenantSession?.token || '').trim()) {
        throw new Error('The selected company did not return a valid POS session. Sign in again.');
      }

      const selectedTenantUser = await fetchCurrentUser(
        SUPPRESS_GLOBAL_ERROR_TOAST,
        {
          token: selectedTenantSession.token,
          companyToken: selectedTenantSession?.company?.token,
          installSession: false
        }
      );
      if (!selectedTenantUser) {
        throw new Error('The selected company session could not be verified. Sign in again.');
      }

      const effectiveSelectedTenantUser = selectedTenantUser;
      // Keep the terminal in a non-clearing lock state before installing the
      // tenant session. The auth:login event can re-run hydrateUser while this
      // async handoff is still resolving the terminal and active shift.
      setStoredTerminalLock(true);
      setStoredTerminalLockReason('shift_start_required');
      setLocked(true);
      setDrawerOpen(false);
      setTerminalUnlockRequired(true);
      setTerminalUnlockMode('shift_start');
      activateDgfyTenantSession(selectedTenantSession);
      const selectedPermissionList = parseUserPermissions(effectiveSelectedTenantUser);
      const selectedCanAccessSettings = effectiveSelectedTenantUser?.is_master_admin === true
        || selectedPermissionList.includes('settings:view');
      const selectedCanViewUsers = effectiveSelectedTenantUser?.is_master_admin === true
        || selectedPermissionList.includes('users:view');
      const [selectedTenantSettings, selectedTenantLocations, selectedTenantItems, selectedCurrentShiftResult] = await Promise.all([
        selectedCanAccessSettings
          ? getAllSettings({
            force: true,
            requestConfig: SUPPRESS_GLOBAL_ERROR_TOAST
          }).catch(() => ({}))
          : fetchPosSettingsBootstrap(SUPPRESS_GLOBAL_ERROR_TOAST).catch(() => ({})),
        listTenantLocations({ include_inactive: false }).catch(() => []),
        fetchPosCatalog({ limit: 200 }).catch(() => []),
        fetchCurrentTerminalShift({}, SUPPRESS_GLOBAL_ERROR_TOAST).catch(() => ({ shift: null, cash_summary: null }))
      ]);
      const [selectedTenantCompany, selectedTenantUsers] = await Promise.all([
        selectedCanAccessSettings ? getCompanyInfo().catch(() => null) : Promise.resolve(null),
        selectedCanViewUsers
          ? getAllUsers({ include_invitations: true }).catch(() => [])
          : Promise.resolve(effectiveSelectedTenantUser ? [effectiveSelectedTenantUser] : [])
      ]);
      const selectedTenantSetupState = buildTenantSetupStateSnapshot({
        settingsPayload: selectedTenantSettings || {},
        companyPayload: selectedTenantCompany || {},
        usersPayload: selectedTenantUsers,
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
      setDgfyAdminBypassActive(selectedCanAccessSettings);
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
      const selectedActiveShift = selectedCurrentShiftResult?.shift || null;
      setTerminalRegistry(selectedTenantRegistry);
      setTerminalRegistryMode(selectedTenantRegistryMode);
      blurActiveTerminalEditor();
      setTerminalStartupReady(false);
      setDrawerOpen(false);
      if (
        effectiveSelectedTenantUser?.is_master_admin === true
        && selectedTenantSetupStep !== POS_TERMINAL_SETUP_STEPS.COMPLETE
      ) {
        setLocked(false);
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
      if (selectedActiveShift) {
        const activeShiftTerminalId = sanitizeTerminalId(selectedActiveShift?.terminal_id);
        const activeShiftLocationId = Number(selectedActiveShift?.location_id || 0);
        const activeShiftRegistryEntry = selectedTenantActiveRegistry.find(
          (entry) => sanitizeTerminalId(entry?.terminal_id) === activeShiftTerminalId
        );
        if (
          !activeShiftTerminalId
          || !activeShiftRegistryEntry
          || !Number.isInteger(activeShiftLocationId)
          || activeShiftLocationId <= 0
          || Number(activeShiftRegistryEntry?.location_id || 0) !== activeShiftLocationId
        ) {
          setTerminalUnlockRequired(false);
          setTerminalUnlockModalOpen(false);
          setDrawerOpen(true);
          throw new Error('Your active shift is linked to an unavailable terminal. A supervisor must review the terminal assignment.');
        }
        setOperatingLocationId(activeShiftLocationId);
        setCashierUnlockSession({
          source: 'dgfy_pos',
          email: String(effectiveSelectedTenantUser?.email || email).trim(),
          userId: effectiveSelectedTenantUser?.user_id || selectedTenantSession?.user_id || null,
          role: effectiveSelectedTenantUser?.role || selectedTenantSession?.role || 'cashier',
          permissions: Array.isArray(effectiveSelectedTenantUser?.permissions) ? effectiveSelectedTenantUser.permissions : [],
          tenantId: selectedTenantId,
          companyToken: selectedTenantSession?.company?.token || getCompanyToken() || '',
          terminalId: activeShiftTerminalId,
          activeShift: selectedActiveShift
        });
        setTerminalUnlockForm((prev) => ({ ...prev, terminalId: activeShiftTerminalId }));
        setTerminalUnlockMode('resume_shift');
        setTerminalUnlockRequired(true);
        setTerminalUnlockModalOpen(true);
        setLocked(true);
        return;
      }
      if (selectedCanAccessSettings) {
        setLocked(false);
        setStoredTerminalLock(false);
        setStoredTerminalLockReason('');
        setTerminalUnlockRequired(false);
        setTerminalUnlockMode('shift_start');
        setTerminalUnlockModalOpen(false);
        setDrawerOpen(false);
        toast.success('DGFY administrator access opened. Open a shift to start selling.');
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
        terminalId: selectedTerminalId,
        activeShift: null
      });
      setTerminalUnlockForm((prev) => ({
        ...prev,
        terminalId: selectedTerminalId
      }));
      setTerminalUnlockMode('shift_start');
      setTerminalUnlockRequired(true);
      setLocked(true);
      setTerminalUnlockModalOpen(true);
    } catch (error) {
      setLocked(true);
      setDrawerOpen(true);
      setDgfyPosState((prev) => ({ ...prev, loadingCompanies: false }));
      reportTerminalFailure(error, 'terminal_unlock');
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

  const resolveCompanyTokenFromEmailLookupState = useCallback((identifier, preferredCompanyToken = '') => {
    const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
    const normalizedPreferred = String(preferredCompanyToken || '').trim();
    const lookupEmail = String(emailCompanyLookup?.email || '').trim().toLowerCase();
    if (!normalizedIdentifier || normalizedIdentifier !== lookupEmail) return '';
    const lookupCompanies = Array.isArray(emailCompanyLookup?.companies) ? emailCompanyLookup.companies : [];
    if (lookupCompanies.length === 0) return '';
    if (
      normalizedPreferred
      && lookupCompanies.some((company) => String(company?.company_token || '').trim() === normalizedPreferred)
    ) {
      return normalizedPreferred;
    }
    if (lookupCompanies.length === 1) {
      return String(lookupCompanies[0]?.company_token || '').trim();
    }
    return '';
  }, [emailCompanyLookup]);

  const resolveCompanyTokenForEmailIdentifier = useCallback(async (identifier, companyTokenHint = '') => {
    const normalizedIdentifier = String(identifier || '').trim();
    const currentCompanyToken = String(companyTokenHint || getCompanyToken() || '').trim();
    const cachedCompanyToken = resolveCompanyTokenFromEmailLookupState(normalizedIdentifier, currentCompanyToken);
    if (cachedCompanyToken) {
      return cachedCompanyToken;
    }
    try {
      return String(await lookupCompanyToken(normalizedIdentifier, currentCompanyToken) || '').trim();
    } catch (lookupError) {
      if (!currentCompanyToken || !shouldFallbackToCurrentCompanyTokenAfterLookupError(lookupError)) {
        throw lookupError;
      }
      return currentCompanyToken;
    }
  }, [resolveCompanyTokenFromEmailLookupState]);

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
    setUnlockFailure(null);
    try {
      if (!identifier.includes('@')) {
        throw createTerminalLoginError('Enter the cashier DGFY email used for this company membership.');
      }

      const tenantId = String(cashierResumeContext.tenantId || '').trim();
      const terminalId = sanitizeTerminalId(cashierResumeContext.terminalId || activeTerminalId);
      if (!tenantId || !terminalId) {
        throw createTerminalLoginError('The locked shift is missing its company or terminal session. Sign in again.');
      }

      const loginResult = await loginDgfyAccount({
        email: identifier,
        password,
        remember_device: false
      });
      const dgfyToken = String(loginResult?.token || '').trim();
      if (!dgfyToken) {
        throw createTerminalLoginError('Unable to start the DGFY cashier session. Sign in again.');
      }

      const posSession = await startDgfyPosSession({
        tenantId,
        terminalId
      }, dgfyToken, { activate: false });
      const cashierUser = await fetchCurrentUser(
        SUPPRESS_GLOBAL_ERROR_TOAST,
        {
          token: posSession?.token,
          companyToken: posSession?.company?.token,
          installSession: false
        }
      );
      if (!cashierUser) {
        throw createTerminalLoginError('The cashier company session could not be verified. Sign in again.');
      }

      if (String(cashierUser?.role || '').trim().toLowerCase() !== 'cashier') {
        clearDgfySession();
        clearClientSession({
          reason: 'logout',
          broadcast: true,
          emitAuthEvents: true,
          redirectTo: null
        });
        toast.error('This login is not an active cashier account for the selected company.');
        return;
      }

      const expectedCashierId = Number(cashierResumeContext.cashierId || 0);
      const authenticatedCashierId = Number(cashierUser?.user_id || 0);
      if (
        Number.isInteger(expectedCashierId)
        && expectedCashierId > 0
        && authenticatedCashierId !== expectedCashierId
      ) {
        clearDgfySession();
        clearClientSession({
          reason: 'logout',
          broadcast: true,
          emitAuthEvents: true,
          redirectTo: null
        });
        toast.error('Only the cashier who opened this shift can continue it. Close the current shift before another cashier signs in.');
        return;
      }

      activateDgfyTenantSession(posSession);
      setTerminalUser(cashierUser);
      await completeTerminalUnlock(terminalId, {
        operatingLocationIdOverride: cashierResumeContext.locationId
      });
      toast.success('Cashier verified. Shift resumed.');
    } catch (error) {
      reportTerminalFailure(error, 'cashier_resume');
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
    setUnlockFailure(null);
    try {
      let resolvedCompanyToken = companyTokenHint;
      if (identifier.includes('@')) {
        resolvedCompanyToken = await resolveCompanyTokenForEmailIdentifier(identifier, companyTokenHint);
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
      const userCanAccessSettings = adminUser?.is_master_admin === true
        || parseUserPermissions(adminUser).includes('settings:view');
      if (!userCanAccessSettings) {
        clearClientSession({
          reason: 'logout',
          broadcast: true,
          emitAuthEvents: true,
          redirectTo: null
        });
        throw createTerminalLoginError('This account cannot unlock an administrator-locked POS.');
      }

      setStoredTerminalLock(false);
      setStoredTerminalLockReason('');
      setStoredAdminLockContext(null);
      setTerminalUser(adminUser);
      setDgfyAdminBypassActive(true);
      blurActiveTerminalEditor();
      setTerminalStartupReady(false);
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
      reportTerminalFailure(error, 'admin_reauth');
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
    const resumeExistingShift = terminalUnlockMode === 'resume_shift';
    const requiresOpeningCash = terminalUnlockMode === 'shift_start';
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
    setSubmitting(true);
    setUnlockFailure(null);
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

      if (requiresOpeningCash || resumeExistingShift) {
        if (!cashierSessionActive && !resolvedCompanyToken) {
          toast.error('Unable to resolve the selected company session for cashier sign-in.');
          return;
        }
        if (dgfyCashierSessionActive) {
          const dgfyToken = getStoredDgfyToken();
          const posSession = await startDgfyPosSession({
            tenantId: selectedTenantId,
            terminalId: selectedTerminalId
          }, dgfyToken, { activate: false });
          setStoredTerminalLock(true);
          setStoredTerminalLockReason('shift_start_required');
          activateDgfyTenantSession(posSession);
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

        const currentShiftResult = await fetchCurrentTerminalShift({}, SUPPRESS_GLOBAL_ERROR_TOAST);
        const currentShift = currentShiftResult?.shift || null;
        const currentShiftDecision = resolveTerminalShiftEntryDecision({ currentShift });
        if (currentShiftDecision.mode === 'resume') {
          const currentShiftTerminalId = currentShiftDecision.terminalId;
          const currentShiftLocationId = currentShiftDecision.locationId;
          const currentShiftRegistryEntry = terminalRegistryLookup.get(currentShiftTerminalId);
          if (
            !currentShiftTerminalId
            || !currentShiftRegistryEntry
            || !Number.isInteger(currentShiftLocationId)
            || currentShiftLocationId <= 0
            || Number(currentShiftRegistryEntry?.location_id || 0) !== currentShiftLocationId
          ) {
            throw new Error('Your active shift is linked to an unavailable terminal. A supervisor must review the terminal assignment.');
          }
          await completeTerminalUnlock(currentShiftTerminalId, {
            operatingLocationIdOverride: currentShiftLocationId
          });
          toast.success('Existing cashier shift resumed.');
          return;
        }

        const selectedTerminalState = await fetchCurrentTerminalShift({
          terminal_id: selectedTerminalId,
          location_id: resolvedLocationId
        }, SUPPRESS_GLOBAL_ERROR_TOAST);
        const selectedTerminalDecision = resolveTerminalShiftEntryDecision({
          selectedTerminalId,
          selectedLocationId: resolvedLocationId,
          terminalOccupancy: selectedTerminalState?.terminal_occupancy
        });
        if (selectedTerminalDecision.mode === 'blocked') {
          throw new Error(selectedTerminalDecision.message);
        }
      }

      if (requiresOpeningCash) {
        if (rawOpeningFloat === '') {
          toast.error('Opening cash amount is required.');
          return;
        }
        if (!Number.isFinite(openingFloatAmount) || openingFloatAmount < 0) {
          toast.error('Opening float must be a non-negative number.');
          return;
        }
        await openTerminalShift({
          terminal_id: selectedTerminalId,
          location_id: resolvedLocationId,
          opening_float_amount: openingFloatAmount,
          opening_note: String(terminalUnlockForm.openingNote || '').trim() || undefined,
          idempotency_key: createIdempotencyKey('pos-shift-open')
        }, SUPPRESS_GLOBAL_ERROR_TOAST);
      }

      await completeTerminalUnlock(selectedTerminalId, {
        operatingLocationIdOverride: resolvedLocationId
      });
      toast.success(
        resumeExistingShift
          ? 'Existing cashier shift resumed.'
          : requiresOpeningCash
            ? 'POS unlocked and cashier shift opened successfully.'
            : 'Terminal unlocked successfully.'
      );
    } catch (error) {
      reportTerminalFailure(error, 'terminal_unlock');
    } finally {
      setSubmitting(false);
    }
  };

  const performLegacyTerminalUnlock = async ({ email, password, selectedTerminalId }) => {
    const currentCompanyToken = String(getCompanyToken() || '').trim();
    let resolvedCompanyToken = '';
    try {
      resolvedCompanyToken = await resolveCompanyTokenForEmailIdentifier(email, currentCompanyToken);
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
        resolvedCompanyToken = await resolveCompanyTokenForEmailIdentifier(email, '');
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
        rememberDevice: false,
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
        tenantId: String(cashierUnlockSession?.tenantId || terminalUser?.company?.id || formData.dgfyTenantId || '').trim(),
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
    setDgfyPosState({
      authenticated: false,
      account: null,
      companies: [],
      loadingCompanies: false
    });
    setFormData({
      email: '',
      password: '',
      rememberDevice: false,
      dgfyTenantId: '',
      terminalId: selectedTerminalId
    });
    setLoadingUser(false);
    setTerminalStartupReady(true);
    void Promise.allSettled([
      api.post('/auth/logout'),
      logoutDgfyAccount(activeDgfyToken)
    ]);
    clearDgfySession();
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
    if (canAdminBypassShiftPrompt && !isMasterAdminOperator) {
      toast.error('Administrator navigation is read-only. Sign in as the cashier to open the shift.');
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
    if (!isOnline) {
      toast.error('Reconnect to the internet before opening a shift. The server must confirm shift ownership before offline selling can begin.');
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
    setShiftActionLoading((prev) => ({ ...prev, open: true }));
    setUnlockFailure(null);
    try {
      await openTerminalShift(payload, SUPPRESS_GLOBAL_ERROR_TOAST);
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
      reportTerminalFailure(error, 'shift_open');
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
        `You are offline. Cash drawer action was saved locally. Press Sync after reconnecting (${pendingCount} queued).`
      );
      return;
    }

    setShiftActionLoading((prev) => ({ ...prev, cashEvent: true }));
    try {
      await recordCashDrawerEvent(activeShiftId, payload);
      toast.success('Cash drawer event recorded.');
      if (payload.event_type === 'cash_in') {
        try {
          const iminDrawerResult = openDrawerWithIminBridge();
          if (!iminDrawerResult.handled) {
            await openPosDeviceDrawer({
              idempotency_key: createIdempotencyKey('pos-cash-event-drawer'),
              shift_id: activeShiftId,
              terminal_id: sanitizeTerminalId(activeTerminalId) || undefined,
              reason: 'cash_in_event_recorded'
            });
          }
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
      terminal_id: sanitizeTerminalId(activeTerminalId) || sanitizeTerminalId(shiftState.shift?.terminal_id) || resolveSelectedLoginTerminalId() || undefined,
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
        cashSummary: null,
        salesSummary: null
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
      const closeResult = await closeTerminalShift(activeShiftId, payload);
      await printClosedShiftSummary(closeResult);
      if (preserveAdminNavigation) {
        toast.success('Shift closed successfully.');
        setCloseShiftConfirmOpen(false);
        setCloseShiftForm({ closingCashAmount: '', closingNote: '' });
        setShiftState({
          loading: false,
          shift: null,
          cashSummary: null,
          salesSummary: null
        });
        setAdminShiftPromptSkipped(true);
        setDgfyAdminBypassActive(true);
        await refreshOperationalContext();
        setMobileNavOpen(false);
        setPosViewMode('shift_controls');
        return;
      }
      toast.success('Shift closed successfully. Sign in to start the next shift.');
      setCloseShiftConfirmOpen(false);
      setCloseShiftForm({ closingCashAmount: '', closingNote: '' });
      setShiftState({
        loading: false,
        shift: null,
        cashSummary: null,
        salesSummary: null
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
      setDgfyAdminBypassActive(false);
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
          cashSummary: null,
          salesSummary: null
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

  const handleForceCloseStaleShift = async ({ shiftId, closingCashAmount, reason } = {}) => {
    const normalizedShiftId = Number.parseInt(shiftId, 10);
    const normalizedClosingCash = Number(closingCashAmount);
    const normalizedReason = String(reason || '').trim();
    if (terminalUser?.is_master_admin !== true) {
      toast.error('Only the company master administrator can recover a stale shift.');
      return false;
    }
    if (!isOnline) {
      toast.error('Reconnect before recovering a stale shift.');
      return false;
    }
    if (!Number.isInteger(normalizedShiftId) || normalizedShiftId <= 0) {
      toast.error('Select a valid stale shift.');
      return false;
    }
    if (!Number.isFinite(normalizedClosingCash) || normalizedClosingCash < 0) {
      toast.error('Closing cash must be a non-negative number.');
      return false;
    }
    if (normalizedReason.length < 8) {
      toast.error('Enter an audit reason with at least 8 characters.');
      return false;
    }

    setShiftActionLoading((previous) => ({ ...previous, staleRecovery: true }));
    try {
      await forceCloseStaleTerminalShift(normalizedShiftId, {
        closing_cash_amount: normalizedClosingCash,
        reason: normalizedReason,
        idempotency_key: createIdempotencyKey('pos-shift-stale-recovery')
      });
      toast.success('Stale shift recovered and closed with an audit record.');
      await Promise.all([
        refreshAdminLocationMonitor({ silent: true }),
        refreshOperationalContext()
      ]);
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to recover the stale shift.');
      return false;
    } finally {
      setShiftActionLoading((previous) => ({ ...previous, staleRecovery: false }));
    }
  };

  const printOnlineOrderReceiptById = useCallback(async (posTransactionId, {
    transaction = null,
    automatic = false
  } = {}) => {
    const normalizedId = Number.parseInt(posTransactionId, 10);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) return null;

    let detail = transaction;
    if (!detail) {
      detail = await fetchPosTransactionById(normalizedId);
    }
    if (automatic && String(detail?.receipt_print_status || '').trim().toLowerCase() === 'printed') {
      return { skipped: true, success: true };
    }

    const outcome = await posHardware.printReceipt({
      transaction: detail,
      businessSettings: { pos_business_name: 'DGFY' },
      receiptContract: null,
      openDrawerAfterPrint: false,
      transactionId: normalizedId,
      terminalId: sanitizeTerminalId(activeTerminalId) || undefined,
      reason: automatic ? 'online_order_completion_receipt' : 'online_order_receipt',
      idempotencyKey: createIdempotencyKey('pos-online-receipt')
    });
    if (!outcome?.success) {
      if (outcome?.reasonCode === 'NO_PRINTER_CONFIGURED') {
        toast.message(outcome.message || 'No printer is configured. The online order receipt remains available for preview.');
      } else {
        toast.error(outcome?.message || 'Online order receipt was not printed.');
      }
    } else if (!automatic) {
      toast.success('Online order receipt printed.');
    }
    return outcome;
  }, [activeTerminalId, posHardware]);

  const printOnlineOrderKitchenTicket = useCallback(async (order) => {
    const lines = Array.isArray(order?.lines) ? order.lines : [];
    if (lines.length === 0) {
      toast.error('The online order has no items to print for the kitchen.');
      return false;
    }

    const outcome = await posHardware.printOrderTicket({
      cart: lines.map((line) => ({
        ...line,
        item_name: line?.item_name_snapshot || line?.item?.name || line?.name,
        quantity: line?.quantity ?? line?.qty ?? 0,
        fnb_special_instructions: line?.fnb_special_instructions
          || line?.special_instructions
          || line?.notes
          || ''
      })),
      terminalId: sanitizeTerminalId(activeTerminalId) || undefined,
      orderMethod: order?.order_method,
      orderNotes: order?.special_instructions || order?.customer_note || order?.order_notes || ''
    });

    if (outcome?.success) {
      toast.success(outcome.message || 'Kitchen order printed.');
    } else if (outcome?.reasonCode === 'NO_PRINTER_CONFIGURED' || outcome?.reasonCode === 'NOT_SUPPORTED') {
      toast.error('Kitchen order printing is not available on this terminal.');
    } else {
      toast.error(outcome?.message || 'Failed to print the kitchen order.');
    }

    return Boolean(outcome?.success);
  }, [activeTerminalId, posHardware]);

  const handleIncomingOrderStatusChange = async (posTransactionId, fulfillmentStatus, reason = null) => {
    if (!isOnline) {
      toast.error('Reconnect to the internet before changing an online order.');
      return false;
    }

    const normalizedId = Number.parseInt(posTransactionId, 10);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      toast.error('Invalid order reference.');
      return false;
    }

    const nextStatus = String(fulfillmentStatus || '').trim();
    if (!nextStatus) {
      toast.error('Select a valid status update action.');
      return false;
    }

    const normalizedReason = String(reason || '').trim();
    if (nextStatus === 'rejected' && normalizedReason.length < 3) {
      toast.error('Enter a rejection reason with at least 3 characters.');
      return false;
    }

    const payload = {
      fulfillment_status: nextStatus,
      idempotency_key: createIdempotencyKey('pos-order-status'),
      reason: normalizedReason || null
    };
    setIncomingOrderActionState((prev) => ({ ...prev, [normalizedId]: nextStatus }));
    try {
      const response = await updateOnlineOrderStatus(normalizedId, payload);
      if (nextStatus === 'completed') {
        try {
          await printOnlineOrderReceiptById(normalizedId, { automatic: true });
        } catch (printError) {
          toast.message(printError?.response?.data?.message || 'Order completed, but the online order receipt still needs printing.');
        }
      }
      const paymentLifecycle = response?.payment_lifecycle || response?.data?.payment_lifecycle || null;
      if (paymentLifecycle?.payment_action === 'refunded') {
        toast.success('Order rejected and PayMongo refund confirmed.');
      } else if (paymentLifecycle?.payment_action === 'refund_pending') {
        toast.success('Order rejected. The PayMongo refund is being processed.');
      } else if (paymentLifecycle?.payment_action === 'refund_failed') {
        toast.error('Order rejected, but the automatic refund needs admin review.');
      } else {
        toast.success('Online order status updated.');
      }
      await refreshIncomingOrders({ silent: true });
      return true;
    } catch (error) {
      if (isRetryableTerminalOperationError(error)) {
        toast.error('The order was not changed because the server connection was lost. Reconnect and try again.');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to update online order status.');
      }
      return false;
    } finally {
      setIncomingOrderActionState((prev) => {
        const next = { ...prev };
        delete next[normalizedId];
        return next;
      });
    }
  };

  const handleDeliveryJobStatusChange = async (posTransactionId, deliveryJobStatus) => {
    if (!isOnline) {
      toast.error('Reconnect to the internet before updating delivery status.');
      return false;
    }

    const normalizedId = Number.parseInt(posTransactionId, 10);
    const nextStatus = String(deliveryJobStatus || '').trim();
    if (!Number.isInteger(normalizedId) || normalizedId <= 0 || !nextStatus) {
      toast.error('Invalid delivery job update.');
      return false;
    }

    const actionKey = `delivery-job:${nextStatus}`;
    setIncomingOrderActionState((prev) => ({ ...prev, [normalizedId]: actionKey }));
    try {
      await updateDeliveryJobStatus(normalizedId, {
        status: nextStatus,
        idempotency_key: createIdempotencyKey('pos-delivery-job')
      });
      toast.success(nextStatus === 'delivered' ? 'Delivery marked as delivered.' : 'Delivery status updated.');
      await refreshIncomingOrders({ silent: true });
      return true;
    } catch (error) {
      if (isRetryableTerminalOperationError(error)) {
        toast.error('The delivery job was not changed because the server connection was lost. Reconnect and try again.');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to update delivery status.');
      }
      return false;
    } finally {
      setIncomingOrderActionState((prev) => {
        const next = { ...prev };
        delete next[normalizedId];
        return next;
      });
    }
  };

  const handleOpenCashCollection = (order) => {
    if (!isOnline) {
      toast.error('Reconnect to the internet before collecting payment for an online order.');
      return;
    }
    setCashCollectionOrder(order || null);
    setCashReceivedInput(order?.total_amount == null ? '' : String(order.total_amount));
  };

  const handleCollectCash = async () => {
    if (!isOnline) {
      toast.error('Reconnect to the internet before collecting payment for an online order.');
      return;
    }
    const orderId = Number.parseInt(cashCollectionOrder?.pos_transaction_id, 10);
    const cashReceived = Number(cashReceivedInput);
    const terminalId = sanitizeTerminalId(activeTerminalId);
    if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isFinite(cashReceived) || cashReceived <= 0 || !terminalId) {
      toast.error('Enter a valid cash amount and use an active terminal.');
      return;
    }
    setCashCollectionSaving(true);
    try {
      const isDeliveryOrder = cashCollectionOrder?.order_method === 'delivery';
      const collectCash = isDeliveryOrder ? collectCashDeliveryOrder : collectCashPickupOrder;
      await collectCash(orderId, {
        terminal_id: terminalId,
        cash_received: cashReceived,
        idempotency_key: createIdempotencyKey(isDeliveryOrder ? 'pos-delivery-cash' : 'pos-pickup-cash')
      });
      try {
        await printOnlineOrderReceiptById(orderId, { automatic: true });
      } catch (printError) {
        toast.message(printError?.response?.data?.message || 'Cash collected, but the online order receipt still needs printing.');
      }
      toast.success(isDeliveryOrder
        ? 'Delivery cash payment collected. You can now complete the order after delivery.'
        : 'Cash payment collected. You can now mark the order as picked up.');
      setCashCollectionOrder(null);
      await refreshIncomingOrders({ silent: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to collect cash for the order.');
    } finally {
      setCashCollectionSaving(false);
    }
  };

  const handleOpenIncomingOrderReceipt = async (posTransactionId, {
    printMode = false,
    retryPrint = false,
    printOrder = false
  } = {}) => {
    if (!isOnline) {
      toast.error('Reconnect to the internet before opening or printing an online order.');
      return;
    }
    const normalizedId = Number.parseInt(posTransactionId, 10);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      toast.error('Invalid order reference.');
      return;
    }

    if (incomingReceiptOpeningId !== null) return;

    setIncomingReceiptOpeningId(normalizedId);
    try {
      const detail = await fetchPosTransactionById(normalizedId);
      setIncomingOrderDetail(detail || null);
      if (printOrder) {
        await printOnlineOrderKitchenTicket(detail);
        return;
      }
      if (retryPrint) {
        await printOnlineOrderReceiptById(normalizedId, {
          transaction: detail,
          automatic: false
        });
        return;
      }
      if (printMode) {
        setIncomingOrderReceiptOpen(true);
      } else {
        setIncomingOrderModalOpen(true);
      }
      setMobileNavOpen(false);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load the active online order.');
    } finally {
      setIncomingReceiptOpeningId(null);
    }
  };

  const handleIncomingOrderModalOpenChange = useCallback((open) => {
    setIncomingOrderModalOpen(open);
    if (!open) {
      setIncomingOrderDetail(null);
      setIncomingOrderPrintLoading(false);
    }
  }, []);

  const handleIncomingOrderReceiptOpenChange = useCallback((open) => {
    setIncomingOrderReceiptOpen(open);
    if (!open) {
      setIncomingOrderDetail(null);
      setIncomingOrderPrintLoading(false);
    }
  }, []);

  const handlePrintIncomingOrder = useCallback(async () => {
    if (!isOnline) {
      toast.error('Reconnect to the internet before printing an online order.');
      return;
    }
    if (!incomingOrderDetail) {
      toast.error('No active order is loaded for printing.');
      return;
    }

    setIncomingOrderPrintLoading(true);
    try {
      await printOnlineOrderReceiptById(incomingOrderDetail.pos_transaction_id, {
        transaction: incomingOrderDetail,
        automatic: false
      });
    } catch (error) {
      toast.error(error?.message || 'Failed to print the active order.');
    } finally {
      setIncomingOrderPrintLoading(false);
    }
  }, [incomingOrderDetail, isOnline, printOnlineOrderReceiptById]);

  const handleCheckoutCompleted = useCallback(async (completedTransaction = null) => {
    await refreshOperationalContext();
    setReportRefreshKey((previous) => previous + 1);
    if (String(completedTransaction?.payment_type || '').trim().toLowerCase() === 'employee_credit') {
      setEmployeeCreditReportRefreshKey((previous) => previous + 1);
    }
  }, [refreshOperationalContext]);

  const offlineSnapshotScope = useMemo(() => ({
    tenantId: activeTenantId,
    terminalId: activeTerminalId,
    locationId: shiftState?.shift?.location_id || operatingLocationId,
    userId: terminalUser?.user_id || terminalUser?.id || terminalUser?.email
  }), [
    activeTenantId,
    activeTerminalId,
    operatingLocationId,
    shiftState?.shift?.location_id,
    terminalUser?.email,
    terminalUser?.id,
    terminalUser?.user_id
  ]);

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
    if (nextMode === 'items' && !canViewPos && !canManageCategories) {
      toast.error('POS view or category-management permission is required.');
      setMobileNavOpen(false);
      return;
    }
    const isSettingsViewMode = SETTINGS_VIEW_MODES.has(nextMode);
    const isOfflineOnlineOnlyMode = isSettingsViewMode || nextMode === 'incoming_queue';
    if (!isOnline && isOfflineOnlineOnlyMode) {
      toast.error('This POS area is available online only. Offline mode supports local sales, pending receipts, and history.');
      setMobileNavOpen(false);
      return;
    }
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
    canManageCategories,
    canViewPos,
    commitViewModeSelection,
    isCashierRole,
    isOnline,
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
    await hydrateTenantSetupState({ suppressGlobalErrors: true, silent: true });
  }, [hydrateTenantSetupState]);

  const handleStorefrontSetupSaved = useCallback(async () => {
    await Promise.all([
      hydrateTenantSetupState({ suppressGlobalErrors: true, silent: true }),
      hydrateTerminalMeta({ suppressGlobalErrors: true })
    ]);
  }, [hydrateTenantSetupState, hydrateTerminalMeta]);

  const handleTenantSetupDataChanged = useCallback(async ({ source = '' } = {}) => {
    const refreshTasks = [
      hydrateTenantSetupState({ suppressGlobalErrors: true, silent: true })
    ];

    if (source === 'terminal') {
      refreshTasks.push(hydrateTerminalMeta({ suppressGlobalErrors: true }));
    }
    if (source === 'location') {
      refreshTasks.push(refreshTenantLocations({
        suppressGlobalErrors: true,
        silent: true
      }));
    }

    await Promise.all(refreshTasks);
  }, [hydrateTenantSetupState, hydrateTerminalMeta, refreshTenantLocations]);

  const handleCompleteTenantSetup = useCallback(async () => {
    if (tenantSetupCompletionInFlightRef.current) return;

    tenantSetupCompletionInFlightRef.current = true;
    setTenantSetupFinishing(true);
    try {
      const completion = await completeOnboarding();
      if (String(completion?.tenant_onboarding_state || '').trim().toLowerCase() !== 'completed') {
        throw new Error('Onboarding completion was not confirmed by the server.');
      }

      await Promise.all([
        hydrateTenantSetupState({ suppressGlobalErrors: true, silent: true }),
        hydrateUser({ suppressGlobalErrors: true })
      ]);
      clearTenantSetupQueryState();
      setTenantSetupDismissedThisSession(false);
      setTenantSetupModalOpen(false);
      toast.success('Tenant onboarding, POS Setup, and Storefront Setup are complete.');
    } catch (error) {
      const missingRequirements = error?.response?.data?.errors?.missing_requirements;
      if (Array.isArray(missingRequirements) && missingRequirements.length > 0) {
        const labels = missingRequirements.map((requirement) => (
          String(requirement || '').replace(/_/g, ' ')
        ));
        toast.error(`Missing requirements: ${labels.join(', ')}`);
      } else {
        toast.error(
          error?.response?.data?.message
          || error?.message
          || 'Unable to complete onboarding.'
        );
      }
    } finally {
      tenantSetupCompletionInFlightRef.current = false;
      setTenantSetupFinishing(false);
    }
  }, [
    clearTenantSetupQueryState,
    hydrateTenantSetupState,
    hydrateUser
  ]);

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
    const wasLocked = terminalLayoutLockedRef.current;
    terminalLayoutLockedRef.current = locked;
    if (!wasLocked || locked || typeof window === 'undefined') return undefined;

    const stopViewportRecovery = restoreTerminalViewportAfterUnlock({
      workspaceElement: workspacePaneRef.current
    });
    let secondFrameId = null;
    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        setTerminalLayoutEpoch((current) => current + 1);
      });
    });

    return () => {
      stopViewportRecovery();
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId !== null) window.cancelAnimationFrame(secondFrameId);
    };
  }, [locked]);

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
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshTerminalOperationQueue]);

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
    if (posViewMode === 'items' && !canViewPos && !canManageCategories) {
      setPosViewMode('checkout');
    }
  }, [canManageCategories, canViewPos, posViewMode]);

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
    && (!canAdminBypassShiftPrompt || isMasterAdminOperator)
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
  const handleSkipShiftOpeningForAdmin = useCallback(async () => {
    await refreshOperationalContext({ suppressGlobalErrors: true });
    setAdminShiftPromptSkipped(true);
    setPosViewMode('shift_controls');
  }, [refreshOperationalContext]);

  const cashierResumeUnlock = terminalUnlockMode === 'cashier_resume';
  const adminReauthUnlock = terminalUnlockMode === 'admin_reunlock';
  const signedInShiftResume = terminalUnlockMode === 'resume_shift';

function PosRestorationLoadingScreen() {
  const [progress, setProgress] = useState(15);
  const [statusText, setStatusText] = useState('Preparing your workspace...');

  useEffect(() => {
    const timer1 = setTimeout(() => {
      setProgress(45);
      setStatusText('Loading inventory catalog...');
    }, 280);

    const timer2 = setTimeout(() => {
      setProgress(78);
      setStatusText('Syncing terminal settings...');
    }, 600);

    const timer3 = setTimeout(() => {
      setProgress(98);
      setStatusText('Finalizing workspace...');
    }, 900);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

    return (
      <main
      className="fixed inset-0 z-[10000] flex min-h-screen items-center justify-center bg-[#F3F5F8] px-6 opacity-100"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="relative w-full max-w-[380px] sm:max-w-[410px] overflow-hidden rounded-[28px] bg-white p-8 sm:p-10 text-center shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-100">
        {/* POS Vector Graphic Illustration in soft blue circular container */}
        <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-[#EFF6FF] p-3 animate-pos-illustration-float">
          <svg className="h-full w-full" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {/* Soft background aura */}
            <circle cx="70" cy="70" r="50" fill="#E0F2FE" opacity="0.6" />

            {/* Ground accent line */}
            <path d="M30 115H110" stroke="#BFDBFE" strokeWidth="3" strokeLinecap="round" />

            {/* Main Cash Drawer Base */}
            <rect x="36" y="94" width="68" height="18" rx="4" fill="#1D4ED8" />
            <rect x="40" y="98" width="60" height="10" rx="2" fill="#2563EB" />
            <circle cx="70" cy="103" r="2.5" fill="#93C5FD" />

            {/* Monitor Stand Base */}
            <path d="M64 84H76V94H64V84Z" fill="#1E40AF" />

            {/* Monitor Outer Shell */}
            <rect x="42" y="38" width="56" height="46" rx="6" fill="#1D4ED8" />
            {/* Monitor Display Screen */}
            <rect x="45" y="41" width="50" height="38" rx="4" fill="#FFFFFF" />
            {/* Display UI Panels */}
            <rect x="49" y="45" width="22" height="14" rx="2" fill="#EFF6FF" />
            <rect x="74" y="45" width="17" height="14" rx="2" fill="#EFF6FF" />
            <rect x="49" y="62" width="42" height="13" rx="2" fill="#EFF6FF" />
            <rect x="79" y="66" width="10" height="5" rx="1.5" fill="#2563EB" />

            {/* Left Keypad / POS Terminal Calculator */}
            <rect x="44" y="60" width="18" height="30" rx="3" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="1.5" />
            <rect x="47" y="63" width="12" height="7" rx="1" fill="#FFFFFF" />
            {/* Keypad Buttons Grid */}
            <rect x="47" y="73" width="3" height="3" rx="0.5" fill="#EFF6FF" />
            <rect x="51.5" y="73" width="3" height="3" rx="0.5" fill="#EFF6FF" />
            <rect x="56" y="73" width="3" height="3" rx="0.5" fill="#EFF6FF" />
            <rect x="47" y="78" width="3" height="3" rx="0.5" fill="#EFF6FF" />
            <rect x="51.5" y="78" width="3" height="3" rx="0.5" fill="#EFF6FF" />
            <rect x="56" y="78" width="3" height="3" rx="0.5" fill="#EFF6FF" />
            <rect x="47" y="83" width="3" height="3" rx="0.5" fill="#EFF6FF" />
            <rect x="51.5" y="83" width="3" height="3" rx="0.5" fill="#EFF6FF" />
            <rect x="56" y="83" width="3" height="3" rx="0.5" fill="#EFF6FF" />
          </svg>
        </div>

        {/* Title */}
        <h2 className="mt-6 text-lg sm:text-xl font-bold text-[#0F172A] tracking-tight">
          Restoring POS workspace...
        </h2>

        {/* Status subtext */}
        <p className="mt-1.5 text-xs sm:text-sm font-medium text-[#64748B] min-h-[20px] transition-opacity duration-200">
          {statusText}
        </p>

        {/* Horizontal Progress Track & Indicator */}
        <div className="mt-6 h-1.5 w-full rounded-full bg-[#E2E8F0] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#2563EB] transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Circular Blue Spinner */}
        <div className="mt-6 flex justify-center items-center">
          <div className="h-6 w-6 rounded-full border-2 border-[#2563EB] border-t-transparent animate-spin" />
        </div>
      </div>
    </main>
  );
}

  if (terminalStartupLoading) {
    return <PosRestorationLoadingScreen />;
  }

  return (
    <Suspense fallback={<PosRestorationLoadingScreen />}>
      <>
        <Dialog open={Boolean(cashCollectionOrder)} onOpenChange={(open) => { if (!open && !cashCollectionSaving) setCashCollectionOrder(null); }}>
          <DialogContent className="border border-slate-200 bg-white shadow-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-slate-950">Collect Cash</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-600">Record payment before completing this order. Change is calculated by the POS.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-semibold">Order total: PHP {Number(cashCollectionOrder?.total_amount || 0).toFixed(2)}</p>
                <p>Change: PHP {Math.max(0, Number(cashReceivedInput || 0) - Number(cashCollectionOrder?.total_amount || 0)).toFixed(2)}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cash-received">Amount received</Label>
                <Input id="cash-received" inputMode="decimal" type="number" min="0" step="0.01" value={cashReceivedInput} onChange={(event) => setCashReceivedInput(event.target.value)} disabled={cashCollectionSaving} />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setCashCollectionOrder(null)} disabled={cashCollectionSaving}>Cancel</Button>
              <Button type="button" onClick={handleCollectCash} disabled={cashCollectionSaving}>{cashCollectionSaving ? 'Collecting...' : 'Collect Cash'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                  {adminReauthUnlock
                    ? 'Admin Unlock'
                    : cashierResumeUnlock || signedInShiftResume
                      ? 'Resume Shift'
                      : terminalUnlockMode === 'relock'
                        ? 'Unlock Terminal'
                        : 'Open Shift'}
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-600">
                  {adminReauthUnlock
                    ? 'Enter the admin credentials to unlock POS. Cashier and terminal credentials are not required.'
                    : cashierResumeUnlock
                      ? 'Enter the DGFY cashier credentials for the open shift. Terminal password is not required.'
                      : signedInShiftResume
                        ? 'Your active shift was found. Resume the same terminal, cart, totals, and cashier session.'
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
                        Cashier DGFY Email
                      </Label>
                      <Input
                        id="cashier-resume-identifier"
                        type="text"
                        value={cashierResumeForm.identifier}
                        onChange={(event) => setCashierResumeForm((prev) => ({ ...prev, identifier: event.target.value }))}
                        placeholder="cashier@company.com"
                        autoComplete="username"
                        disabled={submitting}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cashier-resume-password" className="text-xs font-extrabold text-[#0F172A]">
                        DGFY Password
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
                            disabled={submitting || signedInShiftResume}
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
                            disabled={submitting || signedInShiftResume}
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
                {!adminReauthUnlock && !cashierResumeUnlock && terminalUnlockMode === 'shift_start' ? (
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
                {renderUnlockFailurePanel()}
              </div>
              <DialogFooter className="border-t border-slate-100 px-5 py-4">
                {cashierUnlockSession?.email && !activeShiftId && terminalUnlockMode === 'shift_start' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLock}
                    disabled={submitting || shiftActionLoading.open}
                  >
                    Back to Login
                  </Button>
                )}
                {canAdminBypassShiftPrompt && !signedInShiftResume && (
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
                    ? (adminReauthUnlock
                      ? 'Checking admin...'
                      : cashierResumeUnlock || signedInShiftResume
                        ? 'Resuming shift...'
                        : 'Opening shift...')
                    : (adminReauthUnlock
                      ? 'Unlock as Admin'
                      : cashierResumeUnlock || signedInShiftResume
                        ? 'Resume Shift'
                        : terminalUnlockMode === 'relock'
                          ? 'Unlock POS'
                          : 'Open Shift')}
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
                {renderUnlockFailurePanel()}
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
                  disabled={shiftActionLoading.open || !canOpenShift || !canSubmitOpenShift}
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
                : `Finish POS Setup next. Missing: ${[
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
          finishing={tenantSetupFinishing}
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
          onStepSelect={openTenantSetupStep}
          onBack={() => {
            const previousStep = getPreviousTenantSetupStep(tenantSetupStep);
            if (previousStep) {
              openTenantSetupStep(previousStep);
            }
          }}
          onContinue={async () => {
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
            await handleCompleteTenantSetup();
          }}
          onSkip={() => {
            setTenantSetupModalOpen(false);
            setTenantSetupDismissedThisSession(true);
            toast.message('Finish tenant onboarding in POS Settings to unlock the rest of the POS.');
          }}
          onSetupDataChanged={handleTenantSetupDataChanged}
        />
        {hardwareMessage && (
          <Suspense fallback={null}>
            <PosHardwareMessageModal
              open
              message={hardwareMessage}
              onOpenChange={handleHardwareMessageOpenChange}
            />
          </Suspense>
        )}
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
        {incomingOrderModalOpen && (
          <Suspense fallback={null}>
            <OnlineOrderDetailsModal
              open
              onOpenChange={handleIncomingOrderModalOpenChange}
              order={incomingOrderDetail}
              loading={incomingReceiptOpeningId !== null && !incomingOrderDetail}
            />
          </Suspense>
        )}
        {incomingOrderReceiptOpen && (
          <Suspense fallback={null}>
            <OnlineOrderReceiptModal
              open
              onOpenChange={handleIncomingOrderReceiptOpenChange}
              order={incomingOrderDetail}
              loading={incomingReceiptOpeningId !== null && !incomingOrderDetail}
              onPrint={handlePrintIncomingOrder}
              printLoading={incomingOrderPrintLoading}
            />
            </Suspense>
        )}
        {closedShiftReportOpen && closedShiftReport && (
          <ShiftCloseSummaryPrintView
            report={closedShiftReport}
            currency={terminalMeta.pettyCashSymbol || DEFAULT_CURRENCY}
            autoPrint={closedShiftReportAutoPrint}
            title={closedShiftReportAutoPrint ? 'Cashier Shift Sales Summary' : 'Current Shift Sales Summary'}
            onPrint={() => printClosedShiftSummary(closedShiftReport, {
              reason: closedShiftReportAutoPrint ? 'shift_summary_reprint' : 'shift_summary_manual_print'
            })}
            onClose={() => {
              setClosedShiftReportOpen(false);
              setClosedShiftReport(null);
              setClosedShiftReportAutoPrint(false);
            }}
          />
        )}
        {zReadingPrintOpen && zReadingReport && (
          <ZReadingPrintView
            report={zReadingReport}
            currency={terminalMeta.pettyCashSymbol || DEFAULT_CURRENCY}
            autoPrint={zReadingPrintAutoPrint}
            printState={zReadingPrintState}
            onPrint={() => printZReading(zReadingReport, {
              reason: zReadingReport.snapshot_reused ? 'z_reading_reprint' : 'z_reading_close_day'
            })}
            onClose={() => {
              setZReadingPrintOpen(false);
              setZReadingReport(null);
              setZReadingPrintAutoPrint(false);
              setZReadingPrintState('idle');
            }}
          />
        )}
        <Dialog open={zReadingCloseConfirmOpen} onOpenChange={(open) => {
          if (shiftActionLoading.zReading) return;
          setZReadingCloseConfirmOpen(open);
          if (!open) setZReadingClosePin('');
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Day Close</DialogTitle>
              <DialogDescription>
                This will generate the branch Z-reading after every cashier shift is closed. Enter your own Day Close PIN to record accountability.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                The Z-reading is branch-wide and includes financially recognized sales from all cashiers and completed online orders.
              </div>
              <div>
                <Label htmlFor="z-reading-day-close-pin">Your POS Day Close PIN</Label>
                <Input
                  id="z-reading-day-close-pin"
                  value={zReadingClosePin}
                  onChange={(event) => setZReadingClosePin(event.target.value.replace(/\D/g, '').slice(0, 12))}
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="4 to 12 digits"
                  className="mt-1"
                  disabled={shiftActionLoading.zReading}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setZReadingCloseConfirmOpen(false)} disabled={shiftActionLoading.zReading}>
                Cancel
              </Button>
              <Button type="button" onClick={confirmCloseDay} disabled={shiftActionLoading.zReading}>
                {shiftActionLoading.zReading ? 'Closing Day...' : 'Confirm & Print Z-reading'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <TerminalPageLayout
          key={locked ? 'terminal-layout-locked' : `terminal-layout-unlocked-${terminalLayoutEpoch}`}
          locked={locked}
          isOnline={isOnline && apiReachable}
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
          canManageCategories={canManageCategories}
          itemsStockFilterPreset={itemsStockFilterPreset}
          onItemsStockFilterPresetApplied={handleItemsStockFilterPresetApplied}
          canAdjustCashDrawer={canAdjustCashDrawer}
          canCloseShift={canCloseShift}
          canCloseDay={canCloseDay}
          canAdminBypassShiftPrompt={canAdminBypassShiftPrompt}
          canOpenShift={canOpenShift}
          terminalUser={terminalUser}
          accessibleCompanies={mergeCurrentCompanyWithMemberships(terminalUser, dgfyPosState.companies)}
          companySwitching={companySwitching}
          companySwitchBlockedReason={companySwitchBlockedReason}
          onSwitchCompany={handleCompanySwitch}
          posViewMode={posViewMode}
          workflowMode={workflowMode}
          isMsmeMode={isMsmeMode}
          shiftState={shiftState}
          incomingOrdersState={incomingOrdersState}
          adminLocationMonitorState={adminLocationMonitorState}
          adminTerminalSwitching={adminTerminalSwitching}
          onSelectAdminTerminal={handleSelectAdminTerminal}
          refreshAdminLocationMonitor={refreshAdminLocationMonitor}
          canRecoverStaleShifts={terminalUser?.is_master_admin === true}
          handleForceCloseStaleShift={handleForceCloseStaleShift}
          onlineOrderSoundEnabled={onlineOrderSoundEnabled}
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
          employeeCreditReportRefreshKey={employeeCreditReportRefreshKey}
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
          handleCloseDay={handleCloseDay}
          handleViewShiftSummary={handleViewShiftSummary}
          refreshOperationalContext={refreshOperationalContext}
          setOperatingLocationId={setOperatingLocationId}
          setQueueLocationScopeId={setQueueLocationScopeId}
          incomingOrderActionState={incomingOrderActionState}
          handleIncomingOrderStatusChange={handleIncomingOrderStatusChange}
          handleDeliveryJobStatusChange={handleDeliveryJobStatusChange}
          handleOpenCashCollection={handleOpenCashCollection}
          handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
          incomingReceiptOpeningId={incomingReceiptOpeningId}
          refreshIncomingOrders={refreshIncomingOrders}
          setSidebarCollapsed={setSidebarCollapsed}
          activeShiftId={activeShiftId}
          checkoutBlockedReason={checkoutBlockedReason}
          offlineSnapshotScope={offlineSnapshotScope}
          onQueueOfflineItemDraft={queueOfflineItemDraft}
          onManualUniversalSync={handleManualUniversalSync}
          manualSyncPolicy={manualSyncPolicy}
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
          setOnlineOrderSoundEnabled={setOnlineOrderSoundEnabled}
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
          catalogSearchPrefill={catalogSearchPrefill}
          onCatalogSearchHydrated={handleCatalogSearchHydrated}
          drawerOpen={drawerOpen}
          terminalUnlockModalOpen={terminalUnlockModalOpen}
          formData={formData}
          setFormData={setFormData}
          dgfyPosState={dgfyPosState}
          emailCompanyLookup={emailCompanyLookup}
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

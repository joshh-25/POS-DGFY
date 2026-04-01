import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Menu, X } from 'lucide-react';
import {
  closeTerminalShift,
  fetchIncomingOnlineOrders,
  fetchCurrentTerminalShift,
  fetchTerminalTodayDashboard,
  openTerminalShift,
  recordCashDrawerEvent,
  updateOnlineOrderStatus
} from '../services/posService';
import { login as loginWithCredentials, getCurrentUser as fetchCurrentUser } from '@/services/authService.js';
import { getAllSettings } from '@/services/settingsService.js';
import { listTenantLocations } from '@/services/tenantLocationService.js';
import api from '@/services/api.js';
import { clearClientSession } from '@/services/sessionCleanup.js';

const POSCheckoutTerminal = lazy(() => import('../components/POSCheckoutTerminal'));
const TerminalSidebarPanel = lazy(() => import('../components/TerminalSidebarPanel'));
const TerminalLockDrawer = lazy(() => import('../components/TerminalLockDrawer'));
const TerminalWorkspaceSidebar = lazy(() => import('../components/TerminalWorkspaceSidebar'));
const TerminalOperationsWorkspace = lazy(() => import('../components/TerminalOperationsWorkspace'));

const TERMINAL_ID = 'WEB-POS-01';
const DEFAULT_CURRENCY = 'PHP';
const ONLINE_ORDER_POLL_INTERVAL_MS = 12000;
const CHECKOUT_VIEW_MODES = ['checkout', 'history', 'receipt'];
const OPERATIONS_VIEW_MODES = [
  'incoming_queue',
  'location_scope',
  'shift_controls',
  'cash_drawer',
  'close_shift',
  'sales_today',
  'terminal_setup'
];
const TERMINAL_SECTION_IDS = {
  checkoutWorkspace: 'pos-checkout-workspace',
  terminalSetup: 'pos-section-terminal-setup',
  activeShift: 'pos-section-active-shift',
  cashDrawer: 'pos-section-cash-drawer',
  closeShift: 'pos-section-close-shift',
  locationScope: 'pos-section-location-scope',
  incomingOrders: 'pos-section-incoming-orders',
  salesToday: 'pos-section-sales-today'
};

const lookupCompanyToken = async (email) => {
  const response = await api.post('/auth/lookup', { email }, { skipGlobalErrorToast: true });
  const tenant = response?.data?.data;
  return tenant?.company_token || null;
};

const parseUserPermissions = (user) => {
  if (!user) return [];
  if (Array.isArray(user.permissions)) return user.permissions;
  if (typeof user.permissions === 'string') {
    try {
      const parsed = JSON.parse(user.permissions);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export default function TerminalPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('posTerminalSidebarCollapsed');
    return stored === '1';
  });
  const [locked, setLocked] = useState(() => !localStorage.getItem('authToken'));
  const [drawerOpen, setDrawerOpen] = useState(() => !localStorage.getItem('authToken'));
  const [loadingUser, setLoadingUser] = useState(false);
  const [terminalUser, setTerminalUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [terminalMeta, setTerminalMeta] = useState({
    loading: true,
    pettyCashSymbol: DEFAULT_CURRENCY,
    pettyCashAmount: 0,
    activeDiscountCount: 0,
    enabledFeeMethods: [],
    strictCompliance: false
  });
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    companyToken: ''
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
    cashEvent: false,
    close: false
  });
  const [locationsState, setLocationsState] = useState({
    loading: false,
    locations: []
  });
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [incomingOrdersState, setIncomingOrdersState] = useState({
    loading: false,
    orders: [],
    accessState: 'idle',
    errorMessage: ''
  });
  const [incomingOrderActionState, setIncomingOrderActionState] = useState({});
  const [receiptRequestId, setReceiptRequestId] = useState(null);
  const [incomingReceiptOpeningId, setIncomingReceiptOpeningId] = useState(null);
  const [historyRequestQuery, setHistoryRequestQuery] = useState('');
  const [incomingHistoryOpeningId, setIncomingHistoryOpeningId] = useState(null);
  const [posViewMode, setPosViewMode] = useState('checkout');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const workspacePaneRef = useRef(null);
  const [isDesktopWide, setIsDesktopWide] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 1280;
  });

  const permissions = useMemo(() => parseUserPermissions(terminalUser), [terminalUser]);
  const hasPermission = useCallback((permission) => {
    if (!terminalUser) return false;
    if (terminalUser.is_master_admin) return true;
    return permissions.includes(permission);
  }, [permissions, terminalUser]);

  const canViewPos = hasPermission('pos:view');
  const canTransactPos = hasPermission('pos:transact');
  const canAdjustCashDrawer = hasPermission('pos:cash_drawer_adjust');
  const canCloseDay = hasPermission('pos:close_day');

  const hydrateTerminalMeta = useCallback(async () => {
    setTerminalMeta((prev) => ({ ...prev, loading: true }));
    try {
      const allSettings = await getAllSettings();
      const pettyCashSymbol = String(allSettings?.pos_petty_cash_symbol?.value || DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY;
      const pettyCashAmount = Number(allSettings?.pos_petty_cash_amount?.value ?? 0);
      const strictCompliance = Boolean(allSettings?.pos_strict_compliance_enabled?.value);

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

      let methodFees = allSettings?.pos_order_method_fees?.value || {};
      if (typeof methodFees === 'string') {
        try {
          methodFees = JSON.parse(methodFees);
        } catch {
          methodFees = {};
        }
      }
      const enabledFeeMethods = ['dine_in', 'takeout', 'pickup', 'delivery', 'online'].filter(
        (method) => methodFees?.[method]?.enabled === true
      );

      setTerminalMeta({
        loading: false,
        pettyCashSymbol,
        pettyCashAmount: Number.isFinite(pettyCashAmount) ? pettyCashAmount : 0,
        activeDiscountCount,
        enabledFeeMethods,
        strictCompliance
      });
    } catch {
      setTerminalMeta((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const refreshOperationalContext = useCallback(async () => {
    if (locked) return;
    setShiftState((prev) => ({ ...prev, loading: true }));
    setTodayDashboard((prev) => ({ ...prev, loading: true }));
    try {
      const [currentShiftResult, dashboardResult] = await Promise.all([
        fetchCurrentTerminalShift({ terminal_id: TERMINAL_ID }),
        fetchTerminalTodayDashboard({ terminal_id: TERMINAL_ID })
      ]);

      const shiftPayload = currentShiftResult?.shift || null;
      const cashSummary = currentShiftResult?.cash_summary || null;
      const activeShift = dashboardResult?.active_shift || shiftPayload;
      const activeShiftSummary = dashboardResult?.active_shift_cash_summary || cashSummary;

      setShiftState({
        loading: false,
        shift: activeShift,
        cashSummary: activeShiftSummary
      });
      setTodayDashboard({
        loading: false,
        businessDate: dashboardResult?.business_date || null,
        salesSummary: dashboardResult?.sales_summary || null
      });
    } catch (error) {
      setShiftState((prev) => ({ ...prev, loading: false }));
      setTodayDashboard((prev) => ({ ...prev, loading: false }));
      if (error?.response?.status !== 403) {
        toast.error(error?.response?.data?.message || 'Failed to load terminal operational context.');
      }
    }
  }, [locked]);

  const refreshTenantLocations = useCallback(async () => {
    if (locked) return;
    setLocationsState((prev) => ({ ...prev, loading: true }));
    try {
      const rows = await listTenantLocations({ include_inactive: false });
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

      if (
        selectedLocationId
        && !activeLocations.some((location) => Number(location.location_id) === Number(selectedLocationId))
      ) {
        setSelectedLocationId(null);
      }
    } catch {
      setLocationsState((prev) => ({ ...prev, loading: false }));
    }
  }, [locked, selectedLocationId]);

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

    if (!silent) {
      setIncomingOrdersState((prev) => ({
        ...prev,
        loading: true,
        accessState: 'allowed',
        errorMessage: ''
      }));
    }

    try {
      const params = selectedLocationId ? { location_id: selectedLocationId } : {};
      const payload = await fetchIncomingOnlineOrders(params);
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
  }, [canViewPos, locked, selectedLocationId]);

  const hydrateUser = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      setTerminalUser(null);
      setLocked(true);
      setDrawerOpen(true);
      return;
    }

    setLoadingUser(true);
    try {
      const user = await fetchCurrentUser();
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

  const headerSubtitle = useMemo(() => {
    if (loadingUser) return 'Loading terminal session...';
    if (locked) return 'Terminal is locked. Sign in from the right panel to continue.';
    return 'Single-screen cashier workflow for checkout, history, receipts, and shift controls.';
  }, [loadingUser, locked]);

  const checkoutBlockedReason = useMemo(() => {
    if (locked) return 'Terminal is locked. Login from the right panel.';
    if (!canTransactPos) return 'Your account does not have POS transact permission.';
    if (!shiftState.shift) return 'Open a terminal shift before processing checkout transactions.';
    return '';
  }, [canTransactPos, locked, shiftState.shift]);

  const activeShiftId = shiftState?.shift?.pos_terminal_shift_id || null;
  const handleLogin = async (event) => {
    event.preventDefault();
    const email = String(formData.email || '').trim();
    const password = String(formData.password || '');
    const manualToken = String(formData.companyToken || '').trim();

    if (!email || !password) {
      toast.error('Email and password are required.');
      return;
    }

    setSubmitting(true);
    try {
      let companyToken = manualToken;
      if (!companyToken) {
        companyToken = await lookupCompanyToken(email);
      }

      if (!companyToken) {
        toast.error('Company token is required. Enter it manually if lookup fails.');
        return;
      }

      await loginWithCredentials({ email, password, companyToken });
      await hydrateUser();
      await Promise.all([hydrateTerminalMeta(), refreshOperationalContext()]);
      setFormData((prev) => ({ ...prev, password: '' }));
      toast.success('Terminal unlocked.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to sign in to terminal.');
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
    if (!canTransactPos) {
      toast.error('Your account does not have permission to open a shift.');
      return;
    }

    const rawOpeningFloat = String(openShiftForm.openingFloatAmount ?? '').trim();
    const fallbackOpeningFloat = Number(terminalMeta.pettyCashAmount ?? 0);
    const openingFloatAmount = rawOpeningFloat === '' ? fallbackOpeningFloat : Number(rawOpeningFloat);
    if (!Number.isFinite(openingFloatAmount) || openingFloatAmount < 0) {
      toast.error('Opening float must be a non-negative number.');
      return;
    }

    setShiftActionLoading((prev) => ({ ...prev, open: true }));
    try {
      const result = await openTerminalShift({
        terminal_id: TERMINAL_ID,
        opening_float_amount: openingFloatAmount,
        opening_note: String(openShiftForm.openingNote || '').trim() || undefined
      });
      toast.success(result?.reused_existing ? 'Existing open shift found and reused.' : 'Terminal shift opened.');
      setOpenShiftForm({ openingFloatAmount: '', openingNote: '' });
      await refreshOperationalContext();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to open terminal shift.');
    } finally {
      setShiftActionLoading((prev) => ({ ...prev, open: false }));
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

    setShiftActionLoading((prev) => ({ ...prev, cashEvent: true }));
    try {
      await recordCashDrawerEvent(activeShiftId, {
        event_type: cashEventForm.eventType,
        amount,
        reason
      });
      toast.success('Cash drawer event recorded.');
      setCashEventForm((prev) => ({ ...prev, amount: '', reason: '' }));
      await refreshOperationalContext();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to record cash drawer event.');
    } finally {
      setShiftActionLoading((prev) => ({ ...prev, cashEvent: false }));
    }
  };

  const handleCloseShift = async () => {
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

    setShiftActionLoading((prev) => ({ ...prev, close: true }));
    try {
      await closeTerminalShift(activeShiftId, {
        closing_cash_amount: closingCashAmount,
        closing_note: String(closeShiftForm.closingNote || '').trim() || undefined
      });
      toast.success('Shift closed successfully.');
      setCloseShiftForm({ closingCashAmount: '', closingNote: '' });
      await refreshOperationalContext();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to close shift.');
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

    setIncomingOrderActionState((prev) => ({ ...prev, [normalizedId]: nextStatus }));
    try {
      await updateOnlineOrderStatus(normalizedId, { fulfillment_status: nextStatus });
      toast.success('Online order status updated.');
      await refreshIncomingOrders({ silent: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update online order status.');
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
    setReceiptRequestId(normalizedId);
    setPosViewMode('receipt');
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
  }, [refreshOperationalContext]);

  const handleSelectViewMode = useCallback((nextMode) => {
    if (locked) {
      setMobileNavOpen(false);
      return;
    }
    setPosViewMode(nextMode);
    if (workspacePaneRef.current) {
      workspacePaneRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setMobileNavOpen(false);
  }, [locked]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => {
      setIsDesktopWide(window.innerWidth >= 1280);
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
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
    if (!CHECKOUT_VIEW_MODES.includes(posViewMode) && !OPERATIONS_VIEW_MODES.includes(posViewMode)) {
      setPosViewMode('checkout');
    }
  }, [posViewMode]);

  const effectiveSidebarCollapsed = isDesktopWide ? sidebarCollapsed : false;
  const isCheckoutWorkspaceMode = CHECKOUT_VIEW_MODES.includes(posViewMode);
  const isOperationsWorkspaceMode = OPERATIONS_VIEW_MODES.includes(posViewMode);

  return (
    <div className="min-h-screen bg-slate-100 xl:flex xl:h-screen xl:flex-col xl:overflow-hidden">
      <div className="border-b border-slate-200 bg-gradient-to-r from-white via-teal-50/70 to-white px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">POS Terminal Workspace</h1>
            <p className="mt-1 text-base text-slate-700">{headerSubtitle}</p>
            {!isOnline && (
              <p className="mt-2 text-sm font-semibold text-amber-700">
                You are offline. Online queue refresh and online-order actions are paused until connection is restored.
              </p>
            )}
          </div>
          <div
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              locked
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {locked ? 'Terminal Locked' : 'Terminal Active'}
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 xl:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
        >
          <Menu className="h-4 w-4" />
          POS Menu
        </button>
      </div>

      {!isDesktopWide && mobileNavOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileNavOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[88%] max-w-sm overflow-y-auto bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">POS Navigation</p>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md border border-slate-200 p-1 text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Suspense fallback={<div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">Loading menu...</div>}>
              <TerminalWorkspaceSidebar
                className="flex"
                locked={locked}
                terminalUser={terminalUser}
                currentViewMode={posViewMode}
                canViewPos={canViewPos}
                canAdjustCashDrawer={canAdjustCashDrawer}
                canCloseDay={canCloseDay}
                shiftState={shiftState}
                incomingOrdersState={incomingOrdersState}
                locationsState={locationsState}
                selectedLocationId={selectedLocationId}
                onSelectViewMode={handleSelectViewMode}
                onUnlock={() => {
                  setDrawerOpen(true);
                  setMobileNavOpen(false);
                }}
                onLock={() => {
                  handleLock();
                  setMobileNavOpen(false);
                }}
              />
            </Suspense>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-4 p-4 ${effectiveSidebarCollapsed ? 'xl:grid-cols-[260px_minmax(0,1fr)_72px]' : 'xl:grid-cols-[260px_minmax(0,1fr)_360px]'} xl:grid-rows-[minmax(0,1fr)] xl:flex-1 xl:min-h-0 xl:overflow-hidden`}>
        <div className="hidden xl:flex xl:min-h-0 xl:overflow-hidden">
          <Suspense fallback={<div className="hidden xl:block rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading POS navigation...</div>}>
            <TerminalWorkspaceSidebar
              className="hidden xl:flex xl:h-fit xl:w-full xl:self-start xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto"
              locked={locked}
              terminalUser={terminalUser}
              currentViewMode={posViewMode}
              canViewPos={canViewPos}
              canAdjustCashDrawer={canAdjustCashDrawer}
              canCloseDay={canCloseDay}
              shiftState={shiftState}
              incomingOrdersState={incomingOrdersState}
              locationsState={locationsState}
              selectedLocationId={selectedLocationId}
              onSelectViewMode={handleSelectViewMode}
              onUnlock={() => setDrawerOpen(true)}
              onLock={handleLock}
            />
          </Suspense>
        </div>

        <div
          id={TERMINAL_SECTION_IDS.checkoutWorkspace}
          ref={workspacePaneRef}
          className={`transition xl:h-full xl:min-h-0 ${isCheckoutWorkspaceMode ? 'xl:overflow-hidden' : 'xl:overflow-y-auto xl:overscroll-contain'} ${locked ? 'pointer-events-none select-none opacity-90 blur-[1px]' : ''}`}
        >
          {isCheckoutWorkspaceMode && (
            <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading POS terminal...</div>}>
              <POSCheckoutTerminal
                sessionLocked={locked}
                canViewHistory={canViewPos}
                activeShiftId={activeShiftId}
                checkoutBlockedReason={checkoutBlockedReason}
                onCheckoutCompleted={handleCheckoutCompleted}
                viewMode={posViewMode}
                onViewModeChange={setPosViewMode}
                externalReceiptTransactionId={receiptRequestId}
                externalHistoryQuery={historyRequestQuery}
                onExternalReceiptHydrated={() => {
                  setReceiptRequestId(null);
                  setIncomingReceiptOpeningId(null);
                }}
                onExternalHistoryHydrated={() => {
                  setHistoryRequestQuery('');
                  setIncomingHistoryOpeningId(null);
                }}
              />
            </Suspense>
          )}

          {isOperationsWorkspaceMode && (
            <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading operations workspace...</div>}>
              <TerminalOperationsWorkspace
                viewMode={posViewMode}
                terminalUser={terminalUser}
                locked={locked}
                terminalMeta={terminalMeta}
                shiftState={shiftState}
                todayDashboard={todayDashboard}
                canViewPos={canViewPos}
                canTransactPos={canTransactPos}
                canAdjustCashDrawer={canAdjustCashDrawer}
                canCloseDay={canCloseDay}
                openShiftForm={openShiftForm}
                setOpenShiftForm={setOpenShiftForm}
                cashEventForm={cashEventForm}
                setCashEventForm={setCashEventForm}
                closeShiftForm={closeShiftForm}
                setCloseShiftForm={setCloseShiftForm}
                shiftActionLoading={shiftActionLoading}
                handleOpenShift={handleOpenShift}
                handleRecordCashEvent={handleRecordCashEvent}
                handleCloseShift={handleCloseShift}
                refreshOperationalContext={refreshOperationalContext}
                locationsState={locationsState}
                selectedLocationId={selectedLocationId}
                setSelectedLocationId={setSelectedLocationId}
                incomingOrdersState={incomingOrdersState}
                incomingOrderActionState={incomingOrderActionState}
                handleIncomingOrderStatusChange={handleIncomingOrderStatusChange}
                handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
                handleOpenIncomingOrderHistory={handleOpenIncomingOrderHistory}
                incomingReceiptOpeningId={incomingReceiptOpeningId}
                incomingHistoryOpeningId={incomingHistoryOpeningId}
                refreshIncomingOrders={refreshIncomingOrders}
                handleLock={handleLock}
                setDrawerOpen={setDrawerOpen}
                sectionIds={TERMINAL_SECTION_IDS}
              />
            </Suspense>
          )}
        </div>

        <div className="xl:min-h-0 xl:overflow-hidden">
          <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading terminal controls...</div>}>
            <TerminalSidebarPanel
              className="flex xl:h-full xl:min-h-0"
              isCollapsed={effectiveSidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
              terminalUser={terminalUser}
              locked={locked}
              terminalMeta={terminalMeta}
              shiftState={shiftState}
              todayDashboard={todayDashboard}
              canViewPos={canViewPos}
              canTransactPos={canTransactPos}
              canAdjustCashDrawer={canAdjustCashDrawer}
              canCloseDay={canCloseDay}
              openShiftForm={openShiftForm}
              setOpenShiftForm={setOpenShiftForm}
              cashEventForm={cashEventForm}
              setCashEventForm={setCashEventForm}
              closeShiftForm={closeShiftForm}
              setCloseShiftForm={setCloseShiftForm}
              shiftActionLoading={shiftActionLoading}
              handleOpenShift={handleOpenShift}
              handleRecordCashEvent={handleRecordCashEvent}
              handleCloseShift={handleCloseShift}
              refreshOperationalContext={refreshOperationalContext}
              locationsState={locationsState}
              selectedLocationId={selectedLocationId}
              setSelectedLocationId={setSelectedLocationId}
              incomingOrdersState={incomingOrdersState}
              incomingOrderActionState={incomingOrderActionState}
              handleIncomingOrderStatusChange={handleIncomingOrderStatusChange}
              handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
              handleOpenIncomingOrderHistory={handleOpenIncomingOrderHistory}
              incomingReceiptOpeningId={incomingReceiptOpeningId}
              incomingHistoryOpeningId={incomingHistoryOpeningId}
              refreshIncomingOrders={refreshIncomingOrders}
              handleLock={handleLock}
              setDrawerOpen={setDrawerOpen}
              sectionIds={TERMINAL_SECTION_IDS}
            />
          </Suspense>
        </div>
      </div>

      {locked && <div className="fixed inset-0 bg-slate-900/20 pointer-events-none" />}

      <Suspense fallback={null}>
        <TerminalLockDrawer
          drawerOpen={drawerOpen}
          formData={formData}
          setFormData={setFormData}
          submitting={submitting}
          onSubmit={handleLogin}
        />
      </Suspense>
    </div>
  );
}

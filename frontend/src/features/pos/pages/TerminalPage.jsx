import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  closeTerminalShift,
  fetchCurrentTerminalShift,
  fetchTerminalTodayDashboard,
  openTerminalShift,
  recordCashDrawerEvent
} from '../services/posService';
import { login as loginWithCredentials, getCurrentUser as fetchCurrentUser } from '@/services/authService.js';
import { getAllSettings } from '@/services/settingsService.js';
import api from '@/services/api.js';
import { clearClientSession } from '@/services/sessionCleanup.js';

const POSCheckoutTerminal = lazy(() => import('../components/POSCheckoutTerminal'));
const TerminalSidebarPanel = lazy(() => import('../components/TerminalSidebarPanel'));
const TerminalLockDrawer = lazy(() => import('../components/TerminalLockDrawer'));

const TERMINAL_ID = 'WEB-POS-01';
const DEFAULT_CURRENCY = 'PHP';

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
      const enabledFeeMethods = ['dine_in', 'takeout', 'delivery', 'online'].filter(
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
    hydrateTerminalMeta();
  }, [hydrateTerminalMeta]);

  useEffect(() => {
    if (!locked) {
      refreshOperationalContext();
    }
  }, [locked, refreshOperationalContext]);

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

  const handleCheckoutCompleted = useCallback(async () => {
    await refreshOperationalContext();
  }, [refreshOperationalContext]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-gradient-to-r from-white via-teal-50/70 to-white px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">POS Terminal Workspace</h1>
            <p className="mt-1 text-base text-slate-700">{headerSubtitle}</p>
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

      <div className={`grid grid-cols-1 gap-4 p-4 ${sidebarCollapsed ? 'xl:grid-cols-[1fr_72px]' : 'xl:grid-cols-[1fr_360px]'}`}>
        <div className={`transition ${locked ? 'pointer-events-none select-none opacity-90 blur-[1px]' : ''}`}>
          <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading POS terminal...</div>}>
            <POSCheckoutTerminal
              canViewHistory={canViewPos}
              activeShiftId={activeShiftId}
              checkoutBlockedReason={checkoutBlockedReason}
              onCheckoutCompleted={handleCheckoutCompleted}
            />
          </Suspense>
        </div>

        <Suspense fallback={<div className="hidden xl:block rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading terminal controls...</div>}>
          <TerminalSidebarPanel
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
            terminalUser={terminalUser}
            locked={locked}
            terminalMeta={terminalMeta}
            shiftState={shiftState}
            todayDashboard={todayDashboard}
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
            handleLock={handleLock}
            setDrawerOpen={setDrawerOpen}
          />
        </Suspense>
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

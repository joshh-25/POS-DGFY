import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Menu, UserRound } from 'lucide-react';
import { resolveAppAssetUrl } from '../../../utils/assetUrl.js';
import { playOrderAlertWithIminBridge } from '../utils/iminHardwareBridge.js';

import TerminalLockDrawer from './TerminalLockDrawer.jsx';
import TerminalWorkspaceSidebar from './TerminalWorkspaceSidebar.jsx';
import IminTerminalFeedback from './IminTerminalFeedback.jsx';

const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';
const DGFY_POS_LOGO = resolveAppAssetUrl('/dgfy-horizontal_logo-removebg-preview.png');
const MAX_NOTIFICATION_ITEMS = 5;
const loadPOSCheckoutTerminal = () => import('./POSCheckoutTerminal.jsx');
const loadTerminalOperationsWorkspace = () => import('./TerminalOperationsWorkspace.jsx');
const POSCheckoutTerminal = React.lazy(loadPOSCheckoutTerminal);
const TerminalOperationsWorkspace = React.lazy(loadTerminalOperationsWorkspace);
const CHECKOUT_WORKSPACE_MODES = new Set(['checkout', 'history', 'receipt']);
const preloadWorkspaceForViewMode = (viewMode) => (
  CHECKOUT_WORKSPACE_MODES.has(String(viewMode || '').trim())
    ? loadPOSCheckoutTerminal()
    : loadTerminalOperationsWorkspace()
);

export default function TerminalPageLayout({
    locked,
    isOnline,
    activeTerminalId,
    terminalIdOptions,
    terminalRegistry = [],
    terminalRegistryMode = 'warn',
    registryEnforced = false,
    headerSubtitle,
    mobileNavOpen,
    setMobileNavOpen,
    isDesktopWide,
    canViewPos,
    onboardingRestricted = false,
    canCreateItems = false,
    canEditItems = false,
    canDeleteItems = false,
    canAdminBypassShiftPrompt = false,
    itemsStockFilterPreset = '',
    onItemsStockFilterPresetApplied = () => {},
    canAdjustCashDrawer,
    canCloseDay,
    terminalUser,
    accessibleCompanies = [],
    companySwitching = false,
    companySwitchBlockedReason = '',
    onSwitchCompany = async () => {},
    posViewMode,
    workflowMode = '',
    isMsmeMode = false,
    shiftState,
    incomingOrdersState,
    onlineOrderSoundEnabled = true,
    locationsState,
    operatingLocationId,
    queueLocationScopeId,
    handleSelectViewMode,
    settingsEntryViewMode = 'settings_profile',
    handleLock,
    setDrawerOpen,
    effectiveSidebarCollapsed = false,
    setSidebarCollapsed = () => {},
    isCheckoutWorkspaceMode,
    isOperationsWorkspaceMode,
    TERMINAL_SECTION_IDS,
    workspacePaneRef,
    canTransactPos,
    terminalMeta,
    todayDashboard,
    reportRefreshKey = 0,
    openShiftForm,
    setOpenShiftForm,
    cashEventForm,
    setCashEventForm,
    closeShiftForm,
    setCloseShiftForm,
    shiftActionLoading,
    handleOpenShift,
    canSwitchPosLocation,
    handleSwitchShiftLocation,
    handleRecordCashEvent,
    handleCloseShift,
    refreshOperationalContext,
    setOperatingLocationId,
    setQueueLocationScopeId,
    incomingOrderActionState,
    handleIncomingOrderStatusChange,
    handleOpenCashCollection,
    handleOpenIncomingOrderReceipt,
    incomingReceiptOpeningId,
    refreshIncomingOrders,
    activeShiftId,
    checkoutBlockedReason,
    offlineSnapshotScope = {},
    onQueueOfflineItemDraft = async () => '',
    onManualUniversalSync = async () => ({ allowed: false }),
    manualSyncPolicy = {},
    refreshTerminalUser = async () => {},
    refreshTerminalMeta = async () => {},
    onPosSetupSaved = async () => {},
    onStorefrontSetupSaved = async () => {},
    setOnlineOrderSoundEnabled = () => {},
    queuedTerminalOperationCount,
    queuedTerminalBlockedCount = 0,
    queuedTerminalOperations = [],
    queueStatusFilter = 'all',
    setQueueStatusFilter = () => {},
    queueSummary = {},
    replayingQueuedTerminalOperations,
    handleReplayQueuedTerminalOperations,
    handleRetryQueuedOperation = () => {},
    handleResolveQueuedOperation = () => {},
    handleCheckoutCompleted,
    setPosViewMode,
    modeChangeNotice = null,
    dismissModeChangeNotice = () => {},
    receiptRequestId,
    setReceiptRequestId,
    receiptReturnViewMode = null,
    setReceiptReturnViewMode = () => {},
    setIncomingReceiptOpeningId,
    historyRequestQuery,
    setHistoryRequestQuery,
    catalogSearchPrefill,
    onCatalogSearchHydrated,
    drawerOpen,
    terminalUnlockModalOpen = false,
    formData,
    setFormData,
    dgfyPosState = {},
    emailCompanyLookup = {},
    submitting,
    handleLogin,
    handleIdentityChange = null,
    handleUseDifferentAccount = null,
    handleLegacyLogin = null
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [capabilityNotice, setCapabilityNotice] = useState(null);
  const hasHydratedIncomingOrdersRef = useRef(false);
  const seenIncomingOrderIdsRef = useRef(new Set());
  const lastOrderAlertAtRef = useRef(0);
  const queueCount = Number(queuedTerminalOperationCount || 0);
  const blockedQueueCount = Number(queuedTerminalBlockedCount || 0);
  const actionableQueueCount = queueCount + blockedQueueCount;
  const queueTotalCount = Number(queueSummary?.total || actionableQueueCount);
  const normalizedActiveTerminalId = String(activeTerminalId || '').trim();
  const incomingOrders = Array.isArray(incomingOrdersState?.orders) ? incomingOrdersState.orders : [];
  const activeHeaderTitle = useMemo(() => {
    const titles = {
      checkout: 'POS Catalog',
      receipt: 'Receipt',
      history: 'History',
      reports: 'Report',
      items: 'Items',
      incoming_queue: 'Orders',
      location_scope: 'Settings',
      settings_profile: 'Settings',
      settings_pos: 'Settings',
      settings_storefront: 'Settings',
      shift_controls: 'Shift',
      cash_drawer: 'Cash Drawer Event',
      close_shift: 'Shift',
      terminal_setup: 'Terminal Setup Context'
    };
    return titles[posViewMode] || 'POS Catalog';
  }, [posViewMode]);
  const notifications = useMemo(() => {
    const items = [];
    if (incomingOrders.length > 0) {
      items.push({
        id: 'incoming-orders',
        title: `${incomingOrders.length} incoming order${incomingOrders.length === 1 ? '' : 's'}`,
        description: 'Review and process new online orders.',
        actionLabel: 'Open Orders',
        onClick: () => {
          setNotificationsOpen(false);
          handleSelectViewMode('incoming_queue');
        }
      });
    }
    return items.slice(0, MAX_NOTIFICATION_ITEMS);
  }, [
    handleSelectViewMode,
    incomingOrders.length
  ]);

  useEffect(() => {
    hasHydratedIncomingOrdersRef.current = false;
    seenIncomingOrderIdsRef.current = new Set();
    lastOrderAlertAtRef.current = 0;
  }, [queueLocationScopeId]);

  useEffect(() => {
    if (onlineOrderSoundEnabled !== true) return;
    if (incomingOrdersState?.loading) return;
    if (String(incomingOrdersState?.accessState || '').trim() !== 'allowed') return;

    const currentOrderIds = incomingOrders
      .map((order) => String(order?.pos_transaction_id || '').trim())
      .filter(Boolean);

    if (!hasHydratedIncomingOrdersRef.current) {
      hasHydratedIncomingOrdersRef.current = true;
      seenIncomingOrderIdsRef.current = new Set(currentOrderIds);
      return;
    }

    const seenIds = seenIncomingOrderIdsRef.current;
    const hasNewIncomingOrder = currentOrderIds.some((orderId) => !seenIds.has(orderId));
    if (!hasNewIncomingOrder) return;

    const now = Date.now();
    if ((now - lastOrderAlertAtRef.current) >= 1000) {
      try {
        playOrderAlertWithIminBridge('new_order');
      } catch {
        // Browser and non-iMin surfaces should stay silent.
      }
      lastOrderAlertAtRef.current = now;
    }

    currentOrderIds.forEach((orderId) => {
      seenIds.add(orderId);
    });
  }, [incomingOrders, incomingOrdersState?.accessState, incomingOrdersState?.loading, onlineOrderSoundEnabled]);
  const notificationCount = notifications.length;
  const primaryNotificationAction = notifications[0]?.onClick || null;
  const companyRows = Array.isArray(accessibleCompanies) ? accessibleCompanies : [];
  const currentCompanyId = String(terminalUser?.company?.id || '').trim();
  const shellLayoutClassName = IS_DGFY_POS_SURFACE
    ? `lg:grid ${effectiveSidebarCollapsed ? 'lg:grid-cols-[minmax(0,1fr)]' : 'lg:grid-cols-[244px_minmax(0,1fr)]'}`
    : `xl:grid ${effectiveSidebarCollapsed ? 'xl:grid-cols-[minmax(0,1fr)]' : 'xl:grid-cols-[244px_minmax(0,1fr)]'}`;
  const persistentSidebarClassName = IS_DGFY_POS_SURFACE
    ? 'hidden lg:flex lg:min-h-0 lg:overflow-hidden'
    : 'hidden xl:flex xl:min-h-0 xl:overflow-hidden';
  const persistentSidebarFallbackClassName = IS_DGFY_POS_SURFACE
    ? 'hidden lg:block bg-white p-4 text-sm text-slate-500'
    : 'hidden xl:block bg-white p-4 text-sm text-slate-500';
  const persistentSidebarBodyClassName = IS_DGFY_POS_SURFACE
    ? 'hidden lg:flex lg:h-full lg:w-full lg:min-h-0 lg:touch-pan-y'
    : 'hidden xl:flex xl:h-full xl:w-full xl:min-h-0 xl:touch-pan-y';
  const headerShellClassName = IS_DGFY_POS_SURFACE
    ? 'flex min-h-[38px] flex-col gap-1 lg:grid lg:min-h-[46px] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-2'
    : 'grid min-h-[56px] grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center';
  const headerSubtitleClassName = IS_DGFY_POS_SURFACE
    ? 'mt-1 hidden max-w-3xl text-[11px] leading-4 text-pos-muted lg:block'
    : 'mt-1 hidden max-w-3xl text-[12px] leading-4 text-pos-muted md:block';
  const compactBellClassName = IS_DGFY_POS_SURFACE
    ? 'relative grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[#1A4E8D] hover:bg-slate-100 lg:hidden'
    : 'hidden';
  const desktopBellClassName = IS_DGFY_POS_SURFACE
    ? 'relative hidden h-10 w-10 shrink-0 place-items-center rounded-xl text-[#1A4E8D] hover:bg-slate-100 lg:grid'
    : 'relative grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#1A4E8D] hover:bg-slate-100';
  const desktopIdentityClassName = IS_DGFY_POS_SURFACE
    ? 'hidden min-w-0 shrink-0 items-center gap-2 lg:flex'
    : 'flex min-w-0 shrink-0 items-center gap-2.5';
  const overlayContainerClassName = IS_DGFY_POS_SURFACE
    ? 'fixed inset-0 z-50 lg:hidden'
    : 'fixed inset-0 z-50 xl:hidden';
  const lockedSurfaceClassName = locked ? 'pointer-events-none select-none opacity-80 blur-[2px]' : '';
  const lockedHeaderSurfaceClassName = locked ? 'pointer-events-none select-none opacity-80' : '';
  const workspaceDesktopOverflowClassName = isCheckoutWorkspaceMode
    ? 'xl:flex xl:flex-col xl:overflow-hidden'
    : 'xl:overflow-y-auto xl:overscroll-contain xl:overscroll-y-contain xl:touch-pan-y';
  const workspaceContentClassName = isCheckoutWorkspaceMode
    ? 'grid min-w-0 max-w-full grid-cols-1 gap-2 p-2 xl:flex-1 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)]'
    : 'grid min-w-0 max-w-full grid-cols-1 gap-2 p-2';
  const workspaceSectionClassName = isCheckoutWorkspaceMode
    ? 'min-h-0 min-w-0 max-w-full transition xl:h-full'
    : 'min-h-0 min-w-0 max-w-full transition';

  useEffect(() => {
    if (locked || typeof window === 'undefined') return undefined;

    const preloadWorkspaces = () => {
      loadPOSCheckoutTerminal();
      loadTerminalOperationsWorkspace();
    };

    if (typeof window.requestIdleCallback === 'function') {
      const idleCallbackId = window.requestIdleCallback(preloadWorkspaces, { timeout: 2000 });
      return () => window.cancelIdleCallback?.(idleCallbackId);
    }

    const timeoutId = window.setTimeout(preloadWorkspaces, 300);
    return () => window.clearTimeout(timeoutId);
  }, [locked]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleCapabilityBlocked = (event) => {
      const detail = event?.detail || {};
      if (detail.capability !== 'tenant_pos_enabled') return;
      setCapabilityNotice({
        title: String(detail.title || 'POS access changed').trim(),
        message: String(detail.message || 'POS access is disabled for this company.').trim(),
        code: String(detail.code || '').trim()
      });
    };
    window.addEventListener('tenant:capability-blocked', handleCapabilityBlocked);
    return () => window.removeEventListener('tenant:capability-blocked', handleCapabilityBlocked);
  }, []);

  const notificationPanel = notificationsOpen ? createPortal(
    <div className="fixed inset-0 z-[120]" onClick={() => setNotificationsOpen(false)}>
      <div
        className="absolute right-2 top-[3.85rem] w-[21rem] max-w-[calc(100vw-1rem)] lg:right-5 lg:top-[4.1rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute right-4 top-0 z-10 h-5 w-5 -translate-y-[62%] rotate-45 border-l border-t border-blue-200 bg-[#1A4E8D]" />
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
          <div className="bg-gradient-to-r from-[#1A4E8D] to-[#2563EB] px-4 py-3 text-white">
            <p className="text-lg font-black">Notifications</p>
            <p className="mt-0.5 text-xs text-blue-100">Review alerts without leaving the current screen.</p>
          </div>
          <div className="max-h-[22rem] overflow-y-auto bg-[#f8fbff]">
            {notifications.length > 0 ? notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className="flex w-full items-start gap-3 border-b border-slate-200 px-4 py-4 text-left transition hover:bg-white"
              >
                <span className="mt-2 h-3 w-3 shrink-0 rounded-full bg-[#2563EB]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-[#0F172A]">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#64748B]">{item.description}</p>
                  {item.actionLabel ? (
                    <span className="mt-2 inline-flex text-[11px] font-bold uppercase tracking-wide text-[#1A4E8D]">
                      {item.actionLabel}
                    </span>
                  ) : null}
                </div>
              </button>
            )) : (
              <div className="px-4 py-5 text-center">
                <p className="text-sm font-semibold text-[#0F172A]">No notifications</p>
                <p className="mt-1 text-xs text-[#64748B]">New orders and terminal alerts will appear here.</p>
              </div>
            )}
          </div>
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (typeof primaryNotificationAction === 'function') {
                  primaryNotificationAction();
                } else {
                  setNotificationsOpen(false);
                }
              }}
              className="block w-full bg-gradient-to-r from-[#1A4E8D] to-[#2563EB] px-4 py-3 text-center text-sm font-black text-white transition hover:from-[#143F73] hover:to-[#1D4ED8]"
            >
              Show all notifications
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const renderNotificationButton = (className, size) => (
    <div className="relative">
      <button
        type="button"
        className={className}
        onClick={() => setNotificationsOpen((open) => !open)}
        aria-label="Open notifications"
        aria-expanded={notificationsOpen}
      >
        <Bell size={size} />
        {notificationCount > 0 && (
          <span className={size === 20
            ? 'absolute -right-1.5 -top-1.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-red-500 text-[9px] font-black text-white'
            : 'absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-[10px] font-black text-white'}
          >
            {notificationCount}
          </span>
        )}
      </button>
    </div>
  );

  const renderCompanyProfileMenu = (className, mutedEmailClassName) => (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setCompanyMenuOpen((open) => !open)}
        className="flex min-w-0 items-center gap-2 rounded-2xl px-1 py-1 text-left transition hover:bg-slate-100"
        aria-label="Open admin profile menu"
        aria-expanded={companyMenuOpen}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0B449C] text-white">
          <UserRound size={22} className="text-white" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[12px] font-extrabold">{terminalUser?.username || 'Locked'}</span>
          <span className={`block truncate text-[11px] ${mutedEmailClassName}`}>{terminalUser?.email || 'Sign in required'}</span>
        </span>
      </button>
      {companyMenuOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/15">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-extrabold text-[#0F172A]">Admin Profile</p>
            <p className="mt-0.5 text-xs text-[#64748B]">Choose a company to open its POS workspace.</p>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {companyRows.length > 0 ? companyRows.map((company) => {
              const tenantId = String(company?.tenant_id || '').trim();
              const isCurrent = company?.is_current === true || (currentCompanyId && tenantId === currentCompanyId);
              const unavailable = Boolean(companySwitchBlockedReason) || companySwitching || isCurrent || company?.can_switch !== true;
              return (
                <button
                  key={tenantId}
                  type="button"
                  disabled={unavailable}
                  title={isCurrent ? 'Current company' : (companySwitchBlockedReason || '')}
                  onClick={() => onSwitchCompany(tenantId)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left ${unavailable ? 'cursor-not-allowed opacity-60' : 'hover:bg-blue-50'}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-[#0F172A]">{company?.company_name || 'Unnamed company'}</span>
                    <span className="mt-0.5 block truncate text-xs text-[#64748B]">{isCurrent ? 'Current company' : (company?.role || 'Accessible company')}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${isCurrent ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>
                    {isCurrent ? 'Current' : (companySwitching ? 'Switching' : 'Switch')}
                  </span>
                </button>
              );
            }) : (
              <p className="px-3 py-4 text-sm text-[#64748B]">No additional companies are available for this account.</p>
            )}
          </div>
          {companySwitchBlockedReason && (
            <p className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">{companySwitchBlockedReason}</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className={`dgfy-pos-shell h-[100dvh] min-h-screen min-h-[100dvh] overflow-hidden ${shellLayoutClassName}`}>
      {notificationPanel}
      {!effectiveSidebarCollapsed && (
        <div className={`${persistentSidebarClassName} ${lockedSurfaceClassName}`}>
          <Suspense fallback={<div className={persistentSidebarFallbackClassName}>Loading POS navigation...</div>}>
            <TerminalWorkspaceSidebar
              className={persistentSidebarBodyClassName}
              locked={locked}
              isOnline={isOnline}
              isMsmeMode={isMsmeMode}
              terminalUser={terminalUser}
              currentViewMode={posViewMode}
              canViewPos={canViewPos}
              onboardingRestricted={onboardingRestricted}
              allowAdminNavigationWithoutShift={canAdminBypassShiftPrompt}
              canAdjustCashDrawer={canAdjustCashDrawer}
              canCloseDay={canCloseDay}
              shiftState={shiftState}
              incomingOrdersState={incomingOrdersState}
              locationsState={locationsState}
              queueLocationScopeId={queueLocationScopeId}
              queueSummary={queueSummary}
              settingsTargetViewMode={settingsEntryViewMode}
              onSelectViewMode={handleSelectViewMode}
              onPrefetchViewMode={preloadWorkspaceForViewMode}
              onUnlock={() => setDrawerOpen(true)}
              onLock={handleLock}
            />
          </Suspense>
        </div>
      )}
      <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div
        key={locked ? 'terminal-header-locked' : 'terminal-header-unlocked'}
        className={`dgfy-pos-panel dgfy-pos-panel-strong sticky top-0 z-40 shrink-0 border-b border-pos px-4 py-2 sm:px-5 lg:px-7 ${lockedHeaderSurfaceClassName}`}
      >
        <div className={headerShellClassName}>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (locked) return;
                if (isDesktopWide) {
                  setSidebarCollapsed((collapsed) => !collapsed);
                  return;
                }
                setMobileNavOpen(true);
              }}
              disabled={locked}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-[#1A4E8D] ${locked ? 'cursor-not-allowed opacity-45' : 'hover:bg-slate-100'}`}
              aria-label={isDesktopWide ? (effectiveSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar') : 'Open sidebar menu'}
              aria-pressed={isDesktopWide ? effectiveSidebarCollapsed : undefined}
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="min-w-0 truncate text-[18px] font-black tracking-tight text-[#0F172A] lg:text-[22px]">
                {activeHeaderTitle}
              </h1>
              <p className={headerSubtitleClassName}>{headerSubtitle}</p>
            </div>
            </div>
            {renderNotificationButton(compactBellClassName, 20)}
          </div>
          <div className="flex min-w-0 items-center justify-between gap-3 sm:gap-4 lg:justify-end">
          {renderNotificationButton(desktopBellClassName, 24)}
          {renderCompanyProfileMenu(desktopIdentityClassName, 'text-[#64748B]')}
          </div>
        </div>
      </div>

      <IminTerminalFeedback />

      <div
        ref={workspacePaneRef}
        className={`dgfy-pos-scrollbar-hidden flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y ${workspaceDesktopOverflowClassName} ${lockedSurfaceClassName}`}
      >
      {modeChangeNotice && (
        <div className="mx-4 mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-sm font-semibold text-sky-900">
            Business Mode changed. Refresh this terminal view to apply updated POS defaults.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-sky-300 bg-white px-2.5 py-1 text-xs font-semibold text-sky-900"
              onClick={() => window.location.reload()}
            >
              Refresh Terminal
            </button>
            <button
              type="button"
              className="rounded border border-sky-200 px-2.5 py-1 text-xs font-semibold text-sky-900"
              onClick={dismissModeChangeNotice}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {capabilityNotice && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">{capabilityNotice.title}</p>
              <p className="mt-1 text-xs text-amber-800">{capabilityNotice.message}</p>
              {capabilityNotice.code && (
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                  Reason code: {capabilityNotice.code}
                </p>
              )}
            </div>
            <button
              type="button"
              className="rounded border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900"
              onClick={() => setCapabilityNotice(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {!isDesktopWide && mobileNavOpen && (
        <div className={overlayContainerClassName}>
          <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <div className="dgfy-pos-scrollbar-hidden absolute left-0 top-0 h-full w-[82%] max-w-[304px] overflow-y-auto p-3 shadow-2xl shadow-slate-950/20" style={{ background: 'var(--pos-shell-sidebar, #FFFFFF)' }}>
            <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
              <img
                src={DGFY_POS_LOGO}
                alt="DGFY"
                className="h-8 w-auto min-w-0 object-contain"
              />
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#1A4E8D] hover:bg-slate-100"
                aria-label="Close sidebar menu"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
            <Suspense fallback={<div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">Loading menu...</div>}>
              <TerminalWorkspaceSidebar
                className="flex"
                showBrand={false}
                showIdentityInSidebar
                locked={locked}
                isOnline={isOnline}
                isMsmeMode={isMsmeMode}
                terminalUser={terminalUser}
                currentViewMode={posViewMode}
                canViewPos={canViewPos}
                allowAdminNavigationWithoutShift={canAdminBypassShiftPrompt}
                canAdjustCashDrawer={canAdjustCashDrawer}
                canCloseDay={canCloseDay}
                shiftState={shiftState}
                incomingOrdersState={incomingOrdersState}
                locationsState={locationsState}
                queueLocationScopeId={queueLocationScopeId}
                queueSummary={queueSummary}
                settingsTargetViewMode={settingsEntryViewMode}
                onSelectViewMode={handleSelectViewMode}
                onPrefetchViewMode={preloadWorkspaceForViewMode}
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

      <div className={workspaceContentClassName}>
        <div
          id={TERMINAL_SECTION_IDS.checkoutWorkspace}
          className={workspaceSectionClassName}
        >
          {(isCheckoutWorkspaceMode || receiptRequestId !== null || receiptReturnViewMode !== null) && (
            <div key="checkout-workspace" className="min-h-0 catalog-slide-enter xl:h-full">
            <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading POS terminal...</div>}>
              <POSCheckoutTerminal
                sessionLocked={locked}
                isMsmeMode={isMsmeMode}
                sidebarCollapsed={effectiveSidebarCollapsed}
                canViewHistory={canViewPos}
                terminalUser={terminalUser}
                selectedLocationId={operatingLocationId}
                activeShiftId={activeShiftId}
                terminalId={normalizedActiveTerminalId}
                terminalMeta={terminalMeta}
                checkoutBlockedReason={checkoutBlockedReason}
                onManualUniversalSync={onManualUniversalSync}
                manualSyncPolicy={manualSyncPolicy}
                universalPendingSyncCount={queueCount + blockedQueueCount}
                offlineSnapshotScope={offlineSnapshotScope}
                onQueueOfflineItemDraft={onQueueOfflineItemDraft}
                onCheckoutCompleted={handleCheckoutCompleted}
                viewMode={posViewMode}
                onViewModeChange={setPosViewMode}
                modalOnly={!isCheckoutWorkspaceMode}
                externalReceiptTransactionId={receiptRequestId}
                externalHistoryQuery={historyRequestQuery}
                onExternalReceiptHydrated={() => {
                  setReceiptRequestId(null);
                }}
                onExternalReceiptClosed={() => {
                  setIncomingReceiptOpeningId(null);
                  if (receiptReturnViewMode) {
                    setPosViewMode(receiptReturnViewMode);
                    setReceiptReturnViewMode(null);
                  }
                }}
                onExternalHistoryHydrated={() => {
                  setHistoryRequestQuery('');
                }}
                externalCatalogSearch={catalogSearchPrefill}
                onExternalCatalogHydrated={onCatalogSearchHydrated}
              />
            </Suspense>
            </div>
          )}

          {isOperationsWorkspaceMode && (
            <div key="operations-workspace" className="min-w-0 max-w-full catalog-slide-enter">
            <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading operations workspace...</div>}>
              <TerminalOperationsWorkspace
                viewMode={posViewMode}
                workflowMode={workflowMode}
                isMsmeMode={isMsmeMode}
                terminalUser={terminalUser}
                activeTerminalId={normalizedActiveTerminalId}
                locked={locked}
                terminalMeta={terminalMeta}
                shiftState={shiftState}
                todayDashboard={todayDashboard}
                reportRefreshKey={reportRefreshKey}
                canViewPos={canViewPos}
                canCreateItems={canCreateItems}
                canEditItems={canEditItems}
                canDeleteItems={canDeleteItems}
                itemsStockFilterPreset={itemsStockFilterPreset}
                onItemsStockFilterPresetApplied={onItemsStockFilterPresetApplied}
                canTransactPos={canTransactPos}
                canAdminBypassShiftPrompt={canAdminBypassShiftPrompt}
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
                canSwitchPosLocation={canSwitchPosLocation}
                handleSwitchShiftLocation={handleSwitchShiftLocation}
                handleRecordCashEvent={handleRecordCashEvent}
                handleCloseShift={handleCloseShift}
                refreshOperationalContext={refreshOperationalContext}
                locationsState={locationsState}
                operatingLocationId={operatingLocationId}
                setOperatingLocationId={setOperatingLocationId}
                queueLocationScopeId={queueLocationScopeId}
                setQueueLocationScopeId={setQueueLocationScopeId}
                incomingOrdersState={incomingOrdersState}
                onlineOrderSoundEnabled={onlineOrderSoundEnabled}
                incomingOrderActionState={incomingOrderActionState}
                handleIncomingOrderStatusChange={handleIncomingOrderStatusChange}
                handleOpenCashCollection={handleOpenCashCollection}
                handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
                incomingReceiptOpeningId={incomingReceiptOpeningId}
                refreshIncomingOrders={refreshIncomingOrders}
                queueStatusFilter={queueStatusFilter}
                setQueueStatusFilter={setQueueStatusFilter}
                queueSummary={queueSummary}
                replayingQueuedTerminalOperations={replayingQueuedTerminalOperations}
                handleReplayQueuedTerminalOperations={handleReplayQueuedTerminalOperations}
                handleRetryQueuedOperation={handleRetryQueuedOperation}
                handleResolveQueuedOperation={handleResolveQueuedOperation}
                isOnline={isOnline}
                offlineSnapshotScope={offlineSnapshotScope}
                handleLock={handleLock}
                setDrawerOpen={setDrawerOpen}
                refreshTerminalUser={refreshTerminalUser}
                refreshTerminalMeta={refreshTerminalMeta}
                onPosSetupSaved={onPosSetupSaved}
                onStorefrontSetupSaved={onStorefrontSetupSaved}
                setOnlineOrderSoundEnabled={setOnlineOrderSoundEnabled}
                sectionIds={TERMINAL_SECTION_IDS}
              />
            </Suspense>
            </div>
          )}
        </div>
      </div>
      </div>

      <Suspense fallback={null}>
        <TerminalLockDrawer
          drawerOpen={drawerOpen && !terminalUnlockModalOpen}
          formData={formData}
          setFormData={setFormData}
          dgfyPosState={dgfyPosState}
          emailCompanyLookup={emailCompanyLookup}
          terminalIdOptions={terminalIdOptions}
          terminalRegistry={terminalRegistry}
          terminalRegistryMode={terminalRegistryMode}
          registryEnforced={registryEnforced}
          submitting={submitting}
          onSubmit={handleLogin}
          onIdentityChange={handleIdentityChange}
          onUseDifferentAccount={handleUseDifferentAccount}
          onLegacySubmit={handleLegacyLogin}
        />
      </Suspense>
      </main>
    </div>
  );
}

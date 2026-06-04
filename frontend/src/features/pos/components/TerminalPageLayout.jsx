import React, { Suspense, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Menu, UserRound, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import POSCheckoutTerminal from './POSCheckoutTerminal.jsx';
import TerminalLockDrawer from './TerminalLockDrawer.jsx';
import TerminalWorkspaceSidebar from './TerminalWorkspaceSidebar.jsx';
import TerminalOperationsWorkspace from './TerminalOperationsWorkspace.jsx';
const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';

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
    canAdjustCashDrawer,
    canCloseDay,
    terminalUser,
    posViewMode,
    isMsmeMode = false,
    shiftState,
    incomingOrdersState,
    locationsState,
    operatingLocationId,
    queueLocationScopeId,
    handleSelectViewMode,
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
    handleOpenIncomingOrderReceipt,
    handleOpenIncomingOrderHistory,
    incomingReceiptOpeningId,
    incomingHistoryOpeningId,
    refreshIncomingOrders,
    activeShiftId,
    checkoutBlockedReason,
    complianceBlockerDetails,
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
    setIncomingReceiptOpeningId,
    historyRequestQuery,
    setHistoryRequestQuery,
    setIncomingHistoryOpeningId,
    catalogSearchPrefill,
    onCatalogSearchHydrated,
    drawerOpen,
    formData,
    setFormData,
    submitting,
    handleLogin
}) {
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const queueCount = Number(queuedTerminalOperationCount || 0);
  const blockedQueueCount = Number(queuedTerminalBlockedCount || 0);
  const queueTotalCount = Number(queueSummary?.total || queueCount + blockedQueueCount);
  const complianceBlocked = Boolean(complianceBlockerDetails);
  const incomingOrders = Array.isArray(incomingOrdersState?.orders) ? incomingOrdersState.orders : [];
  const notificationCount = incomingOrders.length + (queueTotalCount > 0 ? 1 : 0) + (complianceBlocked ? 1 : 0);
  const normalizedActiveTerminalId = String(activeTerminalId || '').trim();
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
    if (queueTotalCount > 0) {
      items.push({
        id: 'sync-queue',
        title: `${queueTotalCount} queued terminal operation${queueTotalCount === 1 ? '' : 's'}`,
        description: blockedQueueCount > 0
          ? `${blockedQueueCount} need manual resolution in Sync Queue.`
          : 'Review or replay queued terminal operations.',
        actionLabel: 'Open Sync Queue',
        onClick: () => {
          setNotificationsOpen(false);
          handleSelectViewMode('sync_queue');
        }
      });
    }
    if (complianceBlocked) {
      items.push({
        id: 'compliance-blocked',
        title: complianceBlockerDetails?.title || 'Compliance action required',
        description: complianceBlockerDetails?.message || 'Resolve the compliance blocker before checkout.',
        actionLabel: complianceBlockerDetails?.actionHref ? 'Open Compliance' : '',
        onClick: () => {
          setNotificationsOpen(false);
          if (complianceBlockerDetails?.actionHref) {
            navigate(complianceBlockerDetails.actionHref);
          }
        }
      });
    }
    return items;
  }, [
    blockedQueueCount,
    complianceBlocked,
    complianceBlockerDetails,
    handleSelectViewMode,
    incomingOrders.length,
    navigate,
    queueTotalCount
  ]);
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
    ? 'flex min-h-[44px] flex-col gap-1.5 lg:grid lg:min-h-[56px] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-2.5'
    : 'grid min-h-[56px] grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center';
  const headerSubtitleClassName = IS_DGFY_POS_SURFACE
    ? 'mt-0.5 hidden max-w-3xl text-[12px] leading-4 text-[#334155] lg:block'
    : 'mt-0.5 hidden max-w-3xl text-[12px] leading-4 text-[#334155] md:block';
  const offlineMessageClassName = IS_DGFY_POS_SURFACE
    ? 'mt-2 hidden text-sm font-semibold text-amber-700 lg:block'
    : 'mt-2 hidden text-sm font-semibold text-amber-700 md:block';
  const compactBellClassName = IS_DGFY_POS_SURFACE
    ? 'relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#1A4E8D] hover:bg-slate-100 lg:hidden'
    : 'hidden';
  const compactIdentityClassName = IS_DGFY_POS_SURFACE
    ? 'hidden'
    : 'hidden';
  const desktopBellClassName = IS_DGFY_POS_SURFACE
    ? 'relative hidden h-10 w-10 shrink-0 place-items-center rounded-lg text-[#1A4E8D] hover:bg-slate-100 lg:grid'
    : 'relative grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#1A4E8D] hover:bg-slate-100';
  const desktopIdentityClassName = IS_DGFY_POS_SURFACE
    ? 'hidden min-w-0 shrink-0 items-center gap-2.5 lg:flex'
    : 'flex min-w-0 shrink-0 items-center gap-2.5';
  const overlayContainerClassName = IS_DGFY_POS_SURFACE
    ? 'fixed inset-0 z-50 lg:hidden'
    : 'fixed inset-0 z-50 xl:hidden';
  const notificationPanel = notificationsOpen ? createPortal(
    <div className="fixed inset-0 z-[120]" onClick={() => setNotificationsOpen(false)}>
      <div
        className="absolute right-4 top-[4.5rem] w-[20rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15 lg:right-7 lg:top-[4.75rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-extrabold text-[#0F172A]">Notifications</p>
          <p className="mt-0.5 text-xs text-[#64748B]">Review alerts without leaving the current screen.</p>
        </div>
        <div className="max-h-[22rem] overflow-y-auto">
          {notifications.length > 0 ? notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <p className="text-sm font-bold text-[#0F172A]">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-[#64748B]">{item.description}</p>
              {item.actionLabel ? (
                <span className="mt-2 inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#1A4E8D]">
                  {item.actionLabel}
                </span>
              ) : null}
            </button>
          )) : (
            <div className="px-4 py-5 text-center">
              <p className="text-sm font-semibold text-[#0F172A]">No notifications</p>
              <p className="mt-1 text-xs text-[#64748B]">New orders and terminal alerts will appear here.</p>
            </div>
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

    return (
        <div className={`dgfy-pos-shell h-[100dvh] min-h-screen min-h-[100dvh] overflow-hidden bg-[#F1F5F9] text-[#0F172A] ${shellLayoutClassName}`}>
            {notificationPanel}
            {!effectiveSidebarCollapsed && (
            <div className={persistentSidebarClassName}>
                <Suspense fallback={<div className={persistentSidebarFallbackClassName}>Loading POS navigation...</div>}>
                    <TerminalWorkspaceSidebar
                        className={persistentSidebarBodyClassName}
                        showScrollZoneBadge
                        locked={locked}
                        isMsmeMode={isMsmeMode}
                        terminalUser={terminalUser}
                        currentViewMode={posViewMode}
                        canViewPos={canViewPos}
                        canAdjustCashDrawer={canAdjustCashDrawer}
                        canCloseDay={canCloseDay}
                        shiftState={shiftState}
                        incomingOrdersState={incomingOrdersState}
                        locationsState={locationsState}
                        queueLocationScopeId={queueLocationScopeId}
                        queueSummary={queueSummary}
                        onSelectViewMode={handleSelectViewMode}
                        onUnlock={() => setDrawerOpen(true)}
                        onLock={handleLock}
                    />
                </Suspense>
            </div>
            )}
            <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur sm:px-5 lg:px-7">
                <div className={headerShellClassName}>
                    <div className="flex min-w-0 items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                if (isDesktopWide) {
                                    setSidebarCollapsed((collapsed) => !collapsed);
                                    return;
                                }
                                setMobileNavOpen(true);
                            }}
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#1A4E8D] hover:bg-slate-100"
                            aria-label={isDesktopWide ? (effectiveSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar') : 'Open sidebar menu'}
                            aria-pressed={isDesktopWide ? effectiveSidebarCollapsed : undefined}
                        >
                            <Menu className="h-6 w-6" />
                        </button>
                        <div className="min-w-0 flex-1">
                        <h1 className={IS_DGFY_POS_SURFACE ? 'truncate text-base font-black tracking-tight text-[#0F172A] sm:text-[18px] lg:text-lg' : 'truncate text-lg font-black tracking-tight text-[#0F172A] sm:text-[22px]'}>DGFY Terminal Workspace</h1>
                        <p className={headerSubtitleClassName}>{headerSubtitle}</p>
                        {!isOnline && (
                            <p className={offlineMessageClassName}>
                                You are offline. Online queue refresh and online-order actions are paused until connection is restored.
                            </p>
                        )}
                        </div>
                        </div>
                        {renderNotificationButton(compactBellClassName, 20)}
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-3 sm:gap-4 lg:justify-end">
                    <div className={compactIdentityClassName}>
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0B449C] text-white">
                            <UserRound size={25} className="text-white" />
                        </div>
                        <div className="min-w-0 leading-tight">
                            <div className="truncate text-[13px] font-extrabold">{terminalUser?.username || 'Locked'}</div>
                            <div className="truncate text-[11px] text-[#64748B]">{terminalUser?.email || 'Sign in required'}</div>
                        </div>
                    </div>
                    {renderNotificationButton(desktopBellClassName, 24)}
                    <div className={desktopIdentityClassName}>
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0B449C] text-white">
                            <UserRound size={25} className="text-white" />
                        </div>
                        <div className="min-w-0 leading-tight">
                            <div className="truncate text-[13px] font-extrabold">{terminalUser?.username || 'Locked'}</div>
                            <div className="truncate text-[11px] text-[#64748B]">{terminalUser?.email || 'Sign in required'}</div>
                            <div className="truncate text-[11px] text-[#64748B]">
                                Terminal: <span className="font-semibold text-slate-900">{normalizedActiveTerminalId || 'Not selected'}</span>
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
            </div>

            <div
                ref={workspacePaneRef}
                className={`dgfy-pos-scrollbar-hidden flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y xl:overflow-y-auto xl:overscroll-contain xl:overscroll-y-contain xl:touch-pan-y ${locked ? 'pointer-events-none select-none opacity-90 blur-[1px]' : ''}`}
            >
            {modeChangeNotice && (
                <div className="mx-4 mt-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
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

            {complianceBlockerDetails && (
                <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm font-semibold text-amber-900">{complianceBlockerDetails.title}</p>
                    <p className="mt-1 text-xs text-amber-800">{complianceBlockerDetails.message}</p>
                    {complianceBlockerDetails.reasonCode && (
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                            Reason code: {complianceBlockerDetails.reasonCode}
                        </p>
                    )}
                    {Array.isArray(complianceBlockerDetails.blockers) && complianceBlockerDetails.blockers.length > 0 && (
                        <ul className="mt-2 space-y-2 text-xs text-amber-800">
                            {complianceBlockerDetails.blockers.slice(0, 3).map((blocker) => (
                                <li key={`${blocker.code}-${blocker.section}`} className="rounded-md border border-amber-200 bg-white/70 px-2 py-1.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="font-semibold text-amber-900">
                                            {blocker.label || blocker.code}
                                        </p>
                                        {blocker.action_target && (
                                            <button
                                                type="button"
                                                className="rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900"
                                                onClick={() => navigate(blocker.action_target)}
                                            >
                                                Fix now
                                            </button>
                                        )}
                                    </div>
                                    <p className="mt-1">{blocker.message}</p>
                                    {blocker.code && (
                                        <p className="mt-1 text-[11px] uppercase tracking-wide text-amber-900/80">{blocker.code}</p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    {Number(complianceBlockerDetails.missingRequirementCount) > 0 && (
                        <p className="mt-2 text-xs font-semibold text-amber-900">
                            Missing requirements: {complianceBlockerDetails.missingRequirementCount}
                        </p>
                    )}
                    {complianceBlockerDetails.actionHref && (
                        <button
                            type="button"
                            className="mt-2 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900"
                            onClick={() => navigate(complianceBlockerDetails.actionHref)}
                        >
                            {complianceBlockerDetails.actionLabel || 'Open compliance settings'}
                        </button>
                    )}
                </div>
            )}

            {(Number(queueTotalCount) > 0 || replayingQueuedTerminalOperations) && (
                <div className="mx-4 mt-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <p className="text-sm font-semibold text-sky-900">
                                Offline operation queue: {queueCount} pending
                                {blockedQueueCount > 0 ? ` / ${blockedQueueCount} manual-resolution` : ''}
                            </p>
                            <p className="mt-1 text-xs text-sky-800">
                                Use Sync Queue to review errors, retry blocked intents, and mark resolved outcomes.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="rounded-md border border-sky-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-900"
                                onClick={() => handleSelectViewMode('sync_queue')}
                            >
                                Open Sync Queue
                            </button>
                            <button
                                type="button"
                                className="rounded-md border border-sky-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => handleReplayQueuedTerminalOperations({ toastIfEmpty: true })}
                                disabled={replayingQueuedTerminalOperations || !isOnline}
                            >
                                {replayingQueuedTerminalOperations ? 'Replaying...' : 'Replay queued operations'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!isDesktopWide && mobileNavOpen && (
                <div className={overlayContainerClassName}>
                    <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
                    <div className="dgfy-pos-scrollbar-hidden absolute left-0 top-0 h-full w-[82%] max-w-[304px] overflow-y-auto bg-white p-3 shadow-2xl shadow-slate-950/30">
                        <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
                            <img
                                src="/dgfy-horizontal_logo-removebg-preview.png"
                                alt="DGFY"
                                className="h-8 w-auto min-w-0 object-contain"
                            />
                            <button
                                type="button"
                                onClick={() => setMobileNavOpen(false)}
                                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#1A4E8D] hover:bg-slate-100"
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
                                showScrollZoneBadge={false}
                                locked={locked}
                                isMsmeMode={isMsmeMode}
                                terminalUser={terminalUser}
                                currentViewMode={posViewMode}
                                canViewPos={canViewPos}
                                canAdjustCashDrawer={canAdjustCashDrawer}
                                canCloseDay={canCloseDay}
                                shiftState={shiftState}
                                incomingOrdersState={incomingOrdersState}
                                locationsState={locationsState}
                                queueLocationScopeId={queueLocationScopeId}
                                queueSummary={queueSummary}
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

            <div className="grid grid-cols-1 gap-4 p-4 xl:flex-1 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)]">
                <div
                    id={TERMINAL_SECTION_IDS.checkoutWorkspace}
                    className="transition"
                >
                    {isCheckoutWorkspaceMode && (
                        <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading POS terminal...</div>}>
                            <POSCheckoutTerminal
                                sessionLocked={locked}
                                isMsmeMode={isMsmeMode}
                                sidebarCollapsed={effectiveSidebarCollapsed}
                                canViewHistory={canViewPos}
                                queueReplayManagedExternally
                                selectedLocationId={operatingLocationId}
                                activeShiftId={activeShiftId}
                                terminalId={activeTerminalId}
                                terminalMeta={terminalMeta}
                                checkoutBlockedReason={checkoutBlockedReason}
                                complianceBlockerDetails={complianceBlockerDetails}
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
                                externalCatalogSearch={catalogSearchPrefill}
                                onExternalCatalogHydrated={onCatalogSearchHydrated}
                            />
                        </Suspense>
                    )}

                    {isOperationsWorkspaceMode && (
                        <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading operations workspace...</div>}>
                            <TerminalOperationsWorkspace
                                viewMode={posViewMode}
                                isMsmeMode={isMsmeMode}
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
                                incomingOrderActionState={incomingOrderActionState}
                                handleIncomingOrderStatusChange={handleIncomingOrderStatusChange}
                                handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
                                handleOpenIncomingOrderHistory={handleOpenIncomingOrderHistory}
                                incomingReceiptOpeningId={incomingReceiptOpeningId}
                                incomingHistoryOpeningId={incomingHistoryOpeningId}
                                refreshIncomingOrders={refreshIncomingOrders}
                                queuedTerminalOperations={queuedTerminalOperations}
                                queueStatusFilter={queueStatusFilter}
                                setQueueStatusFilter={setQueueStatusFilter}
                                queueSummary={queueSummary}
                                replayingQueuedTerminalOperations={replayingQueuedTerminalOperations}
                                handleReplayQueuedTerminalOperations={handleReplayQueuedTerminalOperations}
                                handleRetryQueuedOperation={handleRetryQueuedOperation}
                                handleResolveQueuedOperation={handleResolveQueuedOperation}
                                isOnline={isOnline}
                                handleLock={handleLock}
                                setDrawerOpen={setDrawerOpen}
                                sectionIds={TERMINAL_SECTION_IDS}
                            />
                        </Suspense>
                    )}
                </div>
            </div>
            </div>

            {locked && <div className="fixed inset-0 bg-slate-900/20 pointer-events-none" />}

            <Suspense fallback={null}>
                <TerminalLockDrawer
                    drawerOpen={drawerOpen}
                    formData={formData}
                    setFormData={setFormData}
                    terminalIdOptions={terminalIdOptions}
                    terminalRegistry={terminalRegistry}
                    terminalRegistryMode={terminalRegistryMode}
                    registryEnforced={registryEnforced}
                    submitting={submitting}
                    onSubmit={handleLogin}
                />
            </Suspense>
            </main>
        </div>
    );
}

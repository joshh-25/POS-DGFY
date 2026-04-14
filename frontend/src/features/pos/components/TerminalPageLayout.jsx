import React, { Suspense, lazy } from 'react';
import { Menu, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const POSCheckoutTerminal = lazy(() => import('./POSCheckoutTerminal'));
const TerminalSidebarPanel = lazy(() => import('./TerminalSidebarPanel'));
const TerminalLockDrawer = lazy(() => import('./TerminalLockDrawer'));
const TerminalWorkspaceSidebar = lazy(() => import('./TerminalWorkspaceSidebar'));
const TerminalOperationsWorkspace = lazy(() => import('./TerminalOperationsWorkspace'));

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
    selectedLocationId,
    handleSelectViewMode,
    handleLock,
    setDrawerOpen,
    effectiveSidebarCollapsed,
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
    handleRecordCashEvent,
    handleCloseShift,
    refreshOperationalContext,
    setSelectedLocationId,
    incomingOrderActionState,
    handleIncomingOrderStatusChange,
    handleOpenIncomingOrderReceipt,
    handleOpenIncomingOrderHistory,
    incomingReceiptOpeningId,
    incomingHistoryOpeningId,
    refreshIncomingOrders,
    setSidebarCollapsed,
    activeShiftId,
    checkoutBlockedReason,
    complianceBlockerDetails,
    queuedTerminalOperationCount,
    replayingQueuedTerminalOperations,
    handleReplayQueuedTerminalOperations,
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
  const queueCount = Number(queuedTerminalOperationCount || 0);
  const shiftOpen = Boolean(activeShiftId);
  const complianceBlocked = Boolean(complianceBlockerDetails);
  const statusRailItems = [
    {
      label: 'Connectivity',
      value: isOnline ? 'Online' : 'Offline',
      tone: isOnline ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
    },
    {
      label: 'Queued Ops',
      value: replayingQueuedTerminalOperations ? `Replaying (${queueCount})` : `${queueCount}`,
      tone: queueCount > 0 ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-slate-200 bg-slate-50 text-slate-700'
    },
    {
      label: 'Shift',
      value: shiftOpen ? `Open #${activeShiftId}` : 'Closed',
      tone: shiftOpen ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-700'
    },
    {
      label: 'Terminal Policy',
      value: registryEnforced ? 'Enforce' : 'Warn',
      tone: registryEnforced ? 'border-indigo-200 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-slate-50 text-slate-700'
    },
    {
      label: 'Compliance',
      value: complianceBlocked
        ? `${complianceBlockerDetails?.reasonCode || 'BLOCKED'}`
        : 'Cleared',
      tone: complianceBlocked ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
    }
  ];

    return (
        <div className="min-h-screen min-h-[100dvh] bg-slate-100 flex flex-col">
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

            <div className="mx-4 mt-3 grid grid-cols-2 gap-2 xl:grid-cols-5">
                {statusRailItems.map((item) => (
                    <div key={item.label} className={`rounded-lg border px-3 py-2 ${item.tone}`}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide">{item.label}</p>
                        <p className="mt-1 text-sm font-semibold">{item.value}</p>
                    </div>
                ))}
            </div>
            <div className="mx-4 mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                Terminal identity: <span className="font-semibold text-slate-900">{activeTerminalId || 'Select on unlock'}</span>
                <span className="ml-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    {isMsmeMode ? 'MSME Mode' : 'Manufacturing Mode'}
                </span>
                {complianceBlocked && complianceBlockerDetails?.actionHref && (
                    <button
                        type="button"
                        className="ml-2 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-900"
                        onClick={() => navigate(complianceBlockerDetails.actionHref)}
                    >
                        Fix now
                    </button>
                )}
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

            {(Number(queuedTerminalOperationCount) > 0 || replayingQueuedTerminalOperations) && (
                <div className="mx-4 mt-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <p className="text-sm font-semibold text-sky-900">
                                Offline operation queue: {queuedTerminalOperationCount}
                            </p>
                            <p className="mt-1 text-xs text-sky-800">
                                Shift and online-order actions captured while offline are safely replayed with idempotency keys.
                            </p>
                        </div>
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
            )}

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
                                isMsmeMode={isMsmeMode}
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

            <div
                className={`grid grid-cols-1 gap-4 p-4 xl:flex-1 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)] ${
                    effectiveSidebarCollapsed
                        ? '2xl:grid-cols-[260px_minmax(0,1fr)_72px]'
                        : '2xl:grid-cols-[260px_minmax(0,1fr)_360px]'
                }`}
            >
                <div className="hidden xl:flex xl:min-h-0 xl:overflow-hidden">
                    <Suspense fallback={<div className="hidden xl:block rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading POS navigation...</div>}>
                        <TerminalWorkspaceSidebar
                            className="hidden xl:flex xl:h-full xl:w-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain"
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
                                isMsmeMode={isMsmeMode}
                                layoutContext="embedded"
                                canViewHistory={canViewPos}
                                activeShiftId={activeShiftId}
                                terminalId={activeTerminalId}
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
                        <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading operations workspace...</div>}>
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

                <div className="xl:min-h-0 xl:overflow-hidden xl:col-span-2 2xl:col-span-1">
                    <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading terminal controls...</div>}>
                        <TerminalSidebarPanel
                            className="flex xl:h-full xl:min-h-0"
                            isCollapsed={effectiveSidebarCollapsed}
                            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
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
                    terminalIdOptions={terminalIdOptions}
                    terminalRegistry={terminalRegistry}
                    terminalRegistryMode={terminalRegistryMode}
                    registryEnforced={registryEnforced}
                    submitting={submitting}
                    onSubmit={handleLogin}
                />
            </Suspense>
        </div>
    );
}

import React, { Suspense, lazy } from 'react';
import { Menu, X } from 'lucide-react';

const POSCheckoutTerminal = lazy(() => import('./POSCheckoutTerminal'));
const TerminalSidebarPanel = lazy(() => import('./TerminalSidebarPanel'));
const TerminalLockDrawer = lazy(() => import('./TerminalLockDrawer'));
const TerminalWorkspaceSidebar = lazy(() => import('./TerminalWorkspaceSidebar'));
const TerminalOperationsWorkspace = lazy(() => import('./TerminalOperationsWorkspace'));

export default function TerminalPageLayout({
    locked,
    isOnline,
    headerSubtitle,
    mobileNavOpen,
    setMobileNavOpen,
    isDesktopWide,
    canViewPos,
    canAdjustCashDrawer,
    canCloseDay,
    terminalUser,
    posViewMode,
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
    handleCheckoutCompleted,
    setPosViewMode,
    receiptRequestId,
    setReceiptRequestId,
    setIncomingReceiptOpeningId,
    historyRequestQuery,
    setHistoryRequestQuery,
    setIncomingHistoryOpeningId,
    drawerOpen,
    formData,
    setFormData,
    submitting,
    handleLogin
}) {
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

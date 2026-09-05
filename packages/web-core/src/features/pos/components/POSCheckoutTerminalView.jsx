import React, { Suspense } from 'react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import { createPortal } from 'react-dom';
import {
    AlertCircle,
    CarTaxiFront,
    ChevronLeft,
    ChevronRight,
    Delete,
    Folder,
    Lock,
    Minus,
    Plus,
    Percent,
    Printer,
    Search,
    X,
    Eye,
    Trash2,
    LayoutGrid
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CATALOG_GRID_GAP_PX } from '../hooks/usePosCatalogWorkflow.js';
import { QTY_METER_MAX_QTY, QTY_METER_MIN_QTY } from '../hooks/usePosCartWorkflow.js';
import { clearPosCartDraft } from '../services/posCartDraftStore.js';
import { getCatalogStockColorClassName, isServiceCatalogItem } from '../utils/posCatalogAvailability.js';
import { formatParkedSaleDisplayName } from '../utils/posParkedSaleDisplay.js';
import { allowsDecimalQuantity } from '@/src/utils/uomConverter.js';
import { advanceAssetImageFallback } from '@/src/utils/assetUrl.js';
import { ResponsiveImage } from '@/src/components/media/ResponsiveImage.jsx';
import { formatQuantity, getCartLineSubtotal, getLineKey, money, resolvePosCatalogImageSources, sanitizeQuantityInput, VAT_TYPE_LABEL } from '../utils/posCheckoutTerminalUtils.js';
import POSCheckoutConfirmDialog from './POSCheckoutConfirmDialog.jsx';
import { POSCheckoutTerminalReceiptDialogs } from './POSCheckoutTerminalReceiptDialogs.jsx';

const OrderPreviewView = lazyWithChunkRetry(() => import('./OrderPreviewView.jsx'));
const ServiceOptionsModal = lazyWithChunkRetry(() => import('./ServiceOptionsModal.jsx').then(({ ServiceOptionsModal: Component }) => ({ default: Component })));
const POSParkedSalesDialog = lazyWithChunkRetry(() => import('./POSParkedSalesDialog.jsx'));
const POSSplitPaymentWorkflow = lazyWithChunkRetry(() => import('./POSSplitPaymentWorkflow.jsx'));
const ItemOptionsDialog = lazyWithChunkRetry(() => import('./ItemOptionsDialog.jsx'));
const BillRequestDialog = lazyWithChunkRetry(() => import('./BillRequestDialog.jsx'));
const PosAddToCartToastContainer = lazyWithChunkRetry(() => import('./PosAddToCartToastContainer.jsx').then(({ PosAddToCartToastContainer: Component }) => ({ default: Component })));
const PosCurrentSaleActions = lazyWithChunkRetry(() => import('./PosCurrentSaleActions.jsx').then(({ PosCurrentSaleActions: Component }) => ({ default: Component })));
const POSBarcodeScanner = lazyWithChunkRetry(() => import('./POSBarcodeScanner.jsx'));
const POSTransactionHistoryPanel = lazyWithChunkRetry(() => import('./POSTransactionHistoryPanel.jsx'));
const POSDiscountWorkspace = lazyWithChunkRetry(() => import('./POSDiscountWorkspace.jsx'));

const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';
const CatalogItemBadges = ({ isServiceItem = false, isAlwaysAvailable = false, isBestSeller = false, overlay = false }) => {
    if (!isServiceItem && !isAlwaysAvailable && !isBestSeller) return null;
    const sharedClassName = overlay ? 'border-white/30 bg-slate-950/55 text-white' : 'border-blue-200 bg-blue-50 text-[#1A4E8D]';
    const bestSellerClassName = overlay ? 'border-amber-200/70 bg-amber-500/85 text-white' : 'border-amber-200 bg-amber-50 text-amber-700';
    return (
        <div data-pos-catalog-badges="true" className="flex min-w-0 flex-wrap items-center gap-1">
            {isServiceItem && <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${sharedClassName}`}>Service</span>}
            {isAlwaysAvailable && <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${sharedClassName}`}>Always available</span>}
            {isBestSeller && <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${bestSellerClassName}`}>Best seller</span>}
        </div>
    );
};

const renderViewModeControls = ({ sectionTitle = '', action = null } = {}) => {
    if (!sectionTitle && !action) return null;
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
                {sectionTitle && <h2 className="min-w-0 text-[22px] font-black tracking-tight text-[#0F172A]">{sectionTitle}</h2>}
                {action}
            </div>
            {sectionTitle && <p className="text-[13px] leading-5 text-[#334155]">Tap an item card to add it to the current cart.</p>}
        </div>
    );
};

export default function POSCheckoutTerminalView({ viewModel = {} }) {
    const {
        activeParkedSale,
        activeShiftId,
        addCatalogItemToCart,
        addToCart,
        addToCartToasts,
        adjustCartQuantity,
        affiliateCodeInput,
        appliedDiscount,
        availableCategories,
        billRequestDraft,
        bindingReadinessLabel,
        calculatedDiscountAmount,
        canViewHistory,
        canVoidTransactions,
        cartSubtotal,
        cartTotal,
        cartTotalQuantity,
        catalogCapacityViewportRef,
        catalogCardClassName,
        catalogCardImageWrapClassName,
        catalogError,
        catalogForDisplay,
        catalogGridClassName,
        catalogGridLayout,
        catalogGridRef,
        catalogImageErrors,
        catalogLoading,
        catalogPage,
        catalogPageSize,
        catalogPaneHeightClassName,
        catalogRefreshing,
        catalogSectionRef,
        catalogSwipePointerIdRef,
        catalogSwipeStartXRef,
        catalogViewportClassName,
        catalogViewportRef,
        checkoutBlockedReason,
        checkoutGridClassName,
        checkoutLoading,
        checkoutPaneClassName,
        clearSaleConfirmOpen,
        closeDiscountModal,
        closeReceiptPreviewModal,
        commitManualCartQuantity,
        confirmClearCurrentSale,
        currentSaleBodyClassName,
        currentSaleHelpOpen,
        currentSaleItemsListClassName,
        currentSalePaneHeightClassName,
        currentViewMode,
        handleClearSaleDialogOpenChange,
        pendingViewModeAfterSaleClear,
        discountModalOpen,
        drawerAdminBypass,
        drawerAuthorizationModalOpen,
        drawerAuthorizationPin,
        drawerAuthorizationReason,
        drawerAuthorizationSubmitting,
        drawerOpening,
        editingQuantityItemId,
        flyImageToCheckoutBar,
        folderButtonClassName,
        folderStripRef,
        globalDiscountAmount,
        governedDiscountTotals,
        handleCartQtyButtonPointerCancel,
        handleCartQtyButtonPointerDown,
        handleCartQtyButtonPointerMove,
        handleCartQtyButtonPointerUp,
        handleCatalogPageChange,
        handleCatalogSwipeEnd,
        handleCatalogSwipeStart,
        handleCompletePreparedSplitPayment,
        handleConfirmServiceOptions,
        handleDismissToast,
        handleFolderStripClickCapture,
        handleFolderStripPointerDown,
        handleFolderStripPointerEnd,
        handleFolderStripPointerMove,
        handleFolderStripWheel,
        handleKeepSplitPaymentAndClose,
        handleManualUniversalSync,
        handleOpenDrawer,
        handleParkAndNewSale,
        handleParkedSaleClaimed,
        handlePrintOrder,
        handlePrintReceipt,
        handleQtyButtonPointerCancel,
        handleQtyButtonPointerDown,
        handleQtyButtonPointerMove,
        handleQtyButtonPointerUp,
        handleReverseSplitPaymentAndStartNew,
        handleSplitPaymentOpenChange,
        handleSplitPaymentSessionStateChange,
        handleVoidHistoryTransaction,
        historyRefundWorkflow,
        headerParkedSalesHistorySlot,
        historyCashierName,
        historyDateFrom,
        historyDateTo,
        historyDetailLoading,
        historyLoading,
        historyOrderMethod,
        historyOrderSource,
        historyPage,
        historyPaymentType,
        historySearch,
        historyStatus,
        imagePreview,
        isEmployeeCreditPayment,
        isMsmeMode,
        isOrderPrinterAvailable,
        isPrinterAvailable,
        isTabletViewport,
        itemDiscountTotals,
        itemOptionsGlobalDiscount,
        itemOptionsLine,
        itemOptionsLineKey,
        lastReceipt,
        lastReceiptContract,
        lastReceiptPendingSync,
        loadHistory,
        loadPosFolders,
        lowStockDisplayThreshold,
        manualSyncPolicy,
        mobileCheckoutPanelOpen,
        mobileSearchExpanded,
        modalOnly,
        netItemsTotal,
        normalizedTerminalId,
        notifyPosActionBlocked,
        offlineSnapshotScope,
        openCheckoutConfirmModal,
        openClearCurrentSale,
        openHistoryDetail,
        openParkSaleNameDialog,
        openParkedSalesHistory,
        openSplitPaymentModal,
        parkLoading,
        parkSaleNameDialogOpen,
        parkSaleNameInput,
        parkedSalesDialogOpen,
        posActionsBlocked,
        posFoldersError,
        posFoldersLoading,
        posHardware,
        posPresentationBundle,
        qtyMeterState,
        quantityInputValue,
        queuedCheckoutBlockedCount,
        queuedCheckoutPendingCount,
        receiptPaperWidth,
        receiptPreviewModalOpen,
        receiptPreviewSource,
        receiptPrinting,
        receiptSettings,
        removeCartLine,
        replayingQueuedCheckouts,
        resetCurrentSaleForNewSale,
        safeCart,
        safeCatalog,
        saveItemOptions,
        search,
        selectedDiscount,
        selectedFolderId,
        selectedLocationId,
        serviceOptionsLoadingItemId,
        serviceOptionsModal,
        sessionLocked,
        setActiveParkedSale,
        setAffiliateCodeInput,
        setBillRequestDraft,
        setCatalogImageErrors,
        setCurrentSaleHelpOpen,
        setCurrentViewMode,
        setDiscountModalOpen,
        setDrawerAuthorizationModalOpen,
        setDrawerAuthorizationPin,
        setDrawerAuthorizationReason,
        setEditingQuantityItemId,
        setHistoryCashierName,
        setHistoryDateFrom,
        setHistoryDateTo,
        setHistoryOrderMethod,
        setHistoryOrderSource,
        setHistoryPaymentType,
        setHistorySearch,
        setHistoryStatus,
        setImagePreview,
        setItemOptionsLineKey,
        setMobileCheckoutPanelOpen,
        setMobileSearchExpanded,
        setParkSaleNameDialogOpen,
        setParkSaleNameInput,
        setParkedSalesDialogOpen,
        setQuantityInputValue,
        setReceiptPaperWidth,
        setReceiptPreviewModalOpen,
        setReceiptPreviewSource,
        setSearch,
        setSelectedFolderId,
        setServiceOptionsModal,
        setSetupSnapshotModalOpen,
        setSplitPaymentCancelModalOpen,
        setupCurrency,
        setupMeta,
        setupSnapshotModalOpen,
        shellClassName,
        splitPaymentCancelLoading,
        splitPaymentCancelModalOpen,
        splitPaymentCheckoutContext,
        splitPaymentDialogOpen,
        splitPaymentStorageScopeKey,
        splitPaymentWorkflowVersion,
        submitDrawerAuthorization,
        terminalUser,
        toggleFolderFilter,
        totalCatalogPages,
        universalPendingSyncCount,
        updateCartQuantity,
        validateParkedSaleForResume,
        vatBreakdown,
        visibleCatalogItems,
        visibleCatalogRange,
        visibleHistoryPagination,
        visibleHistoryRows,
        voidingTransactionId
    } = viewModel;
    const { refundWorkflowTransaction, refundWorkflowLoading, refundWorkflowSubmitting, openHistoryRefundWorkflow, closeHistoryRefundWorkflow, submitHistoryRefundWorkflow } = historyRefundWorkflow || {};
    const handleCloseDiscountModal = () => {
        closeDiscountModal();
    };


return (
        <div className={modalOnly ? 'hidden' : shellClassName} aria-hidden={modalOnly ? 'true' : undefined}>
            {currentViewMode === 'checkout'
                && !sessionLocked
                && posPresentationBundle.currentSaleActions.showParkedSaleControls
                && headerParkedSalesHistorySlot
                && createPortal(
                    <button
                        type="button"
                        data-testid="pos-header-parked-sales-history-button"
                        onClick={openParkedSalesHistory}
                        disabled={!canViewHistory || !activeShiftId || !normalizedTerminalId}
                        className="inline-flex h-full w-full items-center justify-center rounded-xl text-[#1A4E8D] transition-colors hover:bg-blue-50 hover:text-[#143F73] disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Open parked sales history"
                        title="Open parked sales history"
                    >
                        <CarTaxiFront className="h-5 w-5 lg:h-6 lg:w-6" aria-hidden="true" />
                        <span className="sr-only">Open parked sales history</span>
                    </button>,
                    headerParkedSalesHistorySlot
                )}
            <section
                className={
                    currentViewMode === 'checkout'
                        ? 'contents'
                        : (currentViewMode === 'history'
                            ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:p-5'
                            : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:p-5')
                }
            >
            {currentViewMode === 'history' && (
                <div key="view-history" className="catalog-slide-enter h-full min-h-0 max-sm:animate-pos-slide-in">
                <Suspense fallback={<section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">Loading POS sales history...</section>}>
                    <POSTransactionHistoryPanel
                        historySearch={historySearch}
                        setHistorySearch={setHistorySearch}
                        historyStatus={historyStatus}
                        setHistoryStatus={setHistoryStatus}
                        historyPaymentType={historyPaymentType}
                        setHistoryPaymentType={setHistoryPaymentType}
                        historyOrderMethod={historyOrderMethod}
                        setHistoryOrderMethod={setHistoryOrderMethod}
                        historyOrderSource={historyOrderSource}
                        setHistoryOrderSource={setHistoryOrderSource}
                        historyCashierName={historyCashierName}
                        setHistoryCashierName={setHistoryCashierName}
                        historyDateFrom={historyDateFrom}
                        setHistoryDateFrom={setHistoryDateFrom}
                        historyDateTo={historyDateTo}
                        setHistoryDateTo={setHistoryDateTo}
                        historyLoading={historyLoading}
                        historyRows={visibleHistoryRows}
                        historyDetailLoading={historyDetailLoading}
                        openHistoryDetail={openHistoryDetail}
                        canVoidTransactions={canVoidTransactions}
                        onVoidTransaction={handleVoidHistoryTransaction}
                        voidingTransactionId={voidingTransactionId}
                        refundWorkflowTransaction={refundWorkflowTransaction}
                        refundWorkflowLoading={refundWorkflowLoading}
                        refundWorkflowSubmitting={refundWorkflowSubmitting}
                        hasActiveShift={Boolean(activeShiftId)}
                        onOpenRefundWorkflow={openHistoryRefundWorkflow}
                        onCloseRefundWorkflow={closeHistoryRefundWorkflow}
                        onSubmitRefundWorkflow={submitHistoryRefundWorkflow}
                        loadHistory={loadHistory}
                        historyPage={historyPage}
                        historyPagination={visibleHistoryPagination}
                        pendingSyncCount={queuedCheckoutPendingCount}
                        pendingSyncBlockedCount={queuedCheckoutBlockedCount}
                        syncPendingTransactions={handleManualUniversalSync}
                        syncingPendingTransactions={replayingQueuedCheckouts}
                        syncDisabled={sessionLocked || Boolean(checkoutBlockedReason) || manualSyncPolicy?.remaining <= 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)}
                        syncRemaining={manualSyncPolicy?.remaining}
                        syncResetAt={manualSyncPolicy?.resetAt}
                        universalPendingSyncCount={universalPendingSyncCount}
                    />
                </Suspense>
                </div>
            )}

            {currentViewMode === 'checkout' && (
                <div key="view-checkout" className="h-full min-h-0 overflow-hidden catalog-slide-enter">
                <>
                <div className={checkoutGridClassName}>
            <section ref={catalogSectionRef} className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:p-6 ${catalogPaneHeightClassName} flex min-h-0 flex-col`}>
                    {isTabletViewport && renderViewModeControls()}
                    <div ref={catalogViewportRef} className={catalogViewportClassName} role="region" aria-label="POS catalog contents">
                <div data-testid="pos-catalog-controls" className={`${isTabletViewport ? 'mb-3 gap-2.5' : 'mb-5 gap-4'} flex min-w-0 shrink-0 flex-col ${IS_DGFY_POS_SURFACE ? 'xl:flex-row xl:items-start' : 'lg:flex-row lg:items-start'}`}>
                    <div className={`${isTabletViewport ? 'flex-row items-center' : 'flex-wrap items-center sm:flex-nowrap'} flex min-w-0 flex-1 gap-3 max-sm:relative`}>
                        {/* Mobile: collapsed search icon button */}
                        {!isTabletViewport && !(mobileSearchExpanded || search) && (
                            <button
                                type="button"
                                aria-label="Search POS-visible items"
                                onClick={() => setMobileSearchExpanded(true)}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white shadow-sm transition hover:bg-slate-50 sm:hidden"
                            >
                                <Search size={20} className="text-[#1A4E8D]" />
                            </button>
                        )}
                        {/* Mobile: expanded full-width search with correction icon inside */}
                        {!isTabletViewport && (mobileSearchExpanded || Boolean(search)) && (
                            <div className="absolute inset-0 z-10 flex items-center sm:hidden">
                                <Search size={16} className="pointer-events-none absolute left-3 text-[#1A4E8D]" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search POS-visible items..."
                                    autoFocus
                                    onBlur={() => {
                                        if (!search) setMobileSearchExpanded(false);
                                    }}
                                    className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-10 text-[13px] text-[#0F172A] shadow-sm placeholder:text-[#64748B] transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                                />
                                <button
                                    type="button"
                                    aria-label="Clear search"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        setSearch('');
                                        setMobileSearchExpanded(false);
                                    }}
                                    className={`absolute right-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition ${search ? 'hover:bg-slate-100' : ''}`}
                                >
                                    <Delete
                                        className="h-4 w-4"
                                        style={{ color: search ? '#000000' : '#cbd5e1' }}
                                    />
                                </button>
                            </div>
                        )}
                        {/* Desktop / tablet: original search label */}
                        <label className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 text-[13px] text-[#64748B] shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100 max-sm:hidden">
                            <Search size={20} className="shrink-0 text-[#1A4E8D]" />
                            <span className="sr-only">Search POS-visible items</span>
                            <input
                                type="text"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search POS-visible items..."
                                className="h-auto min-w-0 w-full border-0 bg-transparent p-0 text-[13px] text-[#0F172A] shadow-none outline-none ring-0 placeholder:text-[#64748B] focus:outline-none focus:ring-0"
                            />
                            <button
                                type="button"
                                aria-label="Clear search"
                                onClick={() => setSearch('')}
                                className={`shrink-0 rounded-md p-1 transition ${search ? 'hover:bg-slate-100' : ''}`}
                                disabled={!search}
                            >
                                <Delete
                                    className="h-4 w-4"
                                    style={{ color: search ? '#000000' : '#cbd5e1' }}
                                />
                            </button>
                        </label>
                        {isTabletViewport ? (
                            <div className="flex shrink-0">
                                <Suspense fallback={(
                                    <button
                                        type="button"
                                        disabled
                                        className="flex h-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-[13px] font-bold text-slate-400"
                                    >
                                        Scan
                                    </button>
                                )}>
                                    <POSBarcodeScanner
                                        sessionLocked={sessionLocked}
                                        selectedLocationId={selectedLocationId}
                                        terminalId={normalizedTerminalId}
                                        onAddToCart={addToCart}
                                        className="w-auto"
                                    />
                                </Suspense>
                            </div>
                        ) : (
                            <>
                            <Suspense fallback={(
                                <button
                                    type="button"
                                    disabled
                                    className="flex h-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-[13px] font-bold text-slate-400 max-sm:flex-1 max-sm:min-w-0"
                                >
                                    Scan
                                </button>
                            )}>
                                <POSBarcodeScanner
                                    sessionLocked={sessionLocked}
                                    selectedLocationId={selectedLocationId}
                                    terminalId={normalizedTerminalId}
                                    onAddToCart={addToCart}
                                    className="max-sm:flex-1 max-sm:min-w-0"
                                />
                            </Suspense>
                            </>
                        )}
                </div>
                </div>
                <div
                    ref={folderStripRef}
                    className="mb-4 flex cursor-grab items-center gap-2 overflow-x-auto pb-1 pt-0.5 dgfy-pos-scrollbar-hidden"
                    onPointerDown={handleFolderStripPointerDown}
                    onPointerMove={handleFolderStripPointerMove}
                    onPointerUp={handleFolderStripPointerEnd}
                    onPointerCancel={handleFolderStripPointerEnd}
                    onClickCapture={handleFolderStripClickCapture}
                    onWheel={handleFolderStripWheel}
                >
                    <button
                        type="button"
                        onClick={() => setSelectedFolderId(null)}
                        className={`${folderButtonClassName} ${
                            !selectedFolderId
                                ? 'border border-[#0B449C] bg-[#0B449C] text-white shadow-blue-900/15'
                                : 'border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        <span>All Items</span>
                    </button>
                    {availableCategories.map((folder) => {
                        const active = Number(selectedFolderId) === Number(folder.folder_id);
                        return (
                            <button
                                key={folder.folder_id}
                                type="button"
                                onClick={() => toggleFolderFilter(folder.folder_id)}
                                className={`${folderButtonClassName} ${
                                    active
                                        ? 'border border-[#0B449C] bg-[#0B449C] text-white shadow-blue-900/15'
                                        : 'border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <Folder className="h-3.5 w-3.5" />
                                <span>{folder.name}</span>
                            </button>
                        );
                    })}
                </div>
                {posFoldersLoading && (
                    <span className="sr-only" role="status">Loading POS categories...</span>
                )}
                {!posFoldersLoading && posFoldersError && (
                    <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        <span>{posFoldersError}</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 px-2 text-[11px]"
                            onClick={loadPosFolders}
                        >
                            Retry categories
                        </Button>
                    </div>
                )}
                <div
                    ref={catalogCapacityViewportRef}
                    data-testid="pos-catalog-scroll"
                    className="dgfy-pos-scroll-region relative mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 touch-pan-y select-none"
                    onTouchStart={(event) => {
                        const touch = event.touches?.[0];
                        if (!touch) return;
                        handleCatalogSwipeStart(touch.clientX);
                    }}
                    onTouchEnd={(event) => {
                        const touch = event.changedTouches?.[0];
                        if (!touch) return;
                        handleCatalogSwipeEnd(touch.clientX);
                    }}
                    onPointerDown={(event) => {
                        if (event.pointerType !== 'pen') return;
                        handleCatalogSwipeStart(event.clientX, event.pointerId);
                    }}
                    onPointerUp={(event) => {
                        if (event.pointerType !== 'pen') return;
                        handleCatalogSwipeEnd(event.clientX, event.pointerId);
                    }}
                    onPointerCancel={() => {
                        catalogSwipeStartXRef.current = null;
                        catalogSwipePointerIdRef.current = null;
                    }}
                >
                {catalogLoading ? (
                    <p className="text-sm text-slate-500">Loading catalog...</p>
                ) : (
                    <>
                    {catalogRefreshing && (
                        <p role="status" className="sr-only">
                            Refreshing catalog...
                        </p>
                    )}
                    <div
                        ref={catalogGridRef}
                        className={catalogGridClassName}
                        data-catalog-columns={catalogGridLayout.columns}
                        data-catalog-rows={catalogGridLayout.rows}
                        data-catalog-page-size={catalogPageSize}
                        data-catalog-text-scale={catalogGridLayout.textSizeScale}
                        style={{
                            gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${catalogGridLayout.minimumCardWidth}px), 1fr))`,
                            gridAutoRows: `${catalogGridLayout.cardHeight}px`,
                            gap: `${CATALOG_GRID_GAP_PX}px`
                        }}
                        aria-busy={catalogRefreshing}
                    >
                        {visibleCatalogItems.map((item, itemIndex) => {
                            const isServiceItem = isServiceCatalogItem(item);
                            const isAlwaysAvailable = item?.pos_always_available === true;
                            const isBestSeller = item?.is_best_seller === true;
                            const isOutOfStock = !isServiceItem && !isAlwaysAvailable && Number(item.current_stock || 0) <= 0;
                            const imageSources = resolvePosCatalogImageSources(item, receiptSettings);
                            const {
                                configuredLargeSrc: largePosImageSrc,
                                src: posImageSrc
                            } = imageSources;
                            const hasImage = Boolean(posImageSrc) && !catalogImageErrors.has(String(item.item_id));
                            const cartQuantityForItem = safeCart
                                .filter((line) => line.item_id === item.item_id)
                                .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
                            const isEditingThisQuantity = editingQuantityItemId === item.item_id;
                            const isLoadingServiceOptions = serviceOptionsLoadingItemId === Number(item.item_id);
                            const stockColorClassName = getCatalogStockColorClassName(item, lowStockDisplayThreshold);
                            return (
                                <div
                                    key={item.item_id}
                                    data-pos-catalog-card="true"
                                    onClick={async (event) => {
                                        if (isOutOfStock || posActionsBlocked || isLoadingServiceOptions) {
                                            if (posActionsBlocked) notifyPosActionBlocked();
                                            return;
                                        }
                                        const addedDirectly = await addCatalogItemToCart(item);
                                        if (addedDirectly) flyImageToCheckoutBar(event.currentTarget);
                                    }}
                                    onKeyDown={async (event) => {
                                        if (isOutOfStock || posActionsBlocked || isLoadingServiceOptions) return;
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            const addedDirectly = await addCatalogItemToCart(item);
                                            if (addedDirectly) flyImageToCheckoutBar(event.currentTarget);
                                        }
                                    }}
                                    role={isOutOfStock || posActionsBlocked || isLoadingServiceOptions ? 'group' : 'button'}
                                    tabIndex={isOutOfStock || posActionsBlocked || isLoadingServiceOptions ? -1 : 0}
                                    aria-disabled={isOutOfStock || posActionsBlocked || isLoadingServiceOptions}
                                    aria-label={item.name}
                                    className={`${catalogCardClassName} ${
                                        isOutOfStock || posActionsBlocked || isLoadingServiceOptions
                                            ? 'cursor-not-allowed opacity-75 blur-[0.5px]'
                                            : 'cursor-pointer hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md'
                                    }`}
                                >
                                <div className="mb-1 max-sm:mb-0 max-sm:self-stretch">
                                    <div
                                        className={`${catalogCardImageWrapClassName} relative`}
                                        aria-hidden="true"
                                    >
                                        {hasImage ? (
                                            <ResponsiveImage
                                                sources={imageSources}
                                                alt={`${item.name} menu`}
                                                loading={itemIndex < 4 ? 'eager' : 'lazy'}
                                                decoding="async"
                                                fetchpriority={itemIndex < 4 ? 'high' : 'auto'}
                                                width={400}
                                                height={400}
                                                sizes="(max-width: 640px) 118px, (max-width: 1024px) 33vw, 25vw"
                                                className="product-image h-full w-full object-cover object-center"
                                                onError={(event) => {
                                                    if (advanceAssetImageFallback(event, [largePosImageSrc])) return;
                                                    setCatalogImageErrors((previous) => {
                                                        const next = new Set(previous);
                                                        next.add(String(item.item_id));
                                                        return next;
                                                    });
                                                }}
                                            />
                                        ) : (
                                            <div
                                                className="flex h-full w-full items-center justify-center bg-slate-100 text-center"
                                                style={imageSources.placeholderSrc ? {
                                                    backgroundImage: `url(${imageSources.placeholderSrc})`,
                                                    backgroundPosition: 'center',
                                                    backgroundRepeat: 'no-repeat',
                                                    backgroundSize: 'cover'
                                                } : undefined}
                                            >
                                                {isLoadingServiceOptions ? (
                                                    <span className="px-2 text-xs font-semibold text-[#64748B]">Loading options…</span>
                                                ) : null}
                                            </div>
                                        )}
                                        {isOutOfStock && (
                                            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border border-rose-200 bg-rose-50/95 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-700">
                                                Out of stock
                                            </span>
                                        )}
                                        {IS_DGFY_POS_SURFACE && (
                                            <>
                                                <div className="absolute left-1.5 top-1.5 z-10 max-w-[calc(100%-0.75rem)]">
                                                    <CatalogItemBadges
                                                        isServiceItem={isServiceItem}
                                                        isAlwaysAvailable={isAlwaysAvailable}
                                                        isBestSeller={isBestSeller}
                                                        overlay
                                                    />
                                                </div>
                                                <div className={`absolute inset-0 flex items-center justify-center px-2 py-1.5 ${hasImage ? 'bg-transparent' : 'bg-[#1A4E8D]/85'}`}>
                                                    <p className="min-w-0 text-center text-[14px] font-black leading-tight text-white line-clamp-2 drop-shadow-sm">
                                                        {item.name}
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-1 min-w-0 flex-col justify-between gap-1.5 p-2.5 sm:hidden">
                                    {!IS_DGFY_POS_SURFACE && (
                                        <p className={`min-w-0 text-[13px] font-black leading-tight ${stockColorClassName}`}>{item.name}</p>
                                    )}
                                    <div className="flex items-center justify-between gap-x-2 gap-y-1.5">
                                        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                                            <CatalogItemBadges
                                                isServiceItem={isServiceItem}
                                                isAlwaysAvailable={isAlwaysAvailable}
                                                isBestSeller={isBestSeller}
                                            />
                                            <span className="font-black text-[#1A4E8D] whitespace-nowrap text-[10.5px]">
                                                {Number(item.default_sale_price || 0) > 0 ? `PHP ${money(item.default_sale_price)}` : 'Not set'}
                                            </span>
                                        </div>
                                        {/* Quantity control, laid out horizontally as [ - ] [ item count ] [ + ].
                                            stopPropagation keeps taps here from also firing the card's own
                                            onClick (which would otherwise double-add the item). Manual entry
                                            uses a sanitized text input (not type="number") so no native
                                            increment/decrement spinner buttons render inside the field. */}
                                        <div
                                            className="flex shrink-0 items-center gap-1"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => adjustCartQuantity(item, -1)}
                                                disabled={cartQuantityForItem <= 0 || posActionsBlocked}
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-base font-black leading-none text-slate-500 active:scale-95 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                aria-label={`Decrease quantity for ${item.name}`}
                                            >
                                                −
                                            </button>
                                            {isEditingThisQuantity ? (
                                                <input
                                                    type="text"
                                                    inputMode={allowsDecimalQuantity(item.unit_of_measure) ? 'decimal' : 'numeric'}
                                                    pattern={allowsDecimalQuantity(item.unit_of_measure) ? '[0-9]*\\.?[0-9]*' : '[0-9]*'}
                                                    autoFocus
                                                    value={quantityInputValue}
                                                    onChange={(event) => setQuantityInputValue(sanitizeQuantityInput(event.target.value, allowsDecimalQuantity(item.unit_of_measure)))}
                                                    onBlur={() => commitManualCartQuantity(item)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter') {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            commitManualCartQuantity(item);
                                                        }
                                                    }}
                                                    className="h-8 w-9 shrink-0 rounded-md border border-slate-200 text-center text-[13px] font-black text-[#0F172A]"
                                                    aria-label={`Set quantity for ${item.name}`}
                                                />
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (isOutOfStock || posActionsBlocked) return;
                                                        setEditingQuantityItemId(item.item_id);
                                                        setQuantityInputValue(String(cartQuantityForItem));
                                                    }}
                                                    disabled={isOutOfStock || posActionsBlocked}
                                                    className="flex h-8 w-9 shrink-0 items-center justify-center rounded-md text-[13px] font-black text-[#0F172A] disabled:cursor-not-allowed disabled:opacity-40"
                                                    aria-label={`Quantity for ${item.name}, tap to type a value`}
                                                >
                                                    {cartQuantityForItem}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onPointerDown={(event) => {
                                                    if (isOutOfStock || posActionsBlocked) return;
                                                    handleQtyButtonPointerDown(event, item);
                                                }}
                                                onPointerMove={(event) => handleQtyButtonPointerMove(event, item)}
                                                onPointerUp={(event) => {
                                                    if (isOutOfStock || posActionsBlocked) return;
                                                    handleQtyButtonPointerUp(event, item);
                                                }}
                                                onPointerCancel={handleQtyButtonPointerCancel}
                                                disabled={isOutOfStock || posActionsBlocked}
                                                className="flex h-8 w-8 shrink-0 touch-none select-none items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-base font-black leading-none text-[#1A4E8D] active:scale-95 active:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                aria-label={`Increase quantity for ${item.name}. Tap to add one, or press and hold then drag up to add more.`}
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                {!IS_DGFY_POS_SURFACE && (
                                    <>
                                        <div className="flex min-w-0 flex-col gap-1.5 max-sm:hidden">
                                            <div className="flex min-w-0 items-start gap-1.5">
                                                <p className={`min-w-0 flex-1 text-[13.5px] font-black leading-tight line-clamp-2 ${stockColorClassName}`}>{item.name}</p>
                                                {isBestSeller && (
                                                    <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-amber-700">
                                                        Best seller
                                                    </span>
                                                )}
                                            </div>
                                            <CatalogItemBadges
                                                isServiceItem={isServiceItem}
                                                isAlwaysAvailable={isAlwaysAvailable}
                                                isBestSeller={false}
                                            />
                                        </div>
                                        <p className="mt-0.5 truncate text-[10px] font-extrabold tracking-wide text-[#64748B] max-sm:hidden">{item.sku_code}</p>
                                    </>
                                )}
                                {IS_DGFY_POS_SURFACE && isTabletViewport ? (
                                    <div className="mt-1 flex items-center justify-center rounded-md px-1 py-0.5">
                                        <span className={`text-[11px] font-black ${isOutOfStock ? 'text-rose-700' : 'text-[#1A4E8D]'}`}>
                                            {isOutOfStock
                                                ? 'Unavailable'
                                                : `PHP ${money(item.default_sale_price)}`}
                                        </span>
                                    </div>
                                ) : (
                                    <>
                                        <div className={`${isTabletViewport ? 'mt-1.5' : 'mt-3'} grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10.5px] text-[#64748B] max-sm:hidden`}>
                                            <span className="font-semibold">Stock:</span>
                                            <span className={`text-right font-bold whitespace-nowrap ${stockColorClassName}`}>
                                                {isServiceItem ? 'Service' : isAlwaysAvailable ? 'Always available' : Number(item.current_stock || 0).toFixed(2)}
                                            </span>
                                            <span className="font-semibold">Price:</span>
                                            <span className="text-right font-black text-[#1A4E8D] whitespace-nowrap">
                                                {Number(item.default_sale_price || 0) > 0
                                                    ? `PHP ${money(item.default_sale_price)}`
                                                    : 'Not set'}
                                            </span>
                                            <span className="font-semibold">VAT:</span>
                                            <span className="text-right font-extrabold text-[#334155] whitespace-nowrap">
                                                {VAT_TYPE_LABEL[item.vat_type || 'vatable'] || 'VATable'}
                                            </span>
                                        </div>
                                        {isOutOfStock && (
                                            <p className="mt-auto pt-1 text-[10.5px] font-medium text-slate-500 max-sm:hidden">
                                                Unavailable for checkout.
                                            </p>
                                        )}
                                    </>
                                )}
                                </div>
                            );
                        })}
                        {catalogError && (
                            <p className="text-sm text-amber-700 col-span-full rounded-xl border border-amber-200 bg-amber-50 p-4">
                                {catalogError}
                            </p>
                        )}
                        {!catalogError && visibleCatalogItems.length === 0 && (
                            <p className="text-sm text-slate-600 col-span-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                                No POS-visible items.
                            </p>
                        )}
                    </div>
                    </>
                )}
                    </div>
                    </div>
                    <div
                        data-testid="pos-catalog-footer"
                        className="mt-auto shrink-0 border-t border-slate-200 bg-slate-50/80 px-1 py-1.5 supports-[backdrop-filter]:bg-white/80"
                    >
                            <div className="flex flex-col items-center justify-between gap-1 sm:flex-row">
                                <div className="text-center sm:text-left">
                                    <p className="text-[11px] font-semibold text-[#334155]">
                                    Showing {visibleCatalogRange.start}-{visibleCatalogRange.end} of {catalogForDisplay.length || 0} items
                                    </p>
                                </div>
                                <div className="flex items-center justify-center gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCatalogPageChange('previous')}
                                    disabled={catalogPage <= 1}
                                    aria-label="Go to previous catalog page"
                                >
                                    <ChevronLeft className="mr-1 h-4 w-4" />
                                    Previous
                                </Button>
                                <span className="text-xs font-semibold text-[#334155]">
                                    Page {catalogPage} of {totalCatalogPages}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCatalogPageChange('next')}
                                    disabled={catalogPage >= totalCatalogPages}
                                    aria-label="Go to next catalog page"
                                >
                                    Next
                                    <ChevronRight className="ml-1 h-4 w-4" />
                                </Button>
                            </div>
                            </div>
                        </div>
            </section>

            {mobileCheckoutPanelOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-950/45 md:hidden"
                    onClick={() => setMobileCheckoutPanelOpen(false)}
                    aria-hidden="true"
                />
            )}

            <aside
                data-testid="pos-current-sale-panel"
                className={`${checkoutPaneClassName} ${mobileCheckoutPanelOpen
                    ? 'fixed inset-x-0 bottom-0 z-50 h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] translate-y-0 pointer-events-auto'
                    : 'fixed inset-x-0 bottom-0 z-50 h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] translate-y-full pointer-events-none'
                } transition-transform duration-300 ease-out md:static md:z-auto md:max-h-none md:translate-y-0 md:overflow-hidden md:pointer-events-auto md:transition-none`}
            >
            <section className={`relative flex min-h-0 flex-col overflow-hidden rounded-t-2xl rounded-b-none border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70 sm:p-4 md:rounded-xl ${currentSalePaneHeightClassName}`}>
                    <div role="region" aria-label="Current sale contents" className="flex h-full min-h-0 flex-col">
                <div data-testid="pos-current-sale-header" className="relative mb-2 shrink-0">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-[21px] font-black tracking-tight text-[#0F172A]">Current Sale</h2>
                        <div className="flex items-center gap-1">
                        <button
                            type="button"
                            data-testid="pos-clear-current-sale"
                            onClick={openClearCurrentSale}
                            disabled={posActionsBlocked || safeCart.length === 0 || Boolean(activeParkedSale?.pos_parked_sale_id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Clear all items from current sale"
                            title={activeParkedSale?.pos_parked_sale_id ? 'Finish or cancel the active parked sale first' : 'Clear current sale'}
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentSaleHelpOpen((open) => !open)}
                            className="inline-flex items-center justify-center p-0.5 text-amber-600 hover:text-amber-700"
                            aria-label="Toggle current sale help"
                            title="Show current sale help"
                        >
                            <AlertCircle className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setMobileCheckoutPanelOpen(false)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
                            aria-label="Close current sale panel"
                            title="Close"
                        >
                            <X className="h-5 w-5" />
                        </button>
                        </div>
                    </div>
                    {activeParkedSale?.pos_parked_sale_id && (
                        <div
                            data-testid="pos-active-parked-sale"
                            className="mt-2 break-words rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900"
                        >
                            Editing {formatParkedSaleDisplayName(activeParkedSale)} · changes will update this same parked sale
                        </div>
                    )}
                    {currentSaleHelpOpen && (
                        <div className="absolute right-0 top-9 z-20 w-full max-w-[16rem] rounded-lg border border-amber-200 bg-white p-3 text-[12px] leading-5 text-slate-700 shadow-xl shadow-slate-900/10">
                            <p className="break-words font-semibold text-slate-800">Review cart, VAT, and total before checkout.</p>
                            <p className="mt-2 break-words text-slate-600">Online-order platform fees are not applied to in-store POS checkout.</p>
                        </div>
                    )}
                </div>
                <div data-testid="pos-current-sale-scroll" className={currentSaleBodyClassName}>
                <div className="col-span-2 flex min-h-0 flex-col overflow-hidden md:h-[clamp(18rem,46vh,26rem)] md:flex-none">
                <div className="min-h-0 flex-1 overflow-hidden border-b border-slate-200 pb-2">
                    <div data-testid="pos-current-sale-items" className={`space-y-2.5 ${currentSaleItemsListClassName}`}>
                        {safeCart.length > 0 ? safeCart.map((line) => {
                            const lineKey = getLineKey(line);
                            return (
                                <div
                                    key={lineKey}
                                    role="button"
                                    tabIndex={sessionLocked ? -1 : 0}
                                    aria-disabled={sessionLocked}
                                    aria-label={`Customize ${line.item_name}`}
                                    data-testid={`pos-item-options-trigger-${lineKey}`}
                                    onClick={() => {
                                        if (!sessionLocked) setItemOptionsLineKey(lineKey);
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.target !== event.currentTarget) return;
                                        if ((event.key === 'Enter' || event.key === ' ') && !sessionLocked) {
                                            event.preventDefault();
                                            setItemOptionsLineKey(lineKey);
                                        }
                                    }}
                                    className="cursor-pointer rounded-lg border border-slate-200 p-2.5 transition-colors hover:border-blue-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className="flex min-w-0 items-center gap-2.5 text-left">
                                                <span className="min-w-0">
                                                    <span className="block break-words line-clamp-2 text-[13px] font-extrabold text-[#0F172A]">{line.item_name}</span>
                                                    <span className="mt-0.5 block text-[10px] font-bold text-blue-700">Tap item to customize</span>
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                {Array.isArray(line.service_option_details) && line.service_option_details.length > 0 ? (
                                                    <p className="mt-0.5 break-words line-clamp-2 text-[10px] font-semibold text-blue-700">
                                                        Options: {line.service_option_details.map((option) => option.name).filter(Boolean).join(', ')}
                                                    </p>
                                                ) : null}
                                                {line.special_instructions ? (
                                                    <p className="mt-1 max-w-full break-words line-clamp-2 text-[10px] font-semibold text-slate-600">
                                                        Note: {line.special_instructions}
                                                    </p>
                                                ) : null}
                                                {line.item_discount ? (
                                                    <p className="mt-1 max-w-full break-words line-clamp-2 text-[10px] font-extrabold text-rose-600">
                                                        {(line.item_discount.discount_type === 'pwd'
                                                            ? 'PWD discount'
                                                            : line.item_discount.discount_type === 'senior'
                                                                ? 'Senior discount'
                                                                : line.item_discount.discount_type === 'promo'
                                                                    ? 'Promo discount'
                                                                    : line.item_discount.discount_type === 'employee'
                                                                        ? 'Employee discount'
                                                                    : 'Other discount')}: {line.item_discount.discount_type === 'promo'
                                                            ? 'configured rate'
                                                            : line.item_discount.method === 'fixed'
                                                            ? `-PHP ${money(line.item_discount.amount)}`
                                                            : `-${money(line.item_discount.rate)}%`}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                removeCartLine(lineKey);
                                            }}
                                            disabled={posActionsBlocked}
                                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                            aria-label={`Remove ${line.item_name}`}
                                            title="Remove item"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div
                                        className="mt-2 grid grid-cols-2 gap-2"
                                        onClick={(event) => event.stopPropagation()}
                                        onKeyDown={(event) => event.stopPropagation()}
                                    >
                                        <label className="text-[11px] text-slate-500">
                                            Qty
                                            {/* Mobile: read-only, qty is managed from the catalog card's stepper. */}
                                            <p className="mt-1 flex h-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-center text-[13px] font-extrabold text-[#0F172A] sm:hidden">
                                                {formatQuantity(line.quantity)}
                                            </p>
                                            {/* Tablet/desktop: +/- controls restored here. Tablet's row uses the
                                                same taller h-10 sizing as the "+" button below (for touch-target
                                                consistency/alignment - not itself a functional change), desktop
                                                keeps the original h-8. */}
                                            <div className="mt-1 hidden items-center gap-1 sm:flex">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className={isTabletViewport ? 'h-10 px-3 text-[13px]' : 'h-8 px-2 text-[13px]'}
                                                    onClick={() => updateCartQuantity(lineKey, Number(line.quantity || 0) - 1)}
                                                    disabled={posActionsBlocked}
                                                >
                                                    <Minus className="h-3.5 w-3.5" />
                                                </Button>
                                                <span className={`flex min-w-0 flex-1 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-center text-[13px] font-extrabold text-[#0F172A] ${isTabletViewport ? 'h-10' : 'h-8'}`}>
                                                    {formatQuantity(line.quantity)}
                                                </span>
                                                {/* Desktop and tablet: long-press-then-drag-up shows the same
                                                    bulk-add meter the mobile catalog "+" button uses (see
                                                    handleCartQtyButtonPointerDown and friends, and the shared
                                                    qtyMeterState/.qty-meter portal render below) - same gesture
                                                    timing, drag scaling, and 0-20 limit as desktop/mobile, no
                                                    logic duplicated. A plain tap still adds exactly +1, handled
                                                    inside the pointerUp handler itself, so no onClick here (would
                                                    double-add on tap). Tablet gets a slightly larger touch target
                                                    (h-10/px-3) than desktop's h-8/px-2 for easier touch input;
                                                    mobile is unaffected - it never renders this stepper (its cart
                                                    line qty is read-only, managed from the catalog card instead). */}
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className={`${isTabletViewport ? 'h-10 px-3 text-[13px]' : 'h-8 px-2 text-[13px]'} hidden sm:inline-flex`}
                                                    onPointerDown={(event) => handleCartQtyButtonPointerDown(event, line)}
                                                    onPointerMove={(event) => handleCartQtyButtonPointerMove(event, line)}
                                                    onPointerUp={(event) => handleCartQtyButtonPointerUp(event, line)}
                                                    onPointerCancel={handleCartQtyButtonPointerCancel}
                                                    disabled={posActionsBlocked}
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 px-2 text-[13px] sm:hidden"
                                                    onClick={() => updateCartQuantity(lineKey, Number(line.quantity || 0) + 1)}
                                                    disabled={posActionsBlocked}
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </label>
                                        <div className="text-[11px] text-slate-500">
                                            <span>Price</span>
                                            <p className="mt-1 h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-[13px] font-extrabold leading-8 text-[#0F172A]">
                                                {money(getCartLineSubtotal(line))}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm shadow-slate-200/70">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-[13px] font-black text-[#0F172A]">Current Sale</p>
                                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#64748B]">
                                        Empty
                                    </span>
                                </div>
                                <div className="flex h-14 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50">
                                    <span className="px-2 text-center text-[12px] font-semibold text-slate-500">
                                        No items in cart yet.
                                    </span>
                                </div>
                                <p className="mt-2 text-center text-[11px] font-medium text-slate-500">
                                    Add items to start this sale.
                                </p>
                            </div>
                        )}
                </div>
                </div>
                </div>

                <div className="col-span-2 min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <label className="block text-[11px] font-extrabold text-[#0F172A]" htmlFor="pos-affiliate-code-input">Affiliate Code (optional)</label>
                    <div className="relative mt-1">
                        <Percent className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <Input
                            id="pos-affiliate-code-input"
                            className="h-8 rounded-lg border-slate-200 bg-white pl-8 text-xs font-medium focus:border-teal-500 focus:ring-teal-500"
                            placeholder="e.g. AF-K7QP2X"
                            value={affiliateCodeInput}
                            onChange={(e) => setAffiliateCodeInput(e.target.value)}
                        />
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">Validated at checkout.</p>
                </div>

                <div data-testid="pos-current-sale-totals" className="col-span-2 border-b border-slate-200 pb-2 text-[11px]">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 md:hidden">
                        <div className="flex justify-between">
                            <span className="text-[13px] text-[#334155]">Items Subtotal</span>
                            <span className="text-[13px] font-extrabold text-[#0F172A]">PHP {money(cartSubtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#334155]">
                                Item discount
                            </span>
                            <span className="font-extrabold text-rose-600">- PHP {money(itemDiscountTotals.discountAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#334155]">
                                Global discount{appliedDiscount ? ` (${appliedDiscount.label})` : (selectedDiscount ? ` (${selectedDiscount.name})` : '')}
                            </span>
                            <span className="font-extrabold text-rose-600">- PHP {money(globalDiscountAmount)}</span>
                        </div>
                        {governedDiscountTotals.vatRemoved > 0 && <div className="flex justify-between"><span className="text-[#334155]">VAT Removed</span><span className="font-extrabold text-rose-600">- PHP {money(governedDiscountTotals.vatRemoved)}</span></div>}
                        {governedDiscountTotals.vatExemptAmount > 0 && <div className="flex justify-between"><span className="text-[#334155]">VAT-Exempt Amount</span><span className="font-extrabold text-[#0F172A]">PHP {money(governedDiscountTotals.vatExemptAmount)}</span></div>}
                        <div className="flex justify-between">
                            <span className="text-[#334155]">Net Items</span>
                            <span className="font-extrabold text-[#0F172A]">PHP {money(netItemsTotal)}</span>
                        </div>
                        <div className="col-span-2 my-1 border-t border-dashed border-slate-200" />
                        <div className="flex justify-between">
                            <span className="text-slate-600">VATable Sales</span>
                            <span className="font-medium">PHP {money(vatBreakdown.vatableSales)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">VAT Amount (12%)</span>
                            <span className="font-medium">PHP {money(vatBreakdown.vatAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">VAT Exempt Sales</span>
                            <span className="font-medium">PHP {money(vatBreakdown.vatExemptSales)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Zero Rated Sales</span>
                            <span className="font-medium">PHP {money(vatBreakdown.zeroRatedSales)}</span>
                        </div>
                        <div className="col-span-2 mt-1 flex items-baseline justify-between border-t border-slate-200 pt-1">
                            <span className="text-[18px] font-black text-[#0F172A]">Total</span>
                            <span className="text-[18px] font-black text-[#1A4E8D]">PHP {money(cartTotal)}</span>
                        </div>
                    </div>

                    <div data-testid="pos-current-sale-desktop-summary" className="hidden gap-y-0.5 md:grid">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[13px] text-[#334155]">Items Subtotal</span>
                            <span className="whitespace-nowrap text-right text-[13px] font-extrabold tabular-nums text-[#0F172A]">PHP {money(cartSubtotal)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Net Items</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-[#0F172A]">PHP {money(netItemsTotal)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Item discount</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-rose-600">-PHP {money(itemDiscountTotals.discountAmount)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Global discount{appliedDiscount ? ` (${appliedDiscount.label})` : (selectedDiscount ? ` (${selectedDiscount.name})` : '')}</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-rose-600">-PHP {money(globalDiscountAmount)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Total discounts</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-rose-600">-PHP {money(calculatedDiscountAmount)}</span>
                        </div>
                        {governedDiscountTotals.vatRemoved > 0 && (
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                                <span className="min-w-0 text-[#334155]">VAT Removed</span>
                                <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-rose-600">-PHP {money(governedDiscountTotals.vatRemoved)}</span>
                            </div>
                        )}
                        {governedDiscountTotals.vatExemptAmount > 0 && (
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                                <span className="min-w-0 text-[#334155]">VAT-Exempt Amount</span>
                                <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-[#0F172A]">PHP {money(governedDiscountTotals.vatExemptAmount)}</span>
                            </div>
                        )}
                        <div className="my-1 border-t border-dashed border-slate-200" />
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-slate-600">VATable Sales</span>
                            <span className="whitespace-nowrap text-right font-medium tabular-nums">PHP {money(vatBreakdown.vatableSales)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-slate-600">VAT Exempt Sales</span>
                            <span className="whitespace-nowrap text-right font-medium tabular-nums">PHP {money(vatBreakdown.vatExemptSales)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-slate-600">VAT Amount (12%)</span>
                            <span className="whitespace-nowrap text-right font-medium tabular-nums">PHP {money(vatBreakdown.vatAmount)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-slate-600">Zero Rated Sales</span>
                            <span className="whitespace-nowrap text-right font-medium tabular-nums">PHP {money(vatBreakdown.zeroRatedSales)}</span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between border-t border-slate-200 pt-1">
                            <span className="text-[18px] font-black text-[#0F172A]">Total</span>
                            <span className="whitespace-nowrap text-[18px] font-black tabular-nums text-[#1A4E8D]">PHP {money(cartTotal)}</span>
                        </div>
                    </div>
                </div>
                </div>

                {(checkoutBlockedReason || safeCart.length === 0) && (
                    <div className="shrink-0 border-t border-slate-200 pt-2">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
                            {checkoutBlockedReason || 'Add at least one item before checkout.'}
                        </div>
                    </div>
                )}

                {!posHardware.loading && !isPrinterAvailable && (
                    <div className="shrink-0 border-t border-slate-200 pt-2">
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600">
                            <span>No printer detected on this device.</span>
                            <button
                                type="button"
                                onClick={() => posHardware.refresh()}
                                disabled={posHardware.loading}
                                className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-extrabold text-[#1A4E8D] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Recheck printer
                            </button>
                        </div>
                    </div>
                )}

                {Number(universalPendingSyncCount || 0) > 0 && (
                    <div
                        className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 pt-2"
                        data-testid="pos-pending-sync-banner"
                    >
                        <div className="min-w-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] font-semibold leading-5 text-blue-900">
                            {Number(universalPendingSyncCount)} pending POS record{Number(universalPendingSyncCount) === 1 ? '' : 's'} waiting to sync. Reconnect, then press Sync.
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleManualUniversalSync}
                            disabled={sessionLocked || manualSyncPolicy?.remaining <= 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)}
                            className="shrink-0 border-blue-300 bg-white text-[11px] font-extrabold text-blue-800 hover:bg-blue-100"
                        >
                            Sync
                        </Button>
                    </div>
                )}

                <Suspense fallback={<div className="h-[46px] w-full animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />}>
                    <PosCurrentSaleActions
                        presentationBundle={posPresentationBundle}
                        onParkAndNewSale={openParkSaleNameDialog}
                        parkSaleDisabled={posActionsBlocked || checkoutLoading || parkLoading || safeCart.length === 0 || !activeShiftId || !normalizedTerminalId}
                        parkLoading={parkLoading}
                        activeParkedSale={activeParkedSale}
                        onCheckout={openCheckoutConfirmModal}
                        checkoutDisabled={posActionsBlocked || checkoutLoading || safeCart.length === 0}
                        checkoutLoading={checkoutLoading}
                        itemCount={safeCart.length}
                        onPrintOrder={handlePrintOrder}
                        printOrderDisabled={posActionsBlocked || safeCart.length === 0 || !isOrderPrinterAvailable}
                        printerAvailable={isOrderPrinterAvailable}
                        onOpenCashDrawer={() => handleOpenDrawer({
                            transactionId: Number(lastReceipt?.pos_transaction_id) || null,
                            reason: 'manual_drawer_panel'
                        })}
                        cashDrawerDisabled={!activeShiftId || drawerOpening || drawerAuthorizationModalOpen}
                        drawerOpening={drawerOpening}
                        showParkedSaleControls={posPresentationBundle.currentSaleActions.showParkedSaleControls}
                        onParkSale={openParkSaleNameDialog}
                        parkSaleLoading={parkLoading}
                        parkSaleLabel={activeParkedSale ? 'Update Parked Sale' : 'Park Sale'}
                        onSplitPayment={openSplitPaymentModal}
                        splitPaymentDisabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || isEmployeeCreditPayment}
                        splitPaymentLoading={checkoutLoading}
                        tabletLayout={isTabletViewport}
                    />
                </Suspense>
                    </div>
            </section>
            </aside>

                </div>

                <div
                    id="checkout-bar"
                    className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-4 pt-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] md:hidden"
                    style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
                    role="region"
                    aria-label="Current sale summary"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                {cartTotalQuantity} item{cartTotalQuantity === 1 ? '' : 's'} selected
                            </p>
                            <p className="truncate text-[18px] font-black text-[#1A4E8D]">
                                PHP {money(cartTotal)}
                            </p>
                        </div>
                        <Button
                            id="checkout-bar-button"
                            type="button"
                            onClick={() => setMobileCheckoutPanelOpen(true)}
                            disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0}
                            className="h-11 shrink-0 rounded-lg bg-[#1A4E8D] px-5 text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Lock size={16} className="mr-1.5" />
                            {checkoutLoading ? 'Processing...' : 'Checkout'}
                        </Button>
                    </div>
                </div>
                </>
                </div>
            )}

            {currentViewMode === 'receipt' && (
                <div>
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Order Preview</h2>
                            <p className="text-sm text-slate-600">Review the selected order summary.</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                data-testid="pos-receipt-view-receipt"
                                onClick={() => {
                                    setReceiptPreviewSource('receipt_preview');
                                    setReceiptPreviewModalOpen(true);
                                }}
                                disabled={posActionsBlocked || !lastReceipt}
                            >
                                <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                View Receipt
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                data-testid="pos-receipt-print"
                                onClick={() => handlePrintReceipt(lastReceipt, 'receipt_preview')}
                                disabled={posActionsBlocked || !lastReceipt || receiptPrinting || lastReceiptPendingSync || !isPrinterAvailable}
                                title={isPrinterAvailable ? undefined : 'No printer detected on this device.'}
                            >
                                <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                {receiptPrinting ? 'Printing...' : 'Print'}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                data-testid="pos-receipt-print-order"
                                onClick={() => handlePrintOrder(lastReceipt)}
                                disabled={posActionsBlocked || !lastReceipt || !isOrderPrinterAvailable}
                                title={isOrderPrinterAvailable ? undefined : 'No order-ticket printer detected on this device.'}
                            >
                                <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                Print Order
                            </Button>
                        </div>
                    </div>
                    {lastReceipt ? (
                        <div className="space-y-3">
                            <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading order preview...</div>}>
                                <OrderPreviewView
                                    transaction={lastReceipt}
                                    mobileResponsive
                                />
                            </Suspense>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                            <p className="text-base font-semibold text-slate-900">No receipt selected yet.</p>
                            <p className="mt-1 text-sm text-slate-600">
                                Select a history record to preview.
                            </p>
                            <Button
                                type="button"
                                className="mt-4"
                                onClick={() => setCurrentViewMode('history')}
                                disabled={!canViewHistory}
                            >
                                Go to History
                        </Button>
                    </div>
                    )}
                </div>
            )}
            </section>

            <div data-testid="pos-split-payment-modal-host">
                <Suspense fallback={null}>
                    <POSSplitPaymentWorkflow
                        key={splitPaymentWorkflowVersion}
                        open={splitPaymentDialogOpen}
                        onOpenChange={handleSplitPaymentOpenChange}
                        cart={safeCart}
                        catalog={safeCatalog}
                        subtotalAmount={cartSubtotal}
                        totalAmount={cartTotal}
                        shiftId={activeShiftId}
                        locationId={selectedLocationId}
                        terminalId={normalizedTerminalId}
                        parkedSaleId={activeParkedSale?.pos_parked_sale_id || null}
                        storageScopeKey={splitPaymentStorageScopeKey}
                        isMsmeMode={isMsmeMode}
                        checkoutContext={splitPaymentCheckoutContext}
                        onSessionStateChange={handleSplitPaymentSessionStateChange}
                        onReadyToComplete={handleCompletePreparedSplitPayment}
                    />
                </Suspense>
            </div>

            <Dialog
                open={drawerAuthorizationModalOpen}
                onOpenChange={(nextOpen) => {
                    if (!drawerAuthorizationSubmitting) setDrawerAuthorizationModalOpen(nextOpen);
                }}
            >
                <DialogContent
                    className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full"
                    data-testid="pos-drawer-authorization-dialog"
                >
                    <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left">
                        <DialogTitle className="text-lg font-black text-slate-900">Open Cash Drawer</DialogTitle>
                        <DialogDescription className="text-sm leading-5 text-slate-600">
                            Enter the reason and authorize this drawer opening before the terminal sends the hardware command.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 px-5 py-4">
                        <div>
                            <label htmlFor="pos-drawer-open-reason" className="text-xs font-extrabold text-slate-700">Reason <span className="text-rose-600">*</span></label>
                            <Input
                                id="pos-drawer-open-reason"
                                data-testid="pos-drawer-open-reason"
                                value={drawerAuthorizationReason}
                                onChange={(event) => setDrawerAuthorizationReason(event.target.value)}
                                placeholder="e.g. Cash change for customer"
                                maxLength={255}
                                disabled={drawerAuthorizationSubmitting}
                                className="mt-1"
                            />
                        </div>
                        {drawerAdminBypass ? (
                            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800" role="status">
                                Admin bypass is enabled for your account. A reason is still required and this action will be recorded in the audit history.
                            </div>
                        ) : (
                            <div>
                                <label htmlFor="pos-drawer-open-pin" className="text-xs font-extrabold text-slate-700">Cashier POS PIN <span className="text-rose-600">*</span></label>
                                <Input
                                    id="pos-drawer-open-pin"
                                    data-testid="pos-drawer-open-pin"
                                    type="password"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={drawerAuthorizationPin}
                                    onChange={(event) => setDrawerAuthorizationPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                                    placeholder="Enter your POS PIN"
                                    maxLength={12}
                                    disabled={drawerAuthorizationSubmitting}
                                    className="mt-1"
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDrawerAuthorizationModalOpen(false)}
                            disabled={drawerAuthorizationSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={submitDrawerAuthorization}
                            disabled={drawerAuthorizationSubmitting}
                            className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
                            data-testid="pos-drawer-authorize-submit"
                        >
                            {drawerAuthorizationSubmitting ? 'Authorizing…' : 'Authorize & Open Drawer'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={discountModalOpen && !viewModel.checkoutConfirmModalOpen} onOpenChange={(nextOpen) => (nextOpen ? setDiscountModalOpen(true) : handleCloseDiscountModal())}>
                <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-2xl sm:w-[calc(100vw-4rem)]">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Apply Discount</DialogTitle>
                        <DialogDescription>Select discount type and verify employee.</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />}>
                            <POSDiscountWorkspace viewModel={viewModel} onCancel={handleCloseDiscountModal} />
                        </Suspense>
                    </div>
                </DialogContent>
            </Dialog>


            <POSCheckoutConfirmDialog key={viewModel.checkoutConfirmModalOpen ? 'checkout-open' : 'checkout-closed'} viewModel={viewModel} />

            <POSCheckoutTerminalReceiptDialogs
                splitPaymentCancelModalOpen={splitPaymentCancelModalOpen}
                splitPaymentCancelLoading={splitPaymentCancelLoading}
                setSplitPaymentCancelModalOpen={setSplitPaymentCancelModalOpen}
                handleKeepSplitPaymentAndClose={handleKeepSplitPaymentAndClose}
                handleReverseSplitPaymentAndStartNew={handleReverseSplitPaymentAndStartNew}
                receiptPreviewModalOpen={receiptPreviewModalOpen}
                closeReceiptPreviewModal={closeReceiptPreviewModal}
                receiptPreviewSource={receiptPreviewSource}
                lastReceiptPendingSync={lastReceiptPendingSync}
                lastReceipt={lastReceipt}
                historyDetailLoading={historyDetailLoading}
                receiptSettings={receiptSettings}
                lastReceiptContract={lastReceiptContract}
                receiptPaperWidth={receiptPaperWidth}
                setReceiptPaperWidth={setReceiptPaperWidth}
                setReceiptPreviewSource={setReceiptPreviewSource}
                posActionsBlocked={posActionsBlocked}
                receiptPrinting={receiptPrinting}
                isPrinterAvailable={isPrinterAvailable}
                isOrderPrinterAvailable={isOrderPrinterAvailable}
                handlePrintReceipt={handlePrintReceipt}
                handlePrintOrder={handlePrintOrder}
                OrderPreviewView={OrderPreviewView}
            />

            {setupSnapshotModalOpen && createPortal((
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 px-4 py-6"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="pos-setup-snapshot-modal-title"
                    onClick={() => setSetupSnapshotModalOpen(false)}
                >
                    <div
                        className="flex max-h-[88dvh] w-full max-w-[28rem] flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/25 sm:max-w-[30rem] sm:p-4"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                            <div className="mb-3 flex items-start justify-between gap-2">
                                <div>
                                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#334155]">Terminal Setup Context</p>
                                    <h2 id="pos-setup-snapshot-modal-title" className="mt-1 text-[21px] font-black tracking-tight text-[#0F172A]">
                                        POS readiness snapshot
                                    </h2>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#334155]">
                                        Setup
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setSetupSnapshotModalOpen(false)}
                                        className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none"
                                        aria-label="Close setup snapshot"
                                    >
                                        <X className="h-4.5 w-4.5" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2 text-[13px]">
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5">
                                    <span className="text-[13px] text-[#64748B]">Petty Cash</span>
                                    <span className="text-[13px] font-extrabold text-[#0F172A]">{setupCurrency} {money(setupMeta.pettyCashAmount)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5">
                                    <span className="text-[13px] text-[#64748B]">Active Discounts</span>
                                    <span className="text-[13px] font-extrabold text-[#0F172A]">{Number(setupMeta.activeDiscountCount || 0)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5">
                                    <span className="text-[13px] text-[#64748B]">Compliance Policy</span>
                                    <span className="text-[13px] font-extrabold text-[#0F172A]">Dual-mode</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5">
                                    <span className="text-[13px] text-[#64748B]">Binding Readiness</span>
                                    <span className="text-[13px] font-extrabold text-[#0F172A]">{bindingReadinessLabel}</span>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            ), document.body)}

            {posPresentationBundle.currentSaleActions.showParkedSaleControls && parkedSalesDialogOpen && (
                <Suspense fallback={<div className="sr-only" role="status">Loading parked sales…</div>}>
                    <POSParkedSalesDialog
                        open
                        onOpenChange={setParkedSalesDialogOpen}
                        activeShiftId={activeShiftId}
                        selectedLocationId={selectedLocationId}
                        terminalId={normalizedTerminalId}
                        currentUserId={terminalUser?.user_id || terminalUser?.id || null}
                        cartHasItems={safeCart.length > 0}
                        canView={canViewHistory && !sessionLocked}
                        canTransact={!posActionsBlocked}
                        onBeforeClaim={validateParkedSaleForResume}
                        onClaimed={handleParkedSaleClaimed}
                        onCancelled={(cancelledSale) => {
                            if (Number(cancelledSale?.pos_parked_sale_id) !== Number(activeParkedSale?.pos_parked_sale_id)) return;
                            clearPosCartDraft(offlineSnapshotScope, activeShiftId);
                            setActiveParkedSale(null);
                            resetCurrentSaleForNewSale();
                        }}
                    />
                </Suspense>
            )}
            <Dialog
                open={parkSaleNameDialogOpen}
                onOpenChange={(nextOpen) => {
                    if (parkLoading) return;
                    setParkSaleNameDialogOpen(nextOpen);
                }}
            >
                <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full" data-testid="pos-park-sale-name-dialog">
                    <form
                        className="flex flex-col"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (parkLoading || !parkSaleNameInput.trim()) return;
                            handleParkAndNewSale();
                        }}
                    >
                        <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left">
                            <DialogTitle className="text-lg font-black text-slate-900">Name Parked Sale</DialogTitle>
                            <DialogDescription className="text-sm text-slate-600">
                                Enter the customer or order name so staff know who this parked sale belongs to.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="px-5 py-4">
                            <label className="block text-xs font-bold text-slate-700" htmlFor="parked-sale-name">
                                Customer / Order Name <span className="text-rose-600">*</span>
                            </label>
                            <Input
                                id="parked-sale-name"
                                value={parkSaleNameInput}
                                onChange={(event) => setParkSaleNameInput(event.target.value)}
                                maxLength={100}
                                autoFocus
                                disabled={parkLoading}
                                placeholder="e.g., Maria Santos or Table 4"
                                className="mt-2 h-11"
                                data-testid="pos-park-sale-name-input"
                            />
                            <p className="mt-1.5 text-right text-[11px] text-slate-500">{parkSaleNameInput.length}/100</p>
                        </div>
                        <DialogFooter className="border-t border-slate-200 px-5 py-4 sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setParkSaleNameDialogOpen(false)}
                                disabled={parkLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={parkLoading || !parkSaleNameInput.trim()}
                                className="bg-[#1A4E8D] hover:bg-[#143F73]"
                                data-testid="pos-confirm-park-sale"
                            >
                                {parkLoading ? 'Parking Sale…' : 'Park'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            <Dialog
                open={clearSaleConfirmOpen}
                onOpenChange={handleClearSaleDialogOpenChange}
            >
                <DialogContent
                    className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full"
                    data-testid="pos-clear-current-sale-dialog"
                >
                    <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left">
                        <DialogTitle className="flex items-center gap-2 text-lg font-black text-slate-900">
                            <Trash2 className="h-5 w-5 text-rose-600" />
                            {pendingViewModeAfterSaleClear ? 'Leave checkout and clear sale?' : 'Clear current sale?'}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-600">
                            {pendingViewModeAfterSaleClear
                                ? 'Leaving checkout will remove all items and unsaved sale details from the current sale. This cannot be undone.'
                                : 'This removes all items and unsaved sale details from the current sale. This cannot be undone.'}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="border-t border-slate-200 px-5 py-4 sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleClearSaleDialogOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={confirmClearCurrentSale}
                            className="bg-rose-600 text-white hover:bg-rose-700"
                            data-testid="pos-confirm-clear-current-sale"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {pendingViewModeAfterSaleClear ? 'Leave without sale' : 'Clear sale'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <ServiceOptionsModal
                key={`${serviceOptionsModal.open ? 'open' : 'closed'}:${serviceOptionsModal.item?.item_id || 'none'}`}
                open={serviceOptionsModal.open}
                onOpenChange={(open) => {
                    if (!open) setServiceOptionsModal({ open: false, item: null, groups: [] });
                }}
                serviceItem={serviceOptionsModal.item}
                optionGroups={serviceOptionsModal.groups}
                onConfirmOptions={handleConfirmServiceOptions}
            />
            {itemOptionsLineKey && (
                <Suspense fallback={<div className="sr-only" role="status">Loading item options…</div>}>
                    <ItemOptionsDialog
                        key={itemOptionsLineKey}
                        open
                        line={itemOptionsLine}
                        locationId={selectedLocationId}
                        globalDiscount={itemOptionsGlobalDiscount}
                        onClose={() => setItemOptionsLineKey(null)}
                        onSave={saveItemOptions}
                    />
                </Suspense>
            )}
            {billRequestDraft && (
                <Suspense fallback={<div className="sr-only" role="status">Loading bill request…</div>}>
                    <BillRequestDialog
                        open
                        draft={billRequestDraft}
                        onClose={() => setBillRequestDraft(null)}
                    />
                </Suspense>
            )}

            {imagePreview && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
                    onClick={() => setImagePreview(null)}
                >
                    <div
                        className="w-full max-w-xl rounded-xl bg-white p-4 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-base font-semibold text-slate-900">POS Menu Image Preview</h3>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setImagePreview(null)}
                            >
                                Cancel
                            </Button>
                        </div>
                        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3">
                            {imagePreview.hasImage ? (
                                <img
                                    src={imagePreview.src}
                                    alt={imagePreview.alt}
                                    className="max-h-[70vh] w-full rounded-lg object-contain"
                                    onError={() => {
                                        setImagePreview((previous) => (
                                            previous ? { ...previous, hasImage: false } : previous
                                        ));
                                    }}
                                />
                            ) : (
                                <div className="flex h-72 w-72 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white">
                                    <span className="text-sm font-medium text-slate-500">No POS image uploaded</span>
                                </div>
                            )}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">Tip: press ESC or click outside to close.</p>
                    </div>
                </div>
            )}
            {qtyMeterState && createPortal((
                <div
                    className="qty-meter"
                    style={{ left: `${qtyMeterState.x}px`, top: `${qtyMeterState.y - 24}px` }}
                    aria-live="polite"
                >
                    <span className="qty-meter__value">{qtyMeterState.quantity}</span>
                    <div className="qty-meter__track">
                        <div
                            className="qty-meter__fill"
                            style={{ height: `${((qtyMeterState.quantity - QTY_METER_MIN_QTY) / (QTY_METER_MAX_QTY - QTY_METER_MIN_QTY)) * 100}%` }}
                        />
                    </div>
                </div>
            ), document.body)}
            {addToCartToasts.length > 0 && (
                <Suspense fallback={null}>
                    <PosAddToCartToastContainer toasts={addToCartToasts} onDismiss={handleDismissToast} />
                </Suspense>
            )}
        </div>
    )
}

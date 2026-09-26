import React, { Suspense } from 'react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import { createPortal } from 'react-dom';
import {
    AlertCircle,
    CarTaxiFront,
    Delete,
    Folder,
    Minus,
    Plus,
    Percent,
    Printer,
    ScanLine,
    Search,
    ShoppingCart,
    X,
    Eye,
    Trash2,
    LayoutGrid
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalPagination } from '@/components/ui/pagination';
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
import {
    getPendingPosItemImagePreviews,
    subscribeToPendingPosItemImagePreviews
} from '../services/posPendingItemImagePreviewStore.js';
import { getCatalogStockColorClassName, isServiceCatalogItem } from '../utils/posCatalogAvailability.js';
import { formatParkedSaleDisplayName } from '../utils/posParkedSaleDisplay.js';
import { getParkedLineEditState } from '../utils/posParkedSaleResume.js';
import { POS_HARDWARE_CAPABILITIES } from '../hardware/posHardwareContract.js';
import { allowsDecimalQuantity } from '@/src/utils/uomConverter.js';
import PosItemImage from './PosItemImage.jsx';
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
const CatalogItemBadges = ({ isServiceItem = false, isAlwaysAvailable = false, isBestSeller = false, overlay = false, tabletPortrait = false }) => {
    if (!isServiceItem && !isAlwaysAvailable && !isBestSeller) return null;
    const sharedClassName = overlay ? 'border-slate-950/20 bg-[#0F274D] text-white' : 'border-blue-200 bg-blue-50 text-[#1A4E8D]';
    const bestSellerClassName = overlay ? 'border-orange-600/20 bg-[#F97316] text-white' : 'border-amber-200 bg-amber-50 text-amber-700';
    return (
        <div data-pos-catalog-badges="true" className="flex min-w-0 flex-col items-start gap-1">
            {isServiceItem && <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[8px] font-extrabold uppercase leading-tight tracking-wide sm:text-[9px] ${tabletPortrait ? 'whitespace-nowrap' : ''} ${sharedClassName}`}>Service</span>}
            {isAlwaysAvailable && <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[8px] font-extrabold uppercase leading-tight tracking-wide sm:text-[9px] ${tabletPortrait ? 'whitespace-nowrap' : ''} ${sharedClassName}`}>Always available</span>}
            {isBestSeller && <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[8px] font-extrabold uppercase leading-tight tracking-wide sm:text-[9px] ${tabletPortrait ? 'whitespace-nowrap' : ''} ${bestSellerClassName}`}>Best seller</span>}
        </div>
    );
};

const PosImagelessCatalogName = React.memo(({ name = '' }) => {
    const labelRef = React.useRef(null);
    const [isWrapped, setIsWrapped] = React.useState(false);

    React.useLayoutEffect(() => {
        const label = labelRef.current;
        if (!label) return undefined;

        const measureWrapping = () => {
            const lineHeight = Number.parseFloat(window.getComputedStyle(label).lineHeight) || 14;
            setIsWrapped(label.getBoundingClientRect().height > lineHeight * 1.5);
        };

        measureWrapping();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measureWrapping);
        observer.observe(label);
        return () => observer.disconnect();
    }, [name]);

    return (
        <p
            ref={labelRef}
            className={`min-w-0 max-w-full break-words line-clamp-2 pt-[7px] text-center text-[12px] font-black leading-tight text-white drop-shadow-sm ${isWrapped ? 'translate-y-[5px]' : ''}`}
        >
            {name}
        </p>
    );
});
PosImagelessCatalogName.displayName = 'PosImagelessCatalogName';

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
    const pendingItemImagePreviews = React.useSyncExternalStore(
        subscribeToPendingPosItemImagePreviews,
        getPendingPosItemImagePreviews,
        getPendingPosItemImagePreviews
    );
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
        canUseEmployeeCredit,
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
        catalogLoading,
        catalogPage,
        catalogPageSize,
        catalogPageSizeOptions,
        catalogPaneHeightClassName,
        catalogRefreshing,
        catalogSectionRef,
        catalogSwipePointerIdRef,
        catalogSwipeStartXRef,
        catalogViewportClassName,
        catalogViewportRef,
        checkoutBlockedReason,
        checkoutOpenedFromCurrentSale,
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
        sidebarCollapsed,
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
        handleCatalogPageSizeChange,
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
        historyPageSize,
        historyPaymentType,
        historySearch,
        historyStatus,
        imagePreview,
        employeeCreditAccountCode,
        employeeCreditAccount,
        selectedEmployeeCreditOption,
        employeeCreditLookupLoading,
        handleSelectEmployeeCredit,
        isEmployeeCreditPayment,
        isMobileLandscapeViewport,
        isMobileViewport,
        isMsmeMode,
        isOrderPrinterAvailable,
        isPrinterAvailable,
        isTabletPortraitViewport,
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
        posWorkflow,
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
        parkedLineDeletionRequest,
        parkedLineDeletionReason,
        setParkedLineDeletionReason,
        cancelParkedLineDeletion,
        confirmParkedLineDeletion,
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
        setHistoryPageSize,
        setHistoryOrderMethod,
        setHistoryOrderSource,
        setHistoryPaymentType,
        setHistorySearch,
        setHistoryStatus,
        setImagePreview,
        setItemOptionsLineKey,
        setMobileCheckoutPanelOpen,
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
        setupMeta,
        setupSnapshotModalOpen,
        shellClassName,
        splitPaymentCancelLoading,
        splitPaymentCancelModalOpen,
        splitPaymentCheckoutContext,
        splitPaymentDialogOpen,
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
    const cartQuantityByItemId = React.useMemo(() => {
        const quantities = new Map();
        (Array.isArray(safeCart) ? safeCart : []).forEach((line) => {
            const itemId = Number(line?.item_id);
            if (!Number.isFinite(itemId)) return;
            const currentQuantity = quantities.get(itemId) || 0;
            quantities.set(itemId, currentQuantity + (Number(line.quantity) || 0));
        });
        return quantities;
    }, [safeCart]);
    const drawerDialogButtonClassName = IS_DGFY_POS_SURFACE && isTabletViewport
        ? 'min-h-11 w-full min-w-0 whitespace-nowrap px-3 sm:w-auto sm:flex-1'
        : '';
    const handleCloseDiscountModal = () => {
        closeDiscountModal();
    };
    const cashDrawerAvailable = posHardware?.supportsCapability?.(POS_HARDWARE_CAPABILITIES.OPEN_DRAWER) === true;
    const isTabletPortraitMobileLayout = isTabletPortraitViewport;


return (
        <div
            className={modalOnly ? 'hidden' : shellClassName}
            data-pos-mobile-landscape={isMobileLandscapeViewport ? 'true' : undefined}
            data-pos-tablet-portrait={isTabletPortraitMobileLayout ? 'true' : undefined}
            aria-hidden={modalOnly ? 'true' : undefined}
        >
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
                            ? 'flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden'
                            : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:p-5')
                }
            >
            {currentViewMode === 'history' && (
                <div key="view-history" className="catalog-slide-enter h-full min-h-0 min-w-0 max-w-full max-sm:animate-pos-slide-in">
                <Suspense fallback={<section className="text-sm text-slate-500">Loading POS sales history...</section>}>
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
                        historyPageSize={historyPageSize}
                        setHistoryPageSize={setHistoryPageSize}
                        historyPagination={visibleHistoryPagination}
                        pendingSyncCount={queuedCheckoutPendingCount}
                        pendingSyncBlockedCount={queuedCheckoutBlockedCount}
                        syncPendingTransactions={handleManualUniversalSync}
                        syncingPendingTransactions={replayingQueuedCheckouts}
                        syncDisabled={sessionLocked || Boolean(checkoutBlockedReason) || manualSyncPolicy?.remaining <= 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)}
                        syncRemaining={manualSyncPolicy?.remaining}
                        syncResetAt={manualSyncPolicy?.resetAt}
                         universalPendingSyncCount={universalPendingSyncCount}
                         sidebarCollapsed={sidebarCollapsed}
                         posWorkflow={posWorkflow}
                         isMobileViewport={isMobileViewport}
                     />
                </Suspense>
                </div>
            )}

            {currentViewMode === 'checkout' && (
                <div key="view-checkout" className="h-full min-h-0 overflow-hidden catalog-slide-enter">
                <>
                <div className={checkoutGridClassName}>
            <section ref={catalogSectionRef} className={`pos-catalog-pane ${isTabletPortraitMobileLayout ? 'rounded-none border-0 bg-white p-2 pb-0 shadow-none' : isTabletViewport ? 'rounded-xl border border-slate-200 bg-white p-3 pb-0 shadow-sm shadow-slate-200/70' : 'rounded-xl border border-slate-200 bg-white p-4 pb-0 shadow-sm shadow-slate-200/70 sm:p-6 sm:pb-0'} ${IS_DGFY_POS_SURFACE ? 'max-sm:rounded-none max-sm:border-0 max-sm:p-2 max-sm:shadow-none' : ''} ${catalogPaneHeightClassName} flex min-h-0 flex-col overflow-hidden`}>
                    {isTabletViewport && !isTabletPortraitMobileLayout && renderViewModeControls()}
                    <div ref={catalogViewportRef} className={catalogViewportClassName} role="region" aria-label="POS catalog contents">
                <div data-testid="pos-catalog-controls" className={`${isTabletPortraitMobileLayout ? 'mb-3 gap-2.5' : isTabletViewport ? 'mb-3 gap-2.5' : 'mb-4 max-sm:mb-[18px] sm:mb-6 gap-4'} flex min-w-0 shrink-0 flex-col ${isTabletPortraitMobileLayout ? 'pt-2' : 'max-sm:pt-[10px]'} ${IS_DGFY_POS_SURFACE ? (isTabletViewport ? 'lg:flex-row lg:items-start' : 'xl:flex-row xl:items-start') : 'lg:flex-row lg:items-start'}`}>
                    <div className={`${isTabletPortraitMobileLayout ? 'flex-wrap items-center' : isTabletViewport ? 'flex-row items-center' : 'flex-wrap items-center sm:flex-nowrap'} flex min-w-0 flex-1 gap-3 ${isTabletPortraitMobileLayout ? 'relative gap-2.5' : 'max-sm:relative max-sm:gap-2.5'}`}>
                        {/* Mobile: keep the search field visible by default. */}
                        {!isTabletViewport && (
                            <div className={`relative flex min-w-0 flex-1 items-center ${isTabletPortraitMobileLayout ? '' : 'sm:hidden'}`}>
                                <Search size={16} className="pointer-events-none absolute left-3 text-[#1A4E8D]" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search POS-visible items..."
                                    className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-10 text-[13px] text-[#0F172A] shadow-sm placeholder:text-[#64748B] transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                                />
                                <button
                                    type="button"
                                    aria-label="Clear search"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        setSearch('');
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
                        <label className={`${isTabletPortraitMobileLayout ? 'flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[12px] text-[#64748B] shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100' : isTabletViewport ? 'flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[12px] text-[#64748B] shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100' : 'flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 text-[13px] text-[#64748B] shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100'} ${isTabletPortraitMobileLayout ? '' : 'max-sm:hidden'}`}
                        >
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
                                    className={`${isTabletPortraitMobileLayout ? 'flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-bold text-slate-400' : 'flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-bold text-slate-400'}`}
                                    >
                                        Scan
                                    </button>
                                )}>
                                    <POSBarcodeScanner
                                        sessionLocked={sessionLocked}
                                        selectedLocationId={selectedLocationId}
                                        terminalId={normalizedTerminalId}
                                        onAddToCart={addToCart}
                                    className={isTabletPortraitMobileLayout ? 'h-10 w-auto gap-2 px-3 text-[12px]' : 'w-auto h-10 gap-2 px-3 text-[12px]'}
                                    />
                                </Suspense>
                            </div>
                        ) : (
                            <>
                            <Suspense fallback={(
                                <button
                                    type="button"
                                    disabled
                                        aria-label="Scan barcode"
                                        title="Scan barcode"
                                        className={`${isTabletPortraitMobileLayout ? 'flex h-10 w-10 shrink-0 items-center justify-center gap-0 rounded-lg border border-slate-300 bg-white px-0 text-[13px] font-bold text-slate-400' : 'flex h-11 shrink-0 items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-5 text-[13px] font-bold text-slate-400 max-sm:h-10 max-sm:w-10 max-sm:flex-none max-sm:min-w-0 max-sm:gap-0 max-sm:px-0'}`}
                                    >
                                        <ScanLine className="hidden h-5 w-5 max-sm:block" />
                                        <span className={isTabletPortraitMobileLayout ? 'hidden' : 'max-sm:hidden'}>Scan</span>
                                    </button>
                            )}>
                                <POSBarcodeScanner
                                    sessionLocked={sessionLocked}
                                    selectedLocationId={selectedLocationId}
                                    terminalId={normalizedTerminalId}
                                    onAddToCart={addToCart}
                                    className={isTabletPortraitMobileLayout ? 'h-10 w-10 flex-none min-w-0' : 'max-sm:h-10 max-sm:w-10 max-sm:flex-none max-sm:min-w-0'}
                                />
                            </Suspense>
                            </>
                        )}
                </div>
                </div>
                <div
                    ref={folderStripRef}
                    className={`${isTabletViewport && !isTabletPortraitMobileLayout ? 'mb-0 flex cursor-grab items-center gap-2 overflow-x-auto px-1 py-0.5 dgfy-pos-scrollbar-hidden' : 'mb-0 flex cursor-grab items-center gap-2 overflow-x-auto px-1 py-1 dgfy-pos-scrollbar-hidden'}`}
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
                    className={`dgfy-pos-scroll-region dgfy-pos-catalog-scroll relative mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 ${isTabletPortraitMobileLayout ? 'pt-3' : isTabletViewport ? 'pt-4' : 'pt-4 max-sm:pt-[18px] sm:pt-6'} pb-1 touch-pan-y select-none`}
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
                            gridTemplateColumns: IS_DGFY_POS_SURFACE && isTabletViewport
                                ? `repeat(${catalogGridLayout.columns}, minmax(0, 1fr))`
                                : `repeat(auto-fill, minmax(min(100%, ${catalogGridLayout.minimumCardWidth}px), 1fr))`,
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
                            const resolvedImageSources = resolvePosCatalogImageSources(item, receiptSettings);
                            const pendingImagePreview = pendingItemImagePreviews[String(item.item_id)]?.url || '';
                            const imageSources = pendingImagePreview
                                ? {
                                    ...resolvedImageSources,
                                    src: pendingImagePreview,
                                    srcSet: undefined,
                                    avifSrcSet: undefined,
                                    webpSrcSet: undefined
                                }
                                : resolvedImageSources;
                            const { src: posImageSrc } = imageSources;
                            const hasImage = Boolean(posImageSrc);
                            const catalogCardMediaClassName = isTabletPortraitMobileLayout
                                ? `${IS_DGFY_POS_SURFACE ? 'mb-0' : 'mb-1'} h-full min-h-0 w-[144px] min-w-0 flex-none shrink-0 self-stretch`
                                : `${IS_DGFY_POS_SURFACE ? 'mb-0' : 'mb-1'} ${IS_DGFY_POS_SURFACE ? 'sm:flex sm:min-h-0' : ''} max-sm:mb-0 max-sm:h-full max-sm:min-h-0 ${IS_DGFY_POS_SURFACE ? 'max-sm:w-[128px]' : 'max-sm:w-auto'} max-sm:min-w-0 max-sm:flex-none max-sm:shrink-0 max-sm:self-stretch ${IS_DGFY_POS_SURFACE ? '' : 'max-sm:aspect-square'}`;
                            const catalogCardImageFrameClassName = isTabletPortraitMobileLayout
                                ? `${catalogCardImageWrapClassName} relative box-border h-full w-full flex-none`
                                : `${catalogCardImageWrapClassName} relative ${IS_DGFY_POS_SURFACE && !isTabletViewport ? '' : 'max-sm:aspect-square'} max-sm:box-border max-sm:h-full max-sm:w-full max-sm:flex-none`;
                            const cartQuantityForItem = cartQuantityByItemId.get(Number(item.item_id)) || 0;
                            const isEditingThisQuantity = editingQuantityItemId === item.item_id;
                            const isLoadingServiceOptions = serviceOptionsLoadingItemId === Number(item.item_id);
                            const stockColorClassName = getCatalogStockColorClassName(item, lowStockDisplayThreshold);
                            const catalogCardCaptionClassName = !hasImage
                                ? 'flex min-w-0 min-h-[2.5rem] flex-col items-start justify-center p-1 text-left text-[12px] leading-tight'
                                : (isTabletPortraitMobileLayout
                                    ? 'flex min-w-0 flex-col items-start gap-0 p-1 text-[11px] leading-tight'
                                    : isTabletViewport
                                    ? 'flex min-w-0 flex-col items-start gap-0 p-1 text-[12px] leading-tight'
                                    : 'flex min-w-0 flex-col items-start gap-0.5 p-1 min-h-[2.5rem] text-[12px] leading-tight');
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
                                            ? 'cursor-not-allowed opacity-75'
                                            : 'cursor-pointer hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md'
                                    }`}
                                >
                                <div
                                    className={catalogCardMediaClassName}
                                    style={IS_DGFY_POS_SURFACE && (isTabletPortraitMobileLayout || (isMobileViewport && !isTabletViewport && !isMobileLandscapeViewport))
                                        ? { flex: `0 0 ${isTabletPortraitMobileLayout ? 144 : 128}px`, width: `${isTabletPortraitMobileLayout ? 144 : 128}px` }
                                        : undefined}
                                >
                                    <div
                                        className={catalogCardImageFrameClassName}
                                        style={IS_DGFY_POS_SURFACE && (isTabletPortraitMobileLayout || (isMobileViewport && !isTabletViewport && !isMobileLandscapeViewport))
                                        ? { width: `${isTabletPortraitMobileLayout ? 144 : 128}px`, maxWidth: 'none', aspectRatio: 'auto' }
                                            : undefined}
                                        aria-hidden="true"
                                    >
                                        {hasImage ? (
                                            <PosItemImage
                                                item={item}
                                                alt={`${item.name} menu`}
                                                loading={isMobileViewport || isTabletPortraitMobileLayout || itemIndex < 4 ? 'eager' : 'lazy'}
                                                decoding="async"
                                                fetchpriority={isMobileViewport || isTabletPortraitMobileLayout || itemIndex < 4 ? 'high' : 'auto'}
                                                width={144}
                                                height={144}
                                                sizes="144px"
                                                className="product-image h-full w-full object-cover object-center"
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
                                                        tabletPortrait={isTabletPortraitMobileLayout}
                                                    />
                                                </div>
                                                {!hasImage && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-[#1A4E8D]/85 px-2 py-1.5 max-sm:hidden">
                                                        <PosImagelessCatalogName name={item.name} />
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="relative flex flex-1 min-w-0 flex-col gap-1 p-1.5 sm:hidden">
                                    <p className={`min-w-0 max-w-full shrink-0 line-clamp-2 text-[18px] font-black leading-tight ${IS_DGFY_POS_SURFACE ? 'text-[#0F172A]' : stockColorClassName}`}>
                                        {item.name}
                                    </p>
                                    <div className="flex min-w-0 flex-col items-start gap-0.5 pr-14">
                                            {!IS_DGFY_POS_SURFACE && (
                                                <CatalogItemBadges
                                                    isServiceItem={isServiceItem}
                                                    isAlwaysAvailable={isAlwaysAvailable}
                                                    isBestSeller={isBestSeller}
                                                />
                                            )}
                                            <span className={`shrink-0 font-black text-[#1A4E8D] whitespace-nowrap text-[15px] ${!hasImage ? 'pt-px pb-1' : ''}`}>
                                                {Number(item.default_sale_price || 0) > 0 ? `₱${money(item.default_sale_price)}` : 'Not set'}
                                            </span>
                                        </div>
                                        {/* Quantity control, laid out horizontally as [ - ] [ item count ] [ + ].
                                            stopPropagation keeps taps here from also firing the card's own
                                            onClick (which would otherwise double-add the item). Manual entry
                                            uses a sanitized text input (not type="number") so no native
                                            increment/decrement spinner buttons render inside the field. */}
                                        <div
                                            className="absolute bottom-1.5 right-1.5 flex shrink-0 items-center gap-1"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => adjustCartQuantity(item, -1)}
                                                disabled={cartQuantityForItem <= 0 || posActionsBlocked}
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-base font-black leading-none text-[#1A4E8D] active:scale-95 active:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-100"
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
                                                    className="flex h-8 min-w-[2.25rem] max-w-[5.5rem] shrink-0 items-center justify-center overflow-hidden rounded-md px-1 text-center text-[13px] font-black tabular-nums text-[#0F172A] text-ellipsis whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40"
                                                    aria-label={`Quantity for ${item.name}, tap to type a value`}
                                                    title={`Quantity: ${formatQuantity(cartQuantityForItem)}`}
                                                >
                                                    {formatQuantity(cartQuantityForItem)}
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
                                                className="flex h-8 w-8 shrink-0 touch-none select-none items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-base font-black leading-none text-[#1A4E8D] active:scale-95 active:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-100"
                                                aria-label={`Increase quantity for ${item.name}. Tap to add one, or press and hold then drag up to add more.`}
                                            >
                                                +
                                            </button>
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
                                {IS_DGFY_POS_SURFACE ? (
                                    <div
                                        data-pos-catalog-card-caption="true"
                                        className={`${catalogCardCaptionClassName} max-sm:hidden`}
                                    >
                                        {hasImage && (
                                            <p className="min-w-0 max-w-full truncate text-left font-black text-[#0F172A]">
                                                {item.name}
                                            </p>
                                        )}
                                        <span className={`font-black tracking-[0.01em] ${isOutOfStock ? 'text-rose-700' : 'text-[#1A4E8D]'}`}>
                                            {isOutOfStock
                                                ? 'Unavailable'
                                                : Number(item.default_sale_price || 0) > 0
                                                    ? `₱${money(item.default_sale_price)}`
                                                    : 'Not set'}
                                        </span>
                                    </div>
                                ) : (
                                    <>
                                        <div className={`${isTabletViewport ? 'mt-1.5' : 'mt-3'} grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10.5px] text-[#64748B] max-sm:hidden`}>
                                            <span className="font-semibold">Stock:</span>
                                            <span className={`text-right font-bold whitespace-nowrap ${stockColorClassName}`}>
                                                {isServiceItem ? 'Service' : isAlwaysAvailable ? 'Always available' : Number(item.current_stock || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="font-semibold">Price:</span>
                                            <span className="text-right font-black text-[#1A4E8D] whitespace-nowrap">
                                                {Number(item.default_sale_price || 0) > 0
                                                    ? `₱${money(item.default_sale_price)}`
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
                        className="relative z-10 mt-auto w-full shrink-0 border-t border-slate-200 bg-white shadow-[0_-1px_0_rgba(148,163,184,0.14)]"
                    >
                        <GlobalPagination
                            testId="pos-catalog-pagination"
                            ariaLabel="Product catalog pagination"
                            currentPage={catalogPage}
                            totalPages={totalCatalogPages}
                            totalItems={catalogForDisplay.length || 0}
                            start={visibleCatalogRange.start}
                            end={visibleCatalogRange.end}
                            pageSize={catalogPageSize}
                            pageSizeOptions={catalogPageSizeOptions}
                            loading={catalogLoading || catalogRefreshing}
                            onPageChange={handleCatalogPageChange}
                            onPageSizeChange={handleCatalogPageSizeChange}
                            className={`${isTabletViewport ? 'rounded-none border-0 px-2 py-2 shadow-none' : 'rounded-none border-0 px-3 py-3 shadow-none max-sm:px-2 max-sm:py-2'}`}
                        />
                    </div>
            </section>

            {mobileCheckoutPanelOpen && (
                <div
                    className={`pos-current-sale-mobile-overlay fixed inset-0 z-40 bg-slate-950/70 ${isTabletPortraitMobileLayout ? '' : 'md:hidden'}`}
                    onClick={() => setMobileCheckoutPanelOpen(false)}
                    aria-hidden="true"
                />
            )}

            <aside
                data-testid="pos-current-sale-panel"
                className={`${checkoutPaneClassName} pos-mobile-bottom-sheet pos-current-sale-mobile-sheet ${((isMobileViewport && !isMobileLandscapeViewport) || isTabletPortraitMobileLayout) ? 'pos-current-sale-portrait-sheet' : ''} ${checkoutOpenedFromCurrentSale ? 'pos-current-sale-handoff' : ''} ${mobileCheckoutPanelOpen
                    ? 'fixed inset-x-0 bottom-0 z-50 translate-y-0 pointer-events-auto'
                    : 'fixed inset-x-0 bottom-0 z-50 translate-y-full pointer-events-none'
                } transition-transform duration-300 ease-out motion-reduce:transition-none ${isTabletPortraitMobileLayout ? '' : 'md:static md:z-auto md:h-auto md:max-h-none md:translate-y-0 md:overflow-hidden md:pointer-events-auto md:transition-none'}`}
            >
            <section className={`pos-current-sale-mobile-sheet-content relative flex min-h-0 flex-col overflow-hidden rounded-t-2xl rounded-b-none border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/20 ${isTabletViewport ? '' : 'sm:p-4'} ${isTabletPortraitMobileLayout ? '' : 'md:rounded-xl md:shadow-sm md:shadow-slate-200/70'} ${currentSalePaneHeightClassName}`}>
                    <div role="region" aria-label="Current sale contents" className="dgfy-pos-current-sale-scroll-surface flex min-h-0 flex-1 flex-col overflow-hidden">
                <div data-testid="pos-current-sale-header" className="relative mb-2 shrink-0">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className={`${isTabletPortraitMobileLayout ? 'text-[21px]' : isTabletViewport ? 'text-[18px] sm:text-[19px] lg:text-[20px]' : 'text-[21px]'} font-black tracking-tight text-[#0F172A]`}>Current Sale</h2>
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
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 ${isTabletPortraitMobileLayout ? '' : 'md:hidden'}`}
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
                            isMsmeMode={isMsmeMode}
                            checkoutContext={splitPaymentCheckoutContext}
                            employeeCreditAccountCode={employeeCreditAccountCode}
                            employeeCreditAccount={employeeCreditAccount}
                            selectedEmployeeCreditOption={selectedEmployeeCreditOption}
                            employeeCreditLookupLoading={employeeCreditLookupLoading}
                            canUseEmployeeCredit={canUseEmployeeCredit}
                            onSelectEmployeeCredit={handleSelectEmployeeCredit}
                            onSessionStateChange={handleSplitPaymentSessionStateChange}
                            onReadyToComplete={handleCompletePreparedSplitPayment}
                        />
                    </Suspense>
                </div>
                <div data-testid="pos-current-sale-scroll" className={currentSaleBodyClassName}>
                <div className={`col-span-2 flex min-h-0 flex-col overflow-hidden ${isTabletPortraitMobileLayout ? '' : 'md:h-[clamp(18rem,46vh,26rem)] md:flex-none'}`}>
                <div className="min-h-0 flex-1 overflow-hidden border-b border-slate-200 pb-2">
                    <div data-testid="pos-current-sale-items" className={`space-y-2.5 ${currentSaleItemsListClassName}`}>
                        {safeCart.length > 0 ? safeCart.map((line) => {
                            const lineKey = getLineKey(line);
                            const parkedLineState = getParkedLineEditState(
                                line,
                                safeCatalog.find((item) => Number(item?.item_id) === Number(line?.item_id)),
                                activeParkedSale
                            );
                            const isLockedParkedLine = parkedLineState.isOriginal;
                            const canIncreaseParkedLine = parkedLineState.canIncrease;
                            return (
                                <div
                                    key={lineKey}
                                    role="button"
                                    tabIndex={sessionLocked || isLockedParkedLine ? -1 : 0}
                                    aria-disabled={sessionLocked || isLockedParkedLine}
                                    aria-label={isLockedParkedLine ? `${line.item_name} parked line locked` : `Customize ${line.item_name}`}
                                    data-testid={`pos-item-options-trigger-${lineKey}`}
                                    onClick={() => {
                                        if (!sessionLocked && !isLockedParkedLine) setItemOptionsLineKey(lineKey);
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.target !== event.currentTarget) return;
                                        if ((event.key === 'Enter' || event.key === ' ') && !sessionLocked && !isLockedParkedLine) {
                                            event.preventDefault();
                                            setItemOptionsLineKey(lineKey);
                                        }
                                    }}
                                    className="relative box-border w-full min-w-0 cursor-pointer overflow-hidden rounded-lg border border-blue-300 bg-clip-padding bg-slate-50 p-2.5 transition-colors hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className="flex min-w-0 items-center gap-2.5 text-left">
                                                <span className="min-w-0">
                                                    <span className="block max-w-full line-clamp-2 text-[13px] font-black leading-tight break-words text-[#0F172A] sm:text-[14px]">{line.item_name}</span>
                                                    {!isLockedParkedLine ? (
                                                        <span className="mt-0.5 hidden text-[10px] font-bold text-blue-700 sm:block sm:text-[11px]">
                                                            Tap item to customize
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                {Array.isArray(line.service_option_details) && line.service_option_details.length > 0 ? (
                                                    <p className="mt-0.5 break-words line-clamp-2 text-[10px] font-semibold text-blue-700 sm:text-[11px]">
                                                        Options: {line.service_option_details.map((option) => option.name).filter(Boolean).join(', ')}
                                                    </p>
                                                ) : null}
                                                {line.special_instructions ? (
                                                    <p className="mt-1 max-w-full break-words line-clamp-2 text-[10px] font-semibold text-slate-600 sm:text-[11px]">
                                                        Note: {line.special_instructions}
                                                    </p>
                                                ) : null}
                                                {line.item_discount ? (
                                                    <p className="mt-1 max-w-full break-words line-clamp-2 text-[10px] font-extrabold text-rose-600 sm:text-[11px]">
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
                                                            ? `-₱${money(line.item_discount.amount)}`
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
                                            title={isLockedParkedLine ? 'Remove parked item (reason required)' : 'Remove item'}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div
                                        className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 sm:grid-cols-2 sm:gap-2"
                                        onClick={(event) => event.stopPropagation()}
                                        onKeyDown={(event) => event.stopPropagation()}
                                    >
                                        <label className="text-[11px] text-slate-500 sm:text-[12px]">
                                            Qty
                                            {/* Mobile: read-only, qty is managed from the catalog card's stepper. */}
                                            <div className="mt-1 flex items-center gap-1 sm:hidden">
                                                <button
                                                    type="button"
                                                    onClick={() => updateCartQuantity(lineKey, Number(line.quantity || 0) - 1)}
                                                    disabled={posActionsBlocked || isLockedParkedLine}
                                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-base font-black leading-none text-[#1A4E8D] active:scale-95 active:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-100"
                                                    aria-label={`Decrease quantity for ${line.item_name}`}
                                                >
                                                    −
                                                </button>
                                                <span className="flex h-8 min-w-[2.25rem] max-w-[5.5rem] shrink-0 items-center justify-center overflow-hidden rounded-md px-1 text-center text-[13px] font-black tabular-nums text-[#0F172A] text-ellipsis whitespace-nowrap">
                                                    {formatQuantity(line.quantity)}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => updateCartQuantity(lineKey, Number(line.quantity || 0) + 1)}
                                                    disabled={posActionsBlocked || (isLockedParkedLine && !canIncreaseParkedLine)}
                                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-base font-black leading-none text-[#1A4E8D] active:scale-95 active:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-100"
                                                    aria-label={`Increase quantity for ${line.item_name}`}
                                                >
                                                    +
                                                </button>
                                            </div>
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
                                                    disabled={posActionsBlocked || isLockedParkedLine}
                                                >
                                                    <Minus className="h-3.5 w-3.5" />
                                                </Button>
                                                <span className={`flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 text-center text-[13px] font-extrabold tabular-nums text-[#0F172A] text-ellipsis whitespace-nowrap ${isTabletViewport ? 'h-10' : 'h-8'}`}>
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
                                                    disabled={posActionsBlocked || (isLockedParkedLine && !canIncreaseParkedLine)}
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </label>
                                        <div className="text-[11px] text-slate-500 sm:text-[12px]">
                                            <span>Unit price</span>
                                            <p className="mt-1 h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-[13px] font-extrabold leading-8 text-[#0F172A] sm:text-[14px]">
                                                ₱{money(line.sale_price)}
                                            </p>
                                            <p className="mt-1 text-[10px] font-bold text-slate-500 sm:text-[11px]">
                                                Line total: ₱{money(getCartLineSubtotal(line))}
                                            </p>
                                            {isLockedParkedLine && (parkedLineState.itemMissing || parkedLineState.priceChanged) ? (
                                                <p className="mt-1 text-[10px] font-bold text-amber-700 sm:text-[11px]">
                                                    {parkedLineState.itemMissing
                                                        ? 'Item unavailable; additions disabled.'
                                                        : 'Price changed; add as a separate line.'}
                                                </p>
                                            ) : null}
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
                            <span className="text-[13px] font-extrabold text-[#0F172A]">₱{money(cartSubtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#334155]">
                                Item discount
                            </span>
                            <span className="font-extrabold text-rose-600">- ₱{money(itemDiscountTotals.discountAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#334155]">
                                Global discount{appliedDiscount ? ` (${appliedDiscount.label})` : (selectedDiscount ? ` (${selectedDiscount.name})` : '')}
                            </span>
                            <span className="font-extrabold text-rose-600">- ₱{money(globalDiscountAmount)}</span>
                        </div>
                        {governedDiscountTotals.vatRemoved > 0 && <div className="flex justify-between"><span className="text-[#334155]">VAT Removed</span><span className="font-extrabold text-rose-600">- ₱{money(governedDiscountTotals.vatRemoved)}</span></div>}
                        {governedDiscountTotals.vatExemptAmount > 0 && <div className="flex justify-between"><span className="text-[#334155]">VAT-Exempt Amount</span><span className="font-extrabold text-[#0F172A]">₱{money(governedDiscountTotals.vatExemptAmount)}</span></div>}
                        <div className="flex justify-between">
                            <span className="text-[#334155]">Net Items</span>
                            <span className="font-extrabold text-[#0F172A]">₱{money(netItemsTotal)}</span>
                        </div>
                        <div className="col-span-2 my-1 border-t border-dashed border-slate-200" />
                        <div className="flex justify-between">
                            <span className="text-slate-600">VATable Sales</span>
                            <span className="font-medium">₱{money(vatBreakdown.vatableSales)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">VAT Amount (12%)</span>
                            <span className="font-medium">₱{money(vatBreakdown.vatAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">VAT Exempt Sales</span>
                            <span className="font-medium">₱{money(vatBreakdown.vatExemptSales)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Zero Rated Sales</span>
                            <span className="font-medium">₱{money(vatBreakdown.zeroRatedSales)}</span>
                        </div>
                        <div className="col-span-2 mt-1 flex items-baseline justify-between border-t border-slate-200 pt-1">
                            <span className="text-[18px] font-black text-[#0F172A]">Total</span>
                            <span className="text-[18px] font-black text-[#1A4E8D]">₱{money(cartTotal)}</span>
                        </div>
                    </div>

                    <div data-testid="pos-current-sale-desktop-summary" className="hidden gap-y-0.5 md:grid">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[13px] text-[#334155]">Items Subtotal</span>
                            <span className="whitespace-nowrap text-right text-[13px] font-extrabold tabular-nums text-[#0F172A]">₱{money(cartSubtotal)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Net Items</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-[#0F172A]">₱{money(netItemsTotal)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Item discount</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-rose-600">-₱{money(itemDiscountTotals.discountAmount)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Global discount{appliedDiscount ? ` (${appliedDiscount.label})` : (selectedDiscount ? ` (${selectedDiscount.name})` : '')}</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-rose-600">-₱{money(globalDiscountAmount)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-[#334155]">Total discounts</span>
                            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-rose-600">-₱{money(calculatedDiscountAmount)}</span>
                        </div>
                        {governedDiscountTotals.vatRemoved > 0 && (
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                                <span className="min-w-0 text-[#334155]">VAT Removed</span>
                                <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-rose-600">-₱{money(governedDiscountTotals.vatRemoved)}</span>
                            </div>
                        )}
                        {governedDiscountTotals.vatExemptAmount > 0 && (
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                                <span className="min-w-0 text-[#334155]">VAT-Exempt Amount</span>
                                <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-[#0F172A]">₱{money(governedDiscountTotals.vatExemptAmount)}</span>
                            </div>
                        )}
                        <div className="my-1 border-t border-dashed border-slate-200" />
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-slate-600">VATable Sales</span>
                            <span className="whitespace-nowrap text-right font-medium tabular-nums">₱{money(vatBreakdown.vatableSales)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-slate-600">VAT Exempt Sales</span>
                            <span className="whitespace-nowrap text-right font-medium tabular-nums">₱{money(vatBreakdown.vatExemptSales)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-slate-600">VAT Amount (12%)</span>
                            <span className="whitespace-nowrap text-right font-medium tabular-nums">₱{money(vatBreakdown.vatAmount)}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 leading-4">
                            <span className="min-w-0 text-slate-600">Zero Rated Sales</span>
                            <span className="whitespace-nowrap text-right font-medium tabular-nums">₱{money(vatBreakdown.zeroRatedSales)}</span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between border-t border-slate-200 pt-1">
                            <span className="text-[18px] font-black text-[#0F172A]">Total</span>
                            <span className="whitespace-nowrap text-[18px] font-black tabular-nums text-[#1A4E8D]">₱{money(cartTotal)}</span>
                        </div>
                    </div>
                </div>
                {(checkoutBlockedReason || safeCart.length === 0) && (
                    <div className="col-span-2 shrink-0 border-t border-slate-200 pt-2">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
                            {checkoutBlockedReason || 'Add at least one item before checkout.'}
                        </div>
                    </div>
                )}

                {Number(universalPendingSyncCount || 0) > 0 && (
                    <div
                        className="col-span-2 flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 pt-2"
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

                </div>

                {!posHardware.loading && !isPrinterAvailable && (
                    <div data-testid="pos-no-printer-notice" className="shrink-0 border-t border-slate-200 pt-2">
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-600">
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

                <div className="shrink-0 bg-white">
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
                            cashDrawerAvailable={cashDrawerAvailable}
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
                    </div>
            </section>
            </aside>

                </div>

                <div
                    id="checkout-bar"
                    className={`fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-4 pt-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] ${isTabletPortraitMobileLayout ? '' : 'md:hidden'}`}
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
                                ₱{money(cartTotal)}
                            </p>
                        </div>
                        <Button
                            id="checkout-bar-button"
                            type="button"
                            onClick={() => setMobileCheckoutPanelOpen(true)}
                            disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0}
                            className="h-11 shrink-0 rounded-lg bg-[#1A4E8D] px-5 text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <ShoppingCart size={16} className="mr-1.5" aria-hidden="true" />
                            {checkoutLoading ? 'Processing...' : 'Cart'}
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
                    <form
                        id="pos-drawer-authorization-form"
                        className="space-y-4 px-5 py-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            submitDrawerAuthorization();
                        }}
                    >
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
                    </form>
                    <DialogFooter className="grid w-full grid-cols-1 items-stretch gap-2 border-t border-slate-200 px-5 py-4 sm:grid-cols-2 sm:gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDrawerAuthorizationModalOpen(false)}
                            disabled={drawerAuthorizationSubmitting}
                            className="order-2 h-10 w-full min-w-0 px-2 sm:order-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            form="pos-drawer-authorization-form"
                            disabled={drawerAuthorizationSubmitting}
                            aria-busy={drawerAuthorizationSubmitting}
                            className="order-1 h-10 w-full min-w-0 bg-[#1A4E8D] px-2 text-white hover:bg-[#143F73] sm:order-2"
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
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 px-4 py-6"
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
                                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#334155]">Terminal Setup</p>
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
                                    <span className="text-[13px] font-extrabold text-[#0F172A]">₱{money(setupMeta.pettyCashAmount)}</span>
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
                            if (cancelledSale?.status !== 'cancelled') return;
                            clearPosCartDraft(offlineSnapshotScope, activeShiftId);
                            setActiveParkedSale(null);
                            resetCurrentSaleForNewSale();
                        }}
                    />
                </Suspense>
            )}
            <Dialog
                open={Boolean(parkedLineDeletionRequest)}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) cancelParkedLineDeletion();
                }}
            >
                <DialogContent
                    className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full"
                    data-testid="pos-parked-line-deletion-dialog"
                >
                    <form
                        className="flex flex-col"
                        onSubmit={(event) => {
                            event.preventDefault();
                            confirmParkedLineDeletion();
                        }}
                    >
                        <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left">
                            <DialogTitle className="text-lg font-black text-slate-900">Remove parked item?</DialogTitle>
                            <DialogDescription className="text-sm text-slate-600">
                                Removing the original parked line requires a reason and is recorded with the parked-sale update.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 px-5 py-4">
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                                {parkedLineDeletionRequest?.line?.item_name || 'This parked item'}
                            </div>
                            <div>
                                <label htmlFor="pos-parked-line-deletion-reason" className="text-xs font-extrabold text-slate-700">
                                    Reason <span className="text-rose-600">*</span>
                                </label>
                                <Input
                                    id="pos-parked-line-deletion-reason"
                                    data-testid="pos-parked-line-deletion-reason"
                                    value={parkedLineDeletionReason}
                                    onChange={(event) => setParkedLineDeletionReason(event.target.value)}
                                    placeholder="e.g. Customer removed item"
                                    maxLength={255}
                                    autoFocus
                                />
                                <p className="mt-1 text-[11px] text-slate-500">Minimum 3 characters.</p>
                            </div>
                        </div>
                        <DialogFooter className="flex-row gap-2 border-t border-slate-200 px-5 py-4 sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={cancelParkedLineDeletion}
                                className="min-w-0 flex-1"
                            >
                                Keep item
                            </Button>
                            <Button
                                type="submit"
                                disabled={parkedLineDeletionReason.trim().length < 3}
                                className="min-w-0 flex-1 bg-rose-600 text-white hover:bg-rose-700"
                                data-testid="pos-confirm-parked-line-deletion"
                            >
                                Remove item
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
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
                        <DialogFooter className="flex-row gap-2 border-0 px-5 !pt-1 pb-3 sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setParkSaleNameDialogOpen(false)}
                                disabled={parkLoading}
                                className="min-w-0 flex-1"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={parkLoading || !parkSaleNameInput.trim()}
                                className="min-w-0 flex-1 bg-[#1A4E8D] hover:bg-[#143F73]"
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
                    <DialogFooter className="!flex-row flex-nowrap items-center !gap-3 border-t border-slate-200 px-5 py-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleClearSaleDialogOpenChange(false)}
                            className="h-11 min-w-0 flex-1 px-2 text-[12px] sm:px-4 sm:text-[13px]"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={confirmClearCurrentSale}
                            className="h-11 min-w-0 flex-1 whitespace-nowrap bg-rose-600 px-2 text-[12px] text-white hover:bg-rose-700 sm:px-4 sm:text-[13px]"
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

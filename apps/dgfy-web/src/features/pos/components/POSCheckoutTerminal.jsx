import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
    fetchPosDiscountApprovers,
    verifyPosDiscountApproval
} from '../services/posService';
import {
    TERMINAL_QUEUE_STATUS,
    hydrateTerminalOperationQueueStore
} from '../services/terminalOperationQueueStore.js';
import { usePosCartDraft } from '../hooks/usePosCartDraft.js';
import { usePosCatalogWorkflow } from '../hooks/usePosCatalogWorkflow.js';
import { usePosCartWorkflow } from '../hooks/usePosCartWorkflow.js';
import { usePosEmployeeCreditWorkflow } from '../hooks/usePosEmployeeCreditWorkflow.js';
import { usePosFinancialWorkflow } from '../hooks/usePosFinancialWorkflow.js';
import { usePosHistoryVoidWorkflow } from '../hooks/usePosHistoryVoidWorkflow.js';
import { usePosCheckoutWorkflow } from '../hooks/usePosCheckoutWorkflow.js';
import { usePosReceiptHardwareWorkflow } from '../hooks/usePosReceiptHardwareWorkflow.js';
import POSCheckoutTerminalView from './POSCheckoutTerminalView.jsx';
import { clearPosCartDraft } from '../services/posCartDraftStore.js';
import {
    DEFAULT_LOW_STOCK_DISPLAY_THRESHOLD,
    normalizeLowStockDisplayThreshold
} from '../utils/posCatalogAvailability.js';
import { getAllSettings } from '@/services/settingsService';
import { notifyIminWebPosReady } from '../utils/iminHardwareBridge.js';
import { usePosHardware } from '../hardware/usePosHardware.js';
import { resolvePosWorkflow } from '../utils/posWorkflowResolver.js';
import { resolvePosPresentationBundle } from '../utils/posPresentationBundle.js';
import { publishPosUpdateSafetyState } from '../utils/posUpdateSafety.js';
import { getItemDiscountDraft } from '../utils/posItemDiscount.js';
import {
    EMPTY_DISCOUNT_DRAFT,
    getLineKey,
    isSeniorPwdDiscountEligible,
    normalizeDiscountProfiles,
    normalizePromoCode,
    round4,
    toArray
} from '../utils/posCheckoutTerminalUtils.js';
import { resolveModifierDelta } from '../utils/posCheckoutTerminalModifiers.js';
const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';
// Mobile-only "fly to checkout bar" animation. Fires after the cart update (never blocks or
// delays it), animates a cloned .product-image from the tapped card to #checkout-bar, and
// removes itself on finish/cancel. Skips silently if not mobile, no image, or no target -
// never throws, never touches cart/backend state.
const flyImageToCheckoutBar = (cardElement) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!window.matchMedia('(max-width: 639.98px)').matches) return;
    if (!cardElement) return;
    const sourceImg = cardElement.querySelector('.product-image');
    if (!sourceImg || typeof sourceImg.animate !== 'function') return;

    const checkoutBar = document.getElementById('checkout-bar');
    if (!checkoutBar) return;
    // Land on the Checkout button (right side of the bar) instead of the bar's midpoint;
    // falls back to the bar itself if the button isn't in the DOM for some reason.
    const checkoutTarget = document.getElementById('checkout-bar-button') || checkoutBar;

    const sourceRect = sourceImg.getBoundingClientRect();
    if (sourceRect.width === 0 || sourceRect.height === 0) return;
    const targetRect = checkoutTarget.getBoundingClientRect();

    const size = 44;
    const clone = sourceImg.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.cssText = [
        'position: fixed',
        `left: ${sourceRect.left + (sourceRect.width / 2) - (size / 2)}px`,
        `top: ${sourceRect.top + (sourceRect.height / 2) - (size / 2)}px`,
        `width: ${size}px`,
        `height: ${size}px`,
        'border-radius: 9999px',
        'object-fit: cover',
        'pointer-events: none',
        'z-index: 2147483647',
        'will-change: transform, opacity'
    ].join(';');
    document.body.appendChild(clone);

    const deltaX = (targetRect.left + targetRect.width / 2) - (sourceRect.left + sourceRect.width / 2);
    const deltaY = (targetRect.top + targetRect.height / 2) - (sourceRect.top + sourceRect.height / 2);

    const animation = clone.animate(
        [
            { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0 },
            { transform: `translate(${deltaX * 0.5}px, ${deltaY * 0.35}px) scale(0.7)`, opacity: 1, offset: 0.6 },
            { transform: `translate(${deltaX}px, ${deltaY}px) scale(0.15)`, opacity: 0, offset: 1 }
        ],
        { duration: 550, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)', fill: 'forwards' }
    );

    const cleanup = () => clone.remove();
    if (animation.finished && typeof animation.finished.then === 'function') {
        animation.finished.then(cleanup).catch(cleanup);
    } else {
        animation.onfinish = cleanup;
        animation.oncancel = cleanup;
    }
};

export default function POSCheckoutTerminal({
    sessionLocked = false,
    isMsmeMode = false,
    sidebarCollapsed = false,
    canViewHistory = true,
    terminalUser = null,
    selectedLocationId = null,
    activeShiftId = null,
    activeShiftCashierId = null,
    terminalId = '',
    terminalMeta = null,
    offlineSnapshotScope: providedOfflineSnapshotScope = {},
    onCheckoutCompleted = null,
    checkoutBlockedReason = '',
    onManualUniversalSync = async () => ({ allowed: false }),
    onQueueOfflineOperation = async () => null,
    manualSyncPolicy = {},
    universalPendingSyncCount = 0,
    modalOnly = false,
    viewMode: controlledViewMode = null,
    onViewModeChange = null,
    externalReceiptTransactionId = null,
    onExternalReceiptHydrated = null,
    onExternalReceiptClosed = null,
    externalHistoryQuery = '',
    onExternalHistoryHydrated = null,
    externalCatalogSearch = '',
    onExternalCatalogHydrated = null,
    fnbContext = null,
    workflowMode = null,
    effectiveCapabilities = null
}) {
    useEffect(() => {
        notifyIminWebPosReady();
    }, []);
    const [viewMode, setViewMode] = useState('checkout');
    const [itemOptionsLineKey, setItemOptionsLineKey] = useState(null);
    const [receiptSettings, setReceiptSettings] = useState({});
    // Issue #178 Phase 21: effectiveCapabilities (the tenant's Store Profile
    // modules list, when supplied by the caller) lets a curated
    // fnb_counter_service-style store resolve the counter workflow instead
    // of the full fnb one - without it, a template's subtraction was
    // enforced by the API (Phase 19) but still rendered tables/kitchen
    // buttons the API would then 403. Omitting the prop keeps every other
    // caller (and every test) on today's mode-only behavior.
    const posWorkflow = useMemo(
        () => resolvePosWorkflow(workflowMode, effectiveCapabilities),
        [workflowMode, effectiveCapabilities]
    );
    const posPresentationBundle = useMemo(
        () => resolvePosPresentationBundle(posWorkflow),
        [posWorkflow]
    );

    const isFnbWorkflow = posWorkflow.mode === 'fnb';
    const [orderMethod, setOrderMethod] = useState(() => posWorkflow.allowedMethods[0] || 'dine_in');
    const [tableNumber, setTableNumber] = useState('');
    const [kitchenNotes, setKitchenNotes] = useState('');
    const [servicesClientName, setServicesClientName] = useState('');
    const [servicesDateTime, setServicesDateTime] = useState('');
    const [servicesProvider, setServicesProvider] = useState('');
    const [servicesResource, setServicesResource] = useState('');
    const [servicesNotes, setServicesNotes] = useState('');

    useEffect(() => {
        if (posWorkflow && !posWorkflow.allowedMethods.includes(orderMethod)) {
            setOrderMethod(posWorkflow.allowedMethods[0] || (posWorkflow.mode === 'services' ? 'walk_in' : 'dine_in'));
        }
    }, [posWorkflow, orderMethod]);
    const isCheckoutWorkflowValid = posWorkflow.allowedMethods.includes(orderMethod)
        && (posWorkflow.mode !== 'services' || servicesClientName.trim().length > 0)
        && (orderMethod !== 'appointment' || Boolean(servicesDateTime));
    const [paymentType, setPaymentType] = useState('cash');
    const {
        employeeCreditAccountCode,
        employeeCreditAccount,
        selectedEmployeeCreditOption,
        employeeCreditLookupLoading,
        resetEmployeeCredit,
        handleSelectEmployeeCredit
    } = usePosEmployeeCreditWorkflow();
    const [discountProfiles, setDiscountProfiles] = useState([]);
    const [selectedDiscountProfile, setSelectedDiscountProfile] = useState('');
    const [manualDiscountMode, setManualDiscountMode] = useState('none');
    const [manualDiscountRateInput, setManualDiscountRateInput] = useState('');
    const [manualDiscountAmountInput, setManualDiscountAmountInput] = useState('');
    const [discountModalOpen, setDiscountModalOpen] = useState(false);
    const discountReturnToCheckoutRef = useRef(false);
    const [discountDraft, setDiscountDraft] = useState(EMPTY_DISCOUNT_DRAFT);
    const [appliedDiscount, setAppliedDiscount] = useState(null);
    const discountApprovalRef = useRef(null);
    const itemDiscountApprovalRef = useRef(new Map());
    const itemDiscountApproversRequestedRef = useRef(false);
    const [discountApplying, setDiscountApplying] = useState(false);
    const [affiliateCodeInput, setAffiliateCodeInput] = useState('');
    const [showDiscountPin, setShowDiscountPin] = useState(false);
    const [activeParkedSale, setActiveParkedSale] = useState(null);
    const [parkedSalePayContext, setParkedSalePayContext] = useState(null);
    const [parkedSaleReleaseLoading, setParkedSaleReleaseLoading] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [parkLoading, setParkLoading] = useState(false);
    const [parkedSalesDialogOpen, setParkedSalesDialogOpen] = useState(false);
    const [headerParkedSalesHistorySlot, setHeaderParkedSalesHistorySlot] = useState(null);
    const [parkSaleNameDialogOpen, setParkSaleNameDialogOpen] = useState(false);
    const [parkSaleNameInput, setParkSaleNameInput] = useState('');
    const [queuedCheckouts, setQueuedCheckouts] = useState([]);
    const [replayingQueuedCheckouts, setReplayingQueuedCheckouts] = useState(false);
    const [lastReceipt, setLastReceipt] = useState(null);
    const [lastReceiptContract, setLastReceiptContract] = useState(null);
    const [lowStockDisplayThreshold, setLowStockDisplayThreshold] = useState(DEFAULT_LOW_STOCK_DISPLAY_THRESHOLD);
    const [commercialPromoConfig, setCommercialPromoConfig] = useState([]);
    const [discountApprovers, setDiscountApprovers] = useState([]);
    const [discountApproversLoading, setDiscountApproversLoading] = useState(false);
    const posHardware = usePosHardware({ enabled: Boolean(terminalUser) });
    const [imagePreview, setImagePreview] = useState(null);
    const [setupSnapshotModalOpen, setSetupSnapshotModalOpen] = useState(false);
    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        setHeaderParkedSalesHistorySlot(document.querySelector('[data-testid="pos-header-park-slot"]'));
        return undefined;
    }, []);

    const [checkoutConfirmModalOpen, setCheckoutConfirmModalOpen] = useState(false);
    const [splitPaymentDialogOpen, setSplitPaymentDialogOpen] = useState(false);
    const [splitPaymentSession, setSplitPaymentSession] = useState(null);
    const [splitPaymentCancelModalOpen, setSplitPaymentCancelModalOpen] = useState(false);
    const [splitPaymentCancelLoading, setSplitPaymentCancelLoading] = useState(false);
    const [splitPaymentWorkflowVersion, setSplitPaymentWorkflowVersion] = useState(0);
    const [mobileCheckoutPanelOpen, setMobileCheckoutPanelOpen] = useState(false);

    const handleSplitPaymentSessionStateChange = useCallback((nextState) => {
        setSplitPaymentSession(nextState?.active && nextState?.session ? nextState.session : null);
    }, []);

    const splitPaymentStorageScopeKey = useMemo(() => (
        [
            providedOfflineSnapshotScope?.tenantId || 'tenant',
            terminalUser?.user_id || terminalUser?.id || terminalUser?.email || 'cashier',
            terminalId || 'terminal',
            activeShiftId || 'shift',
            selectedLocationId || 'location'
        ].map((value) => String(value)).join(':')
    ), [
        activeShiftId,
        terminalId,
        providedOfflineSnapshotScope?.tenantId,
        selectedLocationId,
        terminalUser?.email,
        terminalUser?.id,
        terminalUser?.user_id
    ]);
    const [currentSaleHelpOpen, setCurrentSaleHelpOpen] = useState(false);
    const [clearSaleConfirmOpen, setClearSaleConfirmOpen] = useState(false);
    const isViewModeControlled = typeof controlledViewMode === 'string' && controlledViewMode.length > 0;
    const currentViewMode = isViewModeControlled ? controlledViewMode : viewMode;
    const normalizedTerminalId = String(terminalId || '').trim();
    const offlineSnapshotScope = useMemo(() => ({
        tenantId: providedOfflineSnapshotScope?.tenantId,
        terminalId: providedOfflineSnapshotScope?.terminalId || normalizedTerminalId,
        locationId: providedOfflineSnapshotScope?.locationId || selectedLocationId,
        userId: providedOfflineSnapshotScope?.userId
            || terminalUser?.user_id
            || terminalUser?.id
            || terminalUser?.email
    }), [
        normalizedTerminalId,
        providedOfflineSnapshotScope?.locationId,
        providedOfflineSnapshotScope?.tenantId,
        providedOfflineSnapshotScope?.terminalId,
        providedOfflineSnapshotScope?.userId,
        selectedLocationId,
        terminalUser?.email,
        terminalUser?.id,
        terminalUser?.user_id
    ]);
    const {
        catalog,
        setCatalog,
        catalogImageErrors,
        setCatalogImageErrors,
        catalogError,
        catalogLoading,
        catalogRefreshing,
        selectedFolderId,
        setSelectedFolderId,
        mobileSearchExpanded,
        setMobileSearchExpanded,
        posFoldersLoading,
        posFoldersError,
        search,
        setSearch,
        isTabletViewport,
        catalogPage,
        catalogGridLayout,
        catalogSectionRef,
        catalogViewportRef,
        catalogCapacityViewportRef,
        folderStripRef,
        catalogGridRef,
        catalogSwipeStartXRef,
        catalogSwipePointerIdRef,
        availableCategories,
        catalogPageSize,
        catalogForDisplay,
        totalCatalogPages,
        visibleCatalogItems,
        visibleCatalogRange,
        loadCatalog,
        loadPosFolders,
        saveCatalogSnapshot,
        handleCatalogPageChange,
        handleCatalogSwipeStart,
        handleCatalogSwipeEnd,
        handleFolderStripPointerDown,
        handleFolderStripPointerMove,
        handleFolderStripPointerEnd,
        handleFolderStripClickCapture,
        handleFolderStripWheel,
        toggleFolderFilter,
        handleSearchBackspaceStart,
        handleSearchBackspaceEnd
    } = usePosCatalogWorkflow({
        sessionLocked,
        canViewHistory,
        selectedLocationId,
        offlineSnapshotScope,
        currentViewMode,
        sidebarCollapsed,
        isDgfyPosSurface: IS_DGFY_POS_SURFACE,
        receiptSettings,
        setReceiptSettings,
        setLowStockDisplayThreshold
    });
    const normalizedFnbContext = useMemo(() => (
        fnbContext && typeof fnbContext === 'object' ? fnbContext : null
    ), [fnbContext]);
    const parkedSaleEmptyCartHandlerRef = useRef(null);
    const handleCartBecameEmpty = useCallback(() => {
        if (typeof parkedSaleEmptyCartHandlerRef.current === 'function') {
            return parkedSaleEmptyCartHandlerRef.current();
        }
        return false;
    }, []);
    const handleCartLineRemoved = useCallback((lineKey) => {
        if (itemOptionsLineKey === lineKey) setItemOptionsLineKey(null);
        itemDiscountApprovalRef.current.delete(lineKey);
    }, [itemOptionsLineKey]);
    const handleCatalogAddAnimation = useCallback((cardElement) => {
        flyImageToCheckoutBar(cardElement);
    }, []);
    const {
        cart,
        setCart,
        notifyPosActionBlocked,
        serviceOptionsModal,
        setServiceOptionsModal,
        serviceOptionsLoadingItemId,
        editingQuantityItemId,
        setEditingQuantityItemId,
        quantityInputValue,
        setQuantityInputValue,
        addToCartToasts,
        handleDismissToast,
        qtyMeterState,
        addToCart,
        addCatalogItemToCart,
        handleConfirmServiceOptions,
        updateCartLine,
        updateCartQuantity,
        adjustCartQuantity,
        commitManualCartQuantity,
        handleQtyButtonPointerDown,
        handleQtyButtonPointerMove,
        handleQtyButtonPointerUp,
        handleQtyButtonPointerCancel,
        handleCartQtyButtonPointerDown,
        handleCartQtyButtonPointerMove,
        handleCartQtyButtonPointerUp,
        handleCartQtyButtonPointerCancel,
        removeCartLine
    } = usePosCartWorkflow({
        sessionLocked,
        checkoutBlockedReason,
        parkedSaleReleaseLoading,
        activeParkedSale,
        catalog,
        receiptSettings,
        posWorkflow,
        isFnbWorkflow,
        normalizedFnbContext,
        setOrderMethod,
        onCartBecameEmpty: handleCartBecameEmpty,
        onCartLineRemoved: handleCartLineRemoved,
        onCatalogAddAnimation: handleCatalogAddAnimation
    });
    const posActionsBlocked = Boolean(checkoutBlockedReason) || parkedSaleReleaseLoading;
    const shellClassName = 'h-full min-h-0 overflow-hidden';
    const checkoutGridClassName = isTabletViewport
        ? 'grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden pb-20 md:grid-cols-[minmax(0,1fr)_minmax(320px,360px)] md:pb-0 2xl:gap-4'
        : 'grid h-full min-h-0 grid-cols-1 gap-4 overflow-hidden pb-20 md:grid-cols-[minmax(0,1fr)_325px] md:pb-0 2xl:gap-6';
    const catalogGridClassName = 'grid';
    const catalogViewportClassName = 'flex min-h-0 flex-1 flex-col overflow-hidden';
    const currentSaleBodyClassName = 'dgfy-pos-current-sale-panel-scroll grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)_auto_auto] gap-2 overflow-hidden md:grid-rows-[auto_auto_auto] md:overflow-y-auto md:overscroll-contain md:pr-1 md:touch-pan-y';
    const currentSaleItemsListClassName = 'dgfy-pos-scroll-region h-full min-h-0 overflow-y-auto overscroll-contain pr-1 touch-pan-y';
    const checkoutPaneClassName = 'flex h-full min-h-0 max-h-full flex-col overflow-hidden';
    const catalogPaneHeightClassName = 'h-full max-h-full';
    const currentSalePaneHeightClassName = 'h-full max-h-full';
    const safeCatalog = toArray(catalog);
    const safeCart = toArray(cart);
    const safeDiscountProfiles = toArray(discountProfiles);
    const safeCommercialPromoConfig = toArray(commercialPromoConfig);
    const safeDiscountApprovers = toArray(discountApprovers);
    const activeShiftCashierApprover = safeDiscountApprovers.find((approver) => (
        Number(approver?.user_id) === Number(activeShiftCashierId)
    )) || null;
    const safeQueuedCheckouts = toArray(queuedCheckouts);
    const safeEligibleDiscountItemIds = toArray(discountDraft?.eligible_item_ids);
    const safeEligibleDiscountItems = toArray(discountDraft?.eligible_items);
    const employeeDiscountRateOptions = Array.from(new Set([
        ...safeDiscountProfiles
            .filter((profile) => profile?.active !== false)
            .map((profile) => Number(profile?.percentage))
            .filter((percentage) => Number.isFinite(percentage) && percentage > 0 && percentage <= 100),
        Number(discountDraft?.rate || 15),
        15
    ])).sort((left, right) => left - right);
    const isCartLineSeniorPwdEligible = (line) => (
        isSeniorPwdDiscountEligible(line?.senior_pwd_discount_eligible)
        || isSeniorPwdDiscountEligible(safeCatalog.find((item) => Number(item?.item_id) === Number(line?.item_id))?.senior_pwd_discount_eligible)
    );
    const terminalPermissionList = useMemo(() => {
        if (Array.isArray(terminalUser?.permissions)) return terminalUser.permissions;
        if (typeof terminalUser?.permissions !== 'string') return [];
        try {
            const parsed = JSON.parse(terminalUser.permissions);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }, [terminalUser?.permissions]);
    const canVoidTransactions = terminalUser?.is_master_admin === true || terminalPermissionList.includes('pos:void');
    const isAdminOperator = terminalUser?.is_master_admin === true
        || String(terminalUser?.role || '').trim().toLowerCase() === 'admin';
    const safeAppliedDiscount = useMemo(() => (
        appliedDiscount && typeof appliedDiscount === 'object'
            ? { ...appliedDiscount, eligible_item_ids: toArray(appliedDiscount.eligible_item_ids), eligible_items: toArray(appliedDiscount.eligible_items) }
            : null
    ), [appliedDiscount]);
    const {
        cartSubtotal,
        itemDiscountTotals,
        governedDiscountTotals,
        selectedDiscount,
        manualDiscountRate,
        manualDiscountAmount,
        globalDiscountAmount,
        calculatedDiscountAmount,
        checkoutDiscountLabel,
        discountPreviewTotals,
        serviceFeeAmount,
        netItemsTotal,
        restaurantServiceChargeAmount,
        vatBreakdown,
        cartTotal,
        cartTotalQuantity,
        isCashPayment,
        isEmployeeCreditPayment,
        customerPaymentAmount,
        customerPaymentAmountState,
        customerPaymentFieldLabel,
        customerPaymentShortfall,
        customerPaymentChange,
        isCustomerPaymentSufficient,
        splitPaymentReady,
        splitPaymentSummaryAllocations,
        hasSplitPaymentSummary,
        splitPaymentSummaryPaidAmount,
        splitPaymentSummaryRemainingAmount,
        splitPaymentSummaryChangeAmount,
        splitPaymentSuccessfulAllocations
    } = usePosFinancialWorkflow({
        cart: safeCart,
        discountProfiles: safeDiscountProfiles,
        selectedDiscountProfile,
        manualDiscountMode,
        manualDiscountRateInput,
        manualDiscountAmountInput,
        appliedDiscount,
        safeAppliedDiscount,
        discountDraft,
        eligibleDiscountItemIds: safeEligibleDiscountItemIds,
        normalizedFnbContext,
        paymentType,
        checkoutConfirmModalOpen,
        employeeCreditAccount,
        selectedEmployeeCreditOption,
        splitPaymentSession
    });
    const catalogCardClassName = IS_DGFY_POS_SURFACE && isTabletViewport
        ? 'group flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white p-1.5 text-left transition-all shadow-sm shadow-slate-200/70'
        : isTabletViewport
            ? 'group flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white p-1.5 text-left transition-all shadow-sm shadow-slate-200/70'
            : 'group flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white p-2 text-left transition-all shadow-sm shadow-slate-200/70 max-sm:w-full max-sm:flex-row max-sm:p-0 md:p-1.5';
    const catalogCardImageWrapClassName = IS_DGFY_POS_SURFACE && isTabletViewport
        ? 'flex h-16 w-full shrink-0 items-center justify-center overflow-hidden rounded-md'
        : isTabletViewport
            ? 'flex h-16 w-full shrink-0 items-center justify-center overflow-hidden rounded-md'
            : 'flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-md max-sm:h-full max-sm:w-24 max-sm:self-stretch max-sm:rounded-r-none max-sm:rounded-l-[calc(0.5rem-1px)] md:h-16 xl:h-24';
    const folderButtonClassName = isTabletViewport
        ? 'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-extrabold transition-all shadow-xs'
        : 'inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-extrabold transition-all shadow-xs';
    const setupMeta = terminalMeta && typeof terminalMeta === 'object' ? terminalMeta : {};
    const setupCurrency = String(setupMeta.pettyCashSymbol || 'PHP').trim() || 'PHP';
    const setupReadiness = setupMeta.locationBindingReadiness && typeof setupMeta.locationBindingReadiness === 'object'
        ? setupMeta.locationBindingReadiness
        : null;
    const bindingReadinessLabel = setupReadiness
        ? (setupReadiness.ready_for_strict_mode === true ? 'Ready' : 'Needs remediation')
        : 'Not checked';
    const queuedCheckoutPendingCount = useMemo(() => (
        safeQueuedCheckouts.filter((entry) => (
            String(entry?.status || '') === TERMINAL_QUEUE_STATUS.QUEUED
            || String(entry?.status || '') === TERMINAL_QUEUE_STATUS.REPLAYING
        )).length
    ), [safeQueuedCheckouts]);
    const queuedCheckoutBlockedCount = useMemo(() => (
        safeQueuedCheckouts.filter((entry) => (
            String(entry?.status || '') === TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED
        )).length
    ), [safeQueuedCheckouts]);
    const isPrinterAvailable = posHardware.isPrinterAvailable;
    const lastReceiptPendingSync = lastReceipt?.offline_sync_state === 'pending_sync';

    const {
        receiptPrinting,
        receiptPaperWidth,
        setReceiptPaperWidth,
        receiptPreviewModalOpen,
        setReceiptPreviewModalOpen,
        receiptPreviewSource,
        setReceiptPreviewSource,
        setExternalReceiptModalActive,
        closeReceiptPreviewModal,
        billRequestDraft,
        setBillRequestDraft,
        billRequestPrinting,
        drawerOpening,
        drawerAuthorizationModalOpen,
        setDrawerAuthorizationModalOpen,
        drawerAuthorizationReason,
        setDrawerAuthorizationReason,
        drawerAuthorizationPin,
        setDrawerAuthorizationPin,
        drawerAuthorizationSubmitting,
        drawerAdminBypass,
        handlePrintReceipt,
        handleBillRequest,
        handlePrintOrder,
        handleOpenDrawer,
        submitDrawerAuthorization
    } = usePosReceiptHardwareWorkflow({
        activeShiftId,
        terminalUser,
        normalizedTerminalId,
        receiptSettings,
        lastReceipt,
        posHardware,
        safeCart,
        cartTotal,
        orderMethod,
        normalizedFnbContext,
        tableNumber,
        kitchenNotes,
        isFnbWorkflow,
        setCheckoutConfirmModalOpen,
        onExternalReceiptClosed
    });

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const shouldLockModalScroll = receiptPreviewModalOpen || checkoutConfirmModalOpen || splitPaymentDialogOpen || discountModalOpen || mobileCheckoutPanelOpen || drawerAuthorizationModalOpen;
        document.body.classList.toggle('pos-modal-scroll-lock', shouldLockModalScroll);
        return () => {
            document.body.classList.remove('pos-modal-scroll-lock');
        };
    }, [checkoutConfirmModalOpen, discountModalOpen, drawerAuthorizationModalOpen, mobileCheckoutPanelOpen, receiptPreviewModalOpen, splitPaymentDialogOpen]);

    useEffect(() => {
        if (!IS_DGFY_POS_SURFACE) return undefined;
        publishPosUpdateSafetyState({
            cartLineCount: safeCart.length,
            checkoutLoading,
            checkoutConfirmModalOpen,
            splitPaymentDialogOpen,
            splitPaymentSession,
            replayingQueuedCheckouts,
            receiptPrinting,
            billRequestPrinting,
            receiptPreviewModalOpen,
            drawerOpening,
            drawerAuthorizationModalOpen,
            drawerAuthorizationSubmitting,
            activeParkedSale,
            parkedSalePayContext,
            discountModalOpen,
            discountApplying
        });
    }, [
        activeParkedSale,
        billRequestPrinting,
        checkoutConfirmModalOpen,
        checkoutLoading,
        discountApplying,
        discountModalOpen,
        drawerAuthorizationModalOpen,
        drawerAuthorizationSubmitting,
        drawerOpening,
        parkedSalePayContext,
        receiptPreviewModalOpen,
        receiptPrinting,
        replayingQueuedCheckouts,
        safeCart.length,
        splitPaymentDialogOpen,
        splitPaymentSession
    ]);

    useEffect(() => {
        if (!IS_DGFY_POS_SURFACE) return undefined;
        return () => {
            publishPosUpdateSafetyState({});
        };
    }, []);

    const setCurrentViewMode = useCallback((nextMode) => {
        if (!isViewModeControlled) {
            setViewMode(nextMode);
        }
        if (typeof onViewModeChange === 'function') {
            onViewModeChange(nextMode);
        }
    }, [isViewModeControlled, onViewModeChange]);

    const isCashierRole = String(terminalUser?.role || '').trim().toLowerCase() === 'cashier';
    const {
        historyRows: visibleHistoryRows,
        historyLoading,
        historyPage,
        historyPagination: visibleHistoryPagination,
        historySearch,
        setHistorySearch,
        historyStatus,
        setHistoryStatus,
        historyPaymentType,
        setHistoryPaymentType,
        historyOrderMethod,
        setHistoryOrderMethod,
        historyOrderSource,
        setHistoryOrderSource,
        historyCashierName,
        setHistoryCashierName,
        historyDateFrom,
        setHistoryDateFrom,
        historyDateTo,
        setHistoryDateTo,
        historyDetailLoading, voidingTransactionId,
        refundWorkflowTransaction, refundWorkflowLoading, refundWorkflowSubmitting, openHistoryRefundWorkflow, closeHistoryRefundWorkflow, submitHistoryRefundWorkflow,
        openHistoryDetail, handleVoidHistoryTransaction,
        openInPosReport,
        loadHistory
    } = usePosHistoryVoidWorkflow({
        sessionLocked,
        canViewHistory,
        canVoidTransactions,
        isAdminOperator,
        isCashierRole,
        activeShiftId,
        selectedLocationId,
        normalizedTerminalId,
        currentViewMode,
        setCurrentViewMode,
        queuedCheckouts: safeQueuedCheckouts,
        setLastReceipt,
        setLastReceiptContract,
        setReceiptPreviewSource,
        setReceiptPreviewModalOpen,
        setExternalReceiptModalActive,
        externalReceiptTransactionId,
        onExternalReceiptHydrated,
        externalHistoryQuery,
        onExternalHistoryHydrated
    });

    usePosCartDraft({
        activeShiftId,
        activeParkedSale,
        cart,
        catalog,
        catalogReady: !catalogLoading,
        enabled: !sessionLocked && Boolean(activeShiftId),
        scope: offlineSnapshotScope,
        setActiveParkedSale,
        setCart
    });

    const {
        syncQueuedCheckoutsState,
        handleManualUniversalSync,
        openCheckoutConfirmModal,
        openSplitPaymentModal,
        resetCurrentSaleForNewSale,
        cancelActiveParkedSaleEditingAfterCartEmpty,
        validateParkedSaleForResume,
        handleParkedSaleClaimed,
        handleParkAndNewSale,
        openParkSaleNameDialog,
        openParkedSalesHistory,
        handleCancelCheckout,
        handleKeepSplitPaymentAndClose,
        handleReverseSplitPaymentAndStartNew,
        handleCompletePreparedSplitPayment,
        splitPaymentCheckoutContext,
        handleSplitPaymentOpenChange,
        handleCheckout
    } = usePosCheckoutWorkflow({
        sessionLocked,
        checkoutBlockedReason,
        activeShiftId,
        selectedLocationId,
        normalizedTerminalId,
        offlineSnapshotScope,
        posWorkflow,
        isFnbWorkflow,
        normalizedFnbContext,
        orderMethod,
        tableNumber,
        kitchenNotes,
        servicesClientName,
        servicesDateTime,
        servicesProvider,
        servicesResource,
        servicesNotes,
        safeCatalog,
        discountProfiles: safeDiscountProfiles,
        commercialPromoConfig: safeCommercialPromoConfig,
        catalog,
        setCatalog,
        saveCatalogSnapshot,
        safeCart,
        setCart,
        activeParkedSale,
        setActiveParkedSale,
        parkedSalePayContext,
        setParkedSalePayContext,
        parkedSaleReleaseLoading,
        setParkedSaleReleaseLoading,
        setCheckoutLoading,
        setParkLoading,
        queuedCheckouts: safeQueuedCheckouts,
        setQueuedCheckouts,
        setReplayingQueuedCheckouts,
        onQueueOfflineOperation,
        onManualUniversalSync,
        onCheckoutCompleted,
        historyPage,
        loadHistory,
        loadCatalog,
        setLastReceipt,
        setLastReceiptContract,
        setReceiptPreviewSource,
        setReceiptPreviewModalOpen,
        receiptSettings,
        posHardware,
        itemDiscountApprovalRef,
        discountApprovalRef,
        resetEmployeeCredit,
        setOrderMethod,
        setTableNumber,
        setKitchenNotes,
        setServicesClientName,
        setServicesDateTime,
        setServicesProvider,
        setServicesResource,
        setServicesNotes,
        setPaymentType,
        setSelectedDiscountProfile,
        setManualDiscountMode,
        setManualDiscountRateInput,
        setManualDiscountAmountInput,
        setAppliedDiscount,
        setDiscountDraft,
        setDiscountModalOpen,
        setShowDiscountPin,
        setAffiliateCodeInput,
        ...customerPaymentAmountState,
        setCheckoutConfirmModalOpen,
        setMobileCheckoutPanelOpen,
        setItemOptionsLineKey,
        setServiceOptionsModal,
        setCurrentSaleHelpOpen,
        setParkedSalesDialogOpen,
        setParkSaleNameDialogOpen,
        parkSaleNameInput,
        setParkSaleNameInput,
        setCurrentViewMode,
        selectedDiscount,
        manualDiscountMode,
        manualDiscountRate,
        manualDiscountAmount,
        appliedDiscount,
        calculatedDiscountAmount,
        affiliateCodeInput,
        itemDiscountTotals,
        governedDiscountTotals,
        cartSubtotal,
        serviceFeeAmount,
        restaurantServiceChargeAmount,
        vatBreakdown,
        cartTotal,
        paymentType,
        isCheckoutWorkflowValid,
        isCashPayment,
        isEmployeeCreditPayment,
        isCustomerPaymentSufficient,
        customerPaymentFieldLabel,
        customerPaymentAmount,
        customerPaymentChange,
        employeeCreditAccountCode,
        splitPaymentSession,
        setSplitPaymentSession,
        setSplitPaymentDialogOpen,
        setSplitPaymentWorkflowVersion,
        splitPaymentStorageScopeKey,
        splitPaymentSuccessfulAllocations,
        setSplitPaymentCancelModalOpen,
        setSplitPaymentCancelLoading
    });

    const loadReceiptSettings = useCallback(async () => {
        if (sessionLocked) {
            setReceiptSettings({});
            setDiscountProfiles([]);
            setCommercialPromoConfig([]);
            return;
        }
        try {
            const allSettings = await getAllSettings();
            const nextReceiptSettings = {
                pos_registered_name: allSettings?.pos_registered_name?.value || '',
                pos_business_name: allSettings?.pos_business_name?.value || '',
                storefront_profile_image_url: allSettings?.storefront_profile_image_url?.value || '',
                pos_taxpayer_type: allSettings?.pos_taxpayer_type?.value || '',
                pos_tin_branch: allSettings?.pos_tin_branch?.value || '',
                pos_address: allSettings?.pos_address?.value || '',
                pos_ptu_number: allSettings?.pos_ptu_number?.value || '',
                pos_min_number: allSettings?.pos_min_number?.value || '',
                pos_accreditation_number: allSettings?.pos_accreditation_number?.value || '',
                pos_software_name: allSettings?.pos_software_name?.value || '',
                pos_software_version: allSettings?.pos_software_version?.value || '',
                pos_software_serial_number: allSettings?.pos_software_serial_number?.value || '',
                pos_receipt_footer_message: allSettings?.pos_receipt_footer_message?.value || '',
                inventory_low_stock_display_threshold: normalizeLowStockDisplayThreshold(
                    allSettings?.inventory_low_stock_display_threshold?.value
                )
            };
            setReceiptSettings(nextReceiptSettings);
            setLowStockDisplayThreshold(nextReceiptSettings.inventory_low_stock_display_threshold);
            saveCatalogSnapshot(undefined, nextReceiptSettings);
            setDiscountProfiles(normalizeDiscountProfiles(allSettings?.pos_discount_profiles?.value));
            const { normalizeCommercialPromoConfigs } = await import('../utils/posCommercialPromoConfig.js');
            setCommercialPromoConfig(normalizeCommercialPromoConfigs(allSettings));
        } catch {
            setReceiptSettings({});
            setDiscountProfiles([]);
            setCommercialPromoConfig([]);
        }
    }, [saveCatalogSnapshot, sessionLocked]);

    const posReportActionLabel = isCashierRole ? 'Open POS History' : 'Open POS Report';

    useEffect(() => {
        if (sessionLocked) return;
        const query = String(externalCatalogSearch || '').trim();
        if (!query) return;
        setSearch(query);
        setSelectedFolderId(null);
        setCurrentViewMode('checkout');
        if (typeof onExternalCatalogHydrated === 'function') {
            onExternalCatalogHydrated();
        }
    }, [externalCatalogSearch, onExternalCatalogHydrated, sessionLocked, setCurrentViewMode, setSearch, setSelectedFolderId]);

    useEffect(() => {
        if (sessionLocked) return;
        loadReceiptSettings();
        // POS hardware resolution is owned by usePosHardware itself (resolved
        // once per tab, memoized) — it must not be re-triggered by this
        // effect's own dependency churn the way the old direct device-status
        // fetch was.
    }, [loadReceiptSettings, sessionLocked]);

    useEffect(() => {
        let active = true;
        const bootstrapQueueStore = async () => {
            await hydrateTerminalOperationQueueStore();
            if (!active) return;
            await syncQueuedCheckoutsState();
        };
        bootstrapQueueStore();
        return () => {
            active = false;
        };
    }, [syncQueuedCheckoutsState]);

    useEffect(() => {
        if (!imagePreview) return undefined;
        const handleEscClose = (event) => {
            if (event.key === 'Escape') {
                setImagePreview(null);
            }
        };
        window.addEventListener('keydown', handleEscClose);
        return () => window.removeEventListener('keydown', handleEscClose);
    }, [imagePreview]);

    const itemOptionsLine = itemOptionsLineKey
        ? safeCart.find((line) => getLineKey(line) === itemOptionsLineKey) || null
        : null;
    const itemOptionsGlobalDiscountAllocation = itemOptionsLine
        ? governedDiscountTotals.lines?.find((entry) => (
            entry.line_key && entry.line_key === itemOptionsLineKey
        )) || governedDiscountTotals.lines?.find((entry) => Number(entry.item_id) === Number(itemOptionsLine.item_id))
        : null;
    const itemOptionsDiscountIds = toArray(safeAppliedDiscount?.eligible_item_ids).map(Number);
    const itemOptionsDiscountIncluded = safeAppliedDiscount
        ? safeAppliedDiscount.type === 'promo'
            ? itemOptionsDiscountIds.length === 0 || itemOptionsDiscountIds.includes(Number(itemOptionsLine?.item_id))
            : ['senior', 'pwd'].includes(safeAppliedDiscount.type)
                ? itemOptionsDiscountIds.includes(Number(itemOptionsLine?.item_id))
                : itemOptionsDiscountIds.length === 0 || itemOptionsDiscountIds.includes(Number(itemOptionsLine?.item_id))
        : false;
    const itemOptionsItemDiscount = itemOptionsLine ? getItemDiscountDraft(itemOptionsLine) : null;
    const itemOptionsGlobalDiscount = safeAppliedDiscount && Number(itemOptionsGlobalDiscountAllocation?.discount_amount || 0) > 0
        ? {
            label: safeAppliedDiscount.label || 'Approved discount',
            type: safeAppliedDiscount.type,
            rate: safeAppliedDiscount.method === 'fixed' ? null : safeAppliedDiscount.rate,
            amount: Number(itemOptionsGlobalDiscountAllocation?.discount_amount || 0),
            applies_to_all: itemOptionsDiscountIncluded,
            can_edit: false
        }
        : null;

    useEffect(() => {
        if (selectedDiscountProfile && (manualDiscountRateInput || manualDiscountAmountInput)) {
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
        }
    }, [manualDiscountAmountInput, manualDiscountRateInput, selectedDiscountProfile]);

    useEffect(() => {
        if (!itemOptionsLineKey || safeDiscountApprovers.length > 0 || itemDiscountApproversRequestedRef.current) return undefined;
        let mounted = true;
        itemDiscountApproversRequestedRef.current = true;
        setDiscountApproversLoading(true);
        fetchPosDiscountApprovers()
            .then((approvers) => {
                if (mounted) setDiscountApprovers(toArray(approvers));
            })
            .catch(() => {
                if (mounted) toast.error('Unable to load discount approvers.');
            })
            .finally(() => {
                if (mounted) setDiscountApproversLoading(false);
            });
        return () => {
            mounted = false;
        };
    }, [itemOptionsLineKey, safeDiscountApprovers.length]);

    const saveItemOptions = async ({ note, selections, item_discount: itemDiscount }) => {
        const lineKey = itemOptionsLineKey;
        const currentLine = safeCart.find((line) => getLineKey(line) === lineKey);
        if (!lineKey || !currentLine || sessionLocked) return false;
        const basePrice = Number(currentLine.base_sale_price || currentLine.sale_price || 0);
        const serviceDelta = (currentLine.service_option_details || []).reduce(
            (sum, option) => sum + ((Number(option.price_adjustment_centavos) || 0) / 100),
            0
        );
        let normalizedItemDiscount = null;
        if (itemDiscount?.enabled) {
            const discountType = ['senior', 'pwd', 'employee', 'promo', 'manual'].includes(String(itemDiscount.discount_type || '').trim().toLowerCase())
                ? String(itemDiscount.discount_type).trim().toLowerCase()
                : 'manual';
            const method = String(itemDiscount.method || '').trim().toLowerCase() === 'fixed' ? 'fixed' : 'percentage';
            const rate = Number(itemDiscount.rate);
            const amount = Number(itemDiscount.amount);
            if (['senior', 'pwd'].includes(discountType)
                && ![true, 1, '1'].includes(currentLine.senior_pwd_discount_eligible)) {
                toast.error('This item is not configured as eligible for Senior/PWD discounts.');
                return false;
            }
            if (['senior', 'pwd'].includes(discountType) && (!String(itemDiscount.customer_name || '').trim() || !String(itemDiscount.id_number || '').trim())) {
                toast.error('Customer name and Senior/PWD ID number are required.');
                return false;
            }
            if (discountType === 'promo' && !String(itemDiscount.customer_name || '').trim()) {
                toast.error('Customer name is required for a promo item discount.');
                return false;
            }
            if (discountType === 'promo' && !String(itemDiscount.promo_code || '').trim()) {
                toast.error('Enter a promo code for this item discount.');
                return false;
            }
            if (discountType === 'employee' && !String(itemDiscount.employee_name || '').trim()) {
                toast.error('Employee name is required for an employee discount.');
                return false;
            }
            if (!['senior', 'pwd', 'promo'].includes(discountType) && method === 'percentage' && (!Number.isFinite(rate) || rate <= 0 || rate > 100)) {
                toast.error('Item discount rate must be from 0.01% to 100%.');
                return false;
            }
            if (!['senior', 'pwd', 'promo'].includes(discountType) && method === 'fixed' && (!Number.isFinite(amount) || amount <= 0)) {
                toast.error('Item fixed discount amount must be greater than zero.');
                return false;
            }
            const approverId = Number(itemDiscount.approver_user_id);
            const currentDiscount = currentLine.item_discount;
            const sameDiscount = currentDiscount
                && String(currentDiscount.discount_type || 'manual').toLowerCase() === discountType
                && String(currentDiscount.method || '').toLowerCase() === method
                && Number(currentDiscount.rate || 0) === (method === 'percentage' ? rate : 0)
                && Number(currentDiscount.amount || 0) === (method === 'fixed' ? amount : 0)
                && String(currentDiscount.customer_name || '') === String(itemDiscount.customer_name || '').trim()
                && String(currentDiscount.id_number || '') === String(itemDiscount.id_number || '').trim()
                && String(currentDiscount.employee_name || '') === String(itemDiscount.employee_name || '').trim()
                && String(currentDiscount.employee_id || '') === String(itemDiscount.employee_id || '').trim()
                && String(currentDiscount.promo_code || '') === String(itemDiscount.promo_code || '').trim().toUpperCase()
                && String(currentDiscount.reason || '') === String(itemDiscount.reason || '').trim();
            let approval = itemDiscountApprovalRef.current.get(lineKey);
            if (!sameDiscount || !approval || Number(approval.approver_user_id) !== approverId) {
                if (!Number.isInteger(approverId) || approverId <= 0 || !String(itemDiscount.manager_pin || '').trim()) {
                    toast.error('Select an authorized approver and enter the approval PIN for this item discount.');
                    return false;
                }
                try {
                    const verifiedApprover = await verifyPosDiscountApproval({
                        discount_type: discountType,
                        approver_user_id: approverId,
                        manager_pin: String(itemDiscount.manager_pin || '').trim()
                    });
                    approval = {
                        approver_user_id: verifiedApprover?.user_id || approverId,
                        manager_pin: String(itemDiscount.manager_pin || '').trim()
                    };
                    itemDiscountApprovalRef.current.set(lineKey, approval);
                } catch (error) {
                    toast.error(error?.response?.data?.message || error?.message || 'Item discount approval failed.');
                    return false;
                }
            }
            const approver = safeDiscountApprovers.find((entry) => Number(entry?.user_id) === Number(approval?.approver_user_id));
            const labels = { senior: 'Senior Discount', pwd: 'PWD Discount', employee: 'Employee Discount', promo: 'Promo Discount', manual: 'Other Discount' };
            normalizedItemDiscount = {
                discount_type: discountType,
                label: labels[discountType],
                method,
                rate: ['senior', 'pwd', 'promo'].includes(discountType) ? null : (method === 'percentage' ? round4(rate) : null),
                amount: ['senior', 'pwd', 'promo'].includes(discountType) ? null : (method === 'fixed' ? round4(amount) : null),
                customer_name: String(itemDiscount.customer_name || '').trim().slice(0, 255) || null,
                id_number: String(itemDiscount.id_number || '').trim().slice(0, 100) || null,
                employee_name: String(itemDiscount.employee_name || '').trim().slice(0, 255) || null,
                employee_id: String(itemDiscount.employee_id || '').trim().slice(0, 100) || null,
                promo_code: String(itemDiscount.promo_code || '').trim().toUpperCase().slice(0, 40) || null,
                reason: String(itemDiscount.reason || '').trim().slice(0, 500) || null,
                approver_user_id: Number(approval.approver_user_id),
                approver_name: String(approver?.username || '').trim() || null,
                approved_at: currentDiscount?.approved_at || new Date().toISOString()
            };
        } else {
            itemDiscountApprovalRef.current.delete(lineKey);
        }
        const updated = updateCartLine(lineKey, {
            line_modifiers: selections,
            special_instructions: String(note || '').trim().slice(0, 1000),
            sale_price: round4(basePrice + serviceDelta + resolveModifierDelta(currentLine, selections)),
            item_discount: normalizedItemDiscount
        }, { allowWhenCheckoutBlocked: true });
        if (!updated) return false;
        setItemOptionsLineKey(null);
        return true;
    };

    const closeDiscountModal = useCallback(() => {
        setDiscountModalOpen(false);
        if (discountReturnToCheckoutRef.current) {
            discountReturnToCheckoutRef.current = false;
            setCheckoutConfirmModalOpen(true);
        }
    }, []);

    const openDiscountModal = async ({ returnToCheckout = false } = {}) => {
        discountReturnToCheckoutRef.current = returnToCheckout;
        if (returnToCheckout) {
            setCheckoutConfirmModalOpen(false);
        }
        const employeeCreditDiscountName = String(
            selectedEmployeeCreditOption?.employee_name
            || employeeCreditAccount?.employee_name
            || ''
        ).trim();
        const employeeCreditDiscountId = String(
            selectedEmployeeCreditOption?.employee_code
            || ''
        ).trim();
        const draftToOpen = appliedDiscount
            ? { ...EMPTY_DISCOUNT_DRAFT, ...appliedDiscount, manager_pin: '' }
            : {
                ...EMPTY_DISCOUNT_DRAFT,
                employee_name: employeeCreditDiscountName,
                employee_id: employeeCreditDiscountId
            };
        setShowDiscountPin(false);
        setDiscountDraft(draftToOpen);
        setDiscountModalOpen(true);
        setDiscountApproversLoading(true);
        try {
            const approvers = await fetchPosDiscountApprovers();
            setDiscountApprovers(approvers);
            if (!appliedDiscount) {
                const shiftCashierId = Number(activeShiftCashierId);
                const shiftCashierApprover = Number.isInteger(shiftCashierId) && shiftCashierId > 0
                    ? toArray(approvers).find((approver) => (
                        Number(approver?.user_id) === shiftCashierId
                        && approver?.pos_approval_pin_configured === true
                    ))
                    : null;
                draftToOpen.approver_user_id = shiftCashierApprover?.user_id || '';
            }
            setDiscountDraft(draftToOpen);
        } catch (error) {
            setDiscountApprovers([]);
            setDiscountDraft(draftToOpen);
            toast.error(error?.response?.data?.message || 'Failed to load POS discount approvers.');
        } finally {
            setDiscountApproversLoading(false);
        }
    };

    const handleApplyGovernedDiscount = async () => {
        const type = discountDraft.type;
        const statutory = type === 'senior' || type === 'pwd';
        const approvalUserId = Number(discountDraft.approver_user_id);
        if (!Number.isInteger(approvalUserId) || approvalUserId <= 0) {
            toast.error('Select the employee who is authorizing this discount.');
            return;
        }
        const selectedApprover = safeDiscountApprovers.find((approver) => Number(approver?.user_id) === approvalUserId);
        if (!selectedApprover?.pos_approval_pin_configured) {
            toast.error('This employee does not have a POS approval PIN configured yet.');
            return;
        }
        if (!/^\d{4,12}$/.test(String(discountDraft.manager_pin || '').trim())) {
            toast.error('Enter the authorizing employee PIN.');
            return;
        }
        if (type === 'employee' && !discountDraft.employee_name.trim()) {
            toast.error('Employee name is required.');
            return;
        }
        if (!statutory && type !== 'employee' && !discountDraft.customer_name.trim()) {
            toast.error('Customer name is required for this discount.');
            return;
        }
        if (statutory && (!discountDraft.customer_name.trim() || !discountDraft.id_number.trim())) {
            toast.error('Customer name and Senior/PWD ID number are required.');
            return;
        }
        if (statutory && safeEligibleDiscountItemIds.length === 0) {
            toast.error('Select at least one eligible item.');
            return;
        }
        if (type === 'promo' && (!discountDraft.promo_code || !discountDraft.promo_code.trim())) {
            toast.error('Promo code is required.');
            return;
        }
        if (type === 'voucher' && (!discountDraft.voucher_code || !discountDraft.voucher_code.trim())) {
            toast.error('Voucher code is required.');
            return;
        }
        const rate = Number(discountDraft.rate || 0);
        const amount = Number(discountDraft.amount || 0);
        // #712: a voucher's discount amount is never client-resolvable -- unlike Promo, there is no
        // enumerating endpoint for a store's vouchers, so no rate/amount check applies here either.
        // The server decides on submit.
        if (!statutory && !['promo', 'voucher'].includes(type) && discountDraft.method === 'percentage' && (!(rate > 0) || rate > 100)) {
            toast.error('Enter a discount rate from 0.01 to 100.');
            return;
        }
        if (!statutory && !['promo', 'voucher'].includes(type) && discountDraft.method === 'fixed' && !(amount > 0)) {
            toast.error('Enter a fixed discount amount.');
            return;
        }
        setDiscountApplying(true);
        try {
            const parsedEmployeeUserId = type === 'employee'
                ? Number(discountDraft.employee_id)
                : null;
            const employeeUserId = Number.isInteger(parsedEmployeeUserId) && parsedEmployeeUserId > 0
                ? parsedEmployeeUserId
                : null;
            const verifiedApprover = await verifyPosDiscountApproval({
                discount_type: type,
                approver_user_id: approvalUserId,
                manager_pin: discountDraft.manager_pin,
                employee_user_id: employeeUserId
            });
            const labels = { senior: 'Senior Citizen', pwd: 'PWD', employee: 'Employee Discount', promo: 'Promo Discount', voucher: 'Voucher Discount', manual: 'Other Discount' };
            const resolvedApproverUserId = Number(verifiedApprover?.user_id ?? approvalUserId);
            const governedDiscountApproverUserId = Number.isInteger(resolvedApproverUserId) && resolvedApproverUserId > 0
                ? resolvedApproverUserId
                : null;
            const enteredPromoCode = normalizePromoCode(discountDraft.promo_code);
            const matchedPromoConfig = type === 'promo'
                ? safeCommercialPromoConfig.find((entry) => normalizePromoCode(entry?.promo_code) === enteredPromoCode)
                : null;
            const configuredPromoRate = Number(matchedPromoConfig?.discount_percent || 0);
            if (type === 'promo' && (
                matchedPromoConfig?.active !== true
                || !(configuredPromoRate > 0 && configuredPromoRate <= 100)
            )) {
                toast.error('Promo code is invalid or inactive.');
                return;
            }
            const configuredTargetIds = type === 'promo'
                ? [...new Set((Array.isArray(matchedPromoConfig?.target_item_ids) ? matchedPromoConfig.target_item_ids : [])
                    .map(Number)
                    .filter((itemId) => Number.isInteger(itemId) && itemId > 0))]
                : [];
            const cartItemIds = new Set(safeCart.map((line) => Number(line.item_id)));
            const promoEligibleItemIds = configuredTargetIds.filter((itemId) => cartItemIds.has(itemId));
            if (type === 'promo' && configuredTargetIds.length > 0 && promoEligibleItemIds.length === 0) {
                toast.error('Promo code does not apply to the items in this order.');
                return;
            }
            setAppliedDiscount({
                ...discountDraft,
                manager_pin: undefined,
                label: labels[type],
                // #712: a voucher's method/rate are never client-known -- unlike Promo, there is no
                // client-side config to resolve them from, so they stay null until the server
                // responds at checkout. calculateGovernedDiscount (client-side cart-summary preview
                // only, never authoritative) safely treats a null rate as 0, matching the "Discount
                // amount is confirmed at checkout" copy shown in the modal.
                method: type === 'promo' ? 'percentage' : (type === 'voucher' ? null : discountDraft.method),
                rate: statutory ? 20 : (type === 'promo' ? configuredPromoRate : (type === 'voucher' ? null : rate)),
                amount: !['promo', 'voucher'].includes(type) && discountDraft.method === 'fixed' ? amount : null,
                promo_code: type === 'promo' ? enteredPromoCode : discountDraft.promo_code,
                voucher_code: type === 'voucher' ? String(discountDraft.voucher_code || '').trim().toUpperCase() : discountDraft.voucher_code,
                approver_user_id: governedDiscountApproverUserId,
                approver_name: verifiedApprover?.username || null,
                eligible_item_ids: type === 'promo' ? promoEligibleItemIds : safeEligibleDiscountItemIds,
                eligible_items: statutory ? safeEligibleDiscountItems : []
            });
            discountApprovalRef.current = {
                discount_type: type,
                approver_user_id: governedDiscountApproverUserId,
                employee_user_id: type === 'employee' ? Number(discountDraft.employee_id) || null : null,
                manager_pin: String(discountDraft.manager_pin || '').trim()
            };
            setSelectedDiscountProfile('');
            setManualDiscountMode('none');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            closeDiscountModal();
            toast.success(`${labels[type]} applied.`);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Employee PIN authorization failed.');
        } finally {
            setDiscountApplying(false);
        }
    };

    const clearAppliedDiscount = useCallback(() => {
        if (splitPaymentDialogOpen || hasSplitPaymentSummary) {
            toast.error('Finish or cancel the active payment before changing the discount.');
            return;
        }
        setAppliedDiscount(null);
        discountApprovalRef.current = null;
        setSelectedDiscountProfile('');
        setManualDiscountMode('none');
        setManualDiscountRateInput('');
        setManualDiscountAmountInput('');
        setDiscountDraft(EMPTY_DISCOUNT_DRAFT);
        toast.success('Discount removed.');
    }, [hasSplitPaymentSummary, splitPaymentDialogOpen]);

    parkedSaleEmptyCartHandlerRef.current = cancelActiveParkedSaleEditingAfterCartEmpty;

    const openClearCurrentSale = () => {
        if (posActionsBlocked || safeCart.length === 0 || activeParkedSale?.pos_parked_sale_id) return;
        setCurrentSaleHelpOpen(false);
        setClearSaleConfirmOpen(true);
    };

    const confirmClearCurrentSale = () => {
        if (posActionsBlocked || safeCart.length === 0 || activeParkedSale?.pos_parked_sale_id) {
            setClearSaleConfirmOpen(false);
            return;
        }
        clearPosCartDraft(offlineSnapshotScope, activeShiftId);
        setActiveParkedSale(null);
        resetCurrentSaleForNewSale();
        setClearSaleConfirmOpen(false);
        toast.success('Current sale cleared.');
    };
    const terminalViewModel = {
        activeParkedSale,
        activeShiftCashierApprover,
        activeShiftId,
        addCatalogItemToCart,
        addToCart,
        addToCartToasts,
        adjustCartQuantity,
        affiliateCodeInput,
        appliedDiscount,
        availableCategories,
        billRequestDraft,
        billRequestPrinting,
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
        checkoutConfirmModalOpen,
        checkoutDiscountLabel,
        checkoutGridClassName,
        checkoutLoading,
        checkoutPaneClassName,
        clearAppliedDiscount,
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
        ...customerPaymentAmountState,
        customerPaymentChange,
        customerPaymentFieldLabel,
        customerPaymentShortfall,
        discountApplying,
        discountApproversLoading,
        discountDraft,
        discountModalOpen,
        discountPreviewTotals,
        drawerAdminBypass,
        drawerAuthorizationModalOpen,
        drawerAuthorizationPin,
        drawerAuthorizationReason,
        drawerAuthorizationSubmitting,
        drawerOpening,
        editingQuantityItemId,
        employeeCreditAccount,
        employeeCreditLookupLoading,
        employeeDiscountRateOptions,
        flyImageToCheckoutBar,
        folderButtonClassName,
        folderStripRef,
        globalDiscountAmount,
        governedDiscountTotals,
        handleApplyGovernedDiscount,
        handleBillRequest,
        handleCancelCheckout,
        handleCartQtyButtonPointerCancel,
        handleCartQtyButtonPointerDown,
        handleCartQtyButtonPointerMove,
        handleCartQtyButtonPointerUp,
        handleCatalogPageChange,
        handleCatalogSwipeEnd,
        handleCatalogSwipeStart,
        handleCheckout,
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
        handleSearchBackspaceEnd,
        handleSearchBackspaceStart,
        handleSelectEmployeeCredit,
        handleSplitPaymentOpenChange,
        handleSplitPaymentSessionStateChange,
        handleVoidHistoryTransaction,
        historyRefundWorkflow: { refundWorkflowTransaction, refundWorkflowLoading, refundWorkflowSubmitting, openHistoryRefundWorkflow, closeHistoryRefundWorkflow, submitHistoryRefundWorkflow },
        hasSplitPaymentSummary,
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
        isCartLineSeniorPwdEligible,
        isCashPayment,
        isCheckoutWorkflowValid,
        isCustomerPaymentSufficient,
        isEmployeeCreditPayment,
        isMsmeMode,
        isPrinterAvailable,
        isTabletViewport,
        itemDiscountTotals,
        itemOptionsGlobalDiscount,
        itemOptionsItemDiscount,
        itemOptionsLine,
        itemOptionsLineKey,
        kitchenNotes,
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
        openDiscountModal,
        openHistoryDetail,
        openInPosReport,
        openParkSaleNameDialog,
        openParkedSalesHistory,
        openSplitPaymentModal,
        orderMethod,
        parkLoading,
        parkSaleNameDialogOpen,
        parkSaleNameInput,
        parkedSaleReleaseLoading,
        parkedSalesDialogOpen,
        paymentType,
        posActionsBlocked,
        posFoldersError,
        posFoldersLoading,
        posHardware,
        posPresentationBundle,
        posReportActionLabel,
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
        replayingQueuedCheckouts,
        resetCurrentSaleForNewSale,
        resetEmployeeCredit,
        safeCart,
        safeCatalog,
        safeDiscountApprovers,
        safeEligibleDiscountItemIds,
        safeEligibleDiscountItems,
        saveItemOptions,
        search,
        selectedDiscount,
        selectedEmployeeCreditOption,
        selectedFolderId,
        selectedLocationId,
        serviceOptionsLoadingItemId,
        serviceOptionsModal,
        servicesClientName,
        servicesDateTime,
        servicesNotes,
        servicesProvider,
        servicesResource,
        sessionLocked,
        setActiveParkedSale,
        setAffiliateCodeInput,
        setBillRequestDraft,
        setCatalogImageErrors,
        setCheckoutConfirmModalOpen,
        setClearSaleConfirmOpen,
        setCurrentSaleHelpOpen,
        setCurrentViewMode,
        ...customerPaymentAmountState,
        setDiscountDraft,
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
        setKitchenNotes,
        setMobileCheckoutPanelOpen,
        setMobileSearchExpanded,
        setOrderMethod,
        setParkSaleNameDialogOpen,
        setParkSaleNameInput,
        setParkedSalesDialogOpen,
        setPaymentType,
        setQuantityInputValue,
        setReceiptPaperWidth,
        setReceiptPreviewSource,
        setSearch,
        setSelectedFolderId,
        setServiceOptionsModal,
        setServicesClientName,
        setServicesDateTime,
        setServicesNotes,
        setServicesProvider,
        setServicesResource,
        setSetupSnapshotModalOpen,
        setShowDiscountPin,
        setSplitPaymentCancelModalOpen,
        setTableNumber,
        setupCurrency,
        setupMeta,
        setupSnapshotModalOpen,
        shellClassName,
        showDiscountPin,
        splitPaymentCancelLoading,
        splitPaymentCancelModalOpen,
        splitPaymentCheckoutContext,
        splitPaymentDialogOpen,
        splitPaymentReady,
        splitPaymentStorageScopeKey,
        splitPaymentSummaryAllocations,
        splitPaymentSummaryChangeAmount,
        splitPaymentSummaryPaidAmount,
        splitPaymentSummaryRemainingAmount,
        splitPaymentWorkflowVersion,
        submitDrawerAuthorization,
        tableNumber,
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
    };

    return <POSCheckoutTerminalView viewModel={terminalViewModel} />;
}

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { verifyPosDiscountApproval } from '../services/posService';
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
import { usePosCheckoutLifecycle } from '../hooks/usePosCheckoutLifecycle.js';
import { usePosDiscountDirectory } from '../hooks/usePosDiscountDirectory.js';
import { usePosReceiptHardwareWorkflow } from '../hooks/usePosReceiptHardwareWorkflow.js';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
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
import {
    EMPTY_DISCOUNT_DRAFT,
    getLineKey,
    getPriceOverrideReasonValidationMessage,
    isSeniorPwdDiscountEligible,
    normalizePromoCode,
    round4,
    toArray
} from '../utils/posCheckoutTerminalUtils.js';
import { resolveModifierDelta } from '../utils/posCheckoutTerminalModifiers.js';
import { flyImageToCheckoutBar } from '../utils/posCatalogAnimations.js';
import { getPosTerminalLayoutClasses } from '../utils/posTerminalLayout.js';
import { normalizeAppliedDiscount, normalizePosTerminalDraftState, parseTerminalPermissions } from '../utils/posTerminalDraftState.js';
import {
    POS_DISCOUNT_FALLBACK_OPTIONS,
    buildPosDiscountTypeOptions,
    findPosDiscountTypeOption,
    normalizeAvailablePosDiscountRules
} from '../utils/posDiscountOptions.js';
import { buildDiscountItemSelection, getDiscountLineRef, isStatutoryBeneficiaryIdentityValid, MAX_STATUTORY_BENEFICIARIES } from '../utils/posDiscountSelection.js';
import { isParkedSaleOriginalLine } from '../utils/posParkedSaleResume.js';
import { buildIncomingDineInCheckoutCartLines } from '../utils/incomingDineInCheckoutCart.js';
import { resolveFnbCheckoutContext, usePosFnbCheckoutState } from '../hooks/usePosFnbCheckoutState.js';
const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';
const POSCheckoutTerminalView = lazyWithChunkRetry(() => import('./POSCheckoutTerminalView.jsx'));

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
    onCheckoutAuthorityInvalid = null,
    checkoutBlockedReason = '',
    onManualUniversalSync = async () => ({ allowed: false }),
    onQueueOfflineOperation = async () => null,
    manualSyncPolicy = {},
    universalPendingSyncCount = 0,
    modalOnly = false,
    viewMode: controlledViewMode = null,
    onViewModeChange = null, onCheckoutLifecycleChange = null,
    externalReceiptTransactionId = null,
    onExternalReceiptHydrated = null,
    onExternalReceiptClosed = null,
    externalHistoryQuery = '',
    onExternalHistoryHydrated = null,
    externalCatalogSearch = '',
    onExternalCatalogHydrated = null,
    fnbContext = null,
    workflowMode = null,
    effectiveCapabilities = null,
    dineInCashCheckout = null,
    dineInCashCheckoutSaving = false,
    dineInCashCheckoutError = '',
    onDineInCashCheckoutSubmit = async () => false,
    onCancelDineInCashCheckout = () => {}
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
    const isDineInCashCheckoutRequested = Boolean(dineInCashCheckout);
    const [orderMethod, setOrderMethod] = useState(() => posWorkflow.allowedMethods[0] || 'dine_in');
    const [tableNumber, setTableNumber] = useState('');
    const [kitchenNotes, setKitchenNotes] = useState('');
    const [servicesClientName, setServicesClientName] = useState('');
    const [servicesDateTime, setServicesDateTime] = useState('');
    const [servicesProvider, setServicesProvider] = useState('');
    const [servicesResource, setServicesResource] = useState('');
    const [servicesNotes, setServicesNotes] = useState('');

    const [paymentType, setPaymentType] = useState('cash');
    const {
        employeeCreditAccountCode,
        employeeCreditAccount,
        selectedEmployeeCreditOption,
        employeeCreditSelectionSource,
        employeeCreditLookupLoading,
        resetEmployeeCredit,
        handleSelectEmployeeCredit,
        handlePrefillEmployeeCredit,
        clearDiscountEmployeeCreditPrefill
    } = usePosEmployeeCreditWorkflow();
    const [discountProfiles, setDiscountProfiles] = useState([]);
    const [selectedDiscountProfile, setSelectedDiscountProfile] = useState('');
    const [manualDiscountMode, setManualDiscountMode] = useState('none');
    const [manualDiscountRateInput, setManualDiscountRateInput] = useState('');
    const [manualDiscountAmountInput, setManualDiscountAmountInput] = useState('');
    const [discountModalOpen, setDiscountModalOpen] = useState(false);
    const [discountDraft, setDiscountDraft] = useState(EMPTY_DISCOUNT_DRAFT);
    const [appliedDiscount, setAppliedDiscount] = useState(null);
    const discountApprovalRef = useRef(null);
    const itemDiscountApprovalRef = useRef(new Map());
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
    const {
        discountApprovers,
        discountEmployees,
        discountRules,
        discountRulesReady,
        discountApproversLoading,
        discountEmployeesLoading,
        loadDiscountDirectory
    } = usePosDiscountDirectory({ autoLoad: true });
    const posHardware = usePosHardware({ enabled: Boolean(terminalUser) });
    const [imagePreview, setImagePreview] = useState(null);
    const [setupSnapshotModalOpen, setSetupSnapshotModalOpen] = useState(false);
    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        setHeaderParkedSalesHistorySlot(document.querySelector('[data-testid="pos-header-park-slot"]'));
        return undefined;
    }, []);

    const [checkoutConfirmModalOpen, setCheckoutConfirmModalOpen] = useState(false);
    const [checkoutOpenedFromCurrentSale, setCheckoutOpenedFromCurrentSale] = useState(false);
    const [splitPaymentDialogOpen, setSplitPaymentDialogOpen] = useState(false);
    const [splitPaymentSession, setSplitPaymentSession] = useState(null);
    const [splitPaymentCancelModalOpen, setSplitPaymentCancelModalOpen] = useState(false);
    const [splitPaymentCancelLoading, setSplitPaymentCancelLoading] = useState(false);
    const [splitPaymentWorkflowVersion, setSplitPaymentWorkflowVersion] = useState(0);
    const [mobileCheckoutPanelOpen, setMobileCheckoutPanelOpen] = useState(false);

    useEffect(() => {
        if (!checkoutConfirmModalOpen) setCheckoutOpenedFromCurrentSale(false);
    }, [checkoutConfirmModalOpen]);

    const handleSplitPaymentSessionStateChange = useCallback((nextState) => {
        setSplitPaymentSession(nextState?.active && nextState?.session ? nextState.session : null);
    }, []);

    const [currentSaleHelpOpen, setCurrentSaleHelpOpen] = useState(false);
    const [clearSaleConfirmOpen, setClearSaleConfirmOpen] = useState(false);
    const isViewModeControlled = typeof controlledViewMode === 'string' && controlledViewMode.length > 0;
    const currentViewMode = isViewModeControlled ? controlledViewMode : viewMode;

    useEffect(() => {
        if (currentViewMode !== 'checkout') setMobileCheckoutPanelOpen(false);
    }, [currentViewMode]);

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
        posFoldersLoading,
        posFoldersError,
        search,
        setSearch,
        isTabletViewport,
        isTabletPortraitViewport,
        isMobileViewport,
        isMobileLandscapeViewport,
        catalogPage,
        catalogPageSizeOverride,
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
        catalogPageSizeOptions,
        catalogForDisplay,
        totalCatalogPages,
        visibleCatalogItems,
        visibleCatalogRange,
        loadCatalog,
        loadPosFolders,
        saveCatalogSnapshot,
        handleCatalogPageChange,
        handleCatalogPageSizeChange,
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
    // F&B service can be enabled as a capability on a counter/retail terminal.
    // Once a check is attached, checkout must use the F&B line and settlement
    // contract even when the base terminal workflow is not the fnb preset.
    const {
        normalizedFnbContext,
        hasFnbCheckoutContext,
        checkoutUsesFnbContract
    } = resolveFnbCheckoutContext({
        fnbContext,
        isFnbWorkflow: isFnbWorkflow || isDineInCashCheckoutRequested,
        allowedMethods: posWorkflow.allowedMethods
    });

    useEffect(() => {
        if (isTabletViewport) setMobileCheckoutPanelOpen(false);
    }, [isTabletViewport]);
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
        removeCartLine,
        parkedLineDeletionRequest,
        parkedLineDeletionReason,
        setParkedLineDeletionReason,
        cancelParkedLineDeletion,
        confirmParkedLineDeletion
    } = usePosCartWorkflow({
        sessionLocked,
        checkoutBlockedReason,
        parkedSaleReleaseLoading,
        activeParkedSale,
        catalog,
        receiptSettings,
        posWorkflow,
        isFnbWorkflow: checkoutUsesFnbContract,
        normalizedFnbContext,
        setOrderMethod,
        onCartBecameEmpty: handleCartBecameEmpty,
        onCartLineRemoved: handleCartLineRemoved,
        onParkedLineDeleted: ({ line, reason }) => {
            setActiveParkedSale((previous) => {
                if (!previous?.pos_parked_sale_id) return previous;
                const existingReasons = Array.isArray(previous.removed_line_reasons)
                    ? previous.removed_line_reasons
                    : [];
                const lineRef = String(line?.line_key || line?.line_ref || '').trim() || null;
                const itemId = Number(line?.item_id) || null;
                const nextReasons = [
                    ...existingReasons.filter((entry) => (
                        String(entry?.line_ref || '').trim() !== lineRef
                        || Number(entry?.item_id) !== itemId
                    )),
                    {
                        line_ref: lineRef,
                        item_id: itemId,
                        item_name: String(line?.item_name || '').trim() || null,
                        reason: String(reason || '').trim()
                    }
                ];
                return { ...previous, removed_line_reasons: nextReasons };
            });
        },
        onCatalogAddAnimation: handleCatalogAddAnimation
    });
    const posActionsBlocked = Boolean(checkoutBlockedReason) || parkedSaleReleaseLoading;
    const isTabletPortraitMobileLayout = isTabletPortraitViewport;
    const {
        shellClassName,
        checkoutGridClassName,
        catalogGridClassName,
        catalogViewportClassName,
        currentSaleBodyClassName,
        currentSaleItemsListClassName,
        checkoutPaneClassName,
        catalogPaneHeightClassName,
        currentSalePaneHeightClassName
    } = getPosTerminalLayoutClasses({ isTabletViewport, isTabletPortraitViewport, isTabletPortraitMobileLayout });
    const {
        safeCatalog,
        safeCart,
        safeDiscountProfiles,
        safeDiscountRules,
        discountRulesReady: normalizedDiscountRulesReady,
        safeCommercialPromoConfig,
        safeDiscountApprovers,
        safeQueuedCheckouts,
        safeEligibleDiscountItemIds,
        safeEligibleDiscountItems,
        employeeDiscountRateOptions
    } = normalizePosTerminalDraftState({
        catalog,
        cart,
        discountProfiles,
        discountRules,
        discountRulesReady,
        commercialPromoConfig,
        discountApprovers,
        activeShiftCashierId,
        queuedCheckouts,
        discountDraft
    });
    const safeDiscountEmployees = toArray(discountEmployees);
    const discountTypeOptions = useMemo(
        () => buildPosDiscountTypeOptions(
            safeDiscountRules,
            POS_DISCOUNT_FALLBACK_OPTIONS,
            { rulesReady: normalizedDiscountRulesReady }
        ),
        [normalizedDiscountRulesReady, safeDiscountRules]
    );
    const { checkoutAllowedOrderMethods } = usePosFnbCheckoutState({
        normalizedFnbContext,
        hasFnbCheckoutContext,
        checkoutUsesFnbContract,
        workflowMode: posWorkflow.mode,
        allowedMethods: posWorkflow.allowedMethods,
        orderMethod,
        setOrderMethod,
        catalogLoading,
        safeCart,
        safeCatalog,
        setCart,
        setTableNumber,
        setKitchenNotes
    });
    const checkoutWorkflowValidationMessage = useMemo(() => {
        for (const line of safeCart) {
            const catalogItem = safeCatalog.find((item) => Number(item?.item_id) === Number(line?.item_id));
            const baseSalePrice = Number(line?.base_sale_price ?? catalogItem?.default_sale_price);
            if (!Number.isFinite(baseSalePrice) || baseSalePrice <= 0) continue;

            const serviceOptionDelta = toArray(line?.service_option_details).reduce(
                (sum, option) => sum + ((Number(option?.price_adjustment_centavos) || 0) / 100),
                0
            );
            const message = getPriceOverrideReasonValidationMessage({
                line,
                effectiveDefaultSalePrice: round4(baseSalePrice + resolveModifierDelta(line) + serviceOptionDelta)
            });
            if (message) return message;
        }
        return null;
    }, [safeCart, safeCatalog]);
    const isCheckoutWorkflowValid = checkoutAllowedOrderMethods.includes(orderMethod)
        && (posWorkflow.mode !== 'services' || servicesClientName.trim().length > 0)
        && (orderMethod !== 'appointment' || Boolean(servicesDateTime))
        && !checkoutWorkflowValidationMessage;
    const isCartLineSeniorPwdEligible = (line) => (
        isSeniorPwdDiscountEligible(line?.senior_pwd_discount_eligible)
        || isSeniorPwdDiscountEligible(safeCatalog.find((item) => Number(item?.item_id) === Number(line?.item_id))?.senior_pwd_discount_eligible)
    );
    const terminalPermissionList = useMemo(() => parseTerminalPermissions(terminalUser?.permissions), [terminalUser?.permissions]);
    const canVoidTransactions = terminalUser?.is_master_admin === true || terminalPermissionList.includes('pos:void');
    const canUseEmployeeCredit = terminalUser?.is_master_admin === true || terminalPermissionList.includes('pos:employee_credit:use');
    const isAdminOperator = terminalUser?.is_master_admin === true || String(terminalUser?.role || '').trim().toLowerCase() === 'admin';
    const safeAppliedDiscount = useMemo(() => normalizeAppliedDiscount(appliedDiscount), [appliedDiscount]);
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
        discountRules: safeDiscountRules,
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
    const catalogCardClassName = IS_DGFY_POS_SURFACE && isTabletPortraitMobileLayout
        ? 'group box-border flex h-full min-h-0 min-w-0 flex-row overflow-hidden rounded-lg border bg-clip-padding bg-white px-1.5 py-1.5 text-left transition-all shadow-sm shadow-slate-200/70'
        : IS_DGFY_POS_SURFACE && isTabletViewport
        ? 'group box-border flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-clip-padding bg-white p-1 text-left transition-all shadow-sm shadow-slate-200/70 sm:grid sm:grid-rows-[minmax(0,1fr)_auto]'
        : IS_DGFY_POS_SURFACE
            ? 'group box-border flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-clip-padding bg-white p-1 text-left transition-all shadow-sm shadow-slate-200/70 max-sm:w-full max-sm:flex-row max-sm:px-2 max-sm:pt-2 max-sm:pb-2 sm:grid sm:grid-rows-[minmax(0,1fr)_auto]'
            : isTabletPortraitMobileLayout
                ? 'group box-border flex h-full min-h-0 min-w-0 flex-row overflow-hidden rounded-lg border bg-clip-padding bg-white p-2 text-left transition-all shadow-sm shadow-slate-200/70'
                : isTabletViewport
                ? 'group box-border flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-clip-padding bg-white p-1.5 text-left transition-all shadow-sm shadow-slate-200/70'
                : 'group box-border flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-clip-padding bg-white p-2 text-left transition-all shadow-sm shadow-slate-200/70 max-sm:w-full max-sm:flex-row max-sm:p-2 md:p-1.5';
    const catalogCardImageWrapClassName = IS_DGFY_POS_SURFACE && isTabletPortraitMobileLayout
        ? 'flex h-full w-[144px] shrink-0 items-center justify-center self-start overflow-hidden rounded-md'
        : IS_DGFY_POS_SURFACE && isTabletViewport
        ? 'flex h-full w-full shrink-0 items-center justify-center overflow-hidden rounded-md'
        : IS_DGFY_POS_SURFACE
            ? 'flex h-full w-full shrink-0 items-center justify-center overflow-hidden rounded-md max-sm:h-full max-sm:w-full max-sm:flex-none max-sm:self-start'
        : isTabletPortraitMobileLayout
            ? 'flex h-full w-full shrink-0 items-center justify-center overflow-hidden rounded-md'
            : isTabletViewport
                ? 'flex h-16 w-full shrink-0 items-center justify-center overflow-hidden rounded-md'
                : 'flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-md max-sm:h-full max-sm:w-full max-sm:flex-none max-sm:self-start md:h-16 xl:h-24';
    const folderButtonClassName = isTabletPortraitMobileLayout
        ? 'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-[11px] font-extrabold transition-all'
        : isTabletViewport
        ? 'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-extrabold transition-all'
        : 'inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-[12px] text-[12px] font-extrabold transition-all';
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
    const isOrderPrinterAvailable = posHardware.isOrderPrinterAvailable;
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
        isFnbWorkflow: checkoutUsesFnbContract,
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
        historyPageSize,
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
        setHistoryPageSize,
        historyDetailLoading, voidingTransactionId,
        refundWorkflowTransaction, refundWorkflowLoading, refundWorkflowSubmitting, openHistoryRefundWorkflow, closeHistoryRefundWorkflow, submitHistoryRefundWorkflow,
        openHistoryDetail, handleVoidHistoryTransaction,
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
        onExternalHistoryHydrated, onFinancialMutationCompleted: onCheckoutCompleted
    });

    usePosCartDraft({
        activeShiftId,
        activeParkedSale,
        cart,
        catalog,
        catalogReady: !catalogLoading,
        enabled: !sessionLocked && Boolean(activeShiftId) && !isDineInCashCheckoutRequested,
        scope: offlineSnapshotScope,
        setActiveParkedSale,
        setCart
    });

    const {
        syncQueuedCheckoutsState,
        handleManualUniversalSync,
        openCheckoutConfirmModal,
        openSplitPaymentModal,
        resetDiscountState,
        resetCurrentSaleForNewSale,
        cancelActiveParkedSaleEditingAfterCartEmpty,
        validateParkedSaleForResume,
        handleParkedSaleClaimed,
        handleParkAndNewSale,
        openParkSaleNameDialog,
        openParkedSalesHistory,
        handleCancelCheckout,
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
        isFnbWorkflow: checkoutUsesFnbContract,
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
        discountRules: safeDiscountRules,
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
        onCheckoutAuthorityInvalid,
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
        setCheckoutOpenedFromCurrentSale,
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
        checkoutWorkflowValidationMessage,
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
        splitPaymentSuccessfulAllocations,
        setSplitPaymentCancelModalOpen,
        setSplitPaymentCancelLoading
    });
    const {
        setCustomerPaymentAmountInput,
        setCustomerPaymentAmountAutoFilled
    } = customerPaymentAmountState;

    const dineInCashCheckoutHydrationRef = useRef({
        key: '',
        active: false,
        previousCart: []
    });
    const isExistingDineInCheckout = Boolean(dineInCashCheckout);

    useEffect(() => {
        const checkoutOrder = dineInCashCheckout?.order;
        const orderId = Number(checkoutOrder?.pos_transaction_id);
        const checkoutKey = checkoutOrder
            ? `${Number.isInteger(orderId) ? orderId : 'unknown'}:${String(dineInCashCheckout?.idempotencyKey || '')}`
            : '';

        if (!checkoutOrder) {
            if (!dineInCashCheckoutHydrationRef.current.active) return;

            const previousCart = dineInCashCheckoutHydrationRef.current.previousCart;
            dineInCashCheckoutHydrationRef.current = { key: '', active: false, previousCart: [] };
            setCheckoutConfirmModalOpen(false);
            setCheckoutOpenedFromCurrentSale(false);
            setCart(previousCart);
            setPaymentType('cash');
            setCustomerPaymentAmountInput('');
            setCustomerPaymentAmountAutoFilled(false);
            resetDiscountState();
            return;
        }

        if (dineInCashCheckoutHydrationRef.current.key === checkoutKey) return;

        const lines = buildIncomingDineInCheckoutCartLines({ order: checkoutOrder, catalog: safeCatalog });
        if (lines.length === 0) {
            dineInCashCheckoutHydrationRef.current = { key: checkoutKey, active: false, previousCart: [] };
            toast.error('This dine-in order has no valid items to check out. Refresh the incoming order queue and try again.');
            onCancelDineInCashCheckout?.();
            return;
        }

        dineInCashCheckoutHydrationRef.current = {
            key: checkoutKey,
            active: true,
            previousCart: [...safeCart]
        };
        setCart(lines);
        setOrderMethod('dine_in');
        setTableNumber(String(checkoutOrder?.fnb_table_label_snapshot || checkoutOrder?.table_number || '').trim());
        setKitchenNotes(String(
            checkoutOrder?.special_instructions
            || checkoutOrder?.customer_note
            || checkoutOrder?.order_notes
            || ''
        ).trim());
        setPaymentType('cash');
        resetEmployeeCredit();
        resetDiscountState();
        setCustomerPaymentAmountInput(String(checkoutOrder?.total_amount ?? ''));
        setCustomerPaymentAmountAutoFilled(true);
        setCheckoutOpenedFromCurrentSale(false);
        setCheckoutConfirmModalOpen(true);
    }, [
        dineInCashCheckout,
        onCancelDineInCashCheckout,
        resetDiscountState,
        resetEmployeeCredit,
        safeCatalog,
        safeCart,
        setCart,
        setCheckoutConfirmModalOpen,
        setCheckoutOpenedFromCurrentSale,
        setCustomerPaymentAmountAutoFilled,
        setCustomerPaymentAmountInput,
        setKitchenNotes,
        setOrderMethod,
        setPaymentType,
        setTableNumber
    ]);

    const handleExistingDineInCheckout = useCallback(async (paymentSnapshot) => {
        if (!isExistingDineInCheckout) return handleCheckout(paymentSnapshot);
        const result = await onDineInCashCheckoutSubmit?.(paymentSnapshot);
        if (result === true) setCheckoutConfirmModalOpen(false);
        return result;
    }, [
        handleCheckout,
        isExistingDineInCheckout,
        onDineInCashCheckoutSubmit,
        setCheckoutConfirmModalOpen
    ]);

    const handleTerminalCheckoutCancel = useCallback(async () => {
        if (!isExistingDineInCheckout) return handleCancelCheckout();
        await handleCancelCheckout();
        onCancelDineInCashCheckout?.();
        return true;
    }, [
        handleCancelCheckout,
        isExistingDineInCheckout,
        onCancelDineInCashCheckout
    ]);

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
            const { normalizeCommercialPromoConfigs } = await import('../utils/posCommercialPromoConfig.js');
            setCommercialPromoConfig(normalizeCommercialPromoConfigs(allSettings));
        } catch {
            setReceiptSettings({});
            setDiscountProfiles([]);
            setCommercialPromoConfig([]);
        }
    }, [saveCatalogSnapshot, sessionLocked]);

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

    const saveItemOptions = async ({ note, selections }) => {
        const lineKey = itemOptionsLineKey;
        const currentLine = safeCart.find((line) => getLineKey(line) === lineKey);
        if (!lineKey || !currentLine || sessionLocked) return false;
        if (isParkedSaleOriginalLine(currentLine, activeParkedSale)) {
            toast.error('Original parked items cannot be edited. Add a new item instead.');
            setItemOptionsLineKey(null);
            return false;
        }
        const basePrice = Number(currentLine.base_sale_price || currentLine.sale_price || 0);
        const serviceDelta = (currentLine.service_option_details || []).reduce(
            (sum, option) => sum + ((Number(option.price_adjustment_centavos) || 0) / 100),
            0
        );
        const updated = updateCartLine(lineKey, {
            line_modifiers: selections,
            special_instructions: String(note || '').trim().slice(0, 1000),
            sale_price: round4(basePrice + serviceDelta + resolveModifierDelta(currentLine, selections)),
        }, { allowWhenCheckoutBlocked: true });
        if (!updated) return false;
        setItemOptionsLineKey(null);
        return true;
    };

    const closeDiscountModal = useCallback(() => {
        setDiscountModalOpen(false);
    }, []);

    const openDiscountModal = async ({ initialType } = {}) => {
        const requestedOption = findPosDiscountTypeOption(discountTypeOptions, initialType);
        const employeeCreditDirectoryId = Number(selectedEmployeeCreditOption?.employee_id) || null;
        const employeeCreditDiscountName = employeeCreditDirectoryId
            ? String(selectedEmployeeCreditOption?.employee_name || '').trim()
            : '';
        const employeeCreditDiscountId = employeeCreditDirectoryId
            ? String(selectedEmployeeCreditOption?.employee_code || '').trim()
            : '';
        const draftSeed = appliedDiscount
            ? { ...EMPTY_DISCOUNT_DRAFT, ...appliedDiscount, manager_pin: '' }
            : {
                ...EMPTY_DISCOUNT_DRAFT,
                employee_name: employeeCreditDiscountName,
                employee_id: employeeCreditDiscountId,
                employee_directory_id: employeeCreditDirectoryId ? String(employeeCreditDirectoryId) : ''
            };
        if (requestedOption) {
            const rule = requestedOption.rule;
            draftSeed.type = requestedOption.type || requestedOption.value;
            draftSeed.rule_id = rule?.discount_rule_id || '';
            draftSeed.discount_key = rule?.discount_key || '';
            draftSeed.label = rule?.name || draftSeed.label;
            draftSeed.method = rule?.method || draftSeed.method;
            draftSeed.rate = rule?.method === 'percentage' && rule?.percentage != null
                ? String(rule.percentage)
                : '';
            draftSeed.amount = rule?.method === 'fixed' && rule?.fixed_amount != null
                ? String(rule.fixed_amount)
                : '';
            draftSeed.requires_customer_id = rule?.requires_customer_id === true;
            draftSeed.requires_employee_id = rule?.requires_employee_id === true;
            draftSeed.requires_manager_approval = rule?.requires_manager_approval === true;
        }
        const draftToOpen = {
            ...draftSeed,
            ...buildDiscountItemSelection({
                cart: safeCart,
                type: draftSeed.type,
                draft: draftSeed,
                isEligible: isSeniorPwdDiscountEligible
            })
        };
        setShowDiscountPin(false);
        setDiscountDraft(draftToOpen);
        setDiscountModalOpen(true);
        try {
            const directory = await loadDiscountDirectory();
            const resolvedOption = findPosDiscountTypeOption(
                buildPosDiscountTypeOptions(
                    directory?.rules,
                    POS_DISCOUNT_FALLBACK_OPTIONS,
                    { rulesReady: true }
                ),
                initialType
            );
            let resolvedDraft = { ...draftToOpen };
            if (resolvedOption && !appliedDiscount) {
                const rule = resolvedOption.rule;
                resolvedDraft = {
                    ...resolvedDraft,
                    type: resolvedOption.type || resolvedOption.value,
                    rule_id: rule?.discount_rule_id || '',
                    discount_key: rule?.discount_key || '',
                    label: rule?.name || resolvedDraft.label,
                    method: rule?.method || resolvedDraft.method,
                    rate: rule?.method === 'percentage' && rule?.percentage != null ? String(rule.percentage) : '',
                    amount: rule?.method === 'fixed' && rule?.fixed_amount != null ? String(rule.fixed_amount) : '',
                    requires_customer_id: rule?.requires_customer_id === true,
                    requires_employee_id: rule?.requires_employee_id === true,
                    requires_manager_approval: rule?.requires_manager_approval === true
                };
            }
            const { approvers = [] } = directory || {};
            if (!appliedDiscount) {
                const shiftCashierId = Number(activeShiftCashierId);
                const shiftCashierApprover = Number.isInteger(shiftCashierId) && shiftCashierId > 0
                    ? toArray(approvers).find((approver) => (
                        Number(approver?.user_id) === shiftCashierId
                        && approver?.pos_approval_pin_configured === true
                    ))
                    : null;
                resolvedDraft = {
                    ...resolvedDraft,
                    approver_user_id: shiftCashierApprover?.user_id || ''
                };
            }
            setDiscountDraft(resolvedDraft);
        } catch (error) {
            setDiscountDraft({ ...draftToOpen });
            toast.error(error?.response?.data?.message || 'Failed to load POS discount employees.');
        }
    };

    const handleApplyGovernedDiscount = async () => {
        const type = String(discountDraft.type || '').trim().toLowerCase();
        const selectedRule = normalizeAvailablePosDiscountRules(safeDiscountRules).find((rule) => (
            (Number(discountDraft.rule_id) > 0 && Number(rule?.discount_rule_id) === Number(discountDraft.rule_id))
            || (!Number(discountDraft.rule_id) && type !== 'custom' && String(rule?.type || '').trim().toLowerCase() === type)
        )) || null;
        const hasConfiguredRule = Boolean(selectedRule);
        const statutory = type === 'senior' || type === 'pwd';
        const configuredMethod = selectedRule?.method || String(discountDraft.method || '').trim().toLowerCase();
        const configuredRate = selectedRule?.method === 'percentage'
            ? Number(selectedRule.percentage)
            : Number(discountDraft.rate || 0);
        const configuredAmount = selectedRule?.method === 'fixed'
            ? Number(selectedRule.fixed_amount)
            : Number(discountDraft.amount || 0);
        if (!selectedRule && !['promo', 'voucher'].includes(type)) {
            toast.error('The configurable discount directory is unavailable. Refresh the discount list and try again.');
            return;
        }
        const requiresCustomerName = selectedRule
            ? selectedRule.requires_customer_id === true
            : (!statutory && type !== 'employee');
        const legacyPromo = type === 'promo' && !hasConfiguredRule;
        const cartLinesByRef = new Map(safeCart.map((line, index) => [getDiscountLineRef(line, index), line]));
        const selectedDiscountItems = safeEligibleDiscountItems.filter((entry) => {
            const line = cartLinesByRef.get(String(entry?.line_ref || '').trim());
            return line && Number(line.item_id) === Number(entry?.item_id);
        });
        const selectedDiscountItemIds = [...new Set(selectedDiscountItems.map((entry) => Number(entry.item_id)))];
        const statutoryBeneficiaries = statutory
            ? [{
                category: type,
                name: String(discountDraft.customer_name || '').trim(),
                id_number: String(discountDraft.id_number || '').trim(),
                eligible_items: selectedDiscountItems
            }, ...toArray(discountDraft.beneficiaries).map((beneficiary) => ({
                category: beneficiary.category || type,
                name: String(beneficiary.name || '').trim(),
                id_number: String(beneficiary.id_number || '').trim(),
                eligible_items: toArray(beneficiary.eligible_items)
            }))]
            : [];
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
        if (type === 'employee' && !(Number(discountDraft.employee_directory_id) > 0)) {
            toast.error('Select a registered employee.');
            return;
        }
        if (type === 'custom' && !hasConfiguredRule) {
            toast.error('The selected discount configuration is unavailable. Refresh the discount list and try again.');
            return;
        }
        if (discountDraft.rule_id && !hasConfiguredRule) {
            toast.error('The selected discount configuration is no longer available. Refresh and select an active approved discount.');
            return;
        }
        if (requiresCustomerName && !String(discountDraft.customer_name || '').trim()) {
            toast.error('Customer name is required for this discount.');
            return;
        }
        if (statutory && statutoryBeneficiaries.length > MAX_STATUTORY_BENEFICIARIES) {
            toast.error('A maximum of 20 Senior/PWD beneficiaries is allowed per order.');
            return;
        }
        if (statutory && statutoryBeneficiaries.some((beneficiary, index) => !isStatutoryBeneficiaryIdentityValid(beneficiary, index === 0))) {
            toast.error('Use 2–120 characters for beneficiary names, 2–100 for the first ID, and 2–120 for additional IDs.');
            return;
        }
        if (statutory && statutoryBeneficiaries.some((beneficiary) => beneficiary.eligible_items.length === 0)) {
            toast.error('Select at least one eligible item for each beneficiary.');
            return;
        }
        if (statutory) {
            const normalizedIds = statutoryBeneficiaries.map((beneficiary) => beneficiary.id_number.toLowerCase());
            if (new Set(normalizedIds).size !== normalizedIds.length) {
                toast.error('Each beneficiary ID number must be unique in this order.');
                return;
            }
            const quantitiesByLine = statutoryBeneficiaries.flatMap((beneficiary) => beneficiary.eligible_items).reduce((totals, entry) => {
                const key = String(entry.line_ref || `item:${entry.item_id}`);
                totals.set(key, (totals.get(key) || 0) + Number(entry.eligible_quantity || 0));
                return totals;
            }, new Map());
            const overAllocated = [...quantitiesByLine.entries()].some(([key, quantity]) => {
                const line = key.startsWith('item:')
                    ? safeCart.find((entry) => Number(entry.item_id) === Number(key.slice(5)))
                    : cartLinesByRef.get(key);
                return quantity > Number(line?.quantity || 0);
            });
            if (overAllocated) {
                toast.error('Senior/PWD quantities cannot exceed the quantities in the cart.');
                return;
            }
        }
        if (!statutory && selectedDiscountItemIds.length === 0) {
            toast.error('Select at least one item for this discount.');
            return;
        }
        if (legacyPromo && (!discountDraft.promo_code || !discountDraft.promo_code.trim())) {
            toast.error('Promo code is required.');
            return;
        }
        if (type === 'voucher' && (!discountDraft.voucher_code || !discountDraft.voucher_code.trim())) {
            toast.error('Voucher code is required.');
            return;
        }
        const rate = configuredRate;
        const amount = configuredAmount;
        // #712: a voucher's discount amount is never client-resolvable -- unlike Promo, there is no
        // enumerating endpoint for a store's vouchers, so no rate/amount check applies here either.
        // The server decides on submit.
        if (!['promo', 'voucher'].includes(type) && configuredMethod === 'percentage' && (!(rate > 0) || rate > 100)) {
            toast.error('Enter a discount rate from 0.01 to 100.');
            return;
        }
        if (!['promo', 'voucher'].includes(type) && configuredMethod === 'fixed' && !(amount > 0)) {
            toast.error('Enter a fixed discount amount.');
            return;
        }
        setDiscountApplying(true);
        try {
            const verifiedApprover = await verifyPosDiscountApproval({
                discount_type: type,
                approver_user_id: approvalUserId,
                manager_pin: discountDraft.manager_pin,
                employee_directory_id: type === 'employee'
                    ? Number(discountDraft.employee_directory_id) || null
                    : null
            });
            const resolvedApproverUserId = Number(verifiedApprover?.user_id ?? approvalUserId);
            const governedDiscountApproverUserId = Number.isInteger(resolvedApproverUserId) && resolvedApproverUserId > 0
                ? resolvedApproverUserId
                : null;
            const enteredPromoCode = normalizePromoCode(discountDraft.promo_code);
            const matchedPromoConfig = legacyPromo
                ? safeCommercialPromoConfig.find((entry) => normalizePromoCode(entry?.promo_code) === enteredPromoCode)
                : null;
            const configuredPromoRate = Number(matchedPromoConfig?.discount_percent || 0);
            if (legacyPromo && (
                matchedPromoConfig?.active !== true
                || !(configuredPromoRate > 0 && configuredPromoRate <= 100)
            )) {
                toast.error('Promo code is invalid or inactive.');
                return;
            }
            const configuredTargetIds = legacyPromo
                ? [...new Set((Array.isArray(matchedPromoConfig?.target_item_ids) ? matchedPromoConfig.target_item_ids : [])
                    .map(Number)
                    .filter((itemId) => Number.isInteger(itemId) && itemId > 0))]
                : [];
            const promoEligibleItemIds = configuredTargetIds.length > 0
                ? configuredTargetIds.filter((itemId) => selectedDiscountItemIds.includes(itemId))
                : selectedDiscountItemIds;
            if (legacyPromo && promoEligibleItemIds.length === 0) {
                toast.error('Promo code does not apply to the items in this order.');
                return;
            }
            const discountLabel = selectedRule?.name
                || String(discountDraft.label || '').trim()
                || ({ senior: 'Senior Citizen', pwd: 'PWD', employee: 'Employee Discount', promo: 'Promo Discount', voucher: 'Voucher Discount', manual: 'Other Discount' }[type] || 'Discount');
            setAppliedDiscount({
                ...discountDraft,
                manager_pin: undefined,
                label: discountLabel,
                rule_id: selectedRule?.discount_rule_id || null,
                discount_key: selectedRule?.discount_key || null,
                configuration_version: selectedRule?.configuration_version || null,
                // #712: a voucher's method/rate are never client-known -- unlike Promo, there is no
                // client-side config to resolve them from, so they stay null until the server
                // responds at checkout. calculateGovernedDiscount (client-side cart-summary preview
                // only, never authoritative) safely treats a null rate as 0, matching the "Discount
                // amount is confirmed at checkout" copy shown in the modal.
                method: legacyPromo ? 'percentage' : (type === 'voucher' ? null : configuredMethod),
                rate: legacyPromo ? configuredPromoRate : (type === 'voucher' ? null : (configuredMethod === 'percentage' ? rate : null)),
                amount: !['promo', 'voucher'].includes(type) && configuredMethod === 'fixed' ? amount : null,
                promo_code: legacyPromo ? enteredPromoCode : discountDraft.promo_code,
                voucher_code: type === 'voucher' ? String(discountDraft.voucher_code || '').trim().toUpperCase() : discountDraft.voucher_code,
                employee_directory_id: type === 'employee'
                    ? Number(discountDraft.employee_directory_id) || null
                    : null,
                approver_user_id: governedDiscountApproverUserId,
                approver_name: verifiedApprover?.username || null,
                eligible_item_ids: type === 'promo' ? promoEligibleItemIds : selectedDiscountItemIds,
                eligible_items: selectedDiscountItems.filter((entry) => (
                    type !== 'promo' || promoEligibleItemIds.includes(Number(entry?.item_id))
                )),
                beneficiaries: statutory ? statutoryBeneficiaries : undefined
            });
            discountApprovalRef.current = {
                discount_type: type,
                approver_user_id: governedDiscountApproverUserId,
                employee_directory_id: type === 'employee'
                    ? Number(discountDraft.employee_directory_id) || null
                    : null,
                self_approved: verifiedApprover?.self_approved === true,
                manager_pin: String(discountDraft.manager_pin || '').trim()
            };
            setSelectedDiscountProfile('');
            setManualDiscountMode('none');
            setManualDiscountRateInput('');
            setManualDiscountAmountInput('');
            closeDiscountModal();
            toast.success(`${discountLabel} applied.`);
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
        resetDiscountState();
        toast.success('Discount removed.');
    }, [hasSplitPaymentSummary, resetDiscountState, splitPaymentDialogOpen]);

    const { confirmClearCurrentSale, handleClearSaleDialogOpenChange, pendingViewModeAfterSaleClear } = usePosCheckoutLifecycle({ activeParkedSale, activeShiftId, offlineSnapshotScope, onCheckoutLifecycleChange, onViewModeChange, posActionsBlocked, releaseActiveParkedSaleForSessionEnd: cancelActiveParkedSaleEditingAfterCartEmpty, resetCurrentSaleForNewSale, safeCartLength: safeCart.length, setActiveParkedSale, setClearSaleConfirmOpen, setCurrentSaleHelpOpen });

    parkedSaleEmptyCartHandlerRef.current = cancelActiveParkedSaleEditingAfterCartEmpty;

    const openClearCurrentSale = () => {
        if (posActionsBlocked || safeCart.length === 0 || activeParkedSale?.pos_parked_sale_id) return;
        setCurrentSaleHelpOpen(false);
        setClearSaleConfirmOpen(true);
    };

    const terminalViewModel = {
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
        billRequestPrinting,
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
        catalogImageErrors,
        catalogLoading,
        catalogPage,
        catalogPageSize,
        catalogPageSizeOverride,
        catalogPageSizeOptions,
        catalogPaneHeightClassName,
        catalogRefreshing,
        catalogSectionRef,
        catalogSwipePointerIdRef,
        catalogSwipeStartXRef,
        catalogViewportClassName,
        catalogViewportRef,
        checkoutBlockedReason,
        checkoutConfirmModalOpen,
        checkoutError: isExistingDineInCheckout ? dineInCashCheckoutError : '',
        checkoutOpenedFromCurrentSale: isExistingDineInCheckout ? false : checkoutOpenedFromCurrentSale,
        checkoutDiscountLabel,
        checkoutGridClassName,
        checkoutLoading: isExistingDineInCheckout ? dineInCashCheckoutSaving : checkoutLoading,
        checkoutSubtotalOverride: isExistingDineInCheckout ? dineInCashCheckout?.order?.total_amount : null,
        checkoutTotalOverride: isExistingDineInCheckout ? dineInCashCheckout?.order?.total_amount : null,
        checkoutPaneClassName,
        clearAppliedDiscount,
        clearDiscountEmployeeCreditPrefill,
        clearSaleConfirmOpen,
        closeDiscountModal,
        closeReceiptPreviewModal,
        commitManualCartQuantity,
        confirmClearCurrentSale,
        currentSaleBodyClassName,
        currentSaleHelpOpen,
        currentSaleItemsListClassName,
        currentSalePaneHeightClassName,
        currentViewMode, handleClearSaleDialogOpenChange, pendingViewModeAfterSaleClear,
        ...customerPaymentAmountState,
        customerPaymentChange,
        customerPaymentFieldLabel,
        customerPaymentShortfall,
        discountApplying,
        discountApproversLoading,
        discountEmployeesLoading,
        discountDraft,
        discountTypeOptions,
        discountRules: normalizeAvailablePosDiscountRules(safeDiscountRules),
        discountRulesReady: normalizedDiscountRulesReady,
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
        employeeCreditAccountCode,
        employeeCreditLookupLoading,
        employeeCreditSelectionSource,
        employeeDiscountRateOptions,
        flyImageToCheckoutBar,
        folderButtonClassName,
        folderStripRef,
        globalDiscountAmount,
        governedDiscountTotals,
        handleApplyGovernedDiscount,
        handleBillRequest,
        handleCancelCheckout: handleTerminalCheckoutCancel,
        handleCartQtyButtonPointerCancel,
        handleCartQtyButtonPointerDown,
        handleCartQtyButtonPointerMove,
        handleCartQtyButtonPointerUp,
        handleCatalogPageChange,
        handleCatalogPageSizeChange,
        handleCatalogSwipeEnd,
        handleCatalogSwipeStart,
        handleCheckout: handleExistingDineInCheckout,
        handleExistingOrderCheckout: handleExistingDineInCheckout,
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
        handlePrefillEmployeeCredit,
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
        historyPageSize,
        historyPaymentType,
        historySearch,
        historyStatus,
        imagePreview,
        isCartLineSeniorPwdEligible,
        isCashPayment,
        isCheckoutWorkflowValid: isExistingDineInCheckout ? true : isCheckoutWorkflowValid,
        isExistingOrderCheckout: isExistingDineInCheckout,
        isCustomerPaymentSufficient,
        isEmployeeCreditPayment,
        isMsmeMode,
        isOrderPrinterAvailable,
        isPrinterAvailable,
        isTabletViewport,
        isTabletPortraitViewport,
        isMobileViewport,
        isMobileLandscapeViewport,
        itemDiscountTotals,
        itemOptionsGlobalDiscount,
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
        modalOnly,
        netItemsTotal,
        normalizedTerminalId,
        notifyPosActionBlocked,
        offlineSnapshotScope,
        openCheckoutConfirmModal,
        openClearCurrentSale,
        openDiscountModal,
        openHistoryDetail,
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
        resetEmployeeCredit,
        safeCart,
        safeCatalog,
        safeDiscountApprovers,
        safeDiscountEmployees,
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
        setHistoryPageSize,
        setHistoryOrderMethod,
        setHistoryOrderSource,
        setHistoryPaymentType,
        setHistorySearch,
        setHistoryStatus,
        setImagePreview,
        setItemOptionsLineKey,
        setKitchenNotes,
        setMobileCheckoutPanelOpen,
        setOrderMethod,
        setParkSaleNameDialogOpen,
        setParkSaleNameInput,
        setParkedSalesDialogOpen,
        setPaymentType,
        setQuantityInputValue,
        setReceiptPaperWidth,
        setReceiptPreviewModalOpen,
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
        sidebarCollapsed,
        showDiscountPin,
        splitPaymentCancelLoading,
        splitPaymentCancelModalOpen,
        splitPaymentCheckoutContext,
        splitPaymentDialogOpen,
        splitPaymentReady,
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

    return (
        <Suspense fallback={<div className="flex h-full min-h-0 items-center justify-center text-sm text-slate-500">Loading POS terminal…</div>}>
            <POSCheckoutTerminalView viewModel={terminalViewModel} />
        </Suspense>
    );
}

import React, { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    Pencil,
    Printer,
    ShieldCheck,
    Trash2,
    X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import { isIminWrapperRuntime } from '../../../utils/iminRuntimeFeedback.js';
import {
    formatSplitPaymentMethod,
    getCartLineSubtotal,
    isPaymentAmountSufficient,
    money,
    resolveEmployeeDiscountCreditPreference,
    resolvePaymentMethodColorStyles,
    round4
} from '../utils/posCheckoutTerminalUtils.js';
import {
    buildPosDiscountTypeOptions,
    getDiscountRuleSelectionKey,
    POS_DISCOUNT_FALLBACK_OPTIONS
} from '../utils/posDiscountOptions.js';
import {
    DELIVERY_PROVIDER_OPTIONS,
    getDeliveryProviderValidationMessage,
    normalizeDeliveryProviderName
} from '../utils/posDeliveryProviders.js';

const EmployeeCreditPaymentPanel = lazyWithChunkRetry(() => import('./EmployeeCreditPaymentPanel.jsx'));
const PosCheckoutDetailsSlot = lazyWithChunkRetry(() => import('./PosCheckoutDetailsSlot.jsx').then(({ PosCheckoutDetailsSlot: Component }) => ({ default: Component })));
const POSDiscountWorkspace = lazyWithChunkRetry(() => import('./POSDiscountWorkspace.jsx'));

const CASH_PAYMENT_SUGGESTIONS = [50, 100, 200, 500, 1000];
const PAYMENT_METHOD_OPTIONS = [
    { value: 'cash', label: 'Cash' },
    { value: 'gcash', label: 'GCash' },
    { value: 'maya', label: 'Maya' },
    { value: 'card', label: 'Card' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'employee_credit', label: 'Employee Credit' }
];
const CHECKOUT_SECONDARY_HOVER = 'hover:border-[#1A4E8D] hover:bg-[#EFF7FF]';
const CHECKOUT_ICON_HOVER = 'hover:bg-[#EFF7FF] hover:text-[#1A4E8D]';
const DISCOUNT_WORKSPACE_TRANSITION_MS = 360;
const normalizePaymentAmount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return round4(parsed);
};

/**
 * Owns the checkout payment draft so a numeric keystroke only re-renders this
 * dialog. The catalog, cart, and financial orchestration shell stay outside
 * this state boundary; the validated snapshot crosses that boundary only when
 * the cashier confirms the sale.
 */
export function POSCheckoutConfirmDialog({ viewModel = {} }) {
    const {
        billRequestPrinting,
        appliedDiscount,
        calculatedDiscountAmount,
        cartSubtotal,
        cartTotal,
        checkoutConfirmModalOpen,
        checkoutError = '',
        checkoutOpenedFromCurrentSale,
        checkoutDiscountLabel,
        checkoutLoading,
        checkoutSubtotalOverride = null,
        checkoutTotalOverride = null,
        clearAppliedDiscount,
        closeDiscountModal,
        clearDiscountEmployeeCreditPrefill,
        customerPaymentAmountAutoFilled,
        customerPaymentAmountInput,
        customerPaymentFieldLabel,
        deliveryProviderBreakdown = [],
        discountDraft = {},
        discountModalOpen,
        discountPreviewTotals = {},
        discountRules = [],
        discountRulesReady = false,
        discountTypeOptions: providedDiscountTypeOptions = null,
        employeeCreditAccount,
        employeeCreditAccountCode,
        employeeCreditLookupLoading,
        employeeCreditSelectionSource,
        governedDiscountTotals = {},
        handleBillRequest,
        handleCancelCheckout,
        handleCheckout,
        handleExistingOrderCheckout,
        handleCompletePreparedSplitPayment,
        handlePrintOrder,
        handlePrefillEmployeeCredit,
        handleSelectEmployeeCredit,
        hasSplitPaymentSummary,
        isCashPayment,
        isCheckoutWorkflowValid,
        isExistingOrderCheckout = false,
        isCustomerPaymentSufficient,
        isEmployeeCreditPayment,
        isMsmeMode,
        isOrderPrinterAvailable,
        isTabletViewport,
        isTabletPortraitViewport,
        isMobileViewport,
        isMobileLandscapeViewport,
        kitchenNotes,
        openDiscountModal,
        orderMethod,
        parkedSaleReleaseLoading,
        paymentType,
        posActionsBlocked,
        posPresentationBundle,
        posWorkflow,
        resetEmployeeCredit,
        restaurantServiceChargeAmount = 0,
        safeCart = [],
        selectedEmployeeCreditOption,
        selectedLocationId,
        servicesClientName,
        servicesDateTime,
        servicesNotes,
        servicesProvider,
        servicesResource,
        setCheckoutConfirmModalOpen,
        setCustomerPaymentAmountAutoFilled,
        setCustomerPaymentAmountInput,
        setDeliveryProviderBreakdown = () => {},
        setKitchenNotes,
        setOrderMethod,
        setPaymentType,
        setServicesClientName,
        setServicesDateTime,
        setServicesNotes,
        setServicesProvider,
        setServicesResource,
        setTableNumber,
        splitPaymentCancelLoading,
        splitPaymentDialogOpen,
        splitPaymentReady,
        splitPaymentSummaryAllocations = [],
        splitPaymentSummaryChangeAmount,
        splitPaymentSummaryPaidAmount,
        splitPaymentSummaryRemainingAmount,
        tableNumber
    } = viewModel;

    // The terminal viewport classifier is normally the source of truth, but
    // the POS can also run inside a device preview where the CSS viewport has
    // already changed before the workflow state catches up. Use the actual
    // viewport as a fallback for this dialog only so portrait scrolling cannot
    // be left locked by a stale classifier. Landscape and desktop do not match.
    const viewportWidth = typeof window === 'undefined' ? 0 : Number(window.innerWidth);
    const viewportHeight = typeof window === 'undefined' ? 0 : Number(window.innerHeight);
    const isCssPortraitViewport = viewportWidth > 0 && viewportHeight >= viewportWidth;
    const isCssMobilePortraitViewport = isCssPortraitViewport && viewportWidth < 768;
    const isCssTabletPortraitViewport = isCssPortraitViewport && viewportWidth >= 768 && viewportWidth < 1024;
    const isMobilePortraitViewport = (isMobileViewport || isCssMobilePortraitViewport) && !isMobileLandscapeViewport;
    const isTabletPortraitCheckoutViewport = isTabletPortraitViewport || isCssTabletPortraitViewport;
    const isPortraitResponsiveCheckoutViewport = isMobilePortraitViewport || isTabletPortraitCheckoutViewport;

    const [paymentAmountDraft, setPaymentAmountDraft] = useState(null);
    const [orderSummaryOpen, setOrderSummaryOpen] = useState(false);
    const [isIminRuntime] = useState(() => isIminWrapperRuntime());
    const [discountWorkspaceMounted, setDiscountWorkspaceMounted] = useState(false);
    const [discountWorkspaceOpen, setDiscountWorkspaceOpen] = useState(false);
    const [checkoutSheetMotionOpen, setCheckoutSheetMotionOpen] = useState(false);
    const [existingOrderPaymentConfirmed, setExistingOrderPaymentConfirmed] = useState(false);
    const checkoutSheetRef = useRef(null);

    useEffect(() => {
        if (!checkoutConfirmModalOpen) {
            setCheckoutSheetMotionOpen(false);
            return undefined;
        }

        // Mount the dialog in its hidden bottom-sheet state for one paint,
        // then reveal it so the current-sale handoff has a real slide-up.
        setCheckoutSheetMotionOpen(false);
        const openFrameId = window.requestAnimationFrame(() => {
            setCheckoutSheetMotionOpen(true);
        });

        return () => window.cancelAnimationFrame(openFrameId);
    }, [checkoutConfirmModalOpen]);

    useEffect(() => {
        if (!discountModalOpen) return undefined;

        setDiscountWorkspaceMounted(true);

        // Mount collapsed for one paint, then reveal it. The workspace is the
        // only element changing size, and the sheet remains natural-height, so
        // this creates the reference's smooth slide without a fixed-height
        // shrink/reflow before the expansion.
        setDiscountWorkspaceOpen(false);
        const openFrameId = window.requestAnimationFrame(() => {
            setDiscountWorkspaceOpen(true);
        });
        return () => window.cancelAnimationFrame(openFrameId);
    }, [discountModalOpen, isPortraitResponsiveCheckoutViewport]);

    useEffect(() => {
        if (discountModalOpen || !discountWorkspaceMounted) return undefined;

        // Keep the workspace mounted while its collapsed state transitions so
        // dismissal remains smooth on both phone and tablet portrait sheets.
        setDiscountWorkspaceOpen(false);

        const closeTimeoutId = window.setTimeout(() => {
            setDiscountWorkspaceMounted(false);
        }, DISCOUNT_WORKSPACE_TRANSITION_MS);

        return () => window.clearTimeout(closeTimeoutId);
    }, [discountModalOpen, discountWorkspaceMounted, isPortraitResponsiveCheckoutViewport]);

    useLayoutEffect(() => {
        if (!checkoutConfirmModalOpen || !isMobilePortraitViewport || discountModalOpen) return;

        const scrollRegion = checkoutSheetRef.current?.querySelector('[data-testid="pos-checkout-scroll-container"]');
        if (scrollRegion) scrollRegion.scrollTop = 0;
    }, [checkoutConfirmModalOpen, discountModalOpen, isMobilePortraitViewport]);

    useEffect(() => {
        if (checkoutConfirmModalOpen) return;
        setPaymentAmountDraft(null);
        setOrderSummaryOpen(false);
    }, [checkoutConfirmModalOpen]);

    useEffect(() => {
        if (!checkoutConfirmModalOpen || !isExistingOrderCheckout || paymentType === 'cash') {
            setExistingOrderPaymentConfirmed(false);
        }
    }, [checkoutConfirmModalOpen, isExistingOrderCheckout, paymentType]);

    if (!checkoutConfirmModalOpen) return null;

    const checkoutDiscountWorkspaceExpanded = discountWorkspaceOpen || (!discountModalOpen && discountWorkspaceMounted);
    const checkoutDiscountWorkspaceOpen = discountWorkspaceOpen;
    // The workspace owns the expand/collapse motion. The sheet remains a
    // natural-height bottom sheet, so its top edge follows the workspace's
    // max-height transition without a second fixed-height reflow.
    const checkoutDiscountWorkspaceScrollEnabled = isPortraitResponsiveCheckoutViewport
        ? checkoutDiscountWorkspaceExpanded
        : true;
    const checkoutPortraitSheetStyle = isPortraitResponsiveCheckoutViewport
        ? {
            display: 'flex',
            minHeight: 0,
            flexDirection: 'column',
            overflow: 'hidden'
        }
        : undefined;
    const checkoutPortraitBodyStyle = isPortraitResponsiveCheckoutViewport
        ? {
            flex: checkoutDiscountWorkspaceScrollEnabled ? '1 1 auto' : '0 0 auto',
            minHeight: 0,
            overflowY: checkoutDiscountWorkspaceScrollEnabled ? 'auto' : 'hidden',
            overscrollBehaviorY: 'contain',
            WebkitOverflowScrolling: 'touch',
            touchAction: checkoutDiscountWorkspaceScrollEnabled ? 'pan-y' : 'auto'
        }
        : undefined;

    const employeeCreditDiscountPreference = resolveEmployeeDiscountCreditPreference(appliedDiscount, safeCart);

    const normalizedCheckoutTotalOverride = Number(checkoutTotalOverride);
    const hasCheckoutTotalOverride = checkoutTotalOverride !== null
        && checkoutTotalOverride !== undefined
        && Number.isFinite(normalizedCheckoutTotalOverride);
    const effectiveCheckoutTotal = hasCheckoutTotalOverride
        ? round4(normalizedCheckoutTotalOverride)
        : cartTotal;
    const normalizedCheckoutSubtotalOverride = Number(checkoutSubtotalOverride);
    const hasCheckoutSubtotalOverride = checkoutSubtotalOverride !== null
        && checkoutSubtotalOverride !== undefined
        && Number.isFinite(normalizedCheckoutSubtotalOverride);
    const effectiveCheckoutSubtotal = hasCheckoutSubtotalOverride
        ? round4(normalizedCheckoutSubtotalOverride)
        : cartSubtotal;
    const deliveryProviderRows = Array.isArray(deliveryProviderBreakdown) ? deliveryProviderBreakdown : [];
    const selectedDeliveryProvider = deliveryProviderRows[0] || null;
    const deliveryProviderValidationMessage = getDeliveryProviderValidationMessage({
        orderMethod,
        entries: deliveryProviderRows,
        totalAmount: effectiveCheckoutTotal
    });
    const paymentAmountAutoFilled = paymentAmountDraft?.autoFilled ?? Boolean(customerPaymentAmountAutoFilled);
    const paymentAmountInput = paymentAmountAutoFilled
        ? money(effectiveCheckoutTotal)
        : (paymentAmountDraft?.value ?? customerPaymentAmountInput ?? '');
    const customerPaymentAmount = normalizePaymentAmount(paymentAmountInput);
    const customerPaymentShortfall = round4(Math.max(0, Number(effectiveCheckoutTotal || 0) - customerPaymentAmount));
    const customerPaymentChange = round4(Math.max(0, customerPaymentAmount - Number(effectiveCheckoutTotal || 0)));
    const displayedPaymentReceived = hasSplitPaymentSummary
        ? round4(splitPaymentSummaryPaidAmount)
        : customerPaymentAmount;
    const displayedPaymentChange = hasSplitPaymentSummary
        ? round4(splitPaymentSummaryChangeAmount)
        : customerPaymentChange;
    const selectedDiscountType = discountModalOpen
        ? discountDraft.type
        : (appliedDiscount?.type || '');
    const selectedDiscountSelectionKey = getDiscountRuleSelectionKey(
        discountModalOpen ? discountDraft : appliedDiscount
    );
    const checkoutDiscountTypeOptions = providedDiscountTypeOptions || buildPosDiscountTypeOptions(
        discountRules,
        POS_DISCOUNT_FALLBACK_OPTIONS,
        { rulesReady: discountRulesReady }
    );
    const isStatutoryDiscountSelected = selectedDiscountType === 'senior' || selectedDiscountType === 'pwd';
    const displayedVatRemoved = discountModalOpen
        ? round4(discountPreviewTotals.vatRemoved)
        : round4(governedDiscountTotals.vatRemoved);
    const existingNonCashPayment = isExistingOrderCheckout && paymentType !== 'cash';
    const paymentIsSufficient = existingNonCashPayment
        ? Math.abs(customerPaymentAmount - Number(effectiveCheckoutTotal || 0)) <= 0.0001
            && (!isEmployeeCreditPayment || Boolean(isCustomerPaymentSufficient))
        : isEmployeeCreditPayment
            ? Boolean(isCustomerPaymentSufficient)
            : isPaymentAmountSufficient(customerPaymentAmount, effectiveCheckoutTotal);

    const selectPaymentAmount = (nextValue, autoFilled = false) => {
        setPaymentAmountDraft({ value: nextValue, autoFilled });
    };

    const addSuggestedPaymentAmount = (amount) => {
        const currentAmount = paymentAmountAutoFilled ? 0 : normalizePaymentAmount(paymentAmountInput);
        selectPaymentAmount(String(round4(currentAmount + amount)));
    };

    const handlePaymentTypeChange = (nextPaymentType) => {
        setPaymentType(nextPaymentType);
        resetEmployeeCredit();
        setExistingOrderPaymentConfirmed(false);
        setCustomerPaymentAmountInput(money(effectiveCheckoutTotal));
        setCustomerPaymentAmountAutoFilled(true);
        selectPaymentAmount('', true);
    };

    const selectDeliveryProvider = (providerType) => {
        setDeliveryProviderBreakdown((current) => {
            const rows = Array.isArray(current) ? current : [];
            const existingEntry = rows.find((entry) => entry?.provider_type === providerType);
            return [{
                provider_type: providerType,
                provider_name: providerType === 'other'
                    ? normalizeDeliveryProviderName(existingEntry?.provider_name)
                    : '',
                amount: ''
            }];
        });
    };

    const updateDeliveryProviderName = (value) => {
        setDeliveryProviderBreakdown((current) => {
            const rows = Array.isArray(current) ? current : [];
            if (rows.length === 0) return rows;
            return [{
                ...rows[0],
                provider_name: normalizeDeliveryProviderName(value)
            }];
        });
    };

    const checkoutPaymentSnapshot = {
        customerPaymentAmount,
        customerPaymentChange,
        isCustomerPaymentSufficient: paymentIsSufficient,
        ...(isExistingOrderCheckout ? {
            paymentType,
            manualPaymentReceived: existingNonCashPayment ? existingOrderPaymentConfirmed : false,
            ...(employeeCreditAccountCode ? { employeeCreditAccountCode } : {})
        } : {})
    };
    const confirmCheckout = () => {
        if (isExistingOrderCheckout && typeof handleExistingOrderCheckout === 'function') {
            return handleExistingOrderCheckout(checkoutPaymentSnapshot);
        }
        return handleCheckout(checkoutPaymentSnapshot);
    };

    const openCheckoutDiscountEditor = (initialType) => {
        setCustomerPaymentAmountInput(paymentAmountInput);
        setCustomerPaymentAmountAutoFilled(paymentAmountAutoFilled);
        openDiscountModal({
            initialType: typeof initialType === 'string' ? initialType : undefined
        });
    };

    const handleCheckoutDiscountTypeClick = (discountType) => {
        if (selectedDiscountType === discountType) {
            clearAppliedDiscount();
            return;
        }
        if (selectedDiscountSelectionKey === discountType) {
            clearAppliedDiscount();
            return;
        }
        openCheckoutDiscountEditor(discountType);
    };

    return (
        <>
        <Dialog
            open={checkoutConfirmModalOpen}
            mobileSheet
            overlayClassName={`pos-checkout-mobile-overlay ${checkoutSheetMotionOpen ? 'pos-checkout-mobile-overlay-visible' : ''} ${checkoutOpenedFromCurrentSale ? 'pos-checkout-mobile-overlay-handoff' : ''} bg-slate-950/70 backdrop-blur-none ${isIminRuntime ? 'pos-checkout-imin-overlay' : ''}`}
            onOpenChange={(nextOpen) => {
                if (nextOpen) {
                    setCheckoutConfirmModalOpen(true);
                    return;
                }
                void handleCancelCheckout();
            }}
        >
            <DialogContent ref={checkoutSheetRef} style={checkoutPortraitSheetStyle} className={`pos-checkout-confirm-dialog pos-mobile-bottom-sheet pos-checkout-mobile-sheet ${checkoutSheetMotionOpen ? 'pos-checkout-mobile-sheet-visible' : ''} ${isMobilePortraitViewport ? 'pos-checkout-mobile-portrait-sheet' : ''} ${isTabletPortraitCheckoutViewport ? 'pos-checkout-tablet-portrait-sheet' : ''} ${checkoutOpenedFromCurrentSale ? 'pos-checkout-mobile-sheet-handoff' : ''} ${checkoutDiscountWorkspaceExpanded ? 'pos-checkout-mobile-sheet-expanded' : ''} flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 max-md:w-full max-md:max-w-none max-md:rounded-t-2xl max-md:rounded-b-none max-md:border-x max-md:border-t max-md:border-b-0 max-md:shadow-2xl`}>
                <DialogHeader className="pos-checkout-mobile-header shrink-0 border-b border-slate-200 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle id="pos-checkout-confirm-modal-title" className="text-[17px] font-black text-[#0F172A]">
                                    Checkout Tab
                                </DialogTitle>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOrderSummaryOpen(true)}
                                className="h-8 rounded-lg border-sky-300 bg-sky-50 px-4 text-[11px] font-extrabold text-[#1A4E8D] hover:border-[#1A4E8D] hover:bg-[#EFF7FF]"
                                aria-expanded={orderSummaryOpen}
                                aria-label="View Order Summary"
                                data-testid="pos-checkout-view-order-summary"
                            >
                                <span className="hidden sm:inline">View Order Summary</span>
                                <span className="sm:hidden">Summary</span>
                            </Button>
                            <button
                                type="button"
                                onClick={handleCancelCheckout}
                                disabled={checkoutLoading || splitPaymentCancelLoading || parkedSaleReleaseLoading}
                                className="rounded-md p-1 text-slate-500 transition hover:bg-[#EFF7FF] hover:text-[#1A4E8D] focus:outline-none disabled:opacity-50"
                                aria-label="Close checkout confirmation"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </DialogHeader>

                <section
                    className="shrink-0 border-b border-slate-200 bg-white px-4 py-3"
                    aria-label="Payment totals"
                >
                    <div
                        className={`grid overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/70 ${isStatutoryDiscountSelected ? 'grid-cols-6 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'}`}
                        data-testid="pos-checkout-payment-summary"
                    >
                        <div className={`${isStatutoryDiscountSelected ? 'max-sm:col-span-2' : ''} px-3 py-2.5`}>
                            <span className="block text-[10px] font-bold text-slate-600">Order Total</span>
                            <span className="block text-sm font-black tabular-nums text-emerald-700">₱{money(effectiveCheckoutTotal)}</span>
                        </div>
                        <div className={`${isStatutoryDiscountSelected ? 'max-sm:col-span-2' : ''} border-l border-emerald-200 px-3 py-2.5`}>
                            <span className="block text-[10px] font-bold text-slate-600">Discount</span>
                            <span className={`block text-sm font-black tabular-nums ${calculatedDiscountAmount > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                                {calculatedDiscountAmount > 0 ? `- ₱${money(calculatedDiscountAmount)}` : '₱0.00'}
                            </span>
                        </div>
                        {isStatutoryDiscountSelected && (
                            <div className="col-span-2 border-l border-emerald-200 px-3 py-2.5 sm:col-span-1 sm:border-l sm:border-t-0" data-testid="pos-checkout-vat-removed">
                                <span className="block text-[10px] font-bold text-slate-600">VAT Removed</span>
                                <span className="block text-sm font-black tabular-nums text-amber-700">₱{money(displayedVatRemoved)}</span>
                            </div>
                        )}
                        <div className={`${isStatutoryDiscountSelected ? 'col-span-3 sm:col-span-1' : ''} border-t border-emerald-200 px-3 py-2.5 sm:border-l sm:border-t-0`}>
                            <span className="block text-[10px] font-bold text-slate-600">Payment Received</span>
                            <span className="block text-sm font-black tabular-nums text-[#1A4E8D]">₱{money(displayedPaymentReceived)}</span>
                        </div>
                        <div className={`${isStatutoryDiscountSelected ? 'col-span-3 sm:col-span-1' : ''} border-l border-t border-emerald-200 px-3 py-2.5 sm:border-l sm:border-t-0`}>
                            <span className="block text-[10px] font-bold text-slate-600">Change</span>
                            <span className="block text-sm font-black tabular-nums text-blue-600">₱{money(displayedPaymentChange)}</span>
                        </div>
                    </div>
                </section>

                <div
                    className={`pos-modal-scroll-content pos-checkout-scroll-region grid min-h-0 min-w-0 max-w-full flex-1 content-start gap-0 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-4 pt-2 lg:grid-cols-2 ${checkoutDiscountWorkspaceScrollEnabled ? 'pos-checkout-mobile-scroll-expanded' : 'pos-checkout-mobile-scroll-locked'}`}
                    style={checkoutPortraitBodyStyle}
                    data-pos-checkout-scroll-state={checkoutDiscountWorkspaceScrollEnabled ? 'expanded' : 'locked'}
                    data-testid="pos-checkout-scroll-container"
                >

                    <div className="min-w-0 max-w-full space-y-0 lg:col-span-2" data-testid="pos-checkout-order-settings">
                        <Suspense fallback={<div className="h-10 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />}>
                            <PosCheckoutDetailsSlot
                                presentationBundle={posPresentationBundle}
                                posWorkflow={posWorkflow}
                                orderMethod={orderMethod}
                                setOrderMethod={setOrderMethod}
                                tableNumber={tableNumber}
                                setTableNumber={setTableNumber}
                                kitchenNotes={kitchenNotes}
                                setKitchenNotes={setKitchenNotes}
                                servicesClientName={servicesClientName}
                                setServicesClientName={setServicesClientName}
                                servicesDateTime={servicesDateTime}
                                setServicesDateTime={setServicesDateTime}
                                servicesProvider={servicesProvider}
                                setServicesProvider={setServicesProvider}
                                servicesResource={servicesResource}
                                setServicesResource={setServicesResource}
                                servicesNotes={servicesNotes}
                                setServicesNotes={setServicesNotes}
                                buttonLayout={true}
                                isTabletViewport={isTabletViewport}
                                disabled={posActionsBlocked || checkoutLoading || isExistingOrderCheckout}
                                cartItemCount={safeCart.length}
                            />
                        </Suspense>
                    </div>

                    {(!hasSplitPaymentSummary || isEmployeeCreditPayment || (!isEmployeeCreditPayment && !splitPaymentReady)) && (
                        <div className="w-full min-w-0 max-w-full space-y-0 py-[25px] lg:col-span-2" data-testid="pos-checkout-payment-group">
                            {!hasSplitPaymentSummary && (
                                <fieldset className="w-full min-w-0 max-w-full space-y-1 py-[5px]" aria-label="Payment Type">
                                    <legend className="text-[11px] font-bold text-slate-600">{orderMethod === 'delivery' ? 'Settlement Payment Type' : 'Payment Type'}</legend>
                                    <div className={`${isTabletViewport ? 'w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain p-1 touch-pan-x' : 'w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 touch-pan-x'} pos-checkout-payment-method-scroll`}>
                                        <div className="grid min-w-[768px] shrink-0 grid-cols-6 gap-1.5" data-testid="pos-checkout-payment-method-buttons">
                                            {PAYMENT_METHOD_OPTIONS.map((option) => {
                                                const active = paymentType === option.value;
                                                const color = resolvePaymentMethodColorStyles(option.value);
                                                const inactiveSelectClassName = color.inactiveSelectClassName.replace(/\s+hover:[^\s]+/g, '');
                                                const displayLabel = isMsmeMode && ['gcash', 'maya', 'card', 'bank_transfer'].includes(option.value)
                                                    ? `${option.label} (Manual)`
                                                    : option.label;
                                                return (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        aria-pressed={active}
                                                        onClick={() => handlePaymentTypeChange(option.value)}
                                                        disabled={posActionsBlocked || checkoutLoading}
                                                        className={`h-9 whitespace-nowrap rounded-lg border px-2 text-[11px] font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${active
                                                            ? `${color.selectClassName} ${isTabletViewport ? `${color.activeRingClassName} ring-2 ring-offset-1` : ''} shadow-sm hover:brightness-95`
                                                            : `${isTabletViewport ? inactiveSelectClassName : 'border-slate-300 bg-white text-[#0F172A]'} ${CHECKOUT_SECONDARY_HOVER}`}`}
                                                    >
                                                        {displayLabel}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </fieldset>
                            )}

                    {isEmployeeCreditPayment && (
                        <div className="w-full min-w-0 max-w-full" data-testid="pos-checkout-employee-credit">
                            <Suspense fallback={<div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">Loading employee credit...</div>}>
                                <EmployeeCreditPaymentPanel
                                    selectedEmployee={selectedEmployeeCreditOption}
                                    onSelectEmployee={handleSelectEmployeeCredit}
                                    onPrefillEmployee={handlePrefillEmployeeCredit}
                                    onClearPrefill={clearDiscountEmployeeCreditPrefill}
                                    lookupLoading={employeeCreditLookupLoading}
                                    account={employeeCreditAccount}
                                    totalDue={effectiveCheckoutTotal}
                                    locationId={selectedLocationId}
                                    preferredEmployeeId={employeeCreditDiscountPreference.preferredEmployeeId}
                                    prefillEnabled={!hasSplitPaymentSummary}
                                    prefillLocked={employeeCreditSelectionSource === 'manual'}
                                    prefillBlockedReason={employeeCreditDiscountPreference.hasConflict ? 'Different employees are assigned to this sale’s discounts. Select the Employee Credit account manually.' : ''}
                                />
                            </Suspense>
                        </div>
                    )}

                    {!isEmployeeCreditPayment && !splitPaymentReady && (
                        <div className="w-full min-w-0 max-w-full space-y-1.5 lg:col-span-2" data-testid="pos-checkout-payment-entry">
                            <label htmlFor="pos-customer-payment-amount" className="block text-[11px] font-bold text-slate-600">
                                {customerPaymentFieldLabel}
                            </label>
                            <div className={`${isCashPayment ? 'w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 touch-pan-x' : 'w-full min-w-0 max-w-full'} pos-checkout-payment-suggestion-scroll`}>
                                <div
                                    className={isCashPayment
                                        ? 'grid min-w-[768px] shrink-0 grid-cols-6 gap-1.5'
                                        : 'grid'}
                                    data-testid={isCashPayment ? 'pos-cash-payment-suggestions' : undefined}
                                >
                                    <Input
                                        id="pos-customer-payment-amount"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={paymentAmountInput}
                                        onChange={(event) => selectPaymentAmount(event.target.value)}
                                        onFocus={() => {
                                            if (paymentAmountAutoFilled) selectPaymentAmount('');
                                        }}
                                        placeholder="0.00"
                                        className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[14px] font-extrabold text-[#0F172A] focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-blue-100"
                                    />
                                    {isCashPayment && CASH_PAYMENT_SUGGESTIONS.map((amount) => (
                                        <button
                                            key={amount}
                                            type="button"
                                            onClick={() => addSuggestedPaymentAmount(amount)}
                                            disabled={checkoutLoading}
                                            className={`h-9 rounded-lg border border-blue-200 bg-blue-50 px-2 text-[11px] font-extrabold text-[#1A4E8D] transition-colors ${CHECKOUT_SECONDARY_HOVER} disabled:cursor-not-allowed disabled:opacity-50`}
                                            data-testid={`pos-cash-payment-suggestion-${amount}`}
                                        >
                                            ₱{amount.toLocaleString('en-US')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {customerPaymentShortfall > 0 && (
                                <p className="text-right text-[11px] font-bold text-rose-700" data-testid="pos-checkout-payment-shortfall">
                                    Remaining Balance: ₱{money(customerPaymentShortfall)}
                                </p>
                            )}
                            {existingNonCashPayment && !paymentIsSufficient && (
                                <p className="text-right text-[11px] font-bold text-rose-700" data-testid="pos-checkout-payment-exact-required">
                                    Enter the exact order total for this payment method.
                                </p>
                            )}
                            {existingNonCashPayment && (
                                <label className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-[#1A4E8D]" data-testid="pos-checkout-payment-confirmation">
                                    <input
                                        type="checkbox"
                                        checked={existingOrderPaymentConfirmed}
                                        onChange={(event) => setExistingOrderPaymentConfirmed(event.target.checked)}
                                        disabled={checkoutLoading}
                                        className="mt-0.5 h-4 w-4 accent-[#1A4E8D]"
                                    />
                                    <span>{paymentType === 'employee_credit'
                                        ? 'I confirm this Employee Credit account is authorized for the order.'
                                        : 'I confirm the store received this payment.'}</span>
                                </label>
                            )}
                        </div>
                    )}
                        </div>
                    )}
                    {orderMethod === 'delivery' && (
                        <fieldset className="w-full min-w-0 max-w-full space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3 lg:col-span-2" aria-label="Delivery Provider" data-testid="pos-delivery-provider-breakdown">
                            <legend className="px-1 text-[11px] font-black uppercase tracking-wide text-[#1A4E8D]">Delivery Provider <span className="text-rose-600">*</span></legend>
                            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1" data-testid="pos-delivery-provider-prompt-row">
                                <p className="min-w-0 flex-1 text-[11px] font-medium text-slate-600">Select one delivery provider.</p>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5" data-testid="pos-delivery-provider-options">
                                {DELIVERY_PROVIDER_OPTIONS.map((option) => {
                                    const active = selectedDeliveryProvider?.provider_type === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => selectDeliveryProvider(option.value)}
                                            disabled={posActionsBlocked || checkoutLoading}
                                            className={`h-9 rounded-lg border px-2 text-[11px] font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${active ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm' : 'border-slate-300 bg-white text-[#0F172A] hover:border-[#1A4E8D] hover:bg-white'} disabled:cursor-not-allowed disabled:opacity-50`}
                                            data-testid={`pos-delivery-provider-${option.value}`}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                            {selectedDeliveryProvider?.provider_type === 'other' && (
                                <label className="block rounded-lg border border-blue-100 bg-white p-2 text-[10px] font-bold text-slate-600" data-testid="pos-delivery-provider-other-field">
                                    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1" data-testid="pos-delivery-provider-other-label-row">
                                        <span>Other provider name <span className="text-rose-600">*</span></span>
                                        {deliveryProviderValidationMessage && (
                                            <span className="ml-auto max-w-full rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-right text-[11px] font-bold text-rose-700" role="alert" data-testid="pos-delivery-provider-error">
                                                {deliveryProviderValidationMessage}
                                            </span>
                                        )}
                                    </span>
                                    <Input
                                        type="text"
                                        value={selectedDeliveryProvider.provider_name || ''}
                                        onChange={(event) => updateDeliveryProviderName(event.target.value)}
                                        disabled={checkoutLoading}
                                        placeholder="e.g. Maxim"
                                        aria-label="Other delivery provider name"
                                        className="mt-1 h-8 rounded-lg border-slate-200 text-[12px] font-semibold"
                                        data-testid="pos-delivery-provider-other-name"
                                    />
                                </label>
                            )}
                        </fieldset>
                    )}
                    {existingNonCashPayment && isEmployeeCreditPayment && (
                        <label className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-[#1A4E8D] lg:col-span-2" data-testid="pos-checkout-payment-confirmation">
                            <input
                                type="checkbox"
                                checked={existingOrderPaymentConfirmed}
                                onChange={(event) => setExistingOrderPaymentConfirmed(event.target.checked)}
                                disabled={checkoutLoading}
                                className="mt-0.5 h-4 w-4 accent-[#1A4E8D]"
                            />
                            <span>I confirm this Employee Credit account is authorized for the order.</span>
                        </label>
                    )}

                    <fieldset className="pos-checkout-discount-types w-full min-w-0 max-w-full space-y-1 py-2 lg:col-span-2" aria-label="Apply Discount">
                        <legend className="text-[11px] font-bold text-slate-600">Apply Discount</legend>
                        <div className="pos-checkout-discount-type-scroll w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 touch-pan-x">
                            <div className="grid min-w-[768px] shrink-0 grid-cols-6 gap-1.5" data-testid="pos-checkout-discount-type-buttons">
                                {checkoutDiscountTypeOptions.map((option) => {
                                    const active = selectedDiscountSelectionKey === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => handleCheckoutDiscountTypeClick(option.value)}
                                            disabled={isExistingOrderCheckout || checkoutLoading || splitPaymentDialogOpen || hasSplitPaymentSummary}
                                            className={`h-9 whitespace-nowrap rounded-lg border px-2 text-[11px] font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 ${
                                                active
                                                    ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm'
                                                    : 'border-[#1A4E8D] bg-white text-[#1A4E8D] hover:bg-[#EFF7FF]'
                                            } disabled:cursor-not-allowed disabled:opacity-50`}
                                            data-testid={`pos-checkout-discount-type-${option.value}`}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        {calculatedDiscountAmount > 0 && (
                            <div className="flex items-center justify-end gap-2 pt-1" data-testid="pos-checkout-discount-summary">
                                <span className="truncate text-[11px] font-bold text-rose-600">
                                    {checkoutDiscountLabel || 'Discount'} applied
                                </span>
                                <button
                                    type="button"
                                    onClick={() => openCheckoutDiscountEditor()}
                                    disabled={isExistingOrderCheckout || checkoutLoading || splitPaymentDialogOpen || hasSplitPaymentSummary}
                                    className={`flex h-7 items-center gap-1 rounded-lg px-1.5 text-[11px] font-bold text-[#1A4E8D] transition-colors ${CHECKOUT_ICON_HOVER} disabled:cursor-not-allowed disabled:opacity-40`}
                                    aria-label={`Edit ${checkoutDiscountLabel}`}
                                    title={splitPaymentDialogOpen || hasSplitPaymentSummary ? 'Finish or cancel the active payment first' : 'Edit discount'}
                                    data-testid="pos-edit-checkout-discount"
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={clearAppliedDiscount}
                                    disabled={isExistingOrderCheckout || checkoutLoading || splitPaymentDialogOpen || hasSplitPaymentSummary}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-100 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={`Remove ${checkoutDiscountLabel}`}
                                    title={splitPaymentDialogOpen || hasSplitPaymentSummary ? 'Finish or cancel the active payment first' : 'Remove discount'}
                                    data-testid="pos-remove-checkout-discount"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </fieldset>

                    {(discountModalOpen || discountWorkspaceMounted) && (
                        <div
                            className={`pos-checkout-discount-workspace ${checkoutDiscountWorkspaceOpen ? 'pos-checkout-discount-workspace-open' : ''} lg:col-span-2`}
                            aria-hidden={!discountModalOpen}
                        >
                            <Suspense fallback={<div className="h-44 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />}>
                                <POSDiscountWorkspace viewModel={viewModel} onCancel={closeDiscountModal} embedded />
                            </Suspense>
                        </div>
                    )}

                    {hasSplitPaymentSummary && (
                        <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3" data-testid="pos-checkout-split-payment-summary">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-wide text-[#1A4E8D]">Payment Summary</p>
                                <p className="mt-1 text-xs font-medium text-slate-600">Payment methods received for this sale.</p>
                            </div>
                            <div className="space-y-2" data-testid="pos-checkout-split-payment-methods">
                                {splitPaymentSummaryAllocations.map((allocation, index) => {
                                    const paymentMethod = String(allocation?.payment_method || '').trim().toLowerCase();
                                    const appliedAmount = round4(allocation?.applied_amount);
                                    const cashTendered = round4(allocation?.cash_tendered ?? appliedAmount);
                                    const displayedAmount = paymentMethod === 'cash' ? cashTendered : appliedAmount;
                                    const cashChange = round4(allocation?.change_amount);
                                    const hasCashAdjustment = paymentMethod === 'cash' && cashTendered !== appliedAmount;
                                    const paymentMethodColor = resolvePaymentMethodColorStyles(paymentMethod);
                                    return (
                                        <div key={`${paymentMethod || 'payment'}-${index}`} className={`rounded-lg border px-3 py-2 ${paymentMethodColor.rowClassName}`} data-testid={`pos-checkout-split-payment-method-${index + 1}`}>
                                            <div className="flex items-center justify-between gap-3 text-sm">
                                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-extrabold ${paymentMethodColor.badgeClassName}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${paymentMethodColor.dotClassName}`} aria-hidden="true" />
                                                    {formatSplitPaymentMethod(paymentMethod)}
                                                </span>
                                                <span className={`font-black ${paymentMethodColor.amountClassName}`}>₱{money(displayedAmount)}</span>
                                            </div>
                                            {hasCashAdjustment && (
                                                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                                    Applied ₱{money(appliedAmount)} · Change ₱{money(cashChange)}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="grid grid-cols-3 gap-2" data-testid="pos-checkout-split-payment-totals">
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Paid</p>
                                    <p className="mt-1 text-sm font-black text-emerald-800">₱{money(splitPaymentSummaryPaidAmount)}</p>
                                </div>
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Remaining</p>
                                    <p className="mt-1 text-sm font-black text-amber-800">₱{money(splitPaymentSummaryRemainingAmount)}</p>
                                </div>
                                <div className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2" data-testid="pos-checkout-split-payment-change">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700">Change</p>
                                    <p className="mt-1 text-sm font-black text-sky-800">₱{money(splitPaymentSummaryChangeAmount)}</p>
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                <DialogFooter className="pos-checkout-mobile-footer shrink-0 grid grid-cols-3 gap-2 border-t border-slate-200 px-4 py-3 bg-white">
                    {checkoutError && (
                        <p className="col-span-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700" role="alert" data-testid="pos-checkout-error">
                            {checkoutError}
                        </p>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleBillRequest}
                        disabled={posActionsBlocked || checkoutLoading || billRequestPrinting || splitPaymentCancelLoading || parkedSaleReleaseLoading || safeCart.length === 0 || !isOrderPrinterAvailable}
                        className={`h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-extrabold text-[#0F172A] ${CHECKOUT_SECONDARY_HOVER}`}
                        title={isOrderPrinterAvailable ? undefined : 'No order-ticket printer detected on this device.'}
                        data-testid="pos-bill-request-button"
                    >
                        {billRequestPrinting ? 'Printing…' : 'Bill Request'}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => handlePrintOrder()}
                        disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || !isOrderPrinterAvailable}
                        title={isOrderPrinterAvailable ? undefined : 'No order-ticket printer detected on this device.'}
                        className={`h-10 rounded-lg border border-[#1A4E8D] bg-white px-2 text-[12px] font-extrabold text-[#1A4E8D] ${CHECKOUT_SECONDARY_HOVER} disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                        <Printer className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Print Order
                    </Button>
                    <Button
                        type="button"
                        onClick={splitPaymentReady ? () => handleCompletePreparedSplitPayment() : confirmCheckout}
                        disabled={posActionsBlocked || checkoutLoading || discountModalOpen || safeCart.length === 0 || !isCheckoutWorkflowValid || Boolean(deliveryProviderValidationMessage) || (!splitPaymentReady && !paymentIsSufficient) || (existingNonCashPayment && !existingOrderPaymentConfirmed)}
                        title={discountModalOpen ? 'Apply or cancel the discount draft before confirming checkout.' : undefined}
                        className="h-10 rounded-lg bg-[#1A4E8D] px-3 text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 transition hover:bg-[#143F73] disabled:cursor-not-allowed disabled:bg-[#1A4E8D] disabled:opacity-60"
                    >
                        {checkoutLoading ? 'Processing...' : (splitPaymentReady ? 'Confirm Sale' : 'Confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {orderSummaryOpen && (
        <Dialog
            open={checkoutConfirmModalOpen && orderSummaryOpen}
            onOpenChange={setOrderSummaryOpen}
            overlayClassName="bg-slate-950/70 backdrop-blur-none"
        >
            <DialogContent
                className="pos-checkout-order-summary-modal flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-2xl sm:w-[calc(100vw-4rem)]"
                data-testid="pos-checkout-order-summary-modal"
                aria-labelledby="pos-checkout-order-summary-title"
            >
                <DialogHeader className="pos-checkout-mobile-header relative shrink-0 border-b border-slate-200 px-4 py-3 pr-14 text-left">
                    <DialogTitle id="pos-checkout-order-summary-title" className="text-base font-black text-[#0F172A]">
                        Order Summary
                    </DialogTitle>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">Review the items, quantities, and totals for this checkout.</p>
                    <button
                        type="button"
                        onClick={() => setOrderSummaryOpen(false)}
                        className="pos-checkout-order-summary-close absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-[#1A4E8D] text-white shadow-md transition hover:bg-[#143F73] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
                        aria-label="Close Order Summary"
                        data-testid="pos-checkout-close-order-summary"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </DialogHeader>

                <div className="pos-checkout-order-summary-panel max-h-[16rem] flex-none overflow-y-auto overscroll-contain bg-white p-4" data-testid="pos-checkout-order-summary-panel">
                    <div className="space-y-2">
                        {safeCart.map((line, index) => (
                            <article
                                key={line.line_ref || line.line_key || `${line.item_id}-${index}`}
                                className="rounded-xl border border-blue-300 bg-cyan-50/50 px-3 py-2.5"
                            >
                                <p className="truncate text-xs font-extrabold text-slate-900">{line.item_name || `Item #${line.item_id}`}</p>
                                <div className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-4 text-[11px] text-slate-600">
                                    <div>
                                        <span className="block text-[10px] text-slate-500">Quantity</span>
                                        <strong className="text-slate-900">{line.quantity}</strong>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] text-slate-500">Total Price</span>
                                        <strong className="block rounded border border-slate-200 bg-white px-2 py-1 text-slate-900">₱{money(getCartLineSubtotal(line))}</strong>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>

                <div className="pos-checkout-order-summary-totals shrink-0 bg-white p-4 pt-2">
                    <dl className="space-y-1 rounded-xl border border-slate-200 px-4 py-3 text-[11px]">
                        <div className="flex items-center justify-between gap-4"><dt>Item Cost</dt><dd>₱{money(effectiveCheckoutSubtotal)}</dd></div>
                        {Number(restaurantServiceChargeAmount || 0) > 0 && (
                            <div className="flex items-center justify-between gap-4"><dt>Service Charge</dt><dd>₱{money(restaurantServiceChargeAmount)}</dd></div>
                        )}
                            <div className="flex items-center justify-between gap-4"><dt>VAT Removed</dt><dd>₱{money(governedDiscountTotals.vatRemoved)}</dd></div>
                            <div className="flex items-center justify-between gap-4 text-rose-600"><dt>Discount/Promo</dt><dd>-₱{money(calculatedDiscountAmount)}</dd></div>
                        <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2 text-sm font-black text-slate-950"><dt>Total Amount</dt><dd>₱{money(effectiveCheckoutTotal)}</dd></div>
                    </dl>
                </div>
            </DialogContent>
        </Dialog>
        )}
        </>
    );
}

export default React.memo(POSCheckoutConfirmDialog);

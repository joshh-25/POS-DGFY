import React, { Suspense, useEffect, useState } from 'react';
import {
    ChevronRight,
    Pencil,
    Printer,
    ShieldCheck,
    Tag,
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
import { formatSplitPaymentMethod, money, round4 } from '../utils/posCheckoutTerminalUtils.js';

const EmployeeCreditPaymentPanel = lazyWithChunkRetry(() => import('./EmployeeCreditPaymentPanel.jsx'));
const PosCheckoutDetailsSlot = lazyWithChunkRetry(() => import('./PosCheckoutDetailsSlot.jsx').then(({ PosCheckoutDetailsSlot: Component }) => ({ default: Component })));

const POS_FORM_SELECT_CLASS = 'focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
const CASH_PAYMENT_SUGGESTIONS = [50, 100, 200, 500, 1000, 2000];

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
        calculatedDiscountAmount,
        cartSubtotal,
        cartTotal,
        checkoutConfirmModalOpen,
        checkoutDiscountLabel,
        checkoutLoading,
        clearAppliedDiscount,
        customerPaymentAmountAutoFilled,
        customerPaymentAmountInput,
        customerPaymentFieldLabel,
        employeeCreditAccount,
        employeeCreditLookupLoading,
        governedDiscountTotals = {},
        handleBillRequest,
        handleCancelCheckout,
        handleCheckout,
        handleCompletePreparedSplitPayment,
        handlePrintOrder,
        handleSelectEmployeeCredit,
        hasSplitPaymentSummary,
        isCashPayment,
        isCheckoutWorkflowValid,
        isCustomerPaymentSufficient,
        isEmployeeCreditPayment,
        isMsmeMode,
        isPrinterAvailable,
        kitchenNotes,
        openDiscountModal,
        orderMethod,
        parkedSaleReleaseLoading,
        paymentType,
        posActionsBlocked,
        posPresentationBundle,
        posWorkflow,
        resetEmployeeCredit,
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

    const [paymentAmountInput, setPaymentAmountInput] = useState(customerPaymentAmountInput || '');
    const [paymentAmountAutoFilled, setPaymentAmountAutoFilled] = useState(Boolean(customerPaymentAmountAutoFilled));

    useEffect(() => {
        if (!checkoutConfirmModalOpen) return;
        setPaymentAmountInput(customerPaymentAmountAutoFilled ? money(cartTotal) : (customerPaymentAmountInput || ''));
        setPaymentAmountAutoFilled(Boolean(customerPaymentAmountAutoFilled));
    }, [cartTotal, checkoutConfirmModalOpen, customerPaymentAmountAutoFilled, customerPaymentAmountInput, paymentType]);

    const customerPaymentAmount = normalizePaymentAmount(paymentAmountInput);
    const customerPaymentShortfall = round4(Math.max(0, Number(cartTotal || 0) - customerPaymentAmount));
    const customerPaymentChange = round4(Math.max(0, customerPaymentAmount - Number(cartTotal || 0)));
    const paymentIsSufficient = isEmployeeCreditPayment
        ? Boolean(isCustomerPaymentSufficient)
        : customerPaymentAmount >= Number(cartTotal || 0);

    const selectPaymentAmount = (nextValue, autoFilled = false) => {
        setPaymentAmountInput(nextValue);
        setPaymentAmountAutoFilled(autoFilled);
    };

    const handlePaymentTypeChange = (event) => {
        setPaymentType(event.target.value);
        resetEmployeeCredit();
        const exactAmount = money(cartTotal);
        setCustomerPaymentAmountInput(exactAmount);
        setCustomerPaymentAmountAutoFilled(true);
        selectPaymentAmount(exactAmount, true);
    };

    const confirmCheckout = () => handleCheckout({
        customerPaymentAmount,
        customerPaymentChange,
        isCustomerPaymentSufficient: paymentIsSufficient
    });

    const openCheckoutDiscountEditor = () => {
        setCustomerPaymentAmountInput(paymentAmountInput);
        setCustomerPaymentAmountAutoFilled(paymentAmountAutoFilled);
        openDiscountModal({ returnToCheckout: true });
    };

    return (
        <Dialog
            open={checkoutConfirmModalOpen}
            onOpenChange={(nextOpen) => {
                if (nextOpen) {
                    setCheckoutConfirmModalOpen(true);
                    return;
                }
                void handleCancelCheckout();
            }}
        >
            <DialogContent className="pos-checkout-confirm-dialog flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/25 sm:w-full">
                <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle id="pos-checkout-confirm-modal-title" className="text-[17px] font-black text-[#0F172A]">
                                    Confirm Checkout
                                </DialogTitle>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleCancelCheckout}
                            disabled={checkoutLoading || splitPaymentCancelLoading || parkedSaleReleaseLoading}
                            className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none disabled:opacity-50"
                            aria-label="Close checkout confirmation"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </DialogHeader>

                <div className="pos-modal-scroll-content min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" data-testid="pos-checkout-order-settings">
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
                                paymentTypeField={!hasSplitPaymentSummary ? (
                                    <label className="block text-[11px] font-medium text-slate-500">
                                        Payment Type
                                        <select
                                            value={paymentType}
                                            onChange={handlePaymentTypeChange}
                                            disabled={posActionsBlocked || checkoutLoading}
                                            className={`mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 py-1 text-[12px] ${POS_FORM_SELECT_CLASS}`}
                                        >
                                            <option value="cash">Cash</option>
                                            <option value="gcash">{isMsmeMode ? 'GCash (Manual)' : 'GCash'}</option>
                                            <option value="maya">{isMsmeMode ? 'Maya (Manual)' : 'Maya'}</option>
                                            <option value="card">{isMsmeMode ? 'Card (Manual)' : 'Card'}</option>
                                            <option value="bank_transfer">{isMsmeMode ? 'Bank Transfer (Manual)' : 'Bank Transfer'}</option>
                                            <option value="employee_credit">Employee Credit</option>
                                        </select>
                                    </label>
                                ) : null}
                                disabled={posActionsBlocked || checkoutLoading}
                            />
                        </Suspense>
                    </div>

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
                                    return (
                                        <div key={`${paymentMethod || 'payment'}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2" data-testid={`pos-checkout-split-payment-method-${index + 1}`}>
                                            <div className="flex items-center justify-between gap-3 text-sm">
                                                <span className="font-extrabold text-slate-800">{formatSplitPaymentMethod(paymentMethod)}</span>
                                                <span className="font-black text-[#1A4E8D]">PHP {money(displayedAmount)}</span>
                                            </div>
                                            {hasCashAdjustment && (
                                                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                                    Applied PHP {money(appliedAmount)} · Change PHP {money(cashChange)}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="grid grid-cols-3 gap-2" data-testid="pos-checkout-split-payment-totals">
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Paid</p>
                                    <p className="mt-1 text-sm font-black text-emerald-800">PHP {money(splitPaymentSummaryPaidAmount)}</p>
                                </div>
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Remaining</p>
                                    <p className="mt-1 text-sm font-black text-amber-800">PHP {money(splitPaymentSummaryRemainingAmount)}</p>
                                </div>
                                <div className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2" data-testid="pos-checkout-split-payment-change">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700">Change</p>
                                    <p className="mt-1 text-sm font-black text-sky-800">PHP {money(splitPaymentSummaryChangeAmount)}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {isEmployeeCreditPayment && (
                        <Suspense fallback={<div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">Loading employee credit...</div>}>
                            <EmployeeCreditPaymentPanel
                                selectedEmployee={selectedEmployeeCreditOption}
                                onSelectEmployee={handleSelectEmployeeCredit}
                                lookupLoading={employeeCreditLookupLoading}
                                account={employeeCreditAccount}
                                totalDue={cartTotal}
                                locationId={selectedLocationId}
                            />
                        </Suspense>
                    )}

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="pos-checkout-sale-summary">
                        <p className="text-[11px] font-black uppercase tracking-wide text-[#64748B]">Sale Summary</p>
                        <div className="mt-2 space-y-2 text-[13px]">
                            <div className="flex justify-between gap-3">
                                <span className="text-[#334155]">Total Sales (before discount)</span>
                                <span className="font-extrabold tabular-nums text-[#0F172A]">PHP {money(cartSubtotal)}</span>
                            </div>
                            <div className="flex items-start justify-between gap-3" data-testid="pos-checkout-discount-summary">
                                <div className="min-w-0">
                                    <span className="block truncate text-[#334155]">
                                        Discount{calculatedDiscountAmount > 0 && checkoutDiscountLabel ? ` (${checkoutDiscountLabel})` : ''}
                                    </span>
                                    {calculatedDiscountAmount > 0 && <span className="mt-0.5 block text-[11px] font-medium text-slate-500">Applied to this sale</span>}
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <span className={`font-extrabold tabular-nums ${calculatedDiscountAmount > 0 ? 'text-rose-600' : 'text-[#0F172A]'}`}>
                                        {calculatedDiscountAmount > 0 ? `-PHP ${money(calculatedDiscountAmount)}` : 'PHP 0.00'}
                                    </span>
                                    {calculatedDiscountAmount > 0 ? (
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={openCheckoutDiscountEditor}
                                                disabled={checkoutLoading || splitPaymentDialogOpen || hasSplitPaymentSummary}
                                                className="flex h-7 items-center gap-1 rounded-lg px-1.5 text-[11px] font-bold text-[#1A4E8D] transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
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
                                                disabled={checkoutLoading || splitPaymentDialogOpen || hasSplitPaymentSummary}
                                                className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-100 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                                                aria-label={`Remove ${checkoutDiscountLabel}`}
                                                title={splitPaymentDialogOpen || hasSplitPaymentSummary ? 'Finish or cancel the active payment first' : 'Remove discount'}
                                                data-testid="pos-remove-checkout-discount"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                            {governedDiscountTotals.vatRemoved > 0 && (
                                <div className="flex justify-between gap-3">
                                    <span className="text-[#334155]">VAT Removed</span>
                                    <span className="font-extrabold tabular-nums text-rose-600">-PHP {money(governedDiscountTotals.vatRemoved)}</span>
                                </div>
                            )}
                            {calculatedDiscountAmount === 0 && (
                                <button
                                    type="button"
                                    onClick={openCheckoutDiscountEditor}
                                    disabled={checkoutLoading || splitPaymentDialogOpen || hasSplitPaymentSummary}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-left text-[11px] font-bold text-[#1A4E8D] transition-colors hover:border-[#1A4E8D] hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-50"
                                    data-testid="pos-checkout-add-discount"
                                >
                                    <Tag className="h-3.5 w-3.5" />
                                    Add Discount
                                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                            )}
                            <div className="border-t border-dashed border-slate-200 pt-2">
                                <div className="flex justify-between gap-3">
                                    <span className="font-extrabold text-[#334155]">Total Due</span>
                                    <span className="font-black tabular-nums text-[#1A4E8D]">PHP {money(cartTotal)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {!isEmployeeCreditPayment && !splitPaymentReady && (
                        <div className="space-y-2" data-testid="pos-checkout-payment-summary">
                            <label htmlFor="pos-customer-payment-amount" className="block text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                                {customerPaymentFieldLabel}
                            </label>
                            {isCashPayment && (
                                <div className="grid grid-cols-3 gap-2" data-testid="pos-cash-payment-suggestions">
                                    <button
                                        type="button"
                                        onClick={() => selectPaymentAmount(money(cartTotal), true)}
                                        disabled={checkoutLoading}
                                        className="col-span-3 h-8 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-extrabold text-emerald-700 transition-colors hover:border-emerald-500 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                                        data-testid="pos-cash-payment-exact"
                                    >
                                        Exact Amount · PHP {money(cartTotal)}
                                    </button>
                                    {CASH_PAYMENT_SUGGESTIONS.map((amount) => (
                                        <button
                                            key={amount}
                                            type="button"
                                            onClick={() => selectPaymentAmount(String(amount))}
                                            disabled={checkoutLoading}
                                            className="h-8 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] font-extrabold text-[#1A4E8D] transition-colors hover:border-[#1A4E8D] hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                            data-testid={`pos-cash-payment-suggestion-${amount}`}
                                        >
                                            PHP {amount.toLocaleString('en-US')}
                                        </button>
                                    ))}
                                </div>
                            )}
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
                                className="mt-2 h-11 rounded-lg border border-slate-200 bg-white px-3 text-[15px] font-extrabold text-[#0F172A] focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-blue-100"
                            />
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px]">
                                <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-[#64748B]">Payment Summary</p>
                                <div className="flex justify-between gap-2">
                                    <span className="text-[#334155]">Payment Method</span>
                                    <span className="font-bold text-[#1A4E8D]">{formatSplitPaymentMethod(paymentType)}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="text-[#334155]">{isCashPayment ? 'Change' : 'Excess Payment'}</span>
                                    <span className="font-bold text-emerald-700">PHP {money(customerPaymentChange)}</span>
                                </div>
                                <div className="mt-2 flex justify-between gap-2">
                                    <span className="text-[#334155]">Remaining Balance</span>
                                    <span className={`font-bold ${customerPaymentShortfall > 0 ? 'text-rose-700' : 'text-[#0F172A]'}`}>
                                        PHP {money(customerPaymentShortfall)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="shrink-0 grid grid-cols-3 gap-2 border-t border-slate-200 px-4 py-3 bg-white">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleBillRequest}
                        disabled={posActionsBlocked || checkoutLoading || billRequestPrinting || splitPaymentCancelLoading || parkedSaleReleaseLoading || safeCart.length === 0 || !isPrinterAvailable}
                        className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-extrabold text-[#0F172A] hover:bg-slate-50"
                        title={isPrinterAvailable ? undefined : 'No printer detected on this device.'}
                        data-testid="pos-bill-request-button"
                    >
                        {billRequestPrinting ? 'Printing…' : 'Bill Request'}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handlePrintOrder}
                        disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || !isPrinterAvailable}
                        title={isPrinterAvailable ? undefined : 'No printer detected on this device.'}
                        className="h-10 rounded-lg border border-[#1A4E8D] bg-white px-2 text-[12px] font-extrabold text-[#1A4E8D] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Printer className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Print Order
                    </Button>
                    <Button
                        type="button"
                        onClick={splitPaymentReady ? () => handleCompletePreparedSplitPayment() : confirmCheckout}
                        disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || !isCheckoutWorkflowValid || (!splitPaymentReady && !paymentIsSufficient)}
                        className="h-10 rounded-lg bg-[#1A4E8D] px-3 text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 transition hover:bg-[#143F73] disabled:cursor-not-allowed disabled:bg-[#1A4E8D] disabled:opacity-60"
                    >
                        {checkoutLoading ? 'Processing...' : (splitPaymentReady ? 'Confirm Sale' : 'Confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default React.memo(POSCheckoutConfirmDialog);

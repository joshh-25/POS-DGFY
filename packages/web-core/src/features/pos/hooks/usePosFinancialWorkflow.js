import { useMemo, useState } from 'react';
import { calculatePosItemDiscounts } from '../utils/posItemDiscount.js';
import {
    calculateGovernedDiscount,
    isPaymentAmountSufficient,
    round4,
    VAT_RATE
} from '../utils/posCheckoutTerminalUtils.js';

/**
 * Owns the POS financial calculation graph. It deliberately does not build
 * checkout payloads or call services; the terminal remains the compatibility
 * boundary for those contracts.
 */
export const usePosFinancialWorkflow = ({
    cart = [],
    discountProfiles = [],
    selectedDiscountProfile = '',
    manualDiscountMode = 'none',
    manualDiscountRateInput = '',
    manualDiscountAmountInput = '',
    appliedDiscount = null,
    safeAppliedDiscount = null,
    discountDraft = {},
    eligibleDiscountItemIds = [],
    normalizedFnbContext = null,
    paymentType = 'cash',
    customerPaymentAmountInput = '',
    checkoutConfirmModalOpen = false,
    employeeCreditAccount = null,
    selectedEmployeeCreditOption = null,
    splitPaymentSession = null
} = {}) => {
    const [customerPaymentAmountInputValue, setCustomerPaymentAmountInput] = useState(customerPaymentAmountInput);
    const [customerPaymentAmountAutoFilled, setCustomerPaymentAmountAutoFilled] = useState(false);
    // Keep normalized collection references stable so the calculation graph
    // can skip work when unrelated terminal state (for example search input)
    // changes. The input arrays are replaced only when their source changes.
    /* eslint-disable react-hooks/preserve-manual-memoization -- These inputs are immutable React state snapshots; memoization avoids recalculating the cart financial graph on unrelated terminal renders. */
    const safeCart = useMemo(() => (Array.isArray(cart) ? cart : []), [cart]);
    const safeDiscountProfiles = useMemo(() => (Array.isArray(discountProfiles) ? discountProfiles : []), [discountProfiles]);
    const safeEligibleDiscountItemIds = useMemo(() => (Array.isArray(eligibleDiscountItemIds) ? eligibleDiscountItemIds : []), [eligibleDiscountItemIds]);
    const memoSafeAppliedDiscount = useMemo(() => (
        safeAppliedDiscount && typeof safeAppliedDiscount === 'object'
            ? {
                ...safeAppliedDiscount,
                eligible_item_ids: Array.isArray(safeAppliedDiscount.eligible_item_ids) ? safeAppliedDiscount.eligible_item_ids : [],
                eligible_items: Array.isArray(safeAppliedDiscount.eligible_items) ? safeAppliedDiscount.eligible_items : [],
                beneficiaries: Array.isArray(safeAppliedDiscount.beneficiaries) ? safeAppliedDiscount.beneficiaries : []
            }
            : null
    ), [safeAppliedDiscount]);

    const cartSubtotal = useMemo(
        () => safeCart.reduce((sum, line) => sum + (Number(line.quantity) * Number(line.sale_price)), 0),
        [safeCart]
    );

    const itemDiscountTotals = useMemo(
        () => calculatePosItemDiscounts(safeCart),
        [safeCart]
    );

    const globalDiscountCart = useMemo(
        () => safeCart.map((line, index) => ({
            ...line,
            global_discount_base_amount: itemDiscountTotals.lines[index]?.global_discount_base_amount
        })),
        [itemDiscountTotals.lines, safeCart]
    );

    const governedDiscountTotals = useMemo(
        () => calculateGovernedDiscount(globalDiscountCart, memoSafeAppliedDiscount),
        [globalDiscountCart, memoSafeAppliedDiscount]
    );

    const selectedDiscount = safeDiscountProfiles.find((profile) => profile.name === selectedDiscountProfile) || null;

    const manualDiscountRate = (() => {
        const parsed = Number(manualDiscountRateInput);
        if (!Number.isFinite(parsed) || parsed <= 0) return 0;
        return round4(Math.min(parsed, 100));
    })();

    const manualDiscountAmount = (() => {
        if (manualDiscountMode === 'amount') {
            const parsed = Number(manualDiscountAmountInput);
            if (!Number.isFinite(parsed) || parsed <= 0) return 0;
            return round4(Math.min(parsed, itemDiscountTotals.totalAmount));
        }
        if (manualDiscountMode !== 'percentage') return 0;
        return round4(Math.min(
            (itemDiscountTotals.totalAmount * manualDiscountRate) / 100,
            itemDiscountTotals.totalAmount
        ));
    })();

    const globalDiscountAmount = appliedDiscount
        ? governedDiscountTotals.discountAmount
        : (selectedDiscount
            ? round4(Math.min(
                (itemDiscountTotals.totalAmount * selectedDiscount.percentage) / 100,
                itemDiscountTotals.totalAmount
            ))
            : manualDiscountAmount);
    const calculatedDiscountAmount = appliedDiscount
        ? round4(itemDiscountTotals.discountAmount + governedDiscountTotals.discountAmount)
        : round4(itemDiscountTotals.discountAmount + globalDiscountAmount);
    const checkoutDiscountLabel = safeAppliedDiscount?.label
        || selectedDiscount?.name
        || (calculatedDiscountAmount > 0 ? 'Discount' : '');
    const memoDiscountDraft = useMemo(() => (
        discountDraft && typeof discountDraft === 'object'
            ? {
                ...discountDraft,
                eligible_item_ids: Array.isArray(discountDraft.eligible_item_ids) ? discountDraft.eligible_item_ids : [],
                eligible_items: Array.isArray(discountDraft.eligible_items) ? discountDraft.eligible_items : [],
                beneficiaries: Array.isArray(discountDraft.beneficiaries) ? discountDraft.beneficiaries : []
            }
            : {}
    ), [discountDraft]);
    const discountPreviewTotals = useMemo(
        () => calculateGovernedDiscount(globalDiscountCart, {
            ...memoDiscountDraft,
            eligible_item_ids: safeEligibleDiscountItemIds
        }),
        [memoDiscountDraft, globalDiscountCart, safeEligibleDiscountItemIds]
    );

    // POS currently has no separate service-fee input. Keep this as an
    // explicit field so the total formula and the checkout snapshot remain
    // stable when service fees are introduced later.
    const serviceFeeAmount = 0;
    const netItemsTotal = round4(Math.max(0, itemDiscountTotals.totalAmount - globalDiscountAmount - governedDiscountTotals.vatRemoved));

    const restaurantServiceChargeAmount = (() => {
        const charge = normalizedFnbContext?.restaurant_service_charge;
        if (!charge || charge.enabled !== true) return 0;
        const explicitAmount = Number(charge.amount);
        if (Number.isFinite(explicitAmount) && explicitAmount >= 0) return round4(explicitAmount);
        const rate = Math.min(100, Math.max(0, Number(charge.rate || 0)));
        return round4(netItemsTotal * (rate / 100));
    })();

    const vatBreakdown = useMemo(() => {
        const adjustedLines = safeCart.map((line, index) => {
            const itemLine = itemDiscountTotals.lines[index] || {};
            const base = Number(itemLine.global_discount_base_amount || 0);
            const governedLine = governedDiscountTotals.lines?.[index] || {};
            const globalVatRemoved = memoSafeAppliedDiscount
                ? Number(governedLine.vat_removed || 0)
                : 0;
            const governedLineDiscount = memoSafeAppliedDiscount
                ? Number(governedLine.discount_amount || 0)
                : (itemDiscountTotals.totalAmount > 0
                    ? round4((base / itemDiscountTotals.totalAmount) * globalDiscountAmount)
                    : 0);
            return {
                vat_type: line.vat_type || 'vatable',
                governed_vat_exempt: memoSafeAppliedDiscount && Number(governedLine.vat_exempt_amount || 0) > 0,
                gross: round4(Math.max(0, base - globalVatRemoved - governedLineDiscount))
            };
        });

        const adjustedTotal = round4(adjustedLines.reduce((sum, line) => sum + line.gross, 0));
        const lineDiff = round4(netItemsTotal - adjustedTotal);
        if (adjustedLines.length > 0 && Math.abs(lineDiff) > 0) {
            const lastIndex = adjustedLines.length - 1;
            adjustedLines[lastIndex].gross = round4(adjustedLines[lastIndex].gross + lineDiff);
        }

        let vatableGross = 0;
        let vatExemptSales = 0;
        let zeroRatedSales = 0;
        adjustedLines.forEach((line) => {
            if (line.governed_vat_exempt) {
                vatExemptSales = round4(vatExemptSales + line.gross);
            } else if (line.vat_type === 'vatable') {
                vatableGross = round4(vatableGross + line.gross);
            } else if (line.vat_type === 'vat_exempt') {
                vatExemptSales = round4(vatExemptSales + line.gross);
            } else if (line.vat_type === 'zero_rated') {
                zeroRatedSales = round4(zeroRatedSales + line.gross);
            }
        });
        if (
            restaurantServiceChargeAmount > 0
            && normalizedFnbContext?.restaurant_service_charge?.taxable === true
        ) {
            vatableGross = round4(vatableGross + restaurantServiceChargeAmount);
        }

        const vatableSales = round4(vatableGross / (1 + VAT_RATE));
        const vatAmount = round4(vatableGross - vatableSales);
        return { vatableSales, vatAmount, vatExemptSales, zeroRatedSales };
    }, [globalDiscountAmount, governedDiscountTotals, itemDiscountTotals, netItemsTotal, normalizedFnbContext, restaurantServiceChargeAmount, memoSafeAppliedDiscount, safeCart]);
    /* eslint-enable react-hooks/preserve-manual-memoization */

    const cartTotal = round4(netItemsTotal + serviceFeeAmount + restaurantServiceChargeAmount);
    const effectiveCustomerPaymentAmountInput = checkoutConfirmModalOpen && customerPaymentAmountAutoFilled
        ? round4(cartTotal).toFixed(2)
        : customerPaymentAmountInputValue;
    const cartTotalQuantity = safeCart.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const isCashPayment = paymentType === 'cash';
    const isEmployeeCreditPayment = paymentType === 'employee_credit';
    const customerPaymentAmount = (() => {
        const parsed = Number(effectiveCustomerPaymentAmountInput);
        if (!Number.isFinite(parsed) || parsed < 0) return 0;
        return round4(parsed);
    })();
    const customerPaymentFieldLabel = 'Total Payment';
    const customerPaymentShortfall = round4(Math.max(0, cartTotal - customerPaymentAmount));
    const customerPaymentChange = round4(Math.max(0, customerPaymentAmount - cartTotal));
    const employeeCreditReady = Boolean(
        employeeCreditAccount
        && selectedEmployeeCreditOption?.account_configured
        && selectedEmployeeCreditOption?.is_eligible
    );
    const isCustomerPaymentSufficient = isEmployeeCreditPayment
        ? employeeCreditReady
        : isPaymentAmountSufficient(customerPaymentAmount, cartTotal);

    const splitPaymentReady = splitPaymentSession?.status === 'ready_to_complete'
        && round4(splitPaymentSession?.remaining_amount) === 0;
    const splitPaymentAllocations = Array.isArray(splitPaymentSession?.allocations)
        ? splitPaymentSession.allocations
        : [];
    const splitPaymentSummaryAllocations = splitPaymentAllocations.filter((allocation) => (
        !['failed', 'cancelled', 'reversed'].includes(String(allocation?.status || '').toLowerCase())
    ));
    const hasSplitPaymentSummary = splitPaymentSummaryAllocations.length > 0;
    const splitPaymentSummaryPaidAmount = round4(splitPaymentSession?.paid_amount);
    const splitPaymentSummaryRemainingAmount = round4(splitPaymentSession?.remaining_amount);
    const splitPaymentSummaryChangeAmount = round4(splitPaymentSummaryAllocations.reduce(
        (sum, allocation) => sum + Number(allocation?.change_amount || 0),
        0
    ));
    const splitPaymentSuccessfulAllocations = splitPaymentAllocations.filter((allocation) => (
        String(allocation?.status || '').toLowerCase() === 'successful'
    ));

    return {
        cartSubtotal,
        itemDiscountTotals,
        globalDiscountCart,
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
        customerPaymentAmountState: {
            customerPaymentAmountInput: effectiveCustomerPaymentAmountInput,
            setCustomerPaymentAmountInput,
            customerPaymentAmountAutoFilled,
            setCustomerPaymentAmountAutoFilled
        },
        customerPaymentFieldLabel,
        customerPaymentShortfall,
        customerPaymentChange,
        employeeCreditReady,
        isCustomerPaymentSufficient,
        splitPaymentReady,
        splitPaymentAllocations,
        splitPaymentSummaryAllocations,
        hasSplitPaymentSummary,
        splitPaymentSummaryPaidAmount,
        splitPaymentSummaryRemainingAmount,
        splitPaymentSummaryChangeAmount,
        splitPaymentSuccessfulAllocations
    };
};

export default usePosFinancialWorkflow;

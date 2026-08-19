const UNPAID_PAYMENT_STATUSES = new Set(['unpaid', 'payment_pending', 'failed']);
const EXISTING_REFUND_PAYMENT_STATUSES = new Set(['refund_pending', 'partial_refunded']);

const normalize = (value) => String(value || '').trim().toLowerCase();

const normalizePaymentTypes = (paymentBreakdown = []) => [...new Set(
    (Array.isArray(paymentBreakdown) ? paymentBreakdown : [])
        .map((entry) => normalize(entry?.payment_type))
        .filter(Boolean)
)];

const buildOutcome = ({
    refundRequired,
    refundState,
    refundMethod = null,
    tenderOwnership,
    nextAction = 'none',
    reasonCode,
    amount
}) => ({
    internal_void: 'succeeded',
    refund_required: refundRequired,
    refund_state: refundState,
    refund_method: refundMethod,
    tender_ownership: tenderOwnership,
    next_action: nextAction,
    reason_code: reasonCode,
    refund_amount: amount,
    currency: 'PHP'
});

export const resolvePosVoidFinancialOutcome = (transaction = {}) => {
    const paymentStatus = normalize(transaction.payment_status);
    const paymentType = normalize(transaction.payment_type);
    const paymentProvider = normalize(transaction.payment_provider);
    const amount = Math.round((Number(transaction.total_amount) || 0) * 10000) / 10000;
    const paymentTypes = normalizePaymentTypes(transaction.payment_breakdown);
    const isSplitTender = paymentTypes.length > 1;

    if (UNPAID_PAYMENT_STATUSES.has(paymentStatus)) {
        return buildOutcome({
            refundRequired: false,
            refundState: 'not_required',
            tenderOwnership: 'not_applicable',
            reasonCode: 'UNPAID_INTERNAL_VOID',
            amount: 0
        });
    }

    if (paymentStatus === 'refunded') {
        return buildOutcome({
            refundRequired: false,
            refundState: 'already_refunded',
            tenderOwnership: 'previously_refunded',
            reasonCode: 'REFUND_ALREADY_COMPLETED',
            amount: 0
        });
    }

    if (paymentStatus === 'employee_credit' || paymentType === 'employee_credit') {
        return buildOutcome({
            refundRequired: false,
            refundState: 'not_required',
            refundMethod: 'employee_credit_reversal',
            tenderOwnership: 'employee_credit',
            reasonCode: 'EMPLOYEE_CREDIT_REVERSAL',
            amount: 0
        });
    }

    if (EXISTING_REFUND_PAYMENT_STATUSES.has(paymentStatus)) {
        return buildOutcome({
            refundRequired: true,
            refundState: 'existing_refund_incomplete',
            tenderOwnership: 'unconfirmed',
            nextAction: 'manual_review',
            reasonCode: 'EXISTING_REFUND_NOT_TERMINAL',
            amount
        });
    }

    if (isSplitTender) {
        return buildOutcome({
            refundRequired: true,
            refundState: 'manual_review_required',
            refundMethod: 'split_tender',
            tenderOwnership: 'mixed',
            nextAction: 'reverse_each_successful_allocation',
            reasonCode: 'SPLIT_TENDER_REFUND_REQUIRED',
            amount
        });
    }

    if (paymentType === 'cash') {
        return buildOutcome({
            refundRequired: true,
            refundState: 'manual_review_required',
            refundMethod: 'cash',
            tenderOwnership: 'merchant_owned',
            nextAction: 'record_cash_refund_with_cash_drawer_event',
            reasonCode: 'CASH_REFUND_REQUIRED',
            amount
        });
    }

    if (paymentProvider === 'merchant_owned') {
        return buildOutcome({
            refundRequired: true,
            refundState: 'manual_review_required',
            refundMethod: 'external_reversal',
            tenderOwnership: 'merchant_owned',
            nextAction: 'record_external_reversal_reference',
            reasonCode: 'MERCHANT_OWNED_EXTERNAL_REVERSAL_REQUIRED',
            amount
        });
    }

    return buildOutcome({
        refundRequired: true,
        refundState: 'manual_review_required',
        refundMethod: paymentProvider ? 'provider_refund' : null,
        tenderOwnership: 'unconfirmed',
        nextAction: 'confirm_provider_ownership_and_refund',
        reasonCode: paymentProvider
            ? 'PROVIDER_REFUND_REQUIRES_VERIFIED_OWNERSHIP'
            : 'TENDER_OWNERSHIP_UNCONFIRMED',
        amount
    });
};

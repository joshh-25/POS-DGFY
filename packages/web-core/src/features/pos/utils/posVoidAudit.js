export const isVoidedPosTransaction = (transaction) => (
    String(transaction?.status || '').trim().toLowerCase() === 'voided'
);

export const resolvePosVoidActorLabel = (transaction) => {
    const actorName = transaction?.voidedByUser?.username
        || transaction?.voided_by_user?.username;
    if (actorName) return String(actorName);

    const actorId = Number(transaction?.voided_by);
    return Number.isInteger(actorId) && actorId > 0 ? `User #${actorId}` : 'Unknown user';
};

export const resolvePosVoidReason = (transaction) => {
    const reason = String(transaction?.void_reason || '').trim();
    return reason || 'No reason recorded';
};

export const formatPosVoidTimestamp = (value) => {
    if (!value) return 'Unknown time';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown time';
    return date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

const isFinancialOutcome = (value) => (
    value && typeof value === 'object' && !Array.isArray(value)
);

export const resolvePosVoidFinancialOutcome = (transaction) => {
    if (isFinancialOutcome(transaction?.financial_outcome)) return transaction.financial_outcome;

    const adjustments = Array.isArray(transaction?.adjustments) ? transaction.adjustments : [];
    for (let index = adjustments.length - 1; index >= 0; index -= 1) {
        const adjustment = adjustments[index];
        const outcome = adjustment?.financial_outcome || adjustment?.metadata?.financial_outcome;
        if (isFinancialOutcome(outcome)) return outcome;
    }

    return null;
};

export const resolvePosVoidFinancialOutcomeLabel = (transaction) => {
    const outcome = resolvePosVoidFinancialOutcome(transaction);
    if (!outcome) return null;

    if (outcome.refund_state === 'already_refunded') {
        return 'Existing customer refund already recorded. No second refund is required.';
    }
    if (outcome.refund_state === 'existing_refund_incomplete') {
        return 'Existing refund is incomplete. Manual review is required.';
    }
    if (outcome.refund_required !== true) {
        if (outcome.refund_method === 'employee_credit_reversal') {
            return 'Employee Credit reversal path recorded. No cash or provider refund is required.';
        }
        return 'No customer refund is required. This is an internal POS void only.';
    }

    switch (String(outcome.next_action || '').trim().toLowerCase()) {
        case 'record_cash_refund_with_cash_drawer_event':
            return 'Cash refund and a linked cash-drawer event are still required.';
        case 'record_external_reversal_reference':
            return 'External reversal evidence is still required.';
        case 'reverse_each_successful_allocation':
            return 'Each successful payment allocation requires separate reversal evidence.';
        case 'confirm_provider_ownership_and_refund':
            return 'Manual review is required to confirm provider ownership and refund evidence.';
        case 'manual_review':
            return 'Manual review is required before any refund or reversal.';
        default:
            return 'Financial follow-up is required before this void can be treated as refunded.';
    }
};

export const resolvePosVoidFinancialOutcomeAmount = (transaction) => {
    const outcome = resolvePosVoidFinancialOutcome(transaction);
    if (!outcome || outcome.refund_required !== true) return null;

    const amount = Number(outcome.refund_amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    return `₱${amount.toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
};

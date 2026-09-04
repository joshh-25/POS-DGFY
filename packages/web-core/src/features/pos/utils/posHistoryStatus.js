const PAYMENT_STATUS_LABELS = Object.freeze({
    paid: 'Paid',
    unpaid: 'Unpaid',
    payment_pending: 'Payment Pending',
    failed: 'Payment Failed',
    refund_pending: 'Refund Pending',
    partial_refunded: 'Partially Refunded',
    refunded: 'Refunded'
});

const titleCaseStatus = (value) => value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

export const normalizePosHistoryStatus = (value) => String(value || '').trim().toLowerCase();

export const getPaymentStatusLabel = (value) => {
    const normalized = normalizePosHistoryStatus(value);
    return PAYMENT_STATUS_LABELS[normalized] || (normalized ? titleCaseStatus(normalized) : 'Unknown');
};

export const getPaymentStatusClassName = (value) => {
    const normalized = normalizePosHistoryStatus(value);
    if (normalized === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (['failed', 'refund_pending', 'refunded'].includes(normalized)) return 'border-rose-200 bg-rose-50 text-rose-700';
    if (['unpaid', 'payment_pending', 'partial_refunded'].includes(normalized)) return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-slate-200 bg-slate-50 text-slate-600';
};

export const getReceiptPrintStatusLabel = (value) => {
    const normalized = normalizePosHistoryStatus(value);
    if (normalized === 'printed') return 'Printed';
    if (normalized === 'failed') return 'Failed';
    return 'Not Printed';
};

export const getReceiptPrintStatusClassName = (value) => {
    const normalized = normalizePosHistoryStatus(value);
    if (normalized === 'printed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (normalized === 'failed') return 'border-rose-200 bg-rose-50 text-rose-700';
    return 'border-amber-200 bg-amber-50 text-amber-700';
};

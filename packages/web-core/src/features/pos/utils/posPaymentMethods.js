const PAYMENT_METHOD_LABELS = Object.freeze({
    cash: 'Cash',
    gcash: 'GCash',
    maya: 'Maya',
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    employee_credit: 'Employee Credit'
});

const parseBreakdown = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
        const first = JSON.parse(value);
        const parsed = typeof first === 'string' ? JSON.parse(first) : first;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const resolvePosTransactionPaymentMethods = (transaction = {}) => {
    const breakdownMethods = parseBreakdown(transaction?.payment_breakdown)
        .filter((entry) => Number(entry?.amount || 0) > 0)
        .map((entry) => String(entry?.payment_type || '').trim().toLowerCase())
        .filter(Boolean);
    const source = breakdownMethods.length > 0
        ? breakdownMethods
        : [String(transaction?.payment_type || '').trim().toLowerCase()].filter(Boolean);
    return [...new Set(source)];
};

export const matchesPosTransactionPaymentMethod = (transaction, paymentType) => {
    const normalized = String(paymentType || '').trim().toLowerCase();
    return !normalized || normalized === 'all'
        || resolvePosTransactionPaymentMethods(transaction).includes(normalized);
};

export const formatPosTransactionPaymentMethods = (transaction = {}) => {
    const methods = Array.isArray(transaction?.payment_methods) && transaction.payment_methods.length > 0
        ? [...new Set(transaction.payment_methods.map((method) => String(method || '').trim().toLowerCase()).filter(Boolean))]
        : resolvePosTransactionPaymentMethods(transaction);
    return methods.map((method) => PAYMENT_METHOD_LABELS[method]
        || method.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()))
        .join(' + ') || '-';
};

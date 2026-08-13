const PAYMENT_METHOD_DEFINITIONS = Object.freeze([
    Object.freeze({ payment_type: 'cash', payment_label: 'Cash' }),
    Object.freeze({ payment_type: 'gcash', payment_label: 'GCash' }),
    Object.freeze({ payment_type: 'maya', payment_label: 'Maya' }),
    Object.freeze({ payment_type: 'card', payment_label: 'Card (Credit/Debit)' }),
    Object.freeze({ payment_type: 'bank_transfer', payment_label: 'Bank Transfer' }),
    Object.freeze({ payment_type: 'employee_credit', payment_label: 'Employee Credit' }),
    Object.freeze({ payment_type: 'other', payment_label: 'Other' })
]);

const PAYMENT_METHOD_ALIASES = Object.freeze({
    cash: 'cash',
    gcash: 'gcash',
    maya: 'maya',
    card: 'card',
    credit: 'card',
    credit_card: 'card',
    debit_card: 'card',
    bank_transfer: 'bank_transfer',
    employee_credit: 'employee_credit',
    other: 'other'
});

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

export const resolvePosPaymentCategory = (paymentType) => (
    PAYMENT_METHOD_ALIASES[String(paymentType || '').trim().toLowerCase()] || 'other'
);

export const normalizePosPaymentBreakdown = (entries = []) => {
    const totalsByType = new Map(PAYMENT_METHOD_DEFINITIONS.map((definition) => [
        definition.payment_type,
        { ...definition, count: 0, amount: 0 }
    ]));

    (Array.isArray(entries) ? entries : []).forEach((entry) => {
        const paymentType = resolvePosPaymentCategory(entry?.payment_type);
        const current = totalsByType.get(paymentType);
        current.count += Math.max(0, Number.parseInt(entry?.count || 0, 10) || 0);
        current.amount = round4(current.amount + round4(entry?.amount));
    });

    return PAYMENT_METHOD_DEFINITIONS.map(({ payment_type: paymentType }) => ({
        ...totalsByType.get(paymentType)
    }));
};

export const POS_PAYMENT_METHOD_DEFINITIONS = PAYMENT_METHOD_DEFINITIONS;

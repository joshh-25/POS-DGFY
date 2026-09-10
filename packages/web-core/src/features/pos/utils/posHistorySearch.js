const SEARCHABLE_HISTORY_FIELDS = [
    'invoice_number',
    'offline_intent_id',
    'payment_type',
    'payment_status',
    'payment_reference',
    'payment_provider',
    'order_source',
    'order_method',
    'fulfillment_status',
    'cashier.username',
    'cashier.email',
    'acceptedByUser.username',
    'acceptedByUser.email',
    'customer_name',
    'customer_phone',
    'customer_email',
    'employee_credit_employee_name_snapshot',
    'employee_credit_account_code_snapshot',
    'employee_credit_authorization_reference',
    'discount_label_snapshot',
    'discount.discount_type',
    'discount.employee_name',
    'discount.employee_id',
    'discount.customer_name',
    'discount.promo_code',
    'discount.approvedBy.username',
    'service_fee_label_snapshot',
    'service_fee_method_snapshot',
    'restaurant_service_charge_label_snapshot',
    'fnb_table_label_snapshot',
    'status',
    'subtotal_amount',
    'discount_amount',
    'discount_rate_snapshot',
    'service_fee_amount',
    'restaurant_service_charge_amount',
    'vatable_sales',
    'vat_amount',
    'total_amount',
    'employee_credit_amount',
    'employee_credit_balance_after',
    'employee_credit_outstanding_after'
];

const getNestedValue = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);

export const normalizePosHistorySearchText = (value) => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const getHistoryDateValues = (value) => {
    if (!value) return [];
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return [];
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return [
        `${month}/${day}/${year}`,
        `${Number(month)}/${Number(day)}/${year}`,
        `${year}-${month}-${day}`
    ];
};

const getHistoryAmountValues = (value) => {
    if (value === null || value === undefined || value === '') return [];
    const amount = Number(value);
    return Number.isFinite(amount) ? [`₱${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`] : [];
};

export const getPosHistorySearchValues = (row = {}) => {
    const values = SEARCHABLE_HISTORY_FIELDS.flatMap((field) => [
        getNestedValue(row, field),
        ...getHistoryAmountValues(getNestedValue(row, field))
    ]);
    values.push(...getHistoryDateValues(row.created_at));

    return values.flatMap((value) => {
        const raw = String(value ?? '').trim().toLowerCase();
        const normalized = normalizePosHistorySearchText(value);
        return raw && raw !== normalized ? [raw, normalized] : (raw ? [raw] : []);
    });
};

export const matchesPosHistorySearch = (row, query) => {
    const search = normalizePosHistorySearchText(query);
    if (!search) return true;
    return getPosHistorySearchValues(row).some((value) => value.includes(search));
};

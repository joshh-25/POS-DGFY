import { Op } from 'sequelize';

const TEXT_SEARCH_FIELDS = [
    'invoice_number',
    'idempotency_key',
    'terminal_id',
    'order_source',
    'order_method',
    'fulfillment_status',
    'customer_name',
    'customer_phone',
    'customer_email',
    'payment_type',
    'payment_status',
    'payment_reference',
    'payment_provider',
    'payment_session_reference',
    'employee_credit_employee_name_snapshot',
    'employee_credit_account_code_snapshot',
    'employee_credit_authorization_reference',
    'discount_label_snapshot',
    'service_fee_label_snapshot',
    'service_fee_method_snapshot',
    'restaurant_service_charge_label_snapshot',
    'fnb_table_label_snapshot',
    'status'
];

const NORMALIZED_TEXT_FIELDS = [
    'order_source',
    'order_method',
    'payment_type',
    'payment_status',
    'fulfillment_status',
    'service_fee_method_snapshot'
];

const NUMERIC_SEARCH_FIELDS = [
    'pos_transaction_id',
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

const normalizeHistorySearchText = (value) => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const getDateSearchVariants = (value) => {
    const normalized = String(value || '').trim();
    const monthDayYear = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (monthDayYear) {
        const month = String(Number(monthDayYear[1])).padStart(2, '0');
        const day = String(Number(monthDayYear[2])).padStart(2, '0');
        const year = monthDayYear[3];
        return [
            `${month}/${day}/${year}`,
            `${Number(month)}/${Number(day)}/${year}`,
            `${year}-${month}-${day}`
        ];
    }

    const yearMonthDay = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (yearMonthDay) {
        const month = String(Number(yearMonthDay[2])).padStart(2, '0');
        const day = String(Number(yearMonthDay[3])).padStart(2, '0');
        return [
            `${yearMonthDay[1]}-${month}-${day}`,
            `${month}/${day}/${yearMonthDay[1]}`,
            `${Number(month)}/${Number(day)}/${yearMonthDay[1]}`
        ];
    }

    return [];
};

export const buildPosTransactionHistorySearchConditions = ({ sequelize, search } = {}) => {
    const rawSearch = String(search || '').trim();
    const normalizedSearch = normalizeHistorySearchText(rawSearch);
    if (!rawSearch || !normalizedSearch) return [];

    const rawLike = `%${rawSearch}%`;
    const normalizedLike = `%${normalizedSearch}%`;
    const numericSearch = normalizedSearch.replace(/^(?:php|₱)\s+/i, '').trim();
    const numericLike = `%${numericSearch || normalizedSearch}%`;
    const conditions = TEXT_SEARCH_FIELDS.map((field) => ({ [field]: { [Op.like]: rawLike } }));

      if (sequelize?.cast && sequelize?.col && sequelize?.fn && sequelize?.where) {
        NORMALIZED_TEXT_FIELDS.forEach((field) => {
            const column = sequelize.col(`PosTransaction.${field}`);
            const normalizedColumn = sequelize.fn(
                'REPLACE',
                sequelize.fn('REPLACE', sequelize.fn('LOWER', column), '_', ' '),
                '-',
                ' '
            );
            conditions.push(sequelize.where(normalizedColumn, { [Op.like]: normalizedLike }));
        });

        NUMERIC_SEARCH_FIELDS.forEach((field) => {
            conditions.push(
                sequelize.where(
                    sequelize.cast(sequelize.col(`PosTransaction.${field}`), 'CHAR'),
                    { [Op.like]: numericLike }
                )
            );
        });

        getDateSearchVariants(rawSearch).forEach((dateVariant) => {
            conditions.push(
                sequelize.where(
                    sequelize.fn('DATE_FORMAT', sequelize.col('PosTransaction.created_at'), '%Y-%m-%d'),
                    { [Op.like]: `%${dateVariant}%` }
                ),
                sequelize.where(
                    sequelize.fn('DATE_FORMAT', sequelize.col('PosTransaction.created_at'), '%m/%d/%Y'),
                    { [Op.like]: `%${dateVariant}%` }
                )
            );
        });
    }

    return conditions;
};

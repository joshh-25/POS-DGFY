const number = (value) => Number(value || 0);

const POS_REPORT = (label, defaultSort) => Object.freeze({
    label,
    default_sort: defaultSort,
    source: 'pos',
    filters: ['date_from', 'date_to', 'branch_id'],
    formula: 'Persisted finalized POS transaction snapshots, grouped without recalculating money values.',
    permission: 'business_admin:access',
    pagination: { max_limit: 5000 },
    export_formats: ['csv', 'xls']
});

const INVENTORY_REPORT = (label, defaultSort) => Object.freeze({
    label,
    default_sort: defaultSort,
    source: 'inventory_valuation',
    filters: ['branch_id'],
    formula: 'FIFO batch value reconciled against the authoritative branch stock ledger.',
    permission: 'business_admin:access',
    pagination: { max_limit: 5000 },
    export_formats: ['csv', 'xls']
});

const INVENTORY_LEDGER_REPORT = (label, defaultSort) => Object.freeze({
    label,
    default_sort: defaultSort,
    source: 'inventory_ledger',
    filters: ['date_from', 'date_to', 'branch_id'],
    formula: 'Immutable inventory movements recorded by the inventory command owner.',
    permission: 'business_admin:access',
    pagination: { max_limit: 5000 },
    export_formats: ['csv', 'xls']
});

const LOW_STOCK_REPORT = (label, defaultSort) => Object.freeze({
    label,
    default_sort: defaultSort,
    source: 'inventory_ledger',
    filters: ['branch_id'],
    formula: 'Current branch stock at or below the item low-stock threshold.',
    permission: 'business_admin:access',
    pagination: { max_limit: 5000 },
    export_formats: ['csv', 'xls']
});

const summaryRow = (label, summary = {}) => {
    const row = {
        label,
    gross_sales: number(summary.gross_sales),
    net_sales: number(summary.net_sales),
    transaction_count: number(summary.total_transactions),
    quantity: number(summary.total_items_sold),
    discounts: number(summary.discounts),
    refunds_voids: number(summary.refunds_voids),
    vat: number(summary.vat),
        service_fees: number(summary.service_fees)
    };
    if (Object.prototype.hasOwnProperty.call(summary, 'cogs')) row.cogs = number(summary.cogs);
    if (Object.prototype.hasOwnProperty.call(summary, 'pos_profit_loss')) row.pos_profit_loss = number(summary.pos_profit_loss);
    return row;
};

const withSummary = (row, summary = {}) => ({ ...row, ...summaryRow('', summary) });

export const BUSINESS_ADMIN_REPORT_DEFINITIONS = Object.freeze({
    sales_trend: POS_REPORT('Sales trend', 'period'),
    sales_by_terminal: POS_REPORT('Sales by terminal', 'net_sales'),
    sales_by_branch: POS_REPORT('Sales by branch', 'net_sales'),
    sales_by_source: POS_REPORT('POS versus Storefront', 'net_sales'),
    sales_by_employee: POS_REPORT('Sales by employee', 'net_sales'),
    sales_by_item: POS_REPORT('Sales by item', 'net_sales'),
    sales_by_category: POS_REPORT('Sales by category', 'net_sales'),
    sales_by_payment: POS_REPORT('Sales by payment method', 'net_sales'),
    discounts: POS_REPORT('Discounts', 'discount_amount'),
    fulfillment: POS_REPORT('Sales by fulfillment method', 'net_sales'),
    shifts: POS_REPORT('Shift sales', 'net_sales'),
    tax_and_fees: POS_REPORT('Taxes and fees', 'net_sales'),
    refunds_and_voids: POS_REPORT('Refunds and voids', 'refunds_voids'),
    customer_activity: POS_REPORT('Customer activity', 'net_sales'),
    inventory_valuation: INVENTORY_REPORT('FIFO inventory valuation', 'inventory_value'),
    inventory_movements: INVENTORY_LEDGER_REPORT('Inventory movements', 'timestamp'),
    low_stock: LOW_STOCK_REPORT('Low-stock items', 'quantity_on_hand')
});

export const listBusinessAdminReportDefinitions = () => Object.entries(BUSINESS_ADMIN_REPORT_DEFINITIONS)
    .map(([key, definition]) => ({ key, ...definition }));

export const buildBusinessAdminReportRows = (report = {}, reportKey = '') => {
    const daily = report?.daily_report || {};
    switch (reportKey) {
        case 'sales_trend':
            return (daily.trend || []).map((row) => withSummary({ period: row.period, label: row.label || row.period }, row));
        case 'sales_by_terminal':
            return (daily.terminal_breakdown || []).map((row) => withSummary({ terminal_id: row.terminal_id || 'Unassigned' }, row.summary));
        case 'sales_by_branch':
            return (daily.branch_breakdown || []).map((row) => withSummary({ branch_id: row.location_id || 'Unassigned', branch: row.location_name || 'Unassigned' }, row.summary));
        case 'sales_by_source':
            return (daily.source_breakdown || []).map((row) => withSummary({ source: row.order_source, label: row.source_label || row.order_source }, row.summary));
        case 'sales_by_employee':
            return (daily.cashier_summary || []).map((row) => withSummary({ cashier_id: row.cashier_id, employee: row.cashier_name || 'Unassigned', shift_count: row.shift_ids?.length || 0 }, row.summary));
        case 'sales_by_item':
            return (daily.item_breakdown || daily.top_items || []).map((row) => ({ ...row, transaction_count: number(row.total_transactions) }));
        case 'sales_by_category':
            return (daily.category_breakdown || []).map((row) => ({ ...row, transaction_count: number(row.total_transactions) }));
        case 'sales_by_payment':
            return (daily.payment_breakdown || []).map((row) => ({ ...row, transaction_count: number(row.total_transactions) }));
        case 'discounts':
            return (daily.discount_breakdown || []).map((row) => ({ ...row }));
        case 'fulfillment':
            return (daily.order_method_breakdown || []).map((row) => ({ ...row, transaction_count: number(row.total_transactions) }));
        case 'shifts':
            return (daily.shift_summary || []).map((row) => withSummary({ shift_id: row.shift_id || 'No shift', terminal_id: row.terminal_id || 'Unassigned', business_date: row.business_date || null }, row.summary));
        case 'tax_and_fees':
            return [summaryRow('Finalized transaction tax and fee totals', daily.summary || {})];
        case 'refunds_and_voids':
            return [summaryRow('Finalized transaction refund and void totals', daily.summary || {})];
        case 'customer_activity':
            return (daily.customer_breakdown || []).map((row) => withSummary({ customer: row.customer_name }, row.summary));
        default:
            return null;
    }
};

export const buildBusinessAdminInventoryValuationRows = (valuation = {}) => (
    (valuation.locations || []).map((location) => ({
        branch_id: location.location_id,
        branch: location.location_name || `Branch #${location.location_id}`,
        available_quantity: number(location.available_qty),
        ...(Object.prototype.hasOwnProperty.call(location, 'inventory_value') ? { inventory_value: number(location.inventory_value) } : {}),
        fifo_drift_items: number(location.drift_item_count),
        stock_bearing_item_count: number(location.stock_bearing_item_count)
    }))
);

const compare = (left, right) => {
    if (typeof left === 'number' || typeof right === 'number') return number(left) - number(right);
    return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true, sensitivity: 'base' });
};

export const paginateBusinessAdminReportRows = ({ rows = [], reportKey, sortBy = '', sortDirection = 'desc', page = 1, limit = 50 }) => {
    const definition = BUSINESS_ADMIN_REPORT_DEFINITIONS[reportKey];
    if (!definition) return null;
    const allowedSorts = new Set(Object.keys(rows[0] || {}).filter((key) => !['cogs', 'pos_profit_loss'].includes(key)));
    const normalizedSort = allowedSorts.has(sortBy) ? sortBy : definition.default_sort;
    const direction = String(sortDirection).toLowerCase() === 'asc' ? 'asc' : 'desc';
    const sorted = [...rows].sort((left, right) => {
        const result = compare(left[normalizedSort], right[normalizedSort]);
        return direction === 'asc' ? result : -result;
    });
    const normalizedPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const normalizedLimit = Math.min(5000, Math.max(1, Number.parseInt(limit, 10) || 50));
    return {
        definition: { key: reportKey, label: definition.label, default_sort: definition.default_sort },
        rows: sorted.slice((normalizedPage - 1) * normalizedLimit, normalizedPage * normalizedLimit),
        pagination: {
            page: normalizedPage,
            limit: normalizedLimit,
            total: sorted.length,
            total_pages: Math.ceil(sorted.length / normalizedLimit)
        },
        sort: { by: normalizedSort, direction },
        available_sort_fields: [...allowedSorts]
    };
};

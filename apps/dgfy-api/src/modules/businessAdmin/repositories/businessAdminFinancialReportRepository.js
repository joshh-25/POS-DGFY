import { QueryTypes } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { buildStockHealthSqlCase } from '../../inventory/domain/inventoryHealth.js';
import { getReportSortFields } from '../../reports/domain/reportRegistry.js';

const MAX_LIMIT = 5000;

const positiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const direction = (value) => String(value).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

const lineDiscountSql = `COALESCE(dl.discount_amount, t.discount_amount * CASE WHEN t.subtotal_amount > 0 THEN l.line_subtotal / t.subtotal_amount ELSE 0 END)`;
const lineRefundSql = `CASE
    WHEN t.status = 'voided' THEN l.line_subtotal
    WHEN t.payment_status = 'refunded' AND COALESCE(refund_totals.succeeded_refund_amount, 0) = 0 THEN l.line_subtotal
    WHEN COALESCE(refund_totals.succeeded_refund_amount, 0) > 0 THEN LEAST(
        l.line_subtotal,
        refund_totals.succeeded_refund_amount * CASE WHEN t.total_amount > 0 THEN l.line_subtotal / t.total_amount ELSE 0 END
    )
    ELSE 0
END`;
const lineNetSalesSql = `GREATEST(0, l.line_subtotal - ${lineDiscountSql} - ${lineRefundSql})`;
const lineRefundRatioSql = `CASE WHEN l.line_subtotal > 0 THEN GREATEST(0, 1 - (${lineRefundSql} / l.line_subtotal)) ELSE 0 END`;
const successfulRefundJoin = `LEFT JOIN (
    SELECT pos_transaction_id, COALESCE(SUM(amount), 0) AS succeeded_refund_amount
    FROM pos_transaction_adjustments
    WHERE status = 'succeeded'
      AND adjustment_type IN ('cash_refund', 'external_refund', 'provider_refund')
    GROUP BY pos_transaction_id
) refund_totals ON refund_totals.pos_transaction_id = t.pos_transaction_id`;

const lineMetricSelect = `
    COUNT(DISTINCT l.pos_transaction_id) AS transaction_count,
    COALESCE(SUM(l.line_subtotal), 0) AS gross_sales,
    COALESCE(SUM(${lineNetSalesSql}), 0) AS net_sales,
    COALESCE(SUM(${lineDiscountSql}), 0) AS discounts,
    COALESCE(SUM(${lineRefundSql}), 0) AS refunds_voids,
    COALESCE(SUM(t.vat_amount * CASE WHEN t.subtotal_amount > 0 THEN l.line_subtotal / t.subtotal_amount ELSE 0 END * ${lineRefundRatioSql}), 0) AS vat,
    COALESCE(SUM((t.service_fee_amount + t.restaurant_service_charge_amount) * CASE WHEN t.subtotal_amount > 0 THEN l.line_subtotal / t.subtotal_amount ELSE 0 END * ${lineRefundRatioSql}), 0) AS service_fees,
    COALESCE(SUM(l.quantity * COALESCE(l.cost_snapshot, i.cost_per_unit, 0)), 0) AS cogs,
    COALESCE(SUM(${lineNetSalesSql}), 0) - COALESCE(SUM(l.quantity * COALESCE(l.cost_snapshot, i.cost_per_unit, 0)), 0) AS pos_profit_loss,
    COALESCE(SUM(l.quantity), 0) AS quantity`;

// Raw-query replacements are serialized differently than Sequelize model filters.
// Use the exact Manila business-date boundary used by the canonical POS reports.
const toBusinessDateBoundary = (date, includeNextDay = false) => {
    const boundary = new Date(`${date}T00:00:00.000+08:00`);
    if (includeNextDay) boundary.setUTCDate(boundary.getUTCDate() + 1);
    return boundary.toISOString().slice(0, 19).replace('T', ' ');
};

const scopedTransactions = ({ dateFrom, dateTo, branchId, registerId = '', allowedLocationIds }) => {
    const replacements = {
        startAt: toBusinessDateBoundary(dateFrom),
        endAt: toBusinessDateBoundary(dateTo, true)
    };
    const predicates = [
        't.created_at >= :startAt',
        't.created_at < :endAt',
        "t.status IN ('completed', 'voided')",
        "(t.order_source = 'in_store' OR t.order_source IS NULL OR (t.order_source = 'online_store' AND t.fulfillment_status = 'completed'))"
    ];
    if (branchId) {
        replacements.branchId = branchId;
        predicates.push('t.location_id = :branchId');
    } else if (Array.isArray(allowedLocationIds)) {
        replacements.allowedLocationIds = allowedLocationIds;
        predicates.push('t.location_id IN (:allowedLocationIds)');
    }
    if (registerId) {
        replacements.registerId = registerId;
        predicates.push('t.terminal_id = :registerId');
    }
    return {
        replacements,
        where: predicates.join('\n        AND '),
        isSingleBusinessDate: Boolean(dateFrom && dateTo && dateFrom === dateTo)
    };
};

const withScopedTransactions = (scope, body) => `
    WITH scoped_transactions AS (
        SELECT t.*
        FROM pos_transactions t
        WHERE ${scope.where}
    ),
    line_costs AS (
        SELECT l.pos_transaction_id,
            COALESCE(SUM(l.quantity * COALESCE(l.cost_snapshot, i.cost_per_unit, 0)), 0) AS cogs,
            COALESCE(SUM(l.quantity), 0) AS quantity
        FROM pos_transaction_lines l
        INNER JOIN scoped_transactions t ON t.pos_transaction_id = l.pos_transaction_id
        LEFT JOIN items i ON i.item_id = l.item_id
        GROUP BY l.pos_transaction_id
    )
    ${body}`;

const buildHeaderQuery = (key, scope) => {
    // Canonical POS reporting derives all financial measures from transaction lines.
    // This preserves per-line discount allocations and excludes malformed headers with no sale lines.
    const base = `FROM pos_transaction_lines l
        INNER JOIN scoped_transactions t ON t.pos_transaction_id = l.pos_transaction_id
        LEFT JOIN items i ON i.item_id = l.item_id
        LEFT JOIN pos_transaction_discount_lines dl ON dl.transaction_line_id = l.line_id
        ${successfulRefundJoin}`;
    switch (key) {
        case 'sales_trend':
            return withScopedTransactions(scope, scope.isSingleBusinessDate
                ? `SELECT DATE_FORMAT(DATE_ADD(t.created_at, INTERVAL 8 HOUR), '%Y-%m-%d %H:00') AS period, DATE_FORMAT(DATE_ADD(t.created_at, INTERVAL 8 HOUR), '%h %p') AS label, ${lineMetricSelect} ${base} GROUP BY period, label`
                : `SELECT DATE_FORMAT(DATE_ADD(t.created_at, INTERVAL 8 HOUR), '%Y-%m-%d') AS period, DATE_FORMAT(DATE_ADD(t.created_at, INTERVAL 8 HOUR), '%Y-%m-%d') AS label, ${lineMetricSelect} ${base} GROUP BY period, label`);
        case 'sales_by_terminal':
            return withScopedTransactions(scope, `SELECT COALESCE(NULLIF(t.terminal_id, ''), 'Unassigned') AS terminal_id, ${lineMetricSelect} ${base} GROUP BY terminal_id`);
        case 'sales_by_branch':
            return withScopedTransactions(scope, `SELECT COALESCE(t.location_id, 0) AS branch_id, COALESCE(NULLIF(location.name, ''), 'Unassigned') AS branch, ${lineMetricSelect} ${base} LEFT JOIN tenant_locations location ON location.location_id = t.location_id GROUP BY branch_id, branch`);
        case 'sales_by_source':
            return withScopedTransactions(scope, `SELECT COALESCE(t.order_source, 'in_store') AS source, CASE WHEN t.order_source = 'online_store' THEN 'Storefront' ELSE 'POS' END AS label, ${lineMetricSelect} ${base} GROUP BY source, label`);
        case 'sales_by_employee':
            return withScopedTransactions(scope, `SELECT COALESCE(t.cashier_id, 0) AS cashier_id, COALESCE(NULLIF(cashier.username, ''), 'Unassigned') AS employee, COUNT(DISTINCT t.shift_id) AS shift_count, ${lineMetricSelect} ${base} LEFT JOIN users cashier ON cashier.user_id = t.cashier_id GROUP BY cashier_id, employee`);
        case 'sales_by_payment':
            return withScopedTransactions(scope, `SELECT CASE t.payment_type WHEN 'cash' THEN 'Cash' WHEN 'gcash' THEN 'GCash' WHEN 'card' THEN 'Card' ELSE 'Online' END AS payment_method, ${lineMetricSelect} ${base} GROUP BY payment_method`);
        case 'fulfillment':
            return withScopedTransactions(scope, `SELECT COALESCE(t.order_method, 'dine_in') AS order_method, ${lineMetricSelect} ${base} GROUP BY order_method`);
        case 'shifts':
            return withScopedTransactions(scope, `SELECT COALESCE(t.shift_id, 0) AS shift_id, COALESCE(NULLIF(t.terminal_id, ''), 'Unassigned') AS terminal_id, shift.business_date AS business_date, ${lineMetricSelect} ${base} LEFT JOIN pos_terminal_shifts shift ON shift.pos_terminal_shift_id = t.shift_id GROUP BY shift_id, terminal_id, business_date`);
        case 'tax_and_fees':
            return withScopedTransactions(scope, `SELECT 'Finalized transaction tax and fee totals' AS label, ${lineMetricSelect} ${base}`);
        case 'refunds_and_voids':
            return withScopedTransactions(scope, `SELECT 'Finalized transaction refund and void totals' AS label, ${lineMetricSelect} ${base}`);
        case 'customer_activity':
            return withScopedTransactions(scope, `SELECT t.customer_name AS customer, ${lineMetricSelect} ${base} WHERE NULLIF(TRIM(t.customer_name), '') IS NOT NULL GROUP BY customer`);
        default:
            return null;
    }
};

const buildLineQuery = (key, scope) => {
    const select = key === 'sales_by_item'
        ? `SELECT l.item_id, COALESCE(NULLIF(i.name, ''), CONCAT('Item #', l.item_id)) AS item_name, i.sku_code, COALESCE(NULLIF(i.category, ''), 'Uncategorized') AS category, ${lineMetricSelect}`
        : `SELECT COALESCE(NULLIF(i.category, ''), 'Uncategorized') AS category, ${lineMetricSelect}`;
    const groupBy = key === 'sales_by_item'
        ? 'GROUP BY l.item_id, item_name, i.sku_code, category'
        : 'GROUP BY category';
    return withScopedTransactions(scope, `${select}
        FROM pos_transaction_lines l
        INNER JOIN scoped_transactions t ON t.pos_transaction_id = l.pos_transaction_id
        LEFT JOIN items i ON i.item_id = l.item_id
        LEFT JOIN pos_transaction_discount_lines dl ON dl.transaction_line_id = l.line_id
        ${successfulRefundJoin}
        ${groupBy}`);
};

const buildSalesAndStockByItemQuery = (scope) => withScopedTransactions(scope, `
    SELECT
        l.item_id,
        COALESCE(NULLIF(i.name, ''), CONCAT('Item #', l.item_id)) AS item_name,
        i.sku_code,
        COALESCE(NULLIF(i.category, ''), 'Uncategorized') AS category,
        COALESCE(t.location_id, 0) AS branch_id,
        COALESCE(NULLIF(location.name, ''), 'Unassigned') AS branch,
        COALESCE(SUM(CASE WHEN t.status = 'voided' THEN 0 ELSE GREATEST(0, l.quantity * ${lineRefundRatioSql}) END), 0) AS units_sold,
        COALESCE(MAX(stock.quantity_on_hand), 0) AS quantity_on_hand,
        COALESCE(i.min_threshold, 0) AS min_threshold,
        ${buildStockHealthSqlCase({
            stockExpression: 'COALESCE(MAX(stock.quantity_on_hand), 0)',
            minExpression: 'i.min_threshold',
            maxExpression: 'i.max_capacity',
            labels: { overstock: 'in_stock', unconfigured: 'in_stock', healthy: 'in_stock' }
        })} AS stock_status
    FROM pos_transaction_lines l
    INNER JOIN scoped_transactions t ON t.pos_transaction_id = l.pos_transaction_id
    LEFT JOIN items i ON i.item_id = l.item_id
    LEFT JOIN tenant_locations location ON location.location_id = t.location_id
    LEFT JOIN item_location_stocks stock
        ON stock.item_id = l.item_id
        AND stock.location_id = t.location_id
    ${successfulRefundJoin}
    WHERE COALESCE(l.stock_effect_type, 'inventory_issue') = 'inventory_issue'
    GROUP BY l.item_id, item_name, i.sku_code, category, branch_id, branch, i.min_threshold, i.max_capacity`);

const buildDiscountQuery = (scope) => withScopedTransactions(scope, `
    SELECT
        CASE WHEN NULLIF(discount.promo_code, '') IS NOT NULL THEN CONCAT(COALESCE(NULLIF(t.discount_label_snapshot, ''), 'Promo'), ' (', discount.promo_code, ')') ELSE COALESCE(NULLIF(t.discount_label_snapshot, ''), 'Discount') END AS discount_label,
        COALESCE(NULLIF(discount.discount_type, ''), 'legacy') AS discount_type,
        NULLIF(discount.promo_code, '') AS promo_code,
        COUNT(DISTINCT t.pos_transaction_id) AS transaction_count,
        COALESCE(SUM(COALESCE(dl.discount_amount, t.discount_amount * CASE WHEN t.subtotal_amount > 0 THEN l.line_subtotal / t.subtotal_amount ELSE 0 END)), 0) AS discount_amount,
        COALESCE(SUM(COALESCE(dl.vat_removed, discount.vat_removed * CASE WHEN t.subtotal_amount > 0 THEN l.line_subtotal / t.subtotal_amount ELSE 0 END)), 0) AS vat_removed
    FROM scoped_transactions t
    INNER JOIN pos_transaction_lines l ON l.pos_transaction_id = t.pos_transaction_id
    INNER JOIN pos_transaction_discounts discount ON discount.transaction_id = t.pos_transaction_id
    LEFT JOIN pos_transaction_discount_lines dl ON dl.transaction_line_id = l.line_id
    WHERE COALESCE(dl.discount_amount, t.discount_amount * CASE WHEN t.subtotal_amount > 0 THEN l.line_subtotal / t.subtotal_amount ELSE 0 END) > 0
    GROUP BY discount_label, discount_type, promo_code`);

const buildQuery = (reportKey, scope) => {
    if (reportKey === 'sales_and_stock_by_item') return buildSalesAndStockByItemQuery(scope);
    if (reportKey === 'sales_by_item' || reportKey === 'sales_by_category') return buildLineQuery(reportKey, scope);
    if (reportKey === 'discounts') return buildDiscountQuery(scope);
    return buildHeaderQuery(reportKey, scope);
};

const normalizeRows = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (['branch_id', 'cashier_id', 'item_id', 'shift_id', 'shift_count', 'transaction_count'].includes(key)) return [key, Number.parseInt(value, 10) || 0];
    if (['gross_sales', 'net_sales', 'discounts', 'refunds_voids', 'vat', 'service_fees', 'cogs', 'pos_profit_loss', 'quantity', 'units_sold', 'quantity_on_hand', 'min_threshold', 'discount_amount', 'vat_removed'].includes(key)) return [key, number(value)];
    return [key, value];
})));

export const businessAdminFinancialReportRepository = {
    async getDataset({ reportKey, dateFrom, dateTo, branchId = null, registerId = '', allowedLocationIds = null, page = 1, limit = 50, sortBy = '', sortDirection = 'desc' } = {}) {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const fields = getReportSortFields(reportKey);
        if (!fields) throw new Error(`Unsupported Business Admin report dataset: ${reportKey}`);

        const normalizedPage = positiveInt(page, 1);
        const normalizedLimit = Math.min(MAX_LIMIT, positiveInt(limit, 50));
        const normalizedSort = fields.includes(sortBy)
            ? sortBy
            : fields.includes('net_sales')
                ? 'net_sales'
                : fields.includes('units_sold')
                    ? 'units_sold'
                    : fields[0];
        const scope = scopedTransactions({ dateFrom, dateTo, branchId, registerId, allowedLocationIds });
        const baseQuery = buildQuery(reportKey, scope);
        const queryReplacements = {
            ...scope.replacements,
            limit: normalizedLimit,
            offset: (normalizedPage - 1) * normalizedLimit
        };
        const [countRow] = await sequelize.query(`SELECT COUNT(*) AS total FROM (${baseQuery}) report_rows`, {
            replacements: scope.replacements,
            type: QueryTypes.SELECT
        });
        const rows = await sequelize.query(`SELECT * FROM (${baseQuery}) report_rows ORDER BY \`${normalizedSort}\` ${direction(sortDirection)} LIMIT :limit OFFSET :offset`, {
            replacements: queryReplacements,
            type: QueryTypes.SELECT
        });
        const total = Number.parseInt(countRow?.total, 10) || 0;
        return {
            rows: normalizeRows(rows),
            pagination: { page: normalizedPage, limit: normalizedLimit, total, total_pages: Math.ceil(total / normalizedLimit) },
            sort: { by: normalizedSort, direction: direction(sortDirection).toLowerCase() },
            available_sort_fields: fields
        };
    }
};

export { buildQuery as buildBusinessAdminFinancialReportQuery, scopedTransactions as buildBusinessAdminFinancialReportScope };

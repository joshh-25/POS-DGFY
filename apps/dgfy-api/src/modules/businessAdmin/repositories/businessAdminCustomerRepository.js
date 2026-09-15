import { QueryTypes } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const positiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const toBusinessDateBoundary = (date, includeNextDay = false) => {
    const boundary = new Date(`${date}T00:00:00.000+08:00`);
    if (includeNextDay) boundary.setUTCDate(boundary.getUTCDate() + 1);
    return boundary.toISOString().slice(0, 19).replace('T', ' ');
};

const scopedTransactions = ({ dateFrom, dateTo, branchId = null, allowedLocationIds = null, search = '' }) => {
    const replacements = {
        startAt: toBusinessDateBoundary(dateFrom),
        endAt: toBusinessDateBoundary(dateTo, true)
    };
    const predicates = [
        't.created_at >= :startAt',
        't.created_at < :endAt',
        "t.status = 'completed'",
        "(t.order_source = 'in_store' OR t.order_source IS NULL OR (t.order_source = 'online_store' AND t.fulfillment_status = 'completed'))",
        "(t.store_customer_id IS NOT NULL OR NULLIF(TRIM(t.customer_name), '') IS NOT NULL OR NULLIF(TRIM(t.customer_email), '') IS NOT NULL OR NULLIF(TRIM(t.customer_phone), '') IS NOT NULL)"
    ];
    if (branchId) {
        replacements.branchId = branchId;
        predicates.push('t.location_id = :branchId');
    } else if (Array.isArray(allowedLocationIds)) {
        replacements.allowedLocationIds = allowedLocationIds;
        predicates.push('t.location_id IN (:allowedLocationIds)');
    }
    if (search) {
        replacements.search = `%${search}%`;
        predicates.push(`(
            COALESCE(NULLIF(sc.name, ''), NULLIF(t.customer_name, '')) LIKE :search
            OR COALESCE(NULLIF(sc.email, ''), NULLIF(t.customer_email, '')) LIKE :search
            OR COALESCE(NULLIF(sc.phone, ''), NULLIF(t.customer_phone, '')) LIKE :search
        )`);
    }
    return { replacements, where: predicates.join('\n        AND ') };
};

const buildCustomerQuery = ({ dateFrom, dateTo, branchId, allowedLocationIds, search }) => {
    const scope = scopedTransactions({ dateFrom, dateTo, branchId, allowedLocationIds, search });
    const query = `
        WITH customer_transactions AS (
            SELECT
                CASE
                    WHEN t.store_customer_id IS NOT NULL THEN CONCAT('linked:', t.store_customer_id)
                    ELSE CONCAT(
                        'snapshot:',
                        SHA2(CONCAT_WS('|',
                            COALESCE(NULLIF(TRIM(t.customer_email), ''), ''),
                            COALESCE(NULLIF(TRIM(t.customer_phone), ''), ''),
                            COALESCE(NULLIF(TRIM(t.customer_name), ''), '')
                        ), 256)
                    )
                END AS customer_key,
                t.store_customer_id,
                COALESCE(NULLIF(sc.name, ''), NULLIF(t.customer_name, ''), 'Unnamed customer') AS customer_name,
                COALESCE(NULLIF(sc.email, ''), NULLIF(t.customer_email, '')) AS customer_email,
                COALESCE(NULLIF(sc.phone, ''), NULLIF(t.customer_phone, '')) AS customer_phone,
                t.created_at,
                t.total_amount
            FROM pos_transactions t
            LEFT JOIN store_customers sc ON sc.customer_id = t.store_customer_id
            WHERE ${scope.where}
        )
        SELECT
            customer_key,
            MAX(store_customer_id) AS customer_id,
            MAX(customer_name) AS customer_name,
            MAX(customer_email) AS customer_email,
            MAX(customer_phone) AS customer_phone,
            COUNT(*) AS visit_count,
            COALESCE(SUM(total_amount), 0) AS total_spend,
            COALESCE(AVG(total_amount), 0) AS average_order,
            MIN(created_at) AS first_purchase_at,
            MAX(created_at) AS last_purchase_at,
            CASE WHEN COUNT(*) > 1 THEN DATEDIFF(MAX(created_at), MIN(created_at)) / (COUNT(*) - 1) ELSE NULL END AS purchase_frequency_days
        FROM customer_transactions
        GROUP BY customer_key`;
    return { query, replacements: scope.replacements };
};

export const businessAdminCustomerRepository = {
    async listCustomers({ dateFrom, dateTo, branchId = null, allowedLocationIds = null, search = '', page = 1, limit = 50 } = {}) {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const normalizedPage = positiveInt(page, 1);
        const normalizedLimit = Math.min(200, positiveInt(limit, 50));
        const { query, replacements } = buildCustomerQuery({ dateFrom, dateTo, branchId, allowedLocationIds, search });
        const countRows = await sequelize.query(`SELECT COUNT(*) AS total FROM (${query}) customer_rows`, {
            replacements,
            type: QueryTypes.SELECT
        });
        const total = Number.parseInt(countRows[0]?.total, 10) || 0;
        const rows = await sequelize.query(`SELECT * FROM (${query}) customer_rows ORDER BY total_spend DESC, last_purchase_at DESC LIMIT :limit OFFSET :offset`, {
            replacements: { ...replacements, limit: normalizedLimit, offset: (normalizedPage - 1) * normalizedLimit },
            type: QueryTypes.SELECT
        });
        return {
            rows: rows.map((row) => ({
                profile_ref: row.customer_key,
                customer_id: row.customer_id == null ? null : Number(row.customer_id),
                name: row.customer_name || 'Unnamed customer',
                email: row.customer_email || null,
                phone: row.customer_phone || null,
                visit_count: Number.parseInt(row.visit_count, 10) || 0,
                total_spend: number(row.total_spend),
                average_order: number(row.average_order),
                first_purchase_at: row.first_purchase_at || null,
                last_purchase_at: row.last_purchase_at || null,
                purchase_frequency_days: row.purchase_frequency_days == null ? null : number(row.purchase_frequency_days),
                identity_source: row.customer_id == null ? 'transaction_snapshot' : 'tenant_store_customer',
                global_identity_linked: null
            })),
            pagination: {
                page: normalizedPage,
                limit: normalizedLimit,
                total,
                total_pages: Math.ceil(total / normalizedLimit)
            },
            meta: {
                date_from: dateFrom,
                date_to: dateTo,
                branch_id: branchId,
                read_only: true,
                source: 'tenant_pos_customer_snapshots',
                identity_policy: 'Explicit tenant StoreCustomer links only; transaction snapshots are not merged into global DGFY identity.'
            }
        };
    },

    async getCustomerDetail({ profileRef, dateFrom, dateTo, branchId = null, allowedLocationIds = null } = {}) {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const scope = scopedTransactions({ dateFrom, dateTo, branchId, allowedLocationIds });
        const customerKey = `CASE
            WHEN t.store_customer_id IS NOT NULL THEN CONCAT('linked:', t.store_customer_id)
            ELSE CONCAT(
                'snapshot:',
                SHA2(CONCAT_WS('|',
                    COALESCE(NULLIF(TRIM(t.customer_email), ''), ''),
                    COALESCE(NULLIF(TRIM(t.customer_phone), ''), ''),
                    COALESCE(NULLIF(TRIM(t.customer_name), ''), '')
                ), 256)
            )
        END`;
        const replacements = { ...scope.replacements, profileRef };
        const transactionsCte = `
            WITH customer_transactions AS (
                SELECT
                    t.pos_transaction_id AS transaction_id,
                    t.invoice_number,
                    t.created_at,
                    t.location_id,
                    t.payment_type,
                    t.payment_status,
                    t.total_amount,
                    t.store_customer_id,
                    COALESCE(NULLIF(sc.name, ''), NULLIF(t.customer_name, ''), 'Unnamed customer') AS customer_name,
                    COALESCE(NULLIF(sc.email, ''), NULLIF(t.customer_email, '')) AS customer_email,
                    COALESCE(NULLIF(sc.phone, ''), NULLIF(t.customer_phone, '')) AS customer_phone,
                    ${customerKey} AS customer_key
                FROM pos_transactions t
                LEFT JOIN store_customers sc ON sc.customer_id = t.store_customer_id
                WHERE ${scope.where}
            )`;
        const [customerRows, orderRows, favoriteRows] = await Promise.all([
            sequelize.query(`${transactionsCte}
                SELECT customer_key, MAX(store_customer_id) AS customer_id,
                    MAX(customer_name) AS customer_name, MAX(customer_email) AS customer_email,
                    MAX(customer_phone) AS customer_phone, COUNT(*) AS visit_count,
                    COALESCE(SUM(total_amount), 0) AS total_spend,
                    COALESCE(AVG(total_amount), 0) AS average_order,
                    MIN(created_at) AS first_purchase_at, MAX(created_at) AS last_purchase_at
                FROM customer_transactions
                WHERE customer_key = :profileRef
                GROUP BY customer_key`, { replacements, type: QueryTypes.SELECT }),
            sequelize.query(`${transactionsCte}
                SELECT transaction_id, invoice_number, created_at, location_id, payment_type,
                    payment_status, total_amount
                FROM customer_transactions
                WHERE customer_key = :profileRef
                ORDER BY created_at DESC, transaction_id DESC
                LIMIT 50`, { replacements, type: QueryTypes.SELECT }),
            sequelize.query(`${transactionsCte}
                SELECT l.item_id,
                    COALESCE(NULLIF(l.item_name_snapshot, ''), NULLIF(i.name, ''), CONCAT('Item #', l.item_id)) AS item_name,
                    COALESCE(SUM(l.quantity), 0) AS quantity,
                    COALESCE(SUM(l.line_subtotal), 0) AS net_spend,
                    COUNT(DISTINCT ct.transaction_id) AS order_count
                FROM customer_transactions ct
                INNER JOIN pos_transaction_lines l ON l.pos_transaction_id = ct.transaction_id
                LEFT JOIN items i ON i.item_id = l.item_id
                WHERE ct.customer_key = :profileRef
                GROUP BY l.item_id, item_name
                ORDER BY quantity DESC, net_spend DESC, item_name ASC
                LIMIT 10`, { replacements, type: QueryTypes.SELECT })
        ]);
        const customer = customerRows[0];
        if (!customer) return null;
        return {
            profile_ref: customer.profile_key || profileRef,
            customer_id: customer.customer_id == null ? null : Number(customer.customer_id),
            name: customer.customer_name || 'Unnamed customer',
            email: customer.customer_email || null,
            phone: customer.customer_phone || null,
            visit_count: Number.parseInt(customer.visit_count, 10) || 0,
            total_spend: number(customer.total_spend),
            average_order: number(customer.average_order),
            first_purchase_at: customer.first_purchase_at || null,
            last_purchase_at: customer.last_purchase_at || null,
            identity_source: customer.customer_id == null ? 'transaction_snapshot' : 'tenant_store_customer',
            favorite_products: favoriteRows.map((row) => ({
                item_id: row.item_id == null ? null : Number(row.item_id),
                item_name: row.item_name || 'Unknown item',
                quantity: number(row.quantity),
                net_spend: number(row.net_spend),
                order_count: Number.parseInt(row.order_count, 10) || 0
            })),
            orders: orderRows.map((row) => ({
                transaction_id: Number(row.transaction_id),
                invoice_number: row.invoice_number,
                created_at: row.created_at || null,
                location_id: row.location_id == null ? null : Number(row.location_id),
                payment_type: row.payment_type || null,
                payment_status: row.payment_status || null,
                total_amount: number(row.total_amount)
            })),
            meta: {
                date_from: dateFrom,
                date_to: dateTo,
                branch_id: branchId,
                read_only: true,
                source: 'tenant_pos_customer_transaction_detail',
                identity_policy: 'Explicit tenant StoreCustomer links only; transaction snapshots are not merged into global DGFY identity.'
            }
        };
    }
};

export { buildCustomerQuery };

import { QueryTypes } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { businessAdminOrderCenterRepository } from './businessAdminOrderCenterRepository.js';

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

const transactionCustomerAddress = `COALESCE(
    (
        SELECT NULLIF(TRIM(ca.address_line), '')
        FROM customer_addresses ca
        WHERE ca.customer_id = t.store_customer_id
        ORDER BY ca.is_default DESC, ca.updated_at DESC, ca.address_id DESC
        LIMIT 1
    ),
    NULLIF(TRIM(t.delivery_address), ''),
    NULLIF(TRIM(t.buyer_address), '')
)`;

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
    const canonicalSearch = search
        ? `WHERE (
            COALESCE(NULLIF(sc.name, ''), '') LIKE :search
            OR COALESCE(NULLIF(sc.email, ''), '') LIKE :search
            OR COALESCE(NULLIF(sc.phone, ''), '') LIKE :search
        )`
        : '';
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
                t.pos_transaction_id AS transaction_id,
                t.store_customer_id,
                COALESCE(NULLIF(sc.name, ''), NULLIF(t.customer_name, ''), 'Unnamed customer') AS customer_name,
                COALESCE(NULLIF(sc.email, ''), NULLIF(t.customer_email, '')) AS customer_email,
                COALESCE(NULLIF(sc.phone, ''), NULLIF(t.customer_phone, '')) AS customer_phone,
                ${transactionCustomerAddress} AS customer_address,
                t.created_at,
                t.total_amount
            FROM pos_transactions t
            LEFT JOIN store_customers sc ON sc.customer_id = t.store_customer_id
            WHERE ${scope.where}
        ), canonical_profiles AS (
            SELECT
                CONCAT('linked:', sc.customer_id) AS customer_key,
                sc.customer_id,
                sc.name AS customer_name,
                sc.email AS customer_email,
                sc.phone AS customer_phone,
                COALESCE(
                    (
                        SELECT NULLIF(TRIM(ca.address_line), '')
                        FROM customer_addresses ca
                        WHERE ca.customer_id = sc.customer_id
                        ORDER BY ca.is_default DESC, ca.updated_at DESC, ca.address_id DESC
                        LIMIT 1
                    ),
                    (
                        SELECT ct_address.customer_address
                        FROM customer_transactions ct_address
                        WHERE ct_address.store_customer_id = sc.customer_id
                          AND ct_address.customer_address IS NOT NULL
                        ORDER BY ct_address.created_at DESC, ct_address.transaction_id DESC
                        LIMIT 1
                    )
                ) AS customer_address,
                COUNT(ct.transaction_id) AS visit_count,
                COALESCE(SUM(ct.total_amount), 0) AS total_spend,
                COALESCE(AVG(ct.total_amount), 0) AS average_order,
                MIN(ct.created_at) AS first_purchase_at,
                MAX(ct.created_at) AS last_purchase_at,
                CASE WHEN COUNT(ct.transaction_id) > 1 THEN DATEDIFF(MAX(ct.created_at), MIN(ct.created_at)) / (COUNT(ct.transaction_id) - 1) ELSE NULL END AS purchase_frequency_days
            FROM store_customers sc
            LEFT JOIN customer_transactions ct ON ct.store_customer_id = sc.customer_id
            ${canonicalSearch}
            GROUP BY sc.customer_id, sc.name, sc.email, sc.phone
        ), snapshot_profiles AS (
            SELECT
                customer_key,
                NULL AS customer_id,
                MAX(customer_name) AS customer_name,
                MAX(customer_email) AS customer_email,
                MAX(customer_phone) AS customer_phone,
                (
                    SELECT snapshot_address.customer_address
                    FROM customer_transactions snapshot_address
                    WHERE snapshot_address.customer_key = snapshot_profile.customer_key
                      AND snapshot_address.store_customer_id IS NULL
                      AND snapshot_address.customer_address IS NOT NULL
                    ORDER BY snapshot_address.created_at DESC, snapshot_address.transaction_id DESC
                    LIMIT 1
                ) AS customer_address,
                COUNT(*) AS visit_count,
                COALESCE(SUM(total_amount), 0) AS total_spend,
                COALESCE(AVG(total_amount), 0) AS average_order,
                MIN(created_at) AS first_purchase_at,
                MAX(created_at) AS last_purchase_at,
                CASE WHEN COUNT(*) > 1 THEN DATEDIFF(MAX(created_at), MIN(created_at)) / (COUNT(*) - 1) ELSE NULL END AS purchase_frequency_days
            FROM customer_transactions snapshot_profile
            WHERE snapshot_profile.store_customer_id IS NULL
            GROUP BY snapshot_profile.customer_key
        ), customer_profiles AS (
            SELECT * FROM canonical_profiles
            UNION ALL
            SELECT * FROM snapshot_profiles
        )
        SELECT
            customer_key,
            customer_id,
            customer_name,
            customer_email,
            customer_phone,
            customer_address,
            visit_count,
            total_spend,
            average_order,
            first_purchase_at,
            last_purchase_at,
            purchase_frequency_days
        FROM customer_profiles`;
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
                address_line: row.customer_address || null,
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
                read_only: false,
                source: 'tenant_store_customers_and_pos_customer_snapshots',
                customer_write: 'business_admin',
                identity_policy: 'Explicit tenant StoreCustomer links only; transaction snapshots are not merged into global DGFY identity.'
            }
        };
    },

    async findCustomerByEmail(email) {
        const StoreCustomer = dbStore.get('StoreCustomer');
        const row = await StoreCustomer.findOne({
            where: { email: String(email || '').trim().toLowerCase() },
            attributes: ['customer_id', 'email', 'name', 'phone', 'is_active', 'created_at']
        });
        return row?.toJSON ? row.toJSON() : row || null;
    },

    async createCustomer({ name, email, phone, addressLine = null }) {
        const StoreCustomer = dbStore.get('StoreCustomer');
        const StoreCustomerAddress = dbStore.get('StoreCustomerAddress');
        const sequelize = StoreCustomer.sequelize || dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const createProfile = async (transaction) => {
            const options = transaction ? { transaction } : {};
            const row = await StoreCustomer.create({
                name,
                email,
                phone: phone || null,
                // Back Office creates a profile, not a storefront credential. This
                // placeholder is intentionally not a bcrypt hash and therefore
                // cannot be used as a password by the existing login flow.
                password_hash: 'PENDING_INVITATION',
                is_active: true
            }, options);
            if (addressLine) {
                await StoreCustomerAddress.create({
                    customer_id: row.customer_id,
                    label: 'Address',
                    address_line: addressLine,
                    is_default: true
                }, options);
            }
            const created = row?.toJSON ? row.toJSON() : row;
            return { ...created, address_line: addressLine || null };
        };

        if (addressLine && typeof sequelize?.transaction === 'function') {
            return sequelize.transaction(createProfile);
        }
        return createProfile();
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
                    ${transactionCustomerAddress} AS customer_address,
                    ${customerKey} AS customer_key
                FROM pos_transactions t
                LEFT JOIN store_customers sc ON sc.customer_id = t.store_customer_id
                WHERE ${scope.where}
            )`;
        const [customerRows, canonicalOrderData, favoriteRows] = await Promise.all([
            sequelize.query(`${transactionsCte}
                SELECT customer_key, MAX(store_customer_id) AS customer_id,
                    MAX(customer_name) AS customer_name, MAX(customer_email) AS customer_email,
                    MAX(customer_phone) AS customer_phone, MAX(customer_address) AS customer_address,
                    COUNT(*) AS visit_count,
                    COALESCE(SUM(total_amount), 0) AS total_spend,
                    COALESCE(AVG(total_amount), 0) AS average_order,
                    MIN(created_at) AS first_purchase_at, MAX(created_at) AS last_purchase_at
                FROM customer_transactions
                WHERE customer_key = :profileRef
                GROUP BY customer_key
                UNION ALL
                SELECT CONCAT('linked:', sc.customer_id) AS customer_key,
                    sc.customer_id, sc.name AS customer_name, sc.email AS customer_email,
                    sc.phone AS customer_phone,
                    (
                        SELECT NULLIF(TRIM(ca.address_line), '')
                        FROM customer_addresses ca
                        WHERE ca.customer_id = sc.customer_id
                        ORDER BY ca.is_default DESC, ca.updated_at DESC, ca.address_id DESC
                        LIMIT 1
                    ) AS customer_address,
                    0 AS visit_count,
                    0 AS total_spend, 0 AS average_order,
                    NULL AS first_purchase_at, NULL AS last_purchase_at
                FROM store_customers sc
                WHERE CONCAT('linked:', sc.customer_id) = :profileRef
                LIMIT 1`, { replacements, type: QueryTypes.SELECT }),
            businessAdminOrderCenterRepository.listOrders({
                allowedLocationIds,
                filters: {
                    page: 1,
                    limit: 50,
                    branchId,
                    transactionStatus: 'completed',
                    startAt: scope.replacements.startAt,
                    endAtExclusive: scope.replacements.endAt,
                    customerHistoryOnly: true,
                    customerProfileRef: profileRef
                }
            }),
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
            profile_ref: customer.customer_key || profileRef,
            customer_id: customer.customer_id == null ? null : Number(customer.customer_id),
            name: customer.customer_name || 'Unnamed customer',
            email: customer.customer_email || null,
            phone: customer.customer_phone || null,
            address_line: customer.customer_address || null,
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
            // The customer workspace owns customer aggregates and favorite
            // products, but order rows come from the canonical Order Center so
            // customer history and Orders cannot drift on status, branch,
            // payment, or source semantics.
            orders: (canonicalOrderData?.orders || []).map((row) => ({
                ...row,
                transaction_id: Number(row.transaction_id),
                location_id: row.branch_id == null ? null : Number(row.branch_id),
                total_amount: number(row.total_amount)
            })),
            meta: {
                date_from: dateFrom,
                date_to: dateTo,
                branch_id: branchId,
                read_only: false,
                source: 'business_admin_order_center_customer_history',
                identity_policy: 'Explicit tenant StoreCustomer links only; transaction snapshots are not merged into global DGFY identity.'
            }
        };
    }
};

export { buildCustomerQuery };

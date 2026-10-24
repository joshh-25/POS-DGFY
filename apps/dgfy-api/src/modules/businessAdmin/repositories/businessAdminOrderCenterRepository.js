import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => (value && typeof value.toJSON === 'function' ? value.toJSON() : value);
const FINALIZED_REFUND_PAYMENT_STATUSES = ['partial_refunded', 'refunded'];
const REFUND_RELATED_PAYMENT_STATUSES = ['refund_pending', ...FINALIZED_REFUND_PAYMENT_STATUSES];

// Customer profile identity is deliberately derived from the same tenant POS
// transaction snapshot used by the Customer workspace. Keeping the expression
// here lets customer history reuse the Order Center query without merging
// tenant snapshots into the global DGFY identity model.
const CUSTOMER_PROFILE_REF_SQL = `CASE
    WHEN store_customer_id IS NOT NULL THEN CONCAT('linked:', store_customer_id)
    ELSE CONCAT(
        'snapshot:',
        SHA2(CONCAT_WS('|',
            COALESCE(NULLIF(TRIM(customer_email), ''), ''),
            COALESCE(NULLIF(TRIM(customer_phone), ''), ''),
            COALESCE(NULLIF(TRIM(customer_name), ''), '')
        ), 256)
    )
END`;

const CUSTOMER_HISTORY_SCOPE_SQL = `(
    (order_source = 'in_store' OR order_source IS NULL OR (order_source = 'online_store' AND fulfillment_status = 'completed'))
    AND (
        store_customer_id IS NOT NULL
        OR NULLIF(TRIM(customer_name), '') IS NOT NULL
        OR NULLIF(TRIM(customer_email), '') IS NOT NULL
        OR NULLIF(TRIM(customer_phone), '') IS NOT NULL
    )
)`;

const userInclude = (as) => ({
    model: dbStore.get('User'),
    as,
    attributes: ['user_id', 'username', 'email'],
    required: false
});

const discountLineAttributes = [
    'id',
    'transaction_discount_id',
    'beneficiary_id',
    'transaction_line_id',
    'item_id',
    'eligible_quantity',
    'gross_eligible_amount',
    'vat_removed',
    'vat_exempt_amount',
    'discount_amount',
    'final_line_amount',
    'eligibility_override_reason'
];

const transactionInclude = ({ detail = false, itemId = null } = {}) => {
    const includes = [
        { model: dbStore.get('TenantLocation'), as: 'location', attributes: ['location_id', 'name', 'address_line'], required: false },
        userInclude('cashier'),
        userInclude('acceptedByUser'),
        userInclude('paymentCollectedByUser'),
        userInclude('voidedByUser'),
        {
            model: dbStore.get('PosTerminalShift'),
            as: 'shift',
            attributes: ['pos_terminal_shift_id', 'business_date', 'terminal_id', 'location_id', 'status'],
            required: false
        },
        {
            model: dbStore.get('DeliveryJob'),
            as: 'deliveryJob',
            attributes: ['delivery_job_id', 'provider', 'status', 'tracking_url', 'pickup_ready_at', 'picked_up_at', 'delivered_at', 'failure_reason'],
            required: false
        }
    ];
    const StoreCustomer = dbStore.get('StoreCustomer');
    if (StoreCustomer) {
        includes.push({
            model: StoreCustomer,
            as: 'storeCustomer',
            attributes: ['customer_id', 'name', 'email', 'phone'],
            required: false
        });
    }
    if (itemId) {
        includes.push({
            model: dbStore.get('PosTransactionLine'),
            as: 'lines',
            attributes: [],
            where: { item_id: itemId },
            required: true
        });
    }

    if (!detail) return includes;

    includes.push(
        {
            model: dbStore.get('PosTransactionLine'),
            as: 'lines',
            attributes: [
                'line_id',
                'item_id',
                'item_name_snapshot',
                'sku_snapshot',
                'quantity',
                'unit_of_measure',
                'sale_price',
                'line_subtotal',
                'vat_type_snapshot',
                'vat_rate_snapshot',
                'fnb_course_snapshot',
                'fnb_modifiers_snapshot',
                'fnb_special_instructions',
                'item_discount_snapshot'
            ],
            required: false,
            include: [{ model: dbStore.get('Item'), as: 'item', attributes: ['item_id', 'name', 'sku_code'], required: false }]
        },
        {
            model: dbStore.get('PosTransactionDiscount'),
            as: 'discount',
            attributes: [
                'id',
                'discount_type',
                'discount_method',
                'discount_rate',
                'discount_amount',
                'vat_removed',
                'vat_exempt_amount',
                'customer_name',
                'senior_pwd_id_number',
                'employee_name',
                'employee_id',
                'promo_code',
                'reason'
            ],
            required: false,
            include: [
                { model: dbStore.get('PosTransactionDiscountLine'), as: 'lines', attributes: discountLineAttributes, required: false },
                {
                    model: dbStore.get('PosTransactionDiscountBeneficiary'),
                    as: 'beneficiaries',
                    attributes: ['id', 'category', 'customer_name', 'id_number'],
                    required: false,
                    include: [{ model: dbStore.get('PosTransactionDiscountLine'), as: 'lines', attributes: discountLineAttributes, required: false }]
                }
            ]
        },
        {
            // Refunds are recorded by the canonical POS adjustment ledger.  The
            // former PosTransactionRefund model was retired; keep the response
            // field named `refunds` for the Business Admin API contract while
            // reading only finalized refund adjustments.
            model: dbStore.get('PosTransactionAdjustment'),
            as: 'adjustments',
            where: { adjustment_type: { [Op.in]: ['cash_refund', 'external_refund', 'provider_refund'] } },
            attributes: ['pos_transaction_adjustment_id', 'amount', 'tender_type', 'status', 'reason', 'created_at', 'approved_at', 'completed_at', 'provider_reference', 'external_reference', 'failure_reason'],
            required: false,
            include: [userInclude('originalCashier'), userInclude('approvedByUser'), userInclude('actorUser')]
        }
    );
    return includes;
};

const orderSummary = (row) => ({
    transaction_id: row.pos_transaction_id,
    invoice_number: row.invoice_number,
    created_at: row.created_at,
    source: row.order_source || 'in_store',
    order_method: row.order_method,
    transaction_status: row.status,
    fulfillment_status: row.fulfillment_status,
    payment_type: row.payment_type,
    payment_status: row.payment_status,
    customer_processing_fee_amount: row.customer_processing_fee_amount ?? 0,
    customer_processing_fee_label: row.customer_processing_fee_label_snapshot || null,
    provider_refund_eligible: Boolean(row.payment_session_reference && row.payment_provider),
    total_amount: row.total_amount,
    terminal_id: row.terminal_id,
    customer_name: row.storeCustomer?.name || row.customer_name,
    customer_email: row.storeCustomer?.email || row.customer_email || null,
    customer_phone: row.storeCustomer?.phone || row.customer_phone || null,
    cashier_name: row.cashier?.username || row.acceptedByUser?.username || null,
    branch_id: row.location_id,
    branch_name: row.location?.name || null,
    delivery_status: row.deliveryJob?.status || null,
    tracking_pin: row.tracking_pin || null,
    voided_at: row.voided_at || null,
    voided_by: row.voidedByUser?.username || row.voidedByUser?.email || null,
    void_reason: row.void_reason || null
});

export const buildOrderTimeline = (value, auditRows = []) => {
    const mappedAuditRows = auditRows.map(toPlain).map((entry) => {
        const changes = entry.changes || {};
        const actorName = entry.user?.username || entry.actor_username || 'System';
        if (changes.event === 'online_order_status_changed') {
            return {
                event: 'status_changed',
                from: changes.from || null,
                to: changes.to || null,
                occurred_at: entry.timestamp,
                actor_name: actorName,
                note: changes.reason || entry.reason || null
            };
        }
        return {
            event: String(entry.action || 'updated').toLowerCase(),
            occurred_at: entry.timestamp,
            actor_name: actorName,
            changes
        };
    });
    const rejectedAt = value.rejected_at ? new Date(value.rejected_at).getTime() : null;
    const acceptedAt = value.accepted_at ? new Date(value.accepted_at).getTime() : null;
    return [
        { event: 'order_created', occurred_at: value.created_at, actor_name: value.cashier?.username || 'System' },
        value.accepted_at && acceptedAt !== rejectedAt ? { event: 'order_accepted', occurred_at: value.accepted_at, actor_name: value.acceptedByUser?.username || null } : null,
        value.rejected_at ? { event: 'order_rejected', occurred_at: value.rejected_at, actor_name: value.rejectedByUser?.username || null, note: value.rejection_reason || null } : null,
        value.payment_collected_at ? { event: 'payment_collected', occurred_at: value.payment_collected_at, actor_name: value.paymentCollectedByUser?.username || null } : null,
        value.voided_at ? { event: 'transaction_voided', occurred_at: value.voided_at, actor_name: value.voidedByUser?.username || null, note: value.void_reason || null } : null,
        ...mappedAuditRows
    ].filter(Boolean).sort((left, right) => new Date(left.occurred_at) - new Date(right.occurred_at));
};

export const businessAdminOrderCenterRepository = {
    async listOrders({ filters = {}, allowedLocationIds = null } = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const where = {};
        if (Array.isArray(allowedLocationIds)) where.location_id = { [Op.in]: allowedLocationIds };
        if (filters.branchId) where.location_id = filters.branchId;
        if (filters.terminalId) where.terminal_id = filters.terminalId;
        if (filters.cashierId) where[Op.or] = [{ cashier_id: filters.cashierId }, { accepted_by: filters.cashierId }, { payment_collected_by: filters.cashierId }];
        if (filters.source) where.order_source = filters.source;
        if (filters.paymentType) where.payment_type = filters.paymentType;
        if (filters.paymentStatus) where.payment_status = filters.paymentStatus;
        if (filters.transactionStatus) where.status = filters.transactionStatus;
        if (filters.fulfillmentStatus) where.fulfillment_status = filters.fulfillmentStatus;
        const addReceiptTypeCondition = (condition) => {
            where[Op.and] = [...(where[Op.and] || []), condition];
        };
        if (filters.receiptType === 'sales') {
            addReceiptTypeCondition({ status: 'completed' });
            addReceiptTypeCondition({ payment_status: { [Op.notIn]: REFUND_RELATED_PAYMENT_STATUSES } });
        } else if (filters.receiptType === 'refund') {
            addReceiptTypeCondition({ status: 'completed' });
            addReceiptTypeCondition({ payment_status: { [Op.in]: FINALIZED_REFUND_PAYMENT_STATUSES } });
        } else if (filters.receiptType === 'voided') {
            addReceiptTypeCondition({ status: 'voided' });
        }
        if (filters.endAtExclusive) {
            where.created_at = {};
            if (filters.startAt) where.created_at[Op.gte] = filters.startAt;
            if (filters.endAtExclusive) where.created_at[Op.lt] = filters.endAtExclusive;
        } else if (filters.startAt || filters.endAt) {
            where.created_at = { [Op.between]: [filters.startAt, filters.endAt] };
        }
        if (filters.search) {
            const search = `%${filters.search}%`;
            where[Op.and] = [
                ...(where[Op.and] || []),
                { [Op.or]: [{ invoice_number: { [Op.like]: search } }, { tracking_pin: { [Op.like]: search } }, { customer_name: { [Op.like]: search } }] }
            ];
        }
        if (filters.customerHistoryOnly) {
            where[Op.and] = [
                ...(where[Op.and] || []),
                sequelize.literal(CUSTOMER_HISTORY_SCOPE_SQL)
            ];
        }
        if (filters.customerProfileRef) {
            where[Op.and] = [
                ...(where[Op.and] || []),
                sequelize.where(sequelize.literal(CUSTOMER_PROFILE_REF_SQL), String(filters.customerProfileRef).trim())
            ];
        }

        const { rows, count } = await PosTransaction.findAndCountAll({
            where,
            include: transactionInclude({ itemId: filters.itemId }),
            distinct: true,
            order: [['created_at', 'DESC'], ['pos_transaction_id', 'DESC']],
            limit: filters.limit,
            offset: (filters.page - 1) * filters.limit
        });
        return {
            orders: rows.map(toPlain).map(orderSummary),
            pagination: { page: filters.page, limit: filters.limit, total: count, total_pages: Math.ceil(count / filters.limit) }
        };
    },

    async getOrderDetail(transactionId, { allowedLocationIds = null } = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const where = { pos_transaction_id: transactionId };
        if (Array.isArray(allowedLocationIds)) where.location_id = { [Op.in]: allowedLocationIds };
        const transaction = await PosTransaction.findOne({ where, include: transactionInclude({ detail: true }) });
        if (!transaction) return null;
        const value = toPlain(transaction);
        const AuditLog = dbStore.get('AuditLog');
        const auditRows = AuditLog ? await AuditLog.findAll({
            where: { entity_id: transactionId, entity_type: { [Op.in]: ['pos_transaction', 'pos_order'] } },
            include: [userInclude('user')],
            order: [['timestamp', 'ASC'], ['log_id', 'ASC']]
        }) : [];
        const timeline = buildOrderTimeline(value, auditRows);

        return {
            ...orderSummary(value),
            receipt: {
                document_type: value.document_type,
                document_context: value.document_context,
                invoice_number: value.invoice_number,
                printed_at: value.created_at,
                receipt_contract: buildReceiptContract(value),
                transaction: buildOrderReceiptTransaction(value),
                fiscal_document_snapshot: value.fiscal_document_snapshot || null
            },
            customer: {
                name: value.storeCustomer?.name || value.customer_name,
                phone: value.storeCustomer?.phone || value.customer_phone,
                email: value.storeCustomer?.email || value.customer_email,
                address: value.delivery_address || value.buyer_address || null,
                special_instructions: value.special_instructions || null
            },
            payment: {
                method: value.payment_type,
                status: value.payment_status,
                reference: value.payment_reference || null,
                provider_refund_eligible: Boolean(value.payment_session_reference && value.payment_provider),
                cash_received: value.cash_received,
                change_amount: value.change_amount,
                collected_at: value.payment_collected_at || null,
                collected_by: value.paymentCollectedByUser?.username || null,
                collected_shift_id: value.payment_collected_shift_id || null,
                collected_terminal_id: value.payment_collected_terminal_id || null
            },
            totals: {
                subtotal: value.subtotal_amount,
                discount: value.discount_amount,
                tax: value.vat_amount,
                service_fee: value.service_fee_amount,
                customer_processing_fee: value.customer_processing_fee_amount ?? 0,
                customer_processing_fee_label: value.customer_processing_fee_label_snapshot || null,
                restaurant_charge: value.restaurant_service_charge_amount,
                delivery_fee: value.delivery_fee,
                total: value.total_amount
            },
            branch: value.location ? { branch_id: value.location.location_id, name: value.location.name, address: value.location.address_line || null } : null,
            terminal: value.terminal_id || value.shift?.terminal_id || null,
            cashier: value.cashier?.username || value.acceptedByUser?.username || null,
            delivery: value.deliveryJob || null,
            discount: value.discount || null,
            lines: (value.lines || []).map((line) => ({
                line_id: line.line_id,
                item_name: line.item?.name || `Item #${line.item_id}`,
                sku_code: line.item?.sku_code || null,
                quantity: line.quantity,
                unit_price: line.sale_price,
                subtotal: line.line_subtotal,
                modifiers: line.fnb_modifiers_snapshot || [],
                notes: line.fnb_special_instructions || null
            })),
            refunds: (value.adjustments || []).map((refund) => ({
                refund_id: refund.pos_transaction_adjustment_id,
                amount: refund.amount,
                method: refund.tender_type,
                status: refund.status,
                reason: refund.reason,
                requested_at: refund.created_at,
                approved_at: refund.approved_at,
                executed_at: refund.completed_at,
                requested_by: refund.originalCashier?.username || refund.actorUser?.username || null,
                approved_by: refund.approvedByUser?.username || null,
                executed_by: refund.actorUser?.username || null,
                provider_reference: refund.provider_reference || null,
                external_reference: refund.external_reference || null,
                failure_details: refund.failure_reason || null
            })),
            status_history: timeline
        };
    }
};

const buildReceiptContract = (value) => ({
    version: value.fiscal_document_template_version || null,
    document_type: value.document_type,
    document_context: value.document_context,
    label: value.document_type === 'fiscal_invoice' ? 'FISCAL INVOICE' : 'NON-FISCAL SLIP'
});

export const buildOrderReceiptTransaction = (value = {}) => ({
    pos_transaction_id: value.pos_transaction_id,
    invoice_number: value.invoice_number,
    document_type: value.document_type,
    document_context: value.document_context,
    created_at: value.created_at,
    terminal_id: value.terminal_id || value.shift?.terminal_id || null,
    cashier: value.cashier ? { username: value.cashier.username || null } : null,
    customer_name: value.storeCustomer?.name || value.customer_name || null,
    customer_phone: value.storeCustomer?.phone || value.customer_phone || null,
    customer_email: value.storeCustomer?.email || value.customer_email || null,
    buyer_name: value.storeCustomer?.name || value.customer_name || null,
    buyer_tin: value.buyer_tin || null,
    buyer_business_style: value.buyer_business_style || null,
    buyer_address: value.buyer_address || value.delivery_address || null,
    payment_type: value.payment_type,
    payment_status: value.payment_status,
    payment_reference: value.payment_reference || null,
    payment_breakdown: value.payment_breakdown || null,
    cash_received: value.cash_received,
    change_amount: value.change_amount,
    employee_credit_employee_name_snapshot: value.employee_credit_employee_name_snapshot || null,
    employee_credit_account_code_snapshot: value.employee_credit_account_code_snapshot || null,
    employee_credit_amount: value.employee_credit_amount,
    employee_credit_balance_after: value.employee_credit_balance_after,
    employee_credit_authorization_reference: value.employee_credit_authorization_reference || null,
    subtotal_amount: value.subtotal_amount,
    vatable_sales: value.vatable_sales,
    vat_amount: value.vat_amount,
    vat_exempt_sales: value.vat_exempt_sales,
    zero_rated_sales: value.zero_rated_sales,
    discount_amount: value.discount_amount,
    discount_label_snapshot: value.discount_label_snapshot || null,
    discount_rate_snapshot: value.discount_rate_snapshot,
    service_fee_amount: value.service_fee_amount,
    service_fee_label_snapshot: value.service_fee_label_snapshot || null,
    service_fee_method_snapshot: value.service_fee_method_snapshot || null,
    customer_processing_fee_amount: value.customer_processing_fee_amount ?? 0,
    customer_processing_fee_label_snapshot: value.customer_processing_fee_label_snapshot || null,
    customer_processing_fee_breakdown: value.customer_processing_fee_breakdown || null,
    restaurant_service_charge_amount: value.restaurant_service_charge_amount,
    restaurant_service_charge_label_snapshot: value.restaurant_service_charge_label_snapshot || null,
    restaurant_service_charge_rate_snapshot: value.restaurant_service_charge_rate_snapshot,
    delivery_fee: value.delivery_fee,
    total_amount: value.total_amount,
    fnb_check_id: value.fnb_check_id || null,
    fnb_table_label_snapshot: value.fnb_table_label_snapshot || null,
    fnb_guest_count: value.fnb_guest_count || null,
    discount: value.discount || null,
    lines: (value.lines || []).map((line) => ({
        ...line,
        item: line.item
            ? {
                item_id: line.item.item_id,
                name: line.item_name_snapshot || line.item.name || `Item #${line.item_id}`,
                sku_code: line.sku_snapshot || line.item.sku_code || null
            }
            : {
                item_id: line.item_id,
                name: line.item_name_snapshot || `Item #${line.item_id}`,
                sku_code: line.sku_snapshot || null
            }
    })),
    status: value.status,
    voided_at: value.voided_at || null,
    voided_by: value.voidedByUser?.username || null,
    void_reason: value.void_reason || null,
    fiscal_lifecycle_state: value.fiscal_lifecycle_state || null,
    fiscal_document_template_version: value.fiscal_document_template_version || null
});

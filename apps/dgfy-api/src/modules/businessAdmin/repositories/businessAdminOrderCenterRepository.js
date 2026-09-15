import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => (value && typeof value.toJSON === 'function' ? value.toJSON() : value);

const userInclude = (as) => ({
    model: dbStore.get('User'),
    as,
    attributes: ['user_id', 'username', 'email'],
    required: false
});

const transactionInclude = ({ detail = false } = {}) => {
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
    if (!detail) return includes;

    includes.push(
        {
            model: dbStore.get('PosTransactionLine'),
            as: 'lines',
            attributes: ['line_id', 'item_id', 'quantity', 'unit_of_measure', 'sale_price', 'line_subtotal', 'vat_type_snapshot', 'fnb_modifiers_snapshot', 'fnb_special_instructions'],
            required: false,
            include: [{ model: dbStore.get('Item'), as: 'item', attributes: ['item_id', 'name', 'sku_code'], required: false }]
        },
        {
            model: dbStore.get('PosTransactionDiscount'),
            as: 'discount',
            attributes: ['id', 'discount_type', 'discount_method', 'discount_amount', 'discount_rate', 'promo_code', 'customer_name'],
            required: false
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
    provider_refund_eligible: Boolean(row.payment_session_reference && row.payment_provider),
    total_amount: row.total_amount,
    terminal_id: row.terminal_id,
    customer_name: row.customer_name,
    cashier_name: row.cashier?.username || row.acceptedByUser?.username || null,
    branch_id: row.location_id,
    branch_name: row.location?.name || null,
    delivery_status: row.deliveryJob?.status || null,
    tracking_pin: row.tracking_pin || null,
    voided_at: row.voided_at || null
});

export const businessAdminOrderCenterRepository = {
    async listOrders({ filters = {}, allowedLocationIds = null } = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
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
        if (filters.startAt || filters.endAt) where.created_at = { [Op.between]: [filters.startAt, filters.endAt] };
        if (filters.search) {
            const search = `%${filters.search}%`;
            where[Op.and] = [
                ...(where[Op.and] || []),
                { [Op.or]: [{ invoice_number: { [Op.like]: search } }, { tracking_pin: { [Op.like]: search } }, { customer_name: { [Op.like]: search } }] }
            ];
        }

        const { rows, count } = await PosTransaction.findAndCountAll({
            where,
            include: transactionInclude(),
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
        const timeline = [
            { event: 'order_created', occurred_at: value.created_at, actor_name: value.cashier?.username || 'System' },
            value.accepted_at ? { event: 'order_accepted', occurred_at: value.accepted_at, actor_name: value.acceptedByUser?.username || null } : null,
            value.payment_collected_at ? { event: 'payment_collected', occurred_at: value.payment_collected_at, actor_name: value.paymentCollectedByUser?.username || null } : null,
            value.voided_at ? { event: 'transaction_voided', occurred_at: value.voided_at, actor_name: value.voidedByUser?.username || null, note: value.void_reason || null } : null,
            ...auditRows.map(toPlain).map((entry) => ({ event: String(entry.action || 'updated').toLowerCase(), occurred_at: entry.timestamp, actor_name: entry.user?.username || 'System', changes: entry.changes || null }))
        ].filter(Boolean).sort((left, right) => new Date(left.occurred_at) - new Date(right.occurred_at));

        return {
            ...orderSummary(value),
            receipt: {
                document_type: value.document_type,
                document_context: value.document_context,
                invoice_number: value.invoice_number,
                printed_at: value.created_at
            },
            customer: {
                name: value.customer_name,
                phone: value.customer_phone,
                email: value.customer_email,
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

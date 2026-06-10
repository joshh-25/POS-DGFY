import { dgfyCustomerRepository } from '../repositories/dgfyCustomerRepository.js';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeReference = (value) => String(value || '').trim().toUpperCase();

const orderLineSnapshot = (order = {}) => (
    Array.isArray(order.lines)
        ? order.lines.map((line) => ({
            item_id: Number(line.item_id || line.item?.item_id || 0) || null,
            name: line.item_name_snapshot || line.name || line.item?.name || 'Item',
            quantity: Number(line.quantity || 0),
            price: Number(line.unit_price || line.price || line.unit_price_snapshot || line.sale_price || 0),
            unit_of_measure: line.item?.unit_of_measure || line.unit_of_measure || ''
        })).filter((line) => line.item_id)
        : null
);

export const recordDgfyOrderActivity = async ({ tenantId, order, storeCustomer = null } = {}) => {
    const reference = normalizeReference(order?.tracking_pin);
    if (!tenantId || !reference || !order) return null;

    const tenant = await dgfyCustomerRepository.findTenantById(tenantId).catch(() => null);
    const email = normalizeEmail(order.customer_email || storeCustomer?.email);
    const account = storeCustomer?.dgfy_account_id
        ? { id: storeCustomer.dgfy_account_id }
        : null;
    const lines = orderLineSnapshot(order);
    const totalAmount = Number(order.total_amount ?? order.grand_total ?? 0);

    const activity = await dgfyCustomerRepository.upsertActivity({
        dgfy_account_id: account?.id || null,
        tenant_id: tenantId,
        store_customer_id: storeCustomer?.customer_id || order.store_customer_id || null,
        activity_type: 'order',
        reference,
        store_slug: tenant?.company_token || null,
        store_name: tenant?.name || null,
        status: order.fulfillment_status || order.status || null,
        status_label: order.status_label || null,
        payment_status: order.payment_status || order.payment_type || null,
        total_amount: Number.isFinite(totalAmount) ? totalAmount : null,
        customer_email: email || null,
        customer_phone: order.customer_phone || storeCustomer?.phone || null,
        display_snapshot: {
            order_id: order.pos_transaction_id || null,
            order_method: order.order_method || null,
            receipt_number: order.invoice_number || order.receipt_number || null,
            delivery_address: order.delivery_address || null,
            scheduled_for: order.scheduled_for || null,
            ...(lines ? { lines } : {})
        },
        occurred_at: order.created_at || new Date()
    });

    if (activity?.dgfy_account_id && activity.status === 'completed') {
        const points = Math.floor(Number(activity.total_amount || 0) / 100);
        await dgfyCustomerRepository.createLoyaltyIfMissing({
            dgfyAccountId: activity.dgfy_account_id,
            tenantId,
            activityId: activity.activity_id,
            reference,
            pointsDelta: points,
            reason: 'completed_order'
        }).catch(() => null);
    }

    return activity;
};

export default {
    recordDgfyOrderActivity
};

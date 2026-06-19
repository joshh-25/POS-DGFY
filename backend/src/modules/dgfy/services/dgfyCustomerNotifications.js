import logger from '../../../config/logger.js';
import { dgfyCustomerRepository } from '../repositories/dgfyCustomerRepository.js';
import { publishDgfyCustomerEvent } from './dgfyCustomerEventBus.js';

const STATUS_COPY = {
    placed: ['Order placed', 'Your order was received by the store.'],
    confirmed: ['Order confirmed', 'The store confirmed your order.'],
    preparing: ['Order preparing', 'The store is preparing your order.'],
    ready_for_pickup: ['Ready for pickup', 'Your order is ready for pickup.'],
    out_for_delivery: ['Out for delivery', 'Your order is on the way.'],
    delivered: ['Order delivered', 'Your delivery was completed.'],
    picked_up: ['Order picked up', 'Your pickup order was completed.'],
    completed: ['Order completed', 'Your order was completed.'],
    cancelled: ['Order cancelled', 'Your order was cancelled.'],
    rejected: ['Order rejected', 'The store rejected your order.']
};

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();
const normalizeReference = (value) => String(value || '').trim().toUpperCase();

export const buildOrderStatusNotificationPayload = (activity = {}) => {
    const dgfyAccountId = String(activity.dgfy_account_id || '').trim();
    const reference = normalizeReference(activity.reference);
    const status = normalizeStatus(activity.status);
    if (!dgfyAccountId || !reference || !status) return null;

    const [title, body] = STATUS_COPY[status] || [
        'Order updated',
        `Your order status is now ${String(activity.status_label || status).replace(/_/g, ' ')}.`
    ];

    const eventKeyBase = activity.activity_id || `${activity.tenant_id || 'tenant'}:${reference}`;
    return {
        dgfy_account_id: dgfyAccountId,
        tenant_id: activity.tenant_id || null,
        activity_id: activity.activity_id || null,
        reference,
        event_key: `order:${eventKeyBase}:${status}`,
        type: 'order_status',
        title,
        body,
        status
    };
};

export const dispatchDgfyCustomerActivityUpdate = async (activity = {}) => {
    const accountId = String(activity?.dgfy_account_id || '').trim();
    if (!accountId) return { notification: null, published: false };

    publishDgfyCustomerEvent(accountId, 'activity.updated', { activity });

    const payload = buildOrderStatusNotificationPayload(activity);
    if (!payload) return { notification: null, published: true };

    try {
        const result = await dgfyCustomerRepository.createNotificationIfMissing(payload);
        if (result?.created && result.notification) {
            publishDgfyCustomerEvent(accountId, 'notification.created', {
                notification: result.notification
            });
        }
        return { notification: result?.notification || null, published: true };
    } catch (error) {
        logger.warn('[DGFY] Customer notification dispatch failed', {
            error: error?.message,
            reference: activity.reference || null,
            activity_id: activity.activity_id || null
        });
        return { notification: null, published: true };
    }
};

export default {
    buildOrderStatusNotificationPayload,
    dispatchDgfyCustomerActivityUpdate
};

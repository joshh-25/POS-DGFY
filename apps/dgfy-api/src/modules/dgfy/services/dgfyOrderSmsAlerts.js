import logger from '../../../config/logger.js';
import { dgfyCustomerRepository } from '../repositories/dgfyCustomerRepository.js';
import { raiseSmsOperationalAlert, sendSmsUseCase, toE164 } from '../../smsDelivery/index.js';

const SMS_ALERT_TIMEOUT_MS = 5_000;
const normalizeStoreName = (value) => {
    const safe = String(value || '').replace(/[^A-Za-z0-9 &'.-]/g, '').trim().slice(0, 40);
    return safe || 'DGFY';
};
const ALERT_COPY = {
    placed: (storeName, orderReference) => `${storeName}: we received your order ${orderReference}.`,
    delivered: (storeName, orderReference) => `${storeName}: your order ${orderReference} was delivered.`
};

const reportFailure = (error, event, posTransactionId) => {
    try {
        logger.warn('[DGFY] Order SMS alert dispatch failed', {
            error: error?.message,
            event,
            pos_transaction_id: posTransactionId || null
        });
    } catch { /* Reporting must never change the order result. */ }
    void Promise.resolve().then(() => raiseSmsOperationalAlert({
        key: 'sms.order_alert_dispatch_failed',
        context: { event }
    })).catch(() => {});
};

/** Best-effort transactional alert; never lets SMS failures escape into an order flow. */
export const dispatchDgfyOrderSmsAlert = async ({
    tenantId,
    order,
    storeCustomer = null,
    event
} = {}) => {
    const posTransactionId = order?.pos_transaction_id || null;
    let timeoutId;
    try {
        if (!['placed', 'delivered'].includes(event)) return { sent: false, skipped: 'unsupported_event' };
        if (!tenantId || !posTransactionId) return { sent: false, skipped: 'missing_order_context' };

        const phone = order?.customer_phone || storeCustomer?.phone;
        const normalizedPhone = toE164(phone);
        if (!normalizedPhone.ok) return { sent: false, skipped: 'no_usable_phone' };

        const work = (async () => {
            const tenant = await dgfyCustomerRepository.findTenantById(tenantId);
            const storeName = normalizeStoreName(tenant?.name);
            const orderReference = String(order?.tracking_pin || '').replace(/[^A-Za-z0-9-]/g, '').trim().slice(0, 32);
            if (!orderReference) return { sent: false, skipped: 'missing_order_reference' };

            const result = await sendSmsUseCase({
                recipients: [normalizedPhone.e164],
                purpose: 'transactional_order',
                content: ALERT_COPY[event](storeName, orderReference),
                tenantId,
                orderId: null,
                correlation: {
                    event,
                    tenant_id: tenantId,
                    pos_transaction_id: posTransactionId
                },
                dedupeKey: `order-alert:${tenantId}:${posTransactionId}:${event}`
            });
            return {
                sent: result?.deliveries?.some((delivery) => delivery.status === 'accepted') || false,
                status: result?.status
            };
        })();

        const timeout = new Promise((resolve) => {
            timeoutId = setTimeout(() => resolve({ timedOut: true }), SMS_ALERT_TIMEOUT_MS);
        });
        const result = await Promise.race([work, timeout]);
        if (result?.timedOut) {
            reportFailure(new Error('Order SMS alert dispatch timed out'), event, posTransactionId);
            return { sent: false, skipped: 'timeout' };
        }
        return result;
    } catch (error) {
        reportFailure(error, event, posTransactionId);
        return { sent: false, skipped: 'dispatch_failed' };
    } finally {
        clearTimeout(timeoutId);
    }
};

export default dispatchDgfyOrderSmsAlert;

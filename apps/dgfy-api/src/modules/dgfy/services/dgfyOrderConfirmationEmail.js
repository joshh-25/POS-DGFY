import logger from '../../../config/logger.js';
import { isEmailConfigured, sendStorefrontOrderConfirmationEmail } from '../../../services/emailService.js';
import { raiseOperationalAlert } from '../../../services/operationalAlertService.js';
import { dgfyCustomerRepository } from '../repositories/dgfyCustomerRepository.js';
import { buildStorefrontTrackingUrl } from './storefrontOrderTrackingUrl.js';

const DISPATCH_TIMEOUT_MS = 10_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const normalizeStoreName = (value) => {
    const safe = String(value || '').replace(/[^A-Za-z0-9 &'.-]/g, '').trim().slice(0, 40);
    return safe || 'DGFY';
};

const reportPreSendFailure = (error, posTransactionId) => {
    try {
        logger.warn('[DGFY] Order confirmation email dispatch failed before send', {
            error_code: error?.code || 'ORDER_CONFIRMATION_PRE_SEND_FAILED',
            pos_transaction_id: posTransactionId || null
        });
    } catch { /* Reporting must never change the order result. */ }
    void Promise.resolve().then(() => raiseOperationalAlert({
        key: 'email.order_confirmation_dispatch_failed',
        context: { event: 'placed' }
    })).catch(() => {});
};

const reportSendFailure = (error, posTransactionId) => {
    try {
        logger.warn('[DGFY] Order confirmation email send failed', {
            error_code: error?.code || 'EMAIL_SEND_FAILED',
            pos_transaction_id: posTransactionId || null
        });
    } catch { /* Reporting must never change the order result. */ }
};

/** Best-effort transactional email; never lets delivery failures escape into checkout. */
export const dispatchDgfyOrderConfirmationEmail = async ({
    tenantId,
    order,
    storeCustomer = null
} = {}) => {
    const posTransactionId = order?.pos_transaction_id || null;
    let timeoutId;

    try {
        if (!tenantId || !posTransactionId || !order) {
            return { sent: false, skipped: 'missing_order_context' };
        }
        if (process.env.STOREFRONT_ORDER_CONFIRMATION_EMAIL_ENABLED === 'false') {
            return { sent: false, skipped: 'disabled' };
        }
        if (!isEmailConfigured()) {
            logger.debug('[DGFY] Order confirmation email skipped: SMTP is not configured', {
                pos_transaction_id: posTransactionId
            });
            return { sent: false, skipped: 'email_not_configured' };
        }

        const email = normalizeEmail(order.customer_email || storeCustomer?.email);
        if (!EMAIL_PATTERN.test(email)) {
            logger.info('[DGFY] Order confirmation email skipped: no usable customer email', {
                pos_transaction_id: posTransactionId
            });
            return { sent: false, skipped: 'no_usable_email' };
        }

        let sendStarted = false;
        const work = (async () => {
            try {
                const tenant = await dgfyCustomerRepository.findTenantById(tenantId);
                const storeName = normalizeStoreName(tenant?.name);
                const trackingUrl = await buildStorefrontTrackingUrl({
                    tenantId,
                    trackingPin: order.tracking_pin
                });
                sendStarted = true;
                const result = await sendStorefrontOrderConfirmationEmail({
                    email,
                    storeName,
                    order,
                    trackingUrl,
                    tenantId
                });
                return { sent: true, deliveryId: result?.deliveryId || null };
            } catch (error) {
                if (sendStarted && !error?.orderConfirmationTemplateFailed) {
                    reportSendFailure(error, posTransactionId);
                } else {
                    reportPreSendFailure(error, posTransactionId);
                }
                return { sent: false, skipped: 'dispatch_failed' };
            }
        })();

        const timeout = new Promise((resolve) => {
            timeoutId = setTimeout(() => resolve({ timedOut: true }), DISPATCH_TIMEOUT_MS);
        });
        const result = await Promise.race([work, timeout]);
        if (result?.timedOut) {
            reportPreSendFailure(Object.assign(new Error('Order confirmation email dispatch timed out'), {
                code: 'ORDER_CONFIRMATION_DISPATCH_TIMEOUT'
            }), posTransactionId);
            return { sent: false, skipped: 'timeout' };
        }
        return result;
    } catch (error) {
        reportPreSendFailure(error, posTransactionId);
        return { sent: false, skipped: 'dispatch_failed' };
    } finally {
        clearTimeout(timeoutId);
    }
};

export default dispatchDgfyOrderConfirmationEmail;

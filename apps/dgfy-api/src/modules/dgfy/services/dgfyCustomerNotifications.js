import logger from '../../../config/logger.js';
import { dgfyCustomerRepository } from '../repositories/dgfyCustomerRepository.js';
import { publishDgfyCustomerEvent } from './dgfyCustomerEventBus.js';
import { dispatchAccountOrderStatusPush } from '../../pushDelivery/index.js';
import { STATUS_COPY } from '../../pushDelivery/utils/orderStatusCopy.js';

export { STATUS_COPY };

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();
const normalizeReference = (value) => String(value || '').trim().toUpperCase();

export const buildCompanyRegistrationRejectionNotificationPayload = ({
    dgfyAccountId,
    tenantId = null,
    applicationId,
    companyName,
    rejectionReason
} = {}) => {
    const accountId = String(dgfyAccountId || '').trim();
    const registrationId = String(applicationId || '').trim();
    if (!accountId || !registrationId) return null;

    const safeCompanyName = String(companyName || '').trim() || 'Your company';
    const safeReason = String(rejectionReason || '').trim().slice(0, 400);
    const body = safeReason
        ? `${safeCompanyName} registration was rejected. Reason: ${safeReason}`
        : `${safeCompanyName} registration was rejected.`;

    return {
        dgfy_account_id: accountId,
        tenant_id: tenantId || null,
        activity_id: null,
        reference: null,
        event_key: `company-registration:${registrationId}:rejected`,
        type: 'company_registration',
        title: 'Company registration rejected',
        body: body.slice(0, 500),
        status: 'rejected'
    };
};

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
        if (result?.created) {
            void dispatchAccountOrderStatusPush(activity, { eventKey: payload.event_key, created: true }).catch(() => null);
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

export const dispatchDgfyCompanyRegistrationRejectionNotification = async (input = {}) => {
    const payload = buildCompanyRegistrationRejectionNotificationPayload(input);
    if (!payload) return { notification: null, created: false, published: false };

    try {
        const result = await dgfyCustomerRepository.createNotificationIfMissing(payload);
        if (result?.created && result.notification) {
            publishDgfyCustomerEvent(payload.dgfy_account_id, 'notification.created', {
                notification: result.notification
            });
        }
        return {
            notification: result?.notification || null,
            created: Boolean(result?.created),
            published: true
        };
    } catch (error) {
        logger.warn('[DGFY] Company registration rejection notification dispatch failed', {
            error: error?.message,
            application_id: input.applicationId || null,
            dgfy_account_id: input.dgfyAccountId || null
        });
        return { notification: null, created: false, published: true };
    }
};

export const ensureDgfyCompanyRegistrationRejectionNotifications = async ({
    accountId,
    applications = []
} = {}) => {
    const rejectedApplications = (Array.isArray(applications) ? applications : [])
        .filter((application) => String(application?.review_status || '').trim().toLowerCase() === 'rejected');

    return Promise.all(rejectedApplications.map((application) => dispatchDgfyCompanyRegistrationRejectionNotification({
        dgfyAccountId: accountId || application?.dgfy_account_id,
        tenantId: application?.tenant_id || application?.tenant?.id || null,
        applicationId: application?.id,
        companyName: application?.tenant?.name,
        rejectionReason: application?.tenant?.rejection_reason
    })));
};

export default {
    buildOrderStatusNotificationPayload,
    dispatchDgfyCustomerActivityUpdate,
    buildCompanyRegistrationRejectionNotificationPayload,
    dispatchDgfyCompanyRegistrationRejectionNotification,
    ensureDgfyCompanyRegistrationRejectionNotifications
};

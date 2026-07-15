import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// handleWebhookUseCases.js — Phase 10 Plan 08 Task 1 (STF-05, D-04). The
// signature-verified PayMongo webhook event router. Mirrors the shape of
// backend/src/modules/commercePayments/usecases/
// handlePayMongoCommerceWebhookUseCase.js (READ-ONLY reference), reduced to
// the four event categories this phase's threat register (T-10-08-01..07)
// actually requires: payment.paid (Task 2's finalizePaidOrder),
// payment.failed / qrph.expired (release + terminal status), and
// account.*/refund.* (acknowledged and ignored — D-02/D-03, this phase has
// no split/refund surface).
//
// CRITICAL ORDERING (Pitfall 1): verifyWebhookSignature is called FIRST,
// against the RAW body — before any body parsing beyond what the caller
// already did to extract eventType, before any DB read, before ANY side
// effect. An invalid/stale signature returns a 401 DomainError and this
// function does absolutely nothing else.

const signatureError = () => new DomainError(
    DomainErrorCode.AUTHENTICATION_FAILED,
    'Invalid or missing PayMongo webhook signature.',
    { statusCode: 401, details: { error_code: 'PAYMONGO_WEBHOOK_SIGNATURE_INVALID' } }
);

const toPlain = (value) => (value?.get ? value.get({ plain: true }) : value);

const getEventType = (body = {}) => body?.data?.attributes?.type || body?.type || '';
const getEventId = (body = {}, headers = {}) => (
    body?.data?.id || body?.id || headers['paymongo-event-id'] || headers['x-paymongo-event-id'] || null
);
const getEventResource = (body = {}) => body?.data?.attributes?.data || body?.data || {};
const getAttributes = (resource = {}) => resource?.attributes || resource || {};
const getSessionReference = (resource = {}) => getAttributes(resource)?.metadata?.commerce_payment_session || null;
const getPaymentIntentId = (resource = {}) => {
    const attrs = getAttributes(resource);
    if (attrs.payment_intent_id) return attrs.payment_intent_id;
    if (attrs.payment_intent?.id) return attrs.payment_intent.id;
    return String(resource?.id || '').startsWith('pi_') ? resource.id : null;
};
const getPaymentId = (resource = {}) => {
    const attrs = getAttributes(resource);
    const candidate = resource?.id || attrs.payment_id || attrs.payment?.id;
    return String(candidate || '').startsWith('pay_') ? candidate : null;
};

// account.*/refund.* — no split/refund surface exists in this phase (D-02
// platform-fee split is deliberately excised, D-03 has no refund scope) —
// acknowledged (200) and ignored, never acted upon.
const IGNORED_EVENT_TYPES = new Set([
    'account.activated', 'account.declined', 'merchant.activated', 'merchant.declined',
    'consumer.activated', 'consumer.declined',
    'payment.refunded', 'payment.refund.updated'
]);

/**
 * @param {{
 *   verifyWebhookSignature: Function,
 *   findSessionByPublicReference: Function,
 *   findSessionByProviderPaymentIntent: Function,
 *   findSessionByProviderPayment: Function,
 *   updateSessionStatus: Function,
 *   orderRepository: Object,
 *   releaseReservation: Function,
 *   finalizePaidOrder: Function
 * }} deps
 * @returns {Function} async (input: {rawBody, signatureHeader, body, headers?}) => Promise<ApplicationResult>
 */
export function buildHandleWebhookUseCase({
    verifyWebhookSignature,
    findSessionByPublicReference,
    findSessionByProviderPaymentIntent,
    findSessionByProviderPayment,
    updateSessionStatus,
    orderRepository,
    releaseReservation,
    finalizePaidOrder
} = {}) {
    if (typeof verifyWebhookSignature !== 'function') {
        throw new Error('buildHandleWebhookUseCase requires a verifyWebhookSignature function.');
    }
    if (typeof findSessionByPublicReference !== 'function' || typeof findSessionByProviderPaymentIntent !== 'function' || typeof findSessionByProviderPayment !== 'function') {
        throw new Error('buildHandleWebhookUseCase requires the three session-resolution functions.');
    }
    if (typeof updateSessionStatus !== 'function') {
        throw new Error('buildHandleWebhookUseCase requires an updateSessionStatus function.');
    }
    if (!orderRepository) {
        throw new Error('buildHandleWebhookUseCase requires an orderRepository.');
    }
    if (typeof releaseReservation !== 'function') {
        throw new Error('buildHandleWebhookUseCase requires a releaseReservation function.');
    }
    if (typeof finalizePaidOrder !== 'function') {
        throw new Error('buildHandleWebhookUseCase requires a finalizePaidOrder function.');
    }

    // Session resolution order (Pattern 1, 10-RESEARCH.md): metadata
    // reference -> provider_payment_intent_id -> provider_payment_id.
    const resolveSession = async (resource) => {
        const sessionReference = getSessionReference(resource);
        if (sessionReference) {
            const byReference = await findSessionByPublicReference(sessionReference);
            if (byReference) return byReference;
        }
        const paymentIntentId = getPaymentIntentId(resource);
        if (paymentIntentId) {
            const byIntent = await findSessionByProviderPaymentIntent(paymentIntentId);
            if (byIntent) return byIntent;
        }
        const paymentId = getPaymentId(resource);
        if (paymentId) {
            const byPayment = await findSessionByProviderPayment(paymentId);
            if (byPayment) return byPayment;
        }
        return null;
    };

    // payment.failed / qrph.expired: release the tenant stock hold (D-09
    // no-manual-step) and move BOTH the landlord order and session to the
    // terminal status. Never throws on a release failure (best-effort —
    // the fallback hold-TTL from 10-06 still reclaims the stock eventually).
    const releaseAndMark = async (session, status, reason) => {
        const order = await orderRepository.findById(session.storefront_order_id);
        if (order) {
            try {
                await releaseReservation(order.tenant_id, order.public_reference);
            } catch (releaseError) {
                // eslint-disable-next-line no-console
                console.warn('[commercePayments webhook] releaseReservation failed; fallback hold-TTL will reclaim stock.', releaseError);
            }
            try {
                await orderRepository.updateOrder(order.id, { status });
            } catch (updateError) {
                // eslint-disable-next-line no-console
                console.warn('[commercePayments webhook] failed to update order status.', updateError);
            }
        }
        await updateSessionStatus(session.id, { status, manual_resolution_reason: null, failure_reason: reason });
    };

    return async ({ rawBody = '', signatureHeader = '', body = {}, headers = {} } = {}) => {
        // Signature gate FIRST — no DB work happens before this returns true.
        const verified = verifyWebhookSignature({ rawBody, signatureHeader });
        if (!verified) {
            return ApplicationResult.failure(signatureError());
        }

        const eventType = getEventType(body);
        const providerEventId = getEventId(body, headers);
        const resource = toPlain(getEventResource(body));

        if (IGNORED_EVENT_TYPES.has(eventType)) {
            return ApplicationResult.success({ handled: false, reason: 'event_type_ignored', event_type: eventType });
        }

        const session = await resolveSession(resource);
        if (!session) {
            return ApplicationResult.success({ handled: false, reason: 'session_not_found', event_type: eventType });
        }

        if (eventType === 'payment.paid') {
            const finalizeResult = await finalizePaidOrder({ session, resource, providerEventId });
            if (finalizeResult.isFailure) return finalizeResult;
            return ApplicationResult.success({
                handled: true,
                status: finalizeResult.data.status,
                payment_session: session.public_reference
            });
        }

        if (eventType === 'payment.failed') {
            await releaseAndMark(session, 'failed', getAttributes(resource)?.failed_message || 'PayMongo reported payment failure.');
            return ApplicationResult.success({ handled: true, status: 'failed', payment_session: session.public_reference });
        }

        if (eventType === 'qrph.expired') {
            await releaseAndMark(session, 'expired', 'PayMongo QR Ph code expired before payment.');
            return ApplicationResult.success({ handled: true, status: 'expired', payment_session: session.public_reference });
        }

        // Any other verified-but-unhandled event type: acknowledge, do nothing.
        return ApplicationResult.success({ handled: false, reason: 'event_type_ignored', event_type: eventType });
    };
}

export default buildHandleWebhookUseCase;

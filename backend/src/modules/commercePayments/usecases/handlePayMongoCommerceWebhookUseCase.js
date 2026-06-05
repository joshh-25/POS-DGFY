import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
  finalizePaidCommerceSession,
  getPaymentIdFromPayMongoResource
} from './finalizePaidCommerceSession.js';
import { reconcileRefundedPaymentState } from './commercePaymentAdminUseCases.js';

const toPlain = (value) => (value?.get ? value.get({ plain: true }) : value);

const getEventType = (body = {}) => (
  body?.data?.attributes?.type
  || body?.type
  || body?.event
  || ''
);

const getEventId = (body = {}, headers = {}) => (
  body?.data?.id
  || body?.id
  || headers['paymongo-event-id']
  || headers['x-paymongo-event-id']
  || null
);

const getEventResource = (body = {}) => (
  body?.data?.attributes?.data
  || body?.resource
  || body?.data
  || {}
);

const getAttributes = (resource = {}) => resource?.attributes || resource || {};

const getPaymentIntentId = (resource = {}) => {
  const attrs = getAttributes(resource);
  return attrs.payment_intent_id
    || attrs.payment_intent?.id
    || attrs.payment_intent
    || resource?.id
    || null;
};

const getPaymentId = getPaymentIdFromPayMongoResource;

const getRefundId = (resource = {}) => {
  const attrs = getAttributes(resource);
  return String(resource?.id || attrs?.refund_id || attrs?.refund?.id || '').startsWith('ref_')
    ? (resource?.id || attrs?.refund_id || attrs?.refund?.id)
    : null;
};

const getSessionReference = (resource = {}) => {
  const attrs = getAttributes(resource);
  return attrs.metadata?.commerce_payment_session
    || attrs.metadata?.payment_session
    || attrs.payment_intent?.metadata?.commerce_payment_session
    || null;
};

export const buildHandlePayMongoCommerceWebhookUseCase = ({
  commercePaymentRepository,
  paymongoService,
  logger
}) => {
  const handleRefundEvent = async ({ resource, providerEventId }) => {
    const refundId = getRefundId(resource);
    const refund = refundId ? await commercePaymentRepository.findRefundByProviderId(refundId) : null;
    if (!refund) {
      logger?.warn?.('PayMongo commerce refund webhook ignored: refund not found', {
        providerEventId,
        refundId
      });
      return ok({ handled: false, status: 'refund_not_found' });
    }

    const session = await commercePaymentRepository.findSessionBySessionId(refund.payment_session_id);
    if (!session) {
      logger?.warn?.('PayMongo commerce refund webhook ignored: refund session not found', {
        providerEventId,
        refundId,
        paymentSessionId: refund.payment_session_id
      });
      return ok({ handled: false, status: 'refund_session_not_found' });
    }

    const attrs = getAttributes(resource);
    const providerStatus = String(attrs.status || '').toLowerCase();
    const status = ['succeeded', 'success', 'refunded'].includes(providerStatus)
      ? 'succeeded'
      : (['failed', 'cancelled', 'canceled'].includes(providerStatus) ? 'failed' : 'pending');
    await commercePaymentRepository.updateRefundById(refund.refund_id, {
      status,
      provider_payload: resource,
      failure_code: status === 'failed' ? 'PROVIDER_REFUND_FAILED' : null,
      failure_reason: status === 'failed' ? (attrs.failed_message || 'PayMongo reported refund failure.') : null
    });
    const updatedSession = await reconcileRefundedPaymentState({ commercePaymentRepository, session });
    await commercePaymentRepository.createAuditLog?.({
      user_id: null,
      entity_type: 'CommercePayment',
      entity_id: refund.refund_id,
      action: 'UPDATE',
      changes: {
        event: 'commerce_payment_refund_webhook_reconciled',
        provider_event_id: providerEventId,
        refund_reference: refund.public_reference,
        provider_refund_id: refundId,
        provider_status: providerStatus,
        stored_status: status,
        payment_session_id: session.public_reference,
        payment_session_status: updatedSession.status
      },
      user_agent: 'PayMongo Commerce Webhook'
    });
    return ok({ handled: true, status: 'refund_updated', payment_session: session.public_reference });
  };

  const findSessionForResource = async (resource) => {
    const sessionReference = getSessionReference(resource);
    if (sessionReference) {
      const byReference = await commercePaymentRepository.findSessionByPublicReference(sessionReference);
      if (byReference) return byReference;
    }

    const paymentIntentId = getPaymentIntentId(resource);
    if (paymentIntentId) {
      const byIntent = await commercePaymentRepository.findSessionByProviderPaymentIntent(paymentIntentId);
      if (byIntent) return byIntent;
    }

    const paymentId = getPaymentId(resource);
    if (paymentId) {
      return commercePaymentRepository.findSessionByProviderPayment(paymentId);
    }

    return null;
  };

  return async ({ headers = {}, body = {}, rawBody = '' } = {}) => {
    try {
      const signature = headers['paymongo-signature'] || headers['x-paymongo-signature'] || null;
      if (!paymongoService.verifyWebhookSignature(signature, rawBody || body)) {
        throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Invalid PayMongo webhook signature', { statusCode: 401 });
      }

      const eventType = getEventType(body);
      const providerEventId = getEventId(body, headers);
      const resource = toPlain(getEventResource(body));
      if (eventType === 'payment.refunded' || eventType === 'payment.refund.updated') {
        return handleRefundEvent({ resource, providerEventId });
      }

      const session = await findSessionForResource(resource);

      if (!session) {
        logger?.warn?.('PayMongo commerce webhook ignored: session not found', {
          eventType,
          providerEventId,
          paymentIntentId: getPaymentIntentId(resource),
          sessionReference: getSessionReference(resource)
        });
        return ok({ handled: false, reason: 'session_not_found' });
      }

      if (eventType === 'payment.paid') {
        const paidSession = await commercePaymentRepository.updateSessionById(session.session_id, {
          status: 'paid',
          paid_at: new Date(),
          provider_event_id: providerEventId || session.provider_event_id,
          provider_payment_id: getPaymentId(resource) || session.provider_payment_id,
          provider_payload: resource
        });
        const finalized = await finalizePaidCommerceSession({
          session: paidSession,
          resource,
          providerEventId,
          commercePaymentRepository
        });
        return ok({ handled: true, status: finalized.status, payment_session: finalized.public_reference });
      }

      if (eventType === 'payment.failed') {
        const failed = await commercePaymentRepository.updateSessionById(session.session_id, {
          status: 'failed',
          provider_event_id: providerEventId || session.provider_event_id,
          provider_payment_id: getPaymentId(resource) || session.provider_payment_id,
          provider_payload: resource,
          failure_code: 'PAYMENT_FAILED',
          failure_reason: getAttributes(resource)?.failed_message || 'PayMongo reported payment failure.'
        });
        return ok({ handled: true, status: failed.status, payment_session: failed.public_reference });
      }

      if (eventType === 'qrph.expired') {
        const expired = await commercePaymentRepository.updateSessionById(session.session_id, {
          status: 'expired',
          provider_event_id: providerEventId || session.provider_event_id,
          provider_payload: resource,
          failure_code: 'QRPH_EXPIRED',
          failure_reason: 'PayMongo QR Ph code expired before payment.'
        });
        return ok({ handled: true, status: expired.status, payment_session: expired.public_reference });
      }

      return ok({ handled: false, reason: 'event_type_ignored', event_type: eventType });
    } catch (error) {
      return fail(error instanceof DomainError
        ? error
        : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message || 'PayMongo commerce webhook failed', { statusCode: 500 }));
    }
  };
};

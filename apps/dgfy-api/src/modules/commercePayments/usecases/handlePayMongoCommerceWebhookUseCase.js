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
const getAccountId = (resource = {}) => {
  const attrs = getAttributes(resource);
  return resource?.id || attrs.account_id || attrs.merchant_id || attrs.id || null;
};
const hasExplicitEnabledWalletEvidence = (resource = {}) => {
  const attrs = getAttributes(resource);
  const wallet = attrs.wallet || {};
  const status = String(attrs.wallet_status || wallet.status || '').toLowerCase();
  return ['enabled', 'activated', 'active'].includes(status);
};
const hasExplicitSplitEvidence = (resource = {}) => {
  const attrs = getAttributes(resource);
  const capabilities = attrs.capabilities || {};
  const features = Array.isArray(attrs.features) ? attrs.features.map((feature) => String(feature).toLowerCase()) : [];
  return attrs.split_enabled === true
    || attrs.split_payments_enabled === true
    || capabilities.split_payments === 'active'
    || features.includes('split_payments')
    || features.includes('split_payment');
};
const hasExplicitChargeEvidence = (resource = {}) => {
  const attrs = getAttributes(resource);
  const capabilities = attrs.capabilities || {};
  return attrs.charges_enabled === true
    || attrs.payments_enabled === true
    || capabilities.payments === 'active'
    || capabilities.charges === 'active';
};

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

  const handleAccountLifecycleEvent = async ({ eventType, resource, providerEventId }) => {
    const accountId = getAccountId(resource);
    const account = accountId
      ? await commercePaymentRepository.findTenantPaymentAccountByProviderMerchantId?.(accountId)
      : null;
    if (!account) {
      logger?.warn?.('PayMongo account lifecycle webhook ignored: tenant payment account not found', {
        eventType,
        providerEventId,
        accountId
      });
      return ok({ handled: false, reason: 'payment_account_not_found' });
    }

    const attrs = getAttributes(resource);
    const activated = ['account.activated', 'merchant.activated', 'consumer.activated'].includes(eventType);
    const declined = ['account.declined', 'merchant.declined', 'consumer.declined'].includes(eventType);
    const accountRow = toPlain(account);
    const walletEnabled = hasExplicitEnabledWalletEvidence(resource);
    const splitEnabled = walletEnabled && hasExplicitSplitEvidence(resource);
    const chargesEnabled = walletEnabled && hasExplicitChargeEvidence(resource);
    const updated = await commercePaymentRepository.upsertTenantPaymentAccount({
      tenant_id: accountRow.tenant_id,
      provider: accountRow.provider || 'paymongo',
      provider_merchant_id: accountRow.provider_merchant_id,
      provider_wallet_id: accountRow.provider_wallet_id || attrs.wallet_id || attrs.wallet?.id || null,
      onboarding_status: activated ? 'active' : (declined ? 'restricted' : accountRow.onboarding_status),
      qrph_enabled: activated ? true : Boolean(accountRow.qrph_enabled),
      split_enabled: splitEnabled ? true : Boolean(accountRow.split_enabled),
      charges_enabled: chargesEnabled ? true : Boolean(accountRow.charges_enabled),
      wallet_status: walletEnabled ? 'enabled' : (attrs.wallet_status || accountRow.wallet_status || 'unknown'),
      wallet_verified_at: walletEnabled ? new Date() : accountRow.wallet_verified_at,
      requirements_due: attrs.requirements_due || attrs.requirements || accountRow.requirements_due || null,
      metadata: {
        ...(accountRow.metadata || {}),
        verification_reference: providerEventId || accountRow.metadata?.verification_reference || `paymongo:${eventType}:${accountId}`,
        verified_at: activated ? new Date().toISOString() : accountRow.metadata?.verified_at || null,
        verified_by: 'paymongo_webhook',
        provider_status: attrs.status || eventType,
        provider_event_id: providerEventId || null,
        last_account_webhook_type: eventType,
        wallet_evidence_detected: walletEnabled,
        split_evidence_detected: splitEnabled,
        charge_evidence_detected: chargesEnabled
      },
      last_synced_at: new Date()
    });

    await commercePaymentRepository.createAuditLog?.({
      user_id: null,
      entity_type: 'CommercePayment',
      entity_id: updated.account_id,
      action: 'UPDATE',
      changes: {
        event: 'tenant_paymongo_account_lifecycle_webhook',
        provider_event_id: providerEventId,
        event_type: eventType,
        provider_merchant_id: accountId,
        onboarding_status: updated.onboarding_status,
        wallet_status: updated.wallet_status
      },
      user_agent: 'PayMongo Commerce Webhook'
    });

    return ok({ handled: true, status: updated.onboarding_status, payment_account: updated.account_id });
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
      if (['account.activated', 'account.declined', 'merchant.activated', 'merchant.declined', 'consumer.activated', 'consumer.declined'].includes(eventType)) {
        return handleAccountLifecycleEvent({ eventType, resource, providerEventId });
      }
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

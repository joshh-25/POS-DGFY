import { finalizePaidCommerceSession, getPaymentIdFromPayMongoResource } from './finalizePaidCommerceSession.js';
import { postPaidTenantRevenueTransactionUseCase } from '../../tenantRevenue/index.js';

const getAttributes = (resource = {}) => resource?.attributes || resource || {};
const normalizeCurrency = (value) => String(value || '').trim().toUpperCase();
const toPositiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getPaidPaymentValidationFailure = ({ session, resource }) => {
  const attrs = getAttributes(resource);
  const providerStatus = String(attrs.status || '').trim().toLowerCase();
  const expectedAmount = toPositiveInteger(session?.total_amount_centavos);
  const paidAmount = toPositiveInteger(attrs.amount);
  const expectedCurrency = normalizeCurrency(session?.currency || 'PHP');
  const paidCurrency = normalizeCurrency(attrs.currency);

  if (providerStatus !== 'paid') {
    return {
      code: 'PAYMENT_STATUS_MISMATCH',
      reason: `PayMongo payment.paid event contained payment status "${providerStatus || 'missing'}".`
    };
  }
  if (!expectedAmount || !paidAmount || paidAmount !== expectedAmount) {
    return {
      code: 'PAYMENT_AMOUNT_MISMATCH',
      reason: `Paid amount ${paidAmount || 'missing'} centavos does not match expected amount ${expectedAmount || 'missing'} centavos.`
    };
  }
  if (!paidCurrency || paidCurrency !== expectedCurrency) {
    return {
      code: 'PAYMENT_CURRENCY_MISMATCH',
      reason: `Paid currency ${paidCurrency || 'missing'} does not match expected currency ${expectedCurrency}.`
    };
  }
  return null;
};

export const buildProcessVerifiedPaidCommerceSessionUseCase = ({ commercePaymentRepository }) => async ({
  session,
  resource,
  providerEventId = null,
  actor = 'paymongo_webhook'
}) => {
  const plainSession = session?.get ? session.get({ plain: true }) : session;
  if (!plainSession) return null;

  if (plainSession.status === 'finalized' || plainSession.pos_transaction_id || plainSession.tracking_pin) {
    return {
      handled: true,
      idempotent_replay: true,
      status: plainSession.status === 'paid' ? 'finalized' : plainSession.status,
      payment_session: plainSession.public_reference
    };
  }
  if (plainSession.status === 'paid_manual_resolution_required') {
    return {
      handled: true,
      idempotent_replay: true,
      status: plainSession.status,
      payment_session: plainSession.public_reference
    };
  }

  const paymentValidationFailure = getPaidPaymentValidationFailure({ session: plainSession, resource });
  if (paymentValidationFailure) {
    const heldSession = await commercePaymentRepository.updateSessionById(plainSession.session_id, {
      status: 'paid_manual_resolution_required',
      paid_at: new Date(),
      provider_event_id: providerEventId || plainSession.provider_event_id,
      provider_payment_id: getPaymentIdFromPayMongoResource(resource) || plainSession.provider_payment_id,
      provider_payload: resource,
      failure_code: paymentValidationFailure.code,
      failure_reason: paymentValidationFailure.reason
    });
    await commercePaymentRepository.createAuditLog?.({
      user_id: null,
      entity_type: 'CommercePayment',
      entity_id: plainSession.session_id,
      action: 'UPDATE',
      changes: {
        event: 'commerce_payment_paid_validation_hold',
        provider_event_id: providerEventId,
        payment_session: plainSession.public_reference,
        failure_code: paymentValidationFailure.code,
        expected_amount_centavos: toPositiveInteger(plainSession.total_amount_centavos),
        provider_amount_centavos: toPositiveInteger(getAttributes(resource).amount),
        expected_currency: normalizeCurrency(plainSession.currency || 'PHP'),
        provider_currency: normalizeCurrency(getAttributes(resource).currency),
        actor
      },
      user_agent: actor === 'paymongo_webhook'
        ? 'PayMongo Commerce Webhook'
        : 'PayMongo Commerce Reconciliation'
    });
    return {
      handled: true,
      status: heldSession.status,
      payment_session: heldSession.public_reference,
      manual_resolution_required: true,
      failure_code: paymentValidationFailure.code
    };
  }

  const paidSession = await commercePaymentRepository.updateSessionById(plainSession.session_id, {
    status: 'paid',
    paid_at: new Date(),
    provider_event_id: providerEventId || plainSession.provider_event_id,
    provider_payment_id: getPaymentIdFromPayMongoResource(resource) || plainSession.provider_payment_id,
    provider_payload: resource
  });
  const revenueResult = await postPaidTenantRevenueTransactionUseCase({
    session: paidSession,
    resource,
    providerEventId,
    actor
  });
  if (!revenueResult.success) throw revenueResult.error;

  const finalized = await finalizePaidCommerceSession({
    session: paidSession,
    resource,
    providerEventId,
    commercePaymentRepository
  });
  return { handled: true, status: finalized.status, payment_session: finalized.public_reference };
};

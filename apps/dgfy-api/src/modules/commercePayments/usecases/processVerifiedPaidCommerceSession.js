import { finalizePaidCommerceSession, getPaymentIdFromPayMongoResource } from './finalizePaidCommerceSession.js';
import { postPaidTenantRevenueTransactionUseCase } from '../../tenantRevenue/index.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const getAttributes = (resource = {}) => resource?.attributes || resource || {};
const normalizeCurrency = (value) => String(value || '').trim().toUpperCase();
const toPositiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const hasLiveModeValue = (value) => value === true || String(value || '').trim().toLowerCase() === 'true';

const getPaidPaymentValidationFailure = ({ session, resource }) => {
  const attrs = getAttributes(resource);
  const isPayMongoLiveMode = String(process.env.PAYMONGO_MODE || 'test').trim().toLowerCase() === 'live';
  const providerHasLiveMode = hasLiveModeValue(attrs.livemode);
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
  if ((isPayMongoLiveMode && !providerHasLiveMode) || (!isPayMongoLiveMode && providerHasLiveMode)) {
    return {
      code: 'PAYMENT_LIVEMODE_MISMATCH',
      reason: `PayMongo payment livemode ${providerHasLiveMode ? 'true' : 'false'} does not match the configured ${isPayMongoLiveMode ? 'live' : 'test'} mode.`
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
  const plainSessionInput = session?.get ? session.get({ plain: true }) : session;
  if (!plainSessionInput) return null;

  // #476: the state check below used to run against the caller-passed `session` with no lock,
  // so two concurrent/retried webhook deliveries for the same session could both read a
  // pre-paid state and both proceed. Re-fetch with SELECT ... FOR UPDATE inside a transaction
  // and do the state check + status='paid' claim there, so a second delivery blocked on the
  // row lock sees the already-updated status once it unblocks and short-circuits correctly.
  // postPaidTenantRevenueTransactionUseCase/finalizePaidCommerceSession stay OUTSIDE this
  // transaction -- finalizePaidCommerceSession opens a separate tenant DB connection
  // (ADR 0052's accepted "post-commit, cross-database workflow"), which can't share a
  // transaction with the landlord-side claim above.
  const claim = await commercePaymentRepository.runInTransaction(async (transaction) => {
    const plainSession = await commercePaymentRepository.findSessionBySessionId(plainSessionInput.session_id, {
      transaction,
      lock: true
    });
    if (!plainSession) return { outcome: 'missing' };

    // #476 review (RF-1): status === 'paid' alone is deliberately NOT treated as a terminal
    // idempotent replay here. It's the state a webhook delivery is in immediately after this
    // function's own claim write, below, and before postPaidTenantRevenueTransactionUseCase /
    // finalizePaidCommerceSession run (or after they were attempted and failed/crashed without
    // reaching 'finalized' or 'paid_manual_resolution_required'). Treating bare 'paid' as
    // already-handled -- an earlier version of this fix did exactly that -- silently swallows
    // every PayMongo retry that lands in that window: the webhook returns a successful
    // idempotent-replay response without the missing revenue transaction or order ever being
    // created, which is the exact "money with no order" failure #476 exists to close, just
    // moved one step later. Instead, a session merely 'paid' is re-entered and the downstream
    // calls are re-attempted below; both are independently idempotent already --
    // postPaidTenantRevenueTransactionUseCase takes its own locked findRevenueTransactionBySession
    // read before insert (tenantRevenueUseCases.js), and finalizePaidCommerceSession short-circuits
    // on pos_transaction_id/tracking_pin/status==='finalized' and otherwise relies on
    // storeCheckoutUseCase's own idempotency_key dedup -- so resuming is safe, whereas silently
    // replying 200 to a delivery whose work never actually completed is not.
    if (
      plainSession.status === 'finalized'
      || plainSession.status === 'paid_manual_resolution_required'
      || plainSession.pos_transaction_id
      || plainSession.tracking_pin
    ) {
      return {
        outcome: 'idempotent_replay',
        status: plainSession.status,
        publicReference: plainSession.public_reference
      };
    }

    // #476: this provider event must never be attached to a *different* session -- a
    // misrouted replay or a findSessionForResource lookup resolving to the wrong row.
    // Mirrors POS split payments' PAYMENT_PROVIDER_EVENT_REPLAY guard
    // (splitPaymentUseCases.js), backed by the uq_commerce_payment_sessions_provider_event
    // unique index as a race backstop.
    if (providerEventId) {
      const conflictingSession = await commercePaymentRepository.findSessionByProviderEventId(providerEventId, {
        transaction,
        lock: true
      });
      if (conflictingSession && conflictingSession.session_id !== plainSession.session_id) {
        throw new DomainError(
          DomainErrorCode.CONFLICT,
          'Provider event has already been recorded against a different commerce payment session.',
          {
            statusCode: 409,
            details: {
              reason_code: 'PAYMENT_PROVIDER_EVENT_REPLAY',
              payment_session: plainSession.public_reference
            }
          }
        );
      }
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
      }, { transaction });
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
      }, { transaction });
      return {
        outcome: 'validation_hold',
        session: heldSession,
        failureCode: paymentValidationFailure.code
      };
    }

    const paidSession = await commercePaymentRepository.updateSessionById(plainSession.session_id, {
      status: 'paid',
      paid_at: new Date(),
      provider_event_id: providerEventId || plainSession.provider_event_id,
      provider_payment_id: getPaymentIdFromPayMongoResource(resource) || plainSession.provider_payment_id,
      provider_payload: resource
    }, { transaction });
    return { outcome: 'claimed', session: paidSession };
  });

  if (claim.outcome === 'missing') return null;

  if (claim.outcome === 'idempotent_replay') {
    return {
      handled: true,
      idempotent_replay: true,
      status: claim.status,
      payment_session: claim.publicReference
    };
  }

  if (claim.outcome === 'validation_hold') {
    return {
      handled: true,
      status: claim.session.status,
      payment_session: claim.session.public_reference,
      manual_resolution_required: true,
      failure_code: claim.failureCode
    };
  }

  const paidSession = claim.session;
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

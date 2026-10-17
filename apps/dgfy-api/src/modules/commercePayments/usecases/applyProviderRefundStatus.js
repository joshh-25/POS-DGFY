import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { recordSucceededTenantRevenueRefundUseCase } from '../../tenantRevenue/index.js';
import {
  buildRefundLedgerIdempotencyKey,
  mapRefundStatusToLedgerStatus,
  writeTenantOrderPaymentEntry,
  updateTenantOrderPaymentEntryStatus
} from '../repositories/tenantOrderPaymentLedgerRepository.js';
import { reconcileRefundedPaymentState } from './commercePaymentAdminUseCases.js';
import { notifyDglaundryBookingRefund } from './finalizeDglaundryBookingSession.js';
import { alertCommerceRefundFailed } from './commerceRefundAlerting.js';

const getAttributes = (resource = {}) => resource?.attributes || resource || {};
const TERMINAL_REFUND_STATUSES = new Set(['succeeded', 'failed']);

export const mapProviderRefundStatus = (providerResource = {}) => {
  const providerStatus = String(getAttributes(providerResource).status || '').trim().toLowerCase();
  const status = ['succeeded', 'success', 'refunded'].includes(providerStatus)
    ? 'succeeded'
    : (['failed', 'cancelled', 'canceled'].includes(providerStatus) ? 'failed' : 'pending');
  return { providerStatus, status };
};

/**
 * Applies an authenticated PayMongo refund resource once. The refund and session rows stay locked
 * until all retryable landlord and tenant-revenue effects have completed. If a required effect
 * fails, the landlord transaction rolls back and a webhook retry or the scheduled reconciler can
 * safely try again; tenant ledger and revenue writers carry their own stable idempotency keys.
 */
export const applyProviderRefundStatus = async ({
  refund,
  session,
  providerResource,
  actor = 'paymongo_webhook',
  providerEventId = null,
  source = 'paymongo_webhook',
  deps = {}
}) => {
  const {
    commercePaymentRepository,
    logger = console,
    raiseAlert,
    recordSucceededRevenueRefund = recordSucceededTenantRevenueRefundUseCase,
    writeOrderPaymentLedgerEntry = writeTenantOrderPaymentEntry,
    updateOrderPaymentLedgerEntryStatus = updateTenantOrderPaymentEntryStatus,
    partnerClient
  } = deps;

  if (!commercePaymentRepository?.runInTransaction) {
    throw new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Commerce refund transaction support is unavailable.');
  }

  const { providerStatus, status } = mapProviderRefundStatus(providerResource);
  const attributes = getAttributes(providerResource);

  const result = await commercePaymentRepository.runInTransaction(async (transaction) => {
    const currentRefund = await commercePaymentRepository.findRefundById(refund?.refund_id, {
      transaction,
      lock: true
    });
    if (!currentRefund) {
      throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Commerce payment refund not found.', { statusCode: 404 });
    }

    if (TERMINAL_REFUND_STATUSES.has(String(currentRefund.status || '').toLowerCase())) {
      return {
        applied: false,
        idempotent_replay: true,
        status: currentRefund.status,
        refund: currentRefund,
        session
      };
    }

    const lockedSession = await commercePaymentRepository.findSessionBySessionId(currentRefund.payment_session_id, {
      transaction,
      lock: true
    }) || session;
    if (!lockedSession) {
      throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Commerce payment session not found.', { statusCode: 404 });
    }

    const updatedRefund = await commercePaymentRepository.updateRefundById(currentRefund.refund_id, {
      status,
      provider_payload: providerResource,
      failure_code: status === 'failed' ? 'PROVIDER_REFUND_FAILED' : null,
      failure_reason: status === 'failed'
        ? (attributes.failed_message || 'PayMongo reported refund failure.')
        : null
    }, { transaction });

    const ledgerStatus = mapRefundStatusToLedgerStatus(status);
    await writeOrderPaymentLedgerEntry({
      commercePaymentRepository,
      session: lockedSession,
      kind: 'refund',
      status: ledgerStatus,
      amountCentavos: Number(currentRefund.amount_centavos || 0),
      paymentMethod: lockedSession.capture_payment_method || null,
      paymentReference: currentRefund.provider_payment_id || lockedSession.provider_payment_id || null,
      idempotencyKey: buildRefundLedgerIdempotencyKey(currentRefund.public_reference),
      providerEventId
    });
    await updateOrderPaymentLedgerEntryStatus({
      commercePaymentRepository,
      session: lockedSession,
      idempotencyKey: buildRefundLedgerIdempotencyKey(currentRefund.public_reference),
      status: ledgerStatus,
      providerEventId
    });

    const updatedSession = await reconcileRefundedPaymentState({
      commercePaymentRepository,
      session: lockedSession,
      transaction
    });

    if (status === 'succeeded') {
      const revenueResult = await recordSucceededRevenueRefund({
        session: updatedSession,
        refund: updatedRefund,
        actor
      });
      if (!revenueResult?.success) {
        throw revenueResult?.error || new Error('Tenant revenue refund reversal was not recorded.');
      }
    }

    try {
      await commercePaymentRepository.createAuditLog?.({
        user_id: null,
        entity_type: 'CommercePayment',
        entity_id: currentRefund.refund_id,
        action: 'UPDATE',
        changes: {
          event: source === 'paymongo_webhook'
            ? 'commerce_payment_refund_webhook_reconciled'
            : 'commerce_payment_refund_reconciled',
          provider_event_id: providerEventId,
          refund_reference: currentRefund.public_reference,
          provider_refund_id: currentRefund.provider_refund_id || providerResource?.id || null,
          provider_status: providerStatus,
          stored_status: status,
          payment_session_id: lockedSession.public_reference,
          payment_session_status: updatedSession.status,
          actor
        },
        user_agent: source === 'paymongo_webhook'
          ? 'PayMongo Commerce Webhook'
          : 'PayMongo Commerce Refund Reconciliation'
      }, { transaction });
    } catch (error) {
      logger?.warn?.('PayMongo commerce refund audit write failed', {
        refundReference: currentRefund.public_reference,
        error: error?.message
      });
    }

    return {
      applied: true,
      idempotent_replay: false,
      status,
      previous_status: currentRefund.status,
      refund: updatedRefund,
      session: updatedSession
    };
  });

  if (result.applied && result.status === 'succeeded') {
    await notifyDglaundryBookingRefund({
      session: result.session,
      refund: result.refund,
      providerEventId,
      partnerClient
    }).catch((error) => {
      logger?.warn?.('DGLaundry refund notification is pending retry.', {
        error: error?.message,
        paymentSession: result.session?.public_reference
      });
    });
  }
  if (result.applied && result.status === 'failed') {
    await alertCommerceRefundFailed({
      refund: result.refund,
      session: result.session,
      error: new Error(result.refund?.failure_reason || 'PayMongo reported refund failure.'),
      raiseAlert,
      logger
    });
  }
  return result;
};

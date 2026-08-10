import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const TERMINAL_REFUND_STATUSES = new Set(['succeeded']);
const ACTIVE_REFUND_STATUSES = new Set(['created', 'pending']);

export const buildHandleCommerceOrderLifecycleUseCase = ({
  commercePaymentRepository,
  createCommercePaymentRefundUseCase,
  recordTenantRevenueOrderFulfillmentUseCase
}) => async ({
  tenantId,
  posTransactionId,
  fulfillmentStatus,
  actor,
  rejectionReason = null
}) => {
  try {
    const session = await commercePaymentRepository.findSessionByTenantAndPosTransaction({
      tenantId,
      posTransactionId
    });
    if (!session) {
      return ok({
        tracked: false,
        payment_action: 'not_applicable',
        reason: 'commerce_payment_session_not_found'
      });
    }

    const normalizedStatus = String(fulfillmentStatus || '').trim().toLowerCase();
    const fulfillmentResult = await recordTenantRevenueOrderFulfillmentUseCase({
      session,
      fulfillmentStatus: normalizedStatus,
      actor
    });
    if (!fulfillmentResult.success) throw fulfillmentResult.error;

    if (normalizedStatus === 'completed') {
      return ok({
        tracked: true,
        payment_action: 'settlement_pending',
        payment_session: session.public_reference,
        fulfillment: fulfillmentResult.data
      });
    }
    if (!['rejected', 'cancelled'].includes(normalizedStatus)) {
      return ok({
        tracked: true,
        payment_action: 'none',
        payment_session: session.public_reference,
        fulfillment: fulfillmentResult.data
      });
    }

    const refunds = await commercePaymentRepository.listRefundsBySession(session.session_id);
    const succeededRefund = refunds.find((refund) => TERMINAL_REFUND_STATUSES.has(refund.status));
    if (succeededRefund) {
      return ok({
        tracked: true,
        payment_action: 'refunded',
        payment_session: session.public_reference,
        refund: succeededRefund,
        idempotent_replay: true
      });
    }
    const activeRefund = refunds.find((refund) => ACTIVE_REFUND_STATUSES.has(refund.status));
    if (activeRefund) {
      return ok({
        tracked: true,
        payment_action: 'refund_pending',
        payment_session: session.public_reference,
        refund: activeRefund,
        idempotent_replay: true
      });
    }

    const refundResult = await createCommercePaymentRefundUseCase({
      paymentSessionId: session.public_reference,
      payload: {
        amount_centavos: Number(session.total_amount_centavos || 0),
        reason: 'requested_by_customer',
        notes: String(
          rejectionReason
          || `Order ${posTransactionId} ${normalizedStatus} by POS`
        ).slice(0, 255),
        refund_strategy: 'proportional'
      },
      actor
    });
    if (!refundResult.success) throw refundResult.error;

    const refund = refundResult.data?.refund || null;
    return ok({
      tracked: true,
      payment_action: refund?.status === 'succeeded'
        ? 'refunded'
        : (refund?.status === 'failed' || refund?.status === 'manual_review_required'
          ? 'refund_failed'
          : 'refund_pending'),
      payment_session: session.public_reference,
      refund,
      fulfillment: fulfillmentResult.data
    });
  } catch (error) {
    return fail(error instanceof DomainError
      ? error
      : new DomainError(
        DomainErrorCode.INTERNAL_ERROR,
        error.message || 'Commerce order payment lifecycle failed.'
      ));
  }
};

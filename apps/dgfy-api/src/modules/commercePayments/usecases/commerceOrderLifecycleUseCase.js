import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
  buildForfeitureLedgerIdempotencyKey,
  isDownpaymentSession,
  writeTenantOrderPaymentEntry
} from '../repositories/tenantOrderPaymentLedgerRepository.js';

const TERMINAL_REFUND_STATUSES = new Set(['succeeded']);
const ACTIVE_REFUND_STATUSES = new Set(['created', 'pending']);

// Phase 144 (#824). Who ended the order decides whether a non-refundable downpayment may be kept.
//
// 'store'  -- the merchant rejected or cancelled it (POS). ALWAYS refunds, even when the store's
//             own downpayment_refundable toggle says non-refundable: the store's inability to
//             fulfil is not the customer's forfeiture. This is the default precisely because a
//             caller that forgets to pass it must fail toward giving the money back.
// 'customer' -- the customer ended it themselves through the storefront self-service cancel
//             endpoint. Only this origin can forfeit, and only when the policy snapshot taken at
//             capture time says the downpayment was non-refundable.
//
// Known limitation, deliberate (Pat, 2026-08-22): a customer who phones the store and has staff
// cancel on their behalf arrives here as 'store' and is refunded. Attributing that intent needs an
// explicit origin field on the POS status payload and is out of this phase's scope.
const ORIGIN_STORE = 'store';
const ORIGIN_CUSTOMER = 'customer';

export const buildHandleCommerceOrderLifecycleUseCase = ({
  commercePaymentRepository,
  createCommercePaymentRefundUseCase,
  recordTenantRevenueOrderFulfillmentUseCase,
  writeOrderPaymentLedgerEntry = writeTenantOrderPaymentEntry
}) => async ({
  tenantId,
  posTransactionId,
  fulfillmentStatus,
  actor,
  rejectionReason = null,
  initiatedBy = ORIGIN_STORE
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

    // Phase 144 (#824) -- ADR 0069 clause 8 [default], carried forward verbatim by ADR 0070:
    // "Whether a customer cancellation forfeits the collected downpayment or refunds it is a
    // per-store toggle, defaulting to refundable." `downpayment_refundable` is read from the
    // SESSION, not from the tenant's live settings row: it is the policy snapshot taken at capture
    // time (Phase 141, CommercePaymentSession.js), so a merchant flipping the toggle after the
    // customer already paid cannot retroactively change the deal that customer agreed to.
    //
    // The explicit `=== false` matters: the column is nullable, and null (unknown policy) must
    // fall through to refunding rather than to keeping the money.
    const forfeits = normalizedStatus === 'cancelled'
      && initiatedBy === ORIGIN_CUSTOMER
      && isDownpaymentSession(session)
      && session.downpayment_refundable === false;

    if (forfeits) {
      const ledgerResult = await writeOrderPaymentLedgerEntry({
        commercePaymentRepository,
        session,
        kind: 'forfeiture',
        status: 'successful',
        amountCentavos: Number(session.total_amount_centavos || 0),
        paymentMethod: session.capture_payment_method || null,
        paymentReference: session.provider_payment_id || null,
        providerEventId: null,
        idempotencyKey: buildForfeitureLedgerIdempotencyKey(session.public_reference),
        recordedBy: null
      });

      // No provider call at all, and deliberately no change to the order's payment_status,
      // amount_paid, or balance_due: nothing was reversed. A `partially_paid` order with a
      // cancelled fulfilment state and a `kind: 'forfeiture'` ledger row IS the accurate record of
      // "the customer paid a deposit, cancelled, and the store kept it" (ADR 0052 clause 4 --
      // corrections are reversal entries, never edits to the original figures).
      return ok({
        tracked: true,
        payment_action: 'forfeited',
        payment_session: session.public_reference,
        forfeited_amount_centavos: Number(session.total_amount_centavos || 0),
        ledger_entry_recorded: Boolean(ledgerResult?.written) || ledgerResult?.reason === 'already_recorded',
        fulfillment: fulfillmentResult.data
      });
    }

    const refundResult = await createCommercePaymentRefundUseCase({
      paymentSessionId: session.public_reference,
      payload: {
        // Phase 141 (#822) redefined total_amount_centavos as the amount actually CAPTURED online,
        // with the full order value moved to order_total_centavos. For a downpayment order that
        // makes this the downpayment, never the order total -- ADR 0069 clause 1b [binding].
        // Pinned by commerceOrderLifecycle.usecase.test.js so an edit here cannot silently start
        // refunding money that was never collected.
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

import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';
import { formatCentavos } from '../../availments/usecases/money.js';

// finalizePaidOrderUseCases.js — Phase 10 Plan 08 Task 2 (STF-05, D-04,
// ADR 0027 #8). The async, webhook-driven cross-database finalization
// seam: a verified `payment.paid` event resolves the landlord session +
// tenant, invokes 10-07's finalizeStorefrontOrder, and writes the tenant
// availment_id back onto BOTH the durable landlord order and session —
// idempotently. A paid-but-unfinalizable order NEVER silently disappears —
// it lands in finalize_failed_manual_resolution_required, retryable via
// buildRetryFinalizationUseCase below.
//
// Pattern 1/4 (10-RESEARCH.md): landlord-durable-first, then idempotent
// tenant-finalize — mirrors 10-06's placeOrder ordering discipline, applied
// to the async confirmation half of the same flow.

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const notFoundError = (message) => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    message,
    { statusCode: 404 }
);

/**
 * Best-effort terminal-state write for a paid order whose tenant finalize
 * failed/threw AFTER payment was confirmed (STF-05, ADR 0027 #8): NEVER
 * silently mark finalized, NEVER silently drop it. Swallows its own
 * write failures (logs, does not mask the original finalize error the
 * caller is already returning/throwing) — an operator can still discover
 * and retry via `finalize_failed_manual_resolution_required`'s status.
 */
async function markManualResolutionRequired({ orderRepository, updateSessionStatus, order, session, reason }) {
    const truncatedReason = String(reason || 'finalizeStorefrontOrder failed after payment was confirmed.').slice(0, 2000);
    try {
        await orderRepository.updateOrder(order.id, { status: 'finalize_failed_manual_resolution_required' });
    } catch (updateError) {
        // eslint-disable-next-line no-console
        console.warn('[finalizePaidOrder] failed to mark order as manual-resolution-required.', updateError);
    }
    try {
        await updateSessionStatus(session.id, {
            status: 'finalize_failed_manual_resolution_required',
            manual_resolution_reason: truncatedReason
        });
    } catch (updateError) {
        // eslint-disable-next-line no-console
        console.warn('[finalizePaidOrder] failed to mark session as manual-resolution-required.', updateError);
    }
}

/**
 * @param {{orderRepository, updateSessionStatus: Function, finalizeStorefrontOrder: Function}} deps
 * @returns {Function} async (input: {session, resource?, providerEventId?}) => Promise<ApplicationResult>
 */
export function buildFinalizePaidOrderUseCase({ orderRepository, updateSessionStatus, finalizeStorefrontOrder } = {}) {
    if (!orderRepository) {
        throw new Error('buildFinalizePaidOrderUseCase requires an orderRepository.');
    }
    if (typeof updateSessionStatus !== 'function') {
        throw new Error('buildFinalizePaidOrderUseCase requires an updateSessionStatus function.');
    }
    if (typeof finalizeStorefrontOrder !== 'function') {
        throw new Error('buildFinalizePaidOrderUseCase requires a finalizeStorefrontOrder function.');
    }

    return async ({ session, resource = {}, providerEventId = null } = {}) => {
        if (!session) {
            return ApplicationResult.failure(validationError('session is required.'));
        }

        // Natural idempotency guard FIRST (D-04): a duplicate/replayed
        // payment.paid webhook (or a retry of an already-finalized session)
        // is a safe no-op — never a second Availment/stock deduction.
        if (session.status === 'finalized') {
            return ApplicationResult.success({
                status: 'finalized',
                idempotent: true,
                session_public_reference: session.public_reference
            });
        }

        const order = await orderRepository.findById(session.storefront_order_id);
        if (!order) {
            return ApplicationResult.failure(notFoundError('Storefront order not found for this payment session.'));
        }
        if (order.status === 'finalized' && order.availment_id) {
            // Order-side idempotency guard (belt-and-suspenders alongside
            // 10-07's own source_reference uniqueness): the session simply
            // hadn't caught up yet — sync it and return, no re-finalize.
            await updateSessionStatus(session.id, {
                status: 'finalized',
                finalized_at: session.finalized_at || new Date(),
                availment_id: order.availment_id
            }).catch(() => {});
            return ApplicationResult.success({
                status: 'finalized',
                idempotent: true,
                availment_id: order.availment_id,
                session_public_reference: session.public_reference
            });
        }

        const attrs = resource?.attributes || resource || {};
        const providerPaymentId = String(resource?.id || attrs.payment_id || '').startsWith('pay_')
            ? (resource?.id || attrs.payment_id)
            : (session.provider_payment_id || null);

        // Mark the session paid FIRST (landlord-durable-first, Pattern 1) —
        // even if the tenant finalize below fails, the fact that PayMongo
        // confirmed payment is never lost.
        await updateSessionStatus(session.id, {
            status: 'paid',
            paid_at: session.paid_at || new Date(),
            provider_event_id: providerEventId || session.provider_event_id,
            provider_payment_id: providerPaymentId
        });

        const lines = (order.checkout_payload?.lines || []).map((line) => ({
            productId: line.product_id,
            quantity: line.quantity,
            unitPrice: formatCentavos(line.unit_price_centavos)
        }));

        let finalizeResult;
        try {
            finalizeResult = await finalizeStorefrontOrder({
                businessId: order.tenant_id,
                sourceReference: order.public_reference,
                customerAccountId: order.customer_account_id,
                lines,
                totalCentavos: order.total_centavos,
                paymentMethod: order.payment_method,
                paymentReference: providerPaymentId,
                fulfillmentMode: order.fulfillment_mode,
                requestedFor: order.requested_for
            });
        } catch (finalizeError) {
            // A thrown error after payment was confirmed is EXACTLY the
            // case ADR 0027 #8 / STF-05 require a manual-resolution state
            // for — never let it propagate as a silent failure.
            await markManualResolutionRequired({ orderRepository, updateSessionStatus, order, session, reason: finalizeError.message });
            throw finalizeError;
        }

        if (finalizeResult.isFailure) {
            await markManualResolutionRequired({
                orderRepository,
                updateSessionStatus,
                order,
                session,
                reason: finalizeResult.error?.message
            });
            return finalizeResult;
        }

        const availmentId = finalizeResult.data?.availment?.id ?? null;
        await orderRepository.updateOrder(order.id, { status: 'finalized', availment_id: availmentId });
        await updateSessionStatus(session.id, { status: 'finalized', finalized_at: new Date() });

        return ApplicationResult.success({
            status: 'finalized',
            idempotent: Boolean(finalizeResult.data?.idempotent),
            availment_id: availmentId,
            session_public_reference: session.public_reference
        });
    };
}

/**
 * D-09 auto-release sweep (T-10-08-07): reclaims stock for storefront
 * orders whose PayMongo session expired WITHOUT ever receiving a
 * `qrph.expired` webhook (a missed/never-delivered webhook must not strand
 * stock indefinitely). Releases the tenant reservation + moves BOTH the
 * landlord order and its paired session to `expired`. Idempotent and safe
 * to run repeatedly — orders already moved past `awaiting_payment` are
 * excluded from `findDueAwaitingPayment`'s query on the next pass.
 *
 * Composed independently of the webhook path (index.js wires this to run
 * on BOTH a recurring interval AND opportunistically from read paths) —
 * this function itself has no knowledge of its invocation cadence.
 *
 * @param {{orderRepository, commercePaymentRepository, releaseReservation: Function}} deps
 * @returns {Function} async (now?: Date) => Promise<{expired_count: number}>
 */
export function buildExpireDueSessionsUseCase({ orderRepository, commercePaymentRepository, releaseReservation }) {
    if (!orderRepository) {
        throw new Error('buildExpireDueSessionsUseCase requires an orderRepository.');
    }
    if (!commercePaymentRepository) {
        throw new Error('buildExpireDueSessionsUseCase requires a commercePaymentRepository.');
    }
    if (typeof releaseReservation !== 'function') {
        throw new Error('buildExpireDueSessionsUseCase requires a releaseReservation function.');
    }

    return async (now = new Date()) => {
        const dueOrders = await orderRepository.findDueAwaitingPayment(now);
        let expiredCount = 0;

        for (const order of dueOrders) {
            try {
                await releaseReservation(order.tenant_id, order.public_reference);
            } catch (releaseError) {
                // eslint-disable-next-line no-console
                console.warn('[expireDueSessions] releaseReservation failed; will retry next sweep pass.', releaseError);
                continue;
            }

            await orderRepository.updateOrder(order.id, { status: 'expired' });

            const session = await commercePaymentRepository.findSessionByStorefrontOrderId(order.id);
            if (session && session.status !== 'expired' && session.status !== 'finalized') {
                await commercePaymentRepository.updateSessionStatus(session.id, {
                    status: 'expired',
                    manual_resolution_reason: null
                }).catch((updateError) => {
                    // eslint-disable-next-line no-console
                    console.warn('[expireDueSessions] failed to sync session status.', updateError);
                });
            }

            expiredCount += 1;
        }

        return { expired_count: expiredCount };
    };
}

export default buildFinalizePaidOrderUseCase;

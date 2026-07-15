import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';
import { formatCentavos } from '../../availments/usecases/money.js';
import { validateFulfillment as defaultValidateFulfillment } from './schedulingValidation.js';
import {
    computeRequestHash,
    generateOrderPublicReference,
    isUniqueConstraintViolation
} from '../repositories/storefrontOrderRepository.js';
import { STOREFRONT_HOLD_FALLBACK_MINUTES } from '../../../config/env.js';

// placeOrderUseCases.js — Phase 10 Plan 06 Task 2 (STF-04, STF-05, D-08,
// D-09, D-10). The order-placement orchestration seam: composes the
// validated cart (10-03's validateCart), resolved identity (10-04's
// resolveCheckoutIdentity), scheduling validation (this plan's Task 1),
// the tenant-owned stock reservation (10-02's InventoryReservationRepository
// — called DIRECTLY here, NOT through 10-02's buildReserveStockUseCase/
// buildReleaseReservationUseCase/buildSetReservationExpiryUseCase wrappers,
// see the `reserveStock`/`releaseReservation`/`setReservationExpiry`
// dependency docs below for why), and the landlord PayMongo QR Ph session
// (10-05's createQrphSession) — in the exact D-10 fail-fast order:
//
//   (0) idempotency short-circuit
//   (1) validateCart            -> normalized lines + server-computed totalCentavos
//   (2) resolveCheckoutIdentity -> customer_account_id | guest_identity_id
//   (3) validateFulfillment     -> normalized requestedFor or a typed error
//   (4) DURABLE landlord order insert (status pending_payment) FIRST
//   (5) reserveStock (tenant write, fail-fast 503 on TenantDatabaseUnavailableError)
//   (6a) gcash/credit_card: createQrphSession -> re-stamp shared expires_at (D-08)
//        on the reservation on success; release the reservation + mark the
//        order failed on ANY failure (D-09 no-manual-step)
//   (6b) cash: [ASSUMED A3] finalize immediately via the injected
//        finalizeCashOrder (10-07's finalizeStorefrontOrder)
//
// Finalization on the webhook path (payment.paid) is NOT this file's scope
// — that is 10-08's.

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const conflictError = (message, details = null) => new DomainError(
    DomainErrorCode.CONFLICT,
    message,
    { statusCode: 409, details }
);

const serviceUnavailableError = (message, details = null) => new DomainError(
    DomainErrorCode.SERVICE_UNAVAILABLE,
    message,
    { statusCode: 503, details }
);

/** @param {Error} error */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

/** @param {Error} error */
const isInsufficientStockError = (error) => Boolean(error) && error.name === 'InsufficientStockError';

const noTenantDatabaseError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant database is registered for this business.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_DATABASE' } }
);

const mapTenantDatabaseError = (error) => {
    if (error.reason === 'missing' || error.reason === 'not_configured') {
        return noTenantDatabaseError();
    }
    return new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        error.message,
        { statusCode: 503, details: { error_code: 'TENANT_DATABASE_UNAVAILABLE', reason: error.reason } }
    );
};

const PAYMENT_METHODS = ['cash', 'gcash', 'credit_card'];
const NON_CASH_PAYMENT_METHODS = ['gcash', 'credit_card'];

/**
 * Best-effort cleanup helper: releases a reservation and marks the order
 * failed. Swallows a release failure (never masks the original error the
 * caller is already returning) but still surfaces it in a console warning
 * — the fallback hold-TTL (D-09 belt-and-suspenders) still reclaims the
 * stock even if this best-effort release itself fails.
 */
async function failOrder({ orderRepository, releaseReservation, businessId, order, publicReference }) {
    try {
        await releaseReservation(businessId, publicReference);
    } catch (releaseError) {
        // eslint-disable-next-line no-console
        console.warn('[placeOrder] releaseReservation failed during order-failure cleanup; fallback hold-TTL will reclaim stock.', releaseError);
    }
    try {
        await orderRepository.updateOrder(order.id, { status: 'failed' });
    } catch (updateError) {
        // eslint-disable-next-line no-console
        console.warn('[placeOrder] failed to mark order as failed after cleanup.', updateError);
    }
}

/**
 * Builds the placeOrder use case.
 *
 * @param {{
 *   validateCart: Function,
 *   resolveCheckoutIdentity: Function,
 *   orderRepository: Object,
 *   reserveStock: Function,
 *   releaseReservation: Function,
 *   setReservationExpiry: Function,
 *   createQrphSession: Function,
 *   finalizeCashOrder?: Function|null,
 *   validateFulfillment?: Function,
 *   holdFallbackMinutes?: number
 * }} deps
 *   - `reserveStock`/`releaseReservation`/`setReservationExpiry` are thin
 *     PORT functions matching InventoryReservationRepository's own method
 *     signatures directly — `reserveStock({businessId, lines, referenceId,
 *     expiresAt}) => {reservations}`, `releaseReservation(businessId,
 *     referenceId) => count`, `setReservationExpiry(businessId, referenceId,
 *     expiresAt) => count`. This deliberately bypasses 10-02's
 *     buildReserveStockUseCase/buildReleaseReservationUseCase/
 *     buildSetReservationExpiryUseCase usecase wrappers, which gate on a
 *     staff-or-owner `businessRepository.getMembership(accountId,
 *     businessId)` check — a check that has no meaning for a consumer
 *     storefront order (there is no staff accountId; a guest or a logged-in
 *     DGFY Account is never a "staff member of the business" being ordered
 *     from). Placing a stock hold for a consumer order is a system-initiated
 *     write, not a staff action, so this usecase talks to the repository's
 *     capability directly (mirrors 10-07's own `commitReservation` port
 *     convention for the exact same reason). ADR 0029's single-writer
 *     contract is preserved at the STOCK-EFFECT layer regardless (only
 *     `recordSale`, invoked from `commitReservation` on the finalize path,
 *     ever writes InventoryMovement/stock_count — this file never does).
 *   - `finalizeCashOrder` is OPTIONAL (mirrors 10-07's own
 *     `buildAvailmentsModule({commitReservation})` optionality convention).
 *     When omitted, a cash order placement fails closed with 503 rather
 *     than crashing at construction time, letting gcash/credit_card
 *     checkout still function even before 10-07/10-08's full composition
 *     is wired in.
 * @returns {Function}
 */
export function buildPlaceOrderUseCase({
    validateCart,
    resolveCheckoutIdentity,
    orderRepository,
    reserveStock,
    releaseReservation,
    setReservationExpiry,
    createQrphSession,
    finalizeCashOrder = null,
    validateFulfillment = defaultValidateFulfillment,
    holdFallbackMinutes = STOREFRONT_HOLD_FALLBACK_MINUTES
} = {}) {
    if (typeof validateCart !== 'function') {
        throw new Error('buildPlaceOrderUseCase requires a validateCart function.');
    }
    if (typeof resolveCheckoutIdentity !== 'function') {
        throw new Error('buildPlaceOrderUseCase requires a resolveCheckoutIdentity function.');
    }
    if (!orderRepository) {
        throw new Error('buildPlaceOrderUseCase requires an orderRepository.');
    }
    if (typeof reserveStock !== 'function') {
        throw new Error('buildPlaceOrderUseCase requires a reserveStock function.');
    }
    if (typeof releaseReservation !== 'function') {
        throw new Error('buildPlaceOrderUseCase requires a releaseReservation function.');
    }
    if (typeof setReservationExpiry !== 'function') {
        throw new Error('buildPlaceOrderUseCase requires a setReservationExpiry function.');
    }
    if (typeof createQrphSession !== 'function') {
        throw new Error('buildPlaceOrderUseCase requires a createQrphSession function.');
    }

    return async (input = {}) => {
        const {
            businessId,
            idempotencyKey,
            authenticatedAccountId = null,
            guestIdentityId = null,
            lines = [],
            fulfillmentMode,
            fulfillmentTiming,
            requestedFor = null,
            businessHours = null,
            paymentMethod,
            contact = {},
            now = new Date()
        } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        const trimmedIdempotencyKey = String(idempotencyKey || '').trim();
        if (trimmedIdempotencyKey.length < 8) {
            return ApplicationResult.failure(validationError('idempotency_key is required (minimum 8 characters).'));
        }
        if (!PAYMENT_METHODS.includes(paymentMethod)) {
            return ApplicationResult.failure(validationError(`payment_method must be one of: ${PAYMENT_METHODS.join(', ')}.`));
        }

        // Normalized request payload hashed BEFORE any side effects, so the
        // idempotency short-circuit (0) never needs to touch the tenant
        // catalog/DB first.
        const normalizedRequestPayload = {
            businessId,
            lines,
            fulfillmentMode,
            fulfillmentTiming,
            requestedFor,
            paymentMethod,
            contact
        };
        const requestHash = computeRequestHash(normalizedRequestPayload);

        // (0) Idempotency short-circuit (D-04).
        const existingOrder = await orderRepository.findByIdempotency({
            tenant_id: businessId,
            target_type: 'storefront_checkout',
            idempotency_key: trimmedIdempotencyKey
        });
        if (existingOrder) {
            if (existingOrder.request_hash !== requestHash) {
                return ApplicationResult.failure(conflictError(
                    'idempotency_key was already used with a different payload.',
                    { error_code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' }
                ));
            }
            return ApplicationResult.success({
                order_reference: existingOrder.public_reference,
                status: existingOrder.status,
                idempotent_replay: true
            });
        }

        // (1) validateCart — server-side re-pricing, never trusts a
        // client-supplied price/total (T-10-06-01).
        const cartResult = await validateCart({ businessId, lines });
        if (cartResult.isFailure) return cartResult;
        const { normalizedLines, totalCentavos } = cartResult.data;

        // (2) resolveCheckoutIdentity — account always wins when present,
        // else a verified guest identity, else 401 (10-04).
        const identityResult = await resolveCheckoutIdentity({ authenticatedAccountId, guestIdentityId });
        if (identityResult.isFailure) return identityResult;
        const customerAccountId = identityResult.data.customer_account_id ?? null;
        const resolvedGuestIdentityId = identityResult.data.guest_identity_id ?? null;

        // (3) validateFulfillment — mode/timing/business-hours/lead/advance
        // (D-11..D-13). Throws a typed DomainError naming which bound failed.
        let fulfillment;
        try {
            fulfillment = validateFulfillment({
                fulfillmentMode,
                fulfillmentTiming,
                requestedFor,
                businessHours,
                now
            });
        } catch (fulfillmentError) {
            if (fulfillmentError instanceof DomainError) {
                return ApplicationResult.failure(fulfillmentError);
            }
            throw fulfillmentError;
        }

        // (4) DURABLE landlord order insert FIRST (STF-05, D-10) — before
        // any tenant write or payment session exists.
        const publicReference = generateOrderPublicReference();
        const checkoutPayload = {
            lines: normalizedLines,
            contact,
            fulfillment_mode: fulfillmentMode,
            fulfillment_timing: fulfillmentTiming,
            requested_for: fulfillment.requestedFor,
            payment_method: paymentMethod
        };

        let order;
        try {
            order = await orderRepository.createOrder({
                public_reference: publicReference,
                tenant_id: businessId,
                target_type: 'storefront_checkout',
                idempotency_key: trimmedIdempotencyKey,
                request_hash: requestHash,
                status: 'pending_payment',
                customer_account_id: customerAccountId,
                guest_identity_id: resolvedGuestIdentityId,
                fulfillment_mode: fulfillmentMode,
                fulfillment_timing: fulfillmentTiming,
                requested_for: fulfillment.requestedFor,
                payment_method: paymentMethod,
                checkout_payload: checkoutPayload,
                total_centavos: totalCentavos
            });
        } catch (createError) {
            // Lost-guard idempotency race (T-10-06-02): two concurrent
            // submits with the same idempotency_key both missed step (0)'s
            // lookup. Re-select and apply the same replay/conflict logic
            // rather than surfacing a raw unique-constraint error.
            if (isUniqueConstraintViolation(createError)) {
                const winner = await orderRepository.findByIdempotency({
                    tenant_id: businessId,
                    target_type: 'storefront_checkout',
                    idempotency_key: trimmedIdempotencyKey
                });
                if (winner) {
                    if (winner.request_hash !== requestHash) {
                        return ApplicationResult.failure(conflictError(
                            'idempotency_key was already used with a different payload.',
                            { error_code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH' }
                        ));
                    }
                    return ApplicationResult.success({
                        order_reference: winner.public_reference,
                        status: winner.status,
                        idempotent_replay: true
                    });
                }
            }
            throw createError;
        }

        // (5) reserveStock — tenant write, fail-fast on
        // TenantDatabaseUnavailableError (D-10). A fallback hold-TTL is
        // ALWAYS stamped here so the reservation is never created with a
        // null/open-ended expiry, even if step (6) never re-stamps the
        // shared D-08 clock (e.g. the process crashes between steps) — the
        // sweep can always reclaim it (D-09 belt-and-suspenders).
        const fallbackExpiresAt = new Date(now.getTime() + Number(holdFallbackMinutes) * 60 * 1000);
        try {
            await reserveStock({
                businessId,
                lines: normalizedLines.map((line) => ({ productId: line.product_id, quantity: line.quantity })),
                referenceId: publicReference,
                expiresAt: fallbackExpiresAt
            });
        } catch (reserveError) {
            await orderRepository.updateOrder(order.id, { status: 'failed' });
            if (isTenantDatabaseUnavailableError(reserveError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(reserveError));
            }
            if (isInsufficientStockError(reserveError)) {
                return ApplicationResult.failure(conflictError(
                    reserveError.message,
                    { error_code: 'INSUFFICIENT_STOCK' }
                ));
            }
            throw reserveError;
        }

        // (6b) cash: [ASSUMED A3] finalize immediately at placement.
        if (paymentMethod === 'cash') {
            if (typeof finalizeCashOrder !== 'function') {
                await failOrder({ orderRepository, releaseReservation, businessId, order, publicReference });
                return ApplicationResult.failure(serviceUnavailableError(
                    'Cash order finalization is not yet available.',
                    { error_code: 'CASH_FINALIZE_UNAVAILABLE' }
                ));
            }

            const finalizeResult = await finalizeCashOrder({
                businessId,
                sourceReference: publicReference,
                customerAccountId,
                lines: normalizedLines.map((line) => ({
                    productId: line.product_id,
                    quantity: line.quantity,
                    unitPrice: formatCentavos(line.unit_price_centavos)
                })),
                totalCentavos,
                paymentMethod,
                fulfillmentMode,
                requestedFor: fulfillment.requestedFor
            });

            if (finalizeResult.isFailure) {
                await failOrder({ orderRepository, releaseReservation, businessId, order, publicReference });
                return finalizeResult;
            }

            await orderRepository.updateOrder(order.id, {
                status: 'finalized',
                availment_id: finalizeResult.data?.availment?.id ?? null
            });

            return ApplicationResult.success({
                order_reference: publicReference,
                status: 'finalized'
            });
        }

        // (6a) gcash/credit_card: createQrphSession, wrapped so a
        // provider/session failure ALWAYS releases the reservation and
        // marks the order failed — no order is ever left holding stock
        // without a live session (D-09 no-manual-step).
        if (!NON_CASH_PAYMENT_METHODS.includes(paymentMethod)) {
            // Unreachable given the earlier PAYMENT_METHODS guard, but keeps
            // this branch exhaustive/defensive.
            await failOrder({ orderRepository, releaseReservation, businessId, order, publicReference });
            return ApplicationResult.failure(validationError(`Unsupported payment_method: ${paymentMethod}.`));
        }

        let sessionResult;
        try {
            sessionResult = await createQrphSession({
                order: {
                    id: order.id,
                    public_reference: publicReference,
                    tenant_id: businessId,
                    total_centavos: totalCentavos
                }
            });
        } catch (sessionError) {
            await failOrder({ orderRepository, releaseReservation, businessId, order, publicReference });
            throw sessionError;
        }

        if (sessionResult.isFailure) {
            await failOrder({ orderRepository, releaseReservation, businessId, order, publicReference });
            return sessionResult;
        }

        // Strict order preserved: the session now exists ONLY because the
        // reservation already succeeded (Pitfall 4) — re-stamp the ONE
        // shared expires_at (D-08) onto both the reservation and the order.
        const sharedExpiresAt = sessionResult.data.expires_at;
        await setReservationExpiry(businessId, publicReference, sharedExpiresAt);
        await orderRepository.updateOrder(order.id, { status: 'awaiting_payment', expires_at: sharedExpiresAt });

        return ApplicationResult.success({
            order_reference: publicReference,
            qr_code_image_url: sessionResult.data.qr_code_image_url,
            expires_at: sharedExpiresAt,
            status: 'awaiting_payment'
        });
    };
}

export default buildPlaceOrderUseCase;

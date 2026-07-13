import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// getOrderStatusUseCases.js — Phase 10 Plan 06 Task 2 (STF-05 consumer
// read). Resolves an order's status by its opaque public_reference,
// guarding a guest-identity-linked order behind an optional email binding.

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const notFoundError = (message, details = null) => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    message,
    { statusCode: 404, details }
);

const authorizationError = (message, details = null) => new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    message,
    { statusCode: 403, details }
);

/**
 * Builds the getOrderStatus use case (STF-05 consumer read).
 *
 * IDOR guard (T-10-06-05): lookup is ALWAYS by the opaque `public_reference`
 * (never the internal UUID id — `storefront_orders.id` is never accepted as
 * input and never returned). A guest-identity-linked order additionally
 * requires `requesterEmail` to match the linked guest identity's verified
 * email (found by re-using `guestIdentityRepository.findByEmail`, matching
 * its id against `order.guest_identity_id`) — a guest cannot read another
 * guest's order just by guessing/forwarding a reference without proving the
 * matching email. An account-linked order (`customer_account_id` set) is
 * reachable by the opaque reference alone, matching this usecase's given
 * `{reference, requesterEmail?}` interface (no `authenticatedAccountId`
 * parameter is part of this plan's contract).
 *
 * @param {{orderRepository, guestIdentityRepository?: Object}} deps
 */
export function buildGetOrderStatusUseCase({ orderRepository, guestIdentityRepository = null } = {}) {
    if (!orderRepository) {
        throw new Error('buildGetOrderStatusUseCase requires an orderRepository.');
    }

    return async ({ reference, requesterEmail } = {}) => {
        if (!reference) {
            return ApplicationResult.failure(validationError('reference is required.'));
        }

        const order = await orderRepository.findByPublicReference(reference);
        if (!order) {
            return ApplicationResult.failure(notFoundError('Order not found.'));
        }

        if (order.guest_identity_id) {
            if (!requesterEmail) {
                return ApplicationResult.failure(authorizationError(
                    'requesterEmail is required to look up a guest order.',
                    { error_code: 'REQUESTER_EMAIL_REQUIRED' }
                ));
            }
            const guest = guestIdentityRepository
                ? await guestIdentityRepository.findByEmail(requesterEmail)
                : null;
            if (!guest || guest.id !== order.guest_identity_id) {
                return ApplicationResult.failure(authorizationError(
                    'The provided email does not match this order.',
                    { error_code: 'ORDER_EMAIL_MISMATCH' }
                ));
            }
        }

        return ApplicationResult.success({
            order_reference: order.public_reference,
            status: order.status,
            fulfillment_mode: order.fulfillment_mode,
            fulfillment_timing: order.fulfillment_timing,
            requested_for: order.requested_for,
            payment_method: order.payment_method,
            total_centavos: order.total_centavos,
            expires_at: order.expires_at
        });
    };
}

export default buildGetOrderStatusUseCase;

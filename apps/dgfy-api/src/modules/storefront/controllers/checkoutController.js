import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter) for
// order placement + status (STF-04/STF-05, 10-06-PLAN.md), mirroring
// ../discoveryController.js/../guestCheckoutController.js. Parses HTTP
// request data, calls the injected use case, and formats the response via
// sendUseCaseResult. No business logic, no direct model/repository imports.
//
// placeOrder is mounted behind an OPTIONAL account-auth middleware (see
// ../routes.js) so a logged-in DGFY Account's identity always wins, but a
// verified guest (guestIdentityId in the body, from 10-04's
// verifyGuestOtp) is never forced to log in — account is optional, never
// forced (must_haves truth #3, reused from checkout/identity's convention).
//
// getOrderStatus is PUBLIC (no auth) — its own IDOR guard (opaque
// public_reference + optional guest email binding) is the use case's
// responsibility, not this controller's.
//
// @param {Object} [useCases] - storefront module use cases (buildStorefrontModule().useCases)
export function buildCheckoutController(useCases = {}) {
    return {
        // POST /storefront/checkout
        // req.account is populated by the OPTIONAL auth middleware when a
        // valid bearer is present (see ../routes.js's optionalAuthenticateAccount);
        // otherwise it is undefined and the guest path (body.guestIdentityId)
        // applies.
        async placeOrder(req, res) {
            const body = req.body || {};
            const result = await useCases.placeOrder({
                businessId: body.businessId,
                idempotencyKey: req.headers['idempotency-key'] || body.idempotencyKey,
                authenticatedAccountId: req.account?.id ?? null,
                guestIdentityId: body.guestIdentityId ?? null,
                lines: body.lines,
                fulfillmentMode: body.fulfillmentMode,
                fulfillmentTiming: body.fulfillmentTiming,
                requestedFor: body.requestedFor ?? null,
                businessHours: body.businessHours ?? null,
                paymentMethod: body.paymentMethod,
                contact: body.contact ?? {}
            });
            return sendUseCaseResult(res, result, 201);
        },

        // GET /storefront/orders/:reference
        async getOrderStatus(req, res) {
            const result = await useCases.getOrderStatus({
                reference: req.params.reference,
                requesterEmail: req.query?.email ?? null
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildCheckoutController;

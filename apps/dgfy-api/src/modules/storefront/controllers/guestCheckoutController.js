import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter) for the
// guest checkout identity surface (STF-03, 10-04-PLAN.md), mirroring
// ../discoveryController.js. Parses HTTP request data, calls the injected
// use case, and formats the response via sendUseCaseResult. No business
// logic, no direct model/repository imports.
//
// requestOtp/verifyOtp are always PUBLIC (unauthenticated) — guest email
// verification never depends on login state. resolveIdentity is mounted
// behind an OPTIONAL account-auth middleware (see ../routes.js) so an
// authenticated caller's DGFY Account always wins; a guest caller supplies
// guestIdentityId in the body instead — account is optional, never forced
// (must_haves truth #3).
//
// @param {Object} [useCases] - storefront module use cases (buildStorefrontModule().useCases)
export function buildGuestCheckoutController(useCases = {}) {
    return {
        // POST /storefront/guest/otp/request
        async requestOtp(req, res) {
            const body = req.body || {};
            const result = await useCases.requestGuestOtp({ email: body.email });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /storefront/guest/otp/verify
        async verifyOtp(req, res) {
            const body = req.body || {};
            const result = await useCases.verifyGuestOtp({
                email: body.email,
                code: body.code,
                phone: body.phone,
                displayName: body.displayName
            });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /storefront/checkout/identity
        // req.account is populated by the OPTIONAL auth middleware when a
        // valid bearer is present (see ../routes.js's optionalAuthenticateAccount);
        // otherwise it is undefined and the guest path (body.guestIdentityId)
        // applies.
        async resolveIdentity(req, res) {
            const body = req.body || {};
            const result = await useCases.resolveCheckoutIdentity({
                authenticatedAccountId: req.account?.id ?? null,
                guestIdentityId: body.guestIdentityId ?? null
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildGuestCheckoutController;

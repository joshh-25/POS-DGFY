import express from 'express';
import rateLimit from 'express-rate-limit';
import { buildDiscoveryController } from './controllers/discoveryController.js';
import { buildGuestCheckoutController } from './controllers/guestCheckoutController.js';

// Wires Express routing for the storefront module's PUBLIC discovery
// surface (Interface Adapter). Routes are thin: define paths/methods and
// delegate to the injected controller. Errors from async handlers are
// forwarded to Express's error middleware via `.catch(next)`, mirroring
// ../products/routes.js's createProductRoutes() shape.
//
// Signature intentionally matches the products module's
// createXRoutes(useCases, { authenticateAccount }) convention for
// composition-root consistency (the composition root passes
// authenticateAccount uniformly to every module). T-10-03 discovery/
// store-page routes stay unauthenticated (guest browsing). 10-04
// (STF-03/D-06) adds guest OTP request/verify (always public — email
// verification never depends on login state) plus a checkout-identity
// resolve route that uses `authenticateAccount` OPTIONALLY, so a logged-in
// DGFY Account's identity always wins but a guest is never forced to log in
// (must_haves truth #3).
//
// express-rate-limit guards the public discovery endpoints against
// scraping/DoS (T-10-03-03) — no auth gate exists to rely on instead.
const discoveryLimiter = rateLimit({
    windowMs: Number.parseInt(process.env.RATE_LIMIT_STOREFRONT_DISCOVERY_WINDOW_MS || '', 10) || 60 * 1000,
    max: Number.parseInt(process.env.RATE_LIMIT_STOREFRONT_DISCOVERY_MAX_REQUESTS || '', 10) || 60,
    standardHeaders: true,
    legacyHeaders: false
});

// Separate, tighter limiter for the guest OTP request/verify routes
// (T-10-04-01: OTP brute-force/spam guard) — on top of, not instead of,
// emailOtp.js's own hashing + EMAIL_OTP_MAX_ATTEMPTS + single-active-OTP
// enforcement. A stricter default than discoveryLimiter's browse-traffic
// budget since OTP requests are far more sensitive (email delivery cost,
// brute-force surface).
const guestOtpLimiter = rateLimit({
    windowMs: Number.parseInt(process.env.RATE_LIMIT_STOREFRONT_GUEST_OTP_WINDOW_MS || '', 10) || 60 * 1000,
    max: Number.parseInt(process.env.RATE_LIMIT_STOREFRONT_GUEST_OTP_MAX_REQUESTS || '', 10) || 10,
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Wraps the accounts module's REQUIRED `authenticateAccount` middleware
 * (../accounts/middleware/accountAuthMiddleware.js — 401s when the bearer
 * is missing/invalid) into an OPTIONAL pass-through: no Authorization
 * header at all skips auth entirely (guest path); a present-but-invalid/
 * expired bearer is treated the same as "no account" rather than blocking
 * the request (`req.account` stays unset, guest path applies) — checkout
 * identity resolution itself decides whether SOME identity (account OR
 * verified guest) is required, this middleware only ever ATTACHES an
 * account, never REJECTS a request for lacking one.
 * @param {Function} authenticateAccount
 */
const buildOptionalAuthenticateAccount = (authenticateAccount) => (req, res, next) => {
    if (!req.headers.authorization) {
        return next();
    }
    // Intercept authenticateAccount's failure response (it calls
    // res.status(401).json(...) directly) by handing it a stand-in `res`
    // that routes the failure into `next()` (guest path) instead of
    // terminating the request. The success path never touches `res` — it
    // just sets req.account and calls the real `next` closed over here.
    const passthroughRes = {
        status: () => passthroughRes,
        json: () => next()
    };
    Promise.resolve(authenticateAccount(req, passthroughRes, next))
        .catch(() => next());
};

/**
 * @param {Object} useCases - storefront module use cases (buildStorefrontModule().useCases)
 * @param {{authenticateAccount?: Function}} [deps]
 */
export function createStorefrontRoutes(useCases = {}, { authenticateAccount } = {}) {
    const router = express.Router();
    const discoveryController = buildDiscoveryController(useCases);
    const guestCheckoutController = buildGuestCheckoutController(useCases);
    const optionalAuthenticateAccount = typeof authenticateAccount === 'function'
        ? buildOptionalAuthenticateAccount(authenticateAccount)
        : (req, res, next) => next();

    router.get('/discovery/search', discoveryLimiter, (req, res, next) => discoveryController.searchDiscovery(req, res).catch(next));
    router.get('/stores/:handle', discoveryLimiter, (req, res, next) => discoveryController.getStorePage(req, res).catch(next));

    router.post('/guest/otp/request', guestOtpLimiter, (req, res, next) => guestCheckoutController.requestOtp(req, res).catch(next));
    router.post('/guest/otp/verify', guestOtpLimiter, (req, res, next) => guestCheckoutController.verifyOtp(req, res).catch(next));

    router.post('/checkout/identity', guestOtpLimiter, optionalAuthenticateAccount, (req, res, next) => guestCheckoutController.resolveIdentity(req, res).catch(next));

    return router;
}

export default createStorefrontRoutes;

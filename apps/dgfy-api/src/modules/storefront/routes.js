import express from 'express';
import rateLimit from 'express-rate-limit';
import { buildDiscoveryController } from './controllers/discoveryController.js';

// Wires Express routing for the storefront module's PUBLIC discovery
// surface (Interface Adapter). Routes are thin: define paths/methods and
// delegate to the injected controller. Errors from async handlers are
// forwarded to Express's error middleware via `.catch(next)`, mirroring
// ../products/routes.js's createProductRoutes() shape.
//
// Signature intentionally matches the products module's
// createXRoutes(useCases, { authenticateAccount }) convention for
// composition-root consistency (the composition root passes
// authenticateAccount uniformly to every module) — but `authenticateAccount`
// is unused here: T-10-03 discovery/store-page routes are consumer-facing
// and unauthenticated (guest browsing, no login required). A later plan
// (10-04/10-06) may add authenticated storefront routes on this same
// router without changing this signature.
//
// express-rate-limit guards the public discovery endpoints against
// scraping/DoS (T-10-03-03) — no auth gate exists to rely on instead.
const discoveryLimiter = rateLimit({
    windowMs: Number.parseInt(process.env.RATE_LIMIT_STOREFRONT_DISCOVERY_WINDOW_MS || '', 10) || 60 * 1000,
    max: Number.parseInt(process.env.RATE_LIMIT_STOREFRONT_DISCOVERY_MAX_REQUESTS || '', 10) || 60,
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * @param {Object} useCases - storefront module use cases (buildStorefrontModule().useCases)
 * @param {{authenticateAccount?: Function}} [deps]
 */
export function createStorefrontRoutes(useCases = {}, { authenticateAccount } = {}) {
    void authenticateAccount; // unused — see file header note; kept for signature parity.

    const router = express.Router();
    const discoveryController = buildDiscoveryController(useCases);

    router.get('/discovery/search', discoveryLimiter, (req, res, next) => discoveryController.searchDiscovery(req, res).catch(next));
    router.get('/stores/:handle', discoveryLimiter, (req, res, next) => discoveryController.getStorePage(req, res).catch(next));

    return router;
}

export default createStorefrontRoutes;

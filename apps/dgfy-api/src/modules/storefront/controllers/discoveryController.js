import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter) for the
// PUBLIC storefront discovery surface (STF-01/STF-02), mirroring
// ../../products/controllers/productController.js. Parses HTTP request
// data, calls the injected use case, and formats the response via
// sendUseCaseResult. No business logic, no direct model/repository imports
// — this directory is blocked from importing models by
// apps/dgfy-api/eslint.config.mjs's no-restricted-imports rule.
//
// Both routes are UNAUTHENTICATED (public discovery/browse), unlike
// productController.js's owner/membership-gated routes.
//
// @param {Object} [useCases] - storefront module use cases (buildStorefrontModule().useCases)
export function buildDiscoveryController(useCases = {}) {
    return {
        // GET /storefront/discovery/search
        async searchDiscovery(req, res) {
            const query = req.query || {};
            const result = await useCases.searchDiscovery({
                lat: query.lat,
                lng: query.lng,
                radiusKm: query.radiusKm ?? query.radius,
                query: query.query ?? query.q,
                category: query.category,
                openNow: query.openNow ?? query.open_now,
                limit: query.limit,
                offset: query.offset
            });
            return sendUseCaseResult(res, result, 200);
        },

        // GET /storefront/stores/:handle
        async getStorePage(req, res) {
            const result = await useCases.getStorePage({ handle: req.params.handle });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildDiscoveryController;

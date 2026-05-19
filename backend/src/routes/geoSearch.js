import express from 'express';
import { searchNearbyStores } from '../modules/geoSearch/controllers/geoSearchHandlers.js';
import { validateGeoSearchQuery } from '../validators/geoSearchValidator.js';
import { geoSearchLimiter } from '../middleware/rateLimiter.js';
import { setReadCacheControl } from '../middleware/cachePolicy.js';

const router = express.Router();

// Short public cache: 20s browser / 20s CDN, 60s stale-while-revalidate.
// Stays inside the 60-120s TTL budget from the proposal.
const geoSearchCacheControl = setReadCacheControl({
    maxAgeSeconds: 20,
    sMaxAgeSeconds: 20,
    staleWhileRevalidateSeconds: 60,
    staleIfErrorSeconds: 90,
    scope: 'public'
});

// GET /api/v1/storefront/geo-search?query=milk&latitude=10.3&longitude=122.5&radius=5
router.get(
    '/geo-search',
    geoSearchLimiter,
    geoSearchCacheControl,
    validateGeoSearchQuery,
    searchNearbyStores
);

export default router;

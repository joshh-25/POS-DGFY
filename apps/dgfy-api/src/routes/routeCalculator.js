import express from 'express';
import { calculateRoute } from '../modules/routeCalculator/controllers/routeCalculatorHandlers.js';
import { validateRouteCalculatorQuery } from '../validators/routeCalculatorValidator.js';
import { routeCalculatorLimiter } from '../middleware/rateLimiter.js';
import { setReadCacheControl } from '../middleware/cachePolicy.js';

const router = express.Router();

// Short public cache: a given origin/dest coordinate pair's road route doesn't
// change minute to minute, and re-selecting the same store is a common case.
const routeCalculatorCacheControl = setReadCacheControl({
    maxAgeSeconds: 30,
    sMaxAgeSeconds: 30,
    staleWhileRevalidateSeconds: 60,
    staleIfErrorSeconds: 120,
    scope: 'public'
});

// GET /api/v1/storefront/route?origin_lat=10.3&origin_lng=122.5&dest_lat=10.32&dest_lng=122.51
router.get(
    '/route',
    routeCalculatorLimiter,
    routeCalculatorCacheControl,
    validateRouteCalculatorQuery,
    calculateRoute
);

export default router;

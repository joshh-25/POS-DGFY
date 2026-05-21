import express from 'express';
import * as storefrontDiscoveryController from '../controllers/storefrontDiscoveryController.js';
import {
    validateStorefrontDiscoveryQuery,
    validateStorefrontSlugParam
} from '../validators/storefrontDiscoveryValidator.js';
import { storefrontDiscoveryLimiter } from '../middleware/rateLimiter.js';
import { setReadCacheControl } from '../middleware/cachePolicy.js';

const router = express.Router();
const discoveryListCacheControl = setReadCacheControl({
    maxAgeSeconds: 20,
    sMaxAgeSeconds: 20,
    staleWhileRevalidateSeconds: 40,
    staleIfErrorSeconds: 90,
    scope: 'public'
});
const discoveryProfileCacheControl = setReadCacheControl({
    maxAgeSeconds: 30,
    sMaxAgeSeconds: 30,
    staleWhileRevalidateSeconds: 60,
    staleIfErrorSeconds: 120,
    scope: 'public'
});

router.get('/discovery', storefrontDiscoveryLimiter, discoveryListCacheControl, validateStorefrontDiscoveryQuery, storefrontDiscoveryController.listStorefrontDiscovery);
router.get('/discovery/:slug', storefrontDiscoveryLimiter, discoveryProfileCacheControl, validateStorefrontSlugParam, storefrontDiscoveryController.getStorefrontProfile);

export default router;

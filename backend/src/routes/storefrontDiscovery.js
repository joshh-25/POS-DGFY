import express from 'express';
import * as storefrontDiscoveryController from '../controllers/storefrontDiscoveryController.js';
import {
    validateStorefrontDiscoveryQuery,
    validateStorefrontMapPinsQuery,
    validateStorefrontSlugParam,
    validateUpsertExternalListing
} from '../validators/storefrontDiscoveryValidator.js';
import { storefrontDiscoveryLimiter } from '../middleware/rateLimiter.js';
import { setReadCacheControl } from '../middleware/cachePolicy.js';
import { authenticate, requireMasterAdmin } from '../middleware/auth.js';

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
router.get('/discovery/map-pins', storefrontDiscoveryLimiter, discoveryListCacheControl, validateStorefrontMapPinsQuery, storefrontDiscoveryController.listStorefrontMapPins);

// Master-admin-only write surface for entity_type: 'external_listing' rows — stores
// that transact on a different platform. Registered before the /discovery/:slug
// catch-all below so the literal '/external' segment doesn't get captured as a slug.
router.get('/discovery/external', authenticate, requireMasterAdmin, storefrontDiscoveryController.listExternalListings);
router.put('/discovery/external/:slug', authenticate, requireMasterAdmin, validateStorefrontSlugParam, validateUpsertExternalListing, storefrontDiscoveryController.upsertExternalListing);
router.delete('/discovery/external/:slug', authenticate, requireMasterAdmin, validateStorefrontSlugParam, storefrontDiscoveryController.deleteExternalListing);

router.get('/discovery/:slug', storefrontDiscoveryLimiter, discoveryProfileCacheControl, validateStorefrontSlugParam, storefrontDiscoveryController.getStorefrontProfile);

export default router;

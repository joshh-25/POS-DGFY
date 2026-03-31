import express from 'express';
import * as storefrontDiscoveryController from '../controllers/storefrontDiscoveryController.js';
import {
    validateStorefrontDiscoveryQuery,
    validateStorefrontSlugParam
} from '../validators/storefrontDiscoveryValidator.js';
import { storefrontDiscoveryLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.get('/discovery', storefrontDiscoveryLimiter, validateStorefrontDiscoveryQuery, storefrontDiscoveryController.listStorefrontDiscovery);
router.get('/discovery/:slug', storefrontDiscoveryLimiter, validateStorefrontSlugParam, storefrontDiscoveryController.getStorefrontProfile);

export default router;

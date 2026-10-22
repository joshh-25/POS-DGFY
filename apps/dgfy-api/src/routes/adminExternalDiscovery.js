import express from 'express';
import { authenticateAdmin, requirePlatformMaster } from '../middleware/auth.js';
import {
  listExternalAdmin,
  saveExternalSite,
  saveExternalListing,
  removeExternalListing,
  clearTemporaryExternalListings
} from '../modules/storefrontDiscovery/controllers/externalRedirectHandlers.js';

const router = express.Router();
router.use(authenticateAdmin, requirePlatformMaster);
router.get('/', listExternalAdmin);
router.put('/sites/:siteKey', saveExternalSite);
router.put('/listings/:slug', saveExternalListing);
router.delete('/listings/:slug', removeExternalListing);
router.post('/temporary/clear', clearTemporaryExternalListings);

export default router;

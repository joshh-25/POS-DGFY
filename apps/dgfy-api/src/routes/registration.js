import express from 'express';
import { listRegistrationIndustries } from '../modules/registration/controllers/registrationIndustryHandlers.js';
import { tenantRegistrationLimiter } from '../middleware/rateLimiter.js';
import { setReadCacheControl } from '../middleware/cachePolicy.js';

const router = express.Router();

// Short public cache - the catalog is code-owned and changes only on
// deploy, but a short TTL still lets an admin's template publish/deprecate
// reach the picker without a redeploy (same budget as geoSearch.js).
const industriesCacheControl = setReadCacheControl({
    maxAgeSeconds: 30,
    sMaxAgeSeconds: 30,
    staleWhileRevalidateSeconds: 60,
    staleIfErrorSeconds: 90,
    scope: 'public'
});

// GET /api/v1/registration/industries - the merchant-facing Industry
// catalog every signup surface's picker reads (issue #178 "templates
// become the Operating Mode" follow-up). No auth: called before a DGFY
// account or tenant exists. Shares the registration rate limiter with
// POST /admin/tenants/register since both sit in front of the same funnel.
router.get('/industries', tenantRegistrationLimiter, industriesCacheControl, listRegistrationIndustries);

export default router;

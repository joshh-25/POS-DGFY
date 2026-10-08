import express from 'express';
import { listRegistrationIndustries } from '../modules/registration/controllers/registrationIndustryHandlers.js';
import {
    approveCompanyRegistrationDraft,
    createCompanyRegistrationDraft,
    getCompanyRegistrationDraft,
    removeCompanyRegistrationFile,
    submitCompanyRegistrationDraft,
    updateCompanyRegistrationDraft,
    uploadCompanyRegistrationFile,
    retryCompanyRegistrationDraftMaterialization
} from '../modules/tenants/controllers/companyRegistrationDraftHandlers.js';
import { authenticateDgfyAccount } from '../middleware/dgfyAuth.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { companyRegistrationUpload } from '../config/companyRegistrationUpload.js';
import {
    companyRegistrationDraftLimiter,
    tenantRegistrationLimiter
} from '../middleware/rateLimiter.js';
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

// Authenticated registration drafts are landlord-side records. They do not
// create a tenant or enter a tenant database; provisioning is deferred until
// the later admin approval/materialization phase.
router.post('/drafts', authenticateDgfyAccount, companyRegistrationDraftLimiter, createCompanyRegistrationDraft);
router.get('/drafts/:draftId', authenticateDgfyAccount, companyRegistrationDraftLimiter, getCompanyRegistrationDraft);
router.patch('/drafts/:draftId', authenticateDgfyAccount, companyRegistrationDraftLimiter, updateCompanyRegistrationDraft);
router.post(
    '/drafts/:draftId/uploads',
    authenticateDgfyAccount,
    companyRegistrationDraftLimiter,
    companyRegistrationUpload.single('file'),
    uploadCompanyRegistrationFile
);
router.delete(
    '/drafts/:draftId/uploads/:uploadId',
    authenticateDgfyAccount,
    companyRegistrationDraftLimiter,
    removeCompanyRegistrationFile
);
router.post('/drafts/:draftId/submit', authenticateDgfyAccount, companyRegistrationDraftLimiter, submitCompanyRegistrationDraft);

// ADMIN: approval is the boundary that creates/provisions the tenant and
// materializes the approved Storefront snapshot into tenant storage.
router.post('/drafts/:draftId/approve', authenticateAdmin, approveCompanyRegistrationDraft);
router.post('/drafts/:draftId/retry-materialization', authenticateAdmin, retryCompanyRegistrationDraftMaterialization);

export default router;

import express from 'express';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    approveAffiliateCashout,
    cancelAffiliateInvite,
    getAffiliateQrPayload,
    getAffiliateSettings,
    inviteAffiliate,
    listAffiliateCashouts,
    listAffiliateEnrollmentStatusEvents,
    listAffiliateInvites,
    listAffiliates,
    markAffiliateCashoutPaid,
    provisionAffiliate,
    reactivateAffiliateEnrollment,
    rejectAffiliateCashout,
    updateAffiliateEnrollment,
    updateAffiliateSettings,
    listAffiliatePriceRules,
    upsertAffiliatePriceRule,
    deactivateAffiliatePriceRule,
    listAffiliateCategoryRates,
    upsertAffiliateCategoryRate,
    deactivateAffiliateCategoryRate
} from '../modules/dgfy/controllers/dgfyAffiliateHandlers.js';

const router = express.Router();

router.get(
    '/settings',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.VIEW_AFFILIATES),
    getAffiliateSettings
);
router.put(
    '/settings',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.MANAGE_AFFILIATE_SETTINGS),
    updateAffiliateSettings
);
router.get(
    '/affiliates',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.VIEW_AFFILIATES),
    listAffiliates
);
router.post(
    '/affiliates',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.MANAGE_AFFILIATES),
    provisionAffiliate
);
router.get(
    '/invites',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.VIEW_AFFILIATES),
    listAffiliateInvites
);
router.post(
    '/invites',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.MANAGE_AFFILIATES),
    inviteAffiliate
);
router.delete(
    '/invites/:invite_id',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.MANAGE_AFFILIATES),
    cancelAffiliateInvite
);
router.patch(
    '/affiliates/:enrollment_id',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.MANAGE_AFFILIATES),
    updateAffiliateEnrollment
);
// #1191 (Phase 207) - the only path that may perform a `suspended|revoked -> active` transition.
// The PATCH above explicitly rejects `status: 'active'`; this endpoint is where the
// max_affiliate_slots cap check (#1177, Phase 198) actually runs.
router.post(
    '/affiliates/:enrollment_id/reactivate',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.MANAGE_AFFILIATES),
    reactivateAffiliateEnrollment
);
router.get(
    '/affiliates/:enrollment_id/qr',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.VIEW_AFFILIATES),
    getAffiliateQrPayload
);
// #1202 (Phase 214) - status-transition history (J7). Read permission, matching /qr above - not
// MANAGE_AFFILIATES. Merchant-only surface; no affiliate-facing equivalent exists (J2).
router.get(
    '/affiliates/:enrollment_id/status-events',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.VIEW_AFFILIATES),
    listAffiliateEnrollmentStatusEvents
);
// Phase 1 affiliate pricing rule engine (see
// docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md). Selling-price rule only -
// commission configuration is part of /settings and /affiliates/:enrollment_id above.
router.get(
    '/price-rules',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.VIEW_AFFILIATES),
    listAffiliatePriceRules
);
router.put(
    '/price-rules',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.MANAGE_AFFILIATE_SETTINGS),
    upsertAffiliatePriceRule
);
router.delete(
    '/price-rules/:price_rule_id',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.MANAGE_AFFILIATE_SETTINGS),
    deactivateAffiliatePriceRule
);
// #448 (Phase 209) - the category tier of the commission rate ladder. Inserted immediately after
// the price-rules block, same authenticate + checkPermission pairs.
router.get(
    '/category-rates',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.VIEW_AFFILIATES),
    listAffiliateCategoryRates
);
router.put(
    '/category-rates',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.MANAGE_AFFILIATE_SETTINGS),
    upsertAffiliateCategoryRate
);
router.delete(
    '/category-rates/:category_rate_id',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.MANAGE_AFFILIATE_SETTINGS),
    deactivateAffiliateCategoryRate
);
router.get(
    '/cashouts',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.VIEW_AFFILIATES),
    listAffiliateCashouts
);
router.patch(
    '/cashouts/:cashout_id/approve',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.APPROVE_AFFILIATE_CASHOUTS),
    approveAffiliateCashout
);
router.patch(
    '/cashouts/:cashout_id/mark-paid',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.PAY_AFFILIATE_CASHOUTS),
    markAffiliateCashoutPaid
);
router.patch(
    '/cashouts/:cashout_id/reject',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.APPROVE_AFFILIATE_CASHOUTS),
    rejectAffiliateCashout
);

export default router;

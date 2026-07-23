import express from 'express';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    approveAffiliateCashout,
    getAffiliateQrPayload,
    getAffiliateSettings,
    listAffiliateCashouts,
    listAffiliates,
    markAffiliateCashoutPaid,
    provisionAffiliate,
    rejectAffiliateCashout,
    updateAffiliateEnrollment,
    updateAffiliateSettings
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
router.patch(
    '/affiliates/:enrollment_id',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.MANAGE_AFFILIATES),
    updateAffiliateEnrollment
);
router.get(
    '/affiliates/:enrollment_id/qr',
    authenticate,
    checkPermission(PERMISSIONS.AFFILIATES.actions.VIEW_AFFILIATES),
    getAffiliateQrPayload
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

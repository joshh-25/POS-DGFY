import express from 'express';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    getAffiliateQrPayload,
    getAffiliateSettings,
    listAffiliates,
    provisionAffiliate,
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

export default router;

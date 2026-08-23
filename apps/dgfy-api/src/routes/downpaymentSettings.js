import express from 'express';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { validateUpdateDownpaymentSettings } from '../validators/downpaymentSettingsValidator.js';
import {
    getDownpaymentSettings,
    updateDownpaymentSettings
} from '../modules/downpayment/controllers/downpaymentSettingsHandlers.js';

const router = express.Router();

// Phase 138 (#820). Mounted at /api/v1/downpayment (server.js), mirroring affiliateAdmin.js's
// /api/v1/affiliates convention -- leaves room for this epic's later admin endpoints (accept/
// reject, refund, balance settlement) to land as siblings under the same prefix.
router.get(
    '/settings',
    authenticate,
    checkPermission(PERMISSIONS.DOWNPAYMENT.actions.VIEW_DOWNPAYMENT_SETTINGS),
    getDownpaymentSettings
);
router.put(
    '/settings',
    authenticate,
    checkPermission(PERMISSIONS.DOWNPAYMENT.actions.MANAGE_DOWNPAYMENT_SETTINGS),
    validateUpdateDownpaymentSettings,
    updateDownpaymentSettings
);

export default router;

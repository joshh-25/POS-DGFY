import express from 'express';
import * as mobilePosController from '../controllers/mobilePosController.js';
import { authenticate, checkPermission, requirePremium } from '../middleware/auth.js';
import { posLimiter } from '../middleware/rateLimiter.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    validateMobilePosCatalogBootstrapQuery,
    validateMobilePosCheckoutSync,
    validateMobilePosShiftSync,
    validateMobilePosHardwareEventSync,
    validateMobilePosCheckpointAck
} from '../validators/posValidator.js';

const router = express.Router();

router.use(authenticate);
router.use(requirePremium);
router.use(posLimiter);

router.get('/bootstrap/catalog', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateMobilePosCatalogBootstrapQuery, mobilePosController.getCatalogBootstrap);
router.get('/bootstrap/settings', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), mobilePosController.getSettingsBootstrap);
router.get('/bootstrap/device-policy', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), mobilePosController.getDevicePolicy);
router.post('/sync/checkouts', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateMobilePosCheckoutSync, mobilePosController.syncCheckouts);
router.post('/sync/shifts', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateMobilePosShiftSync, mobilePosController.syncShifts);
router.post('/sync/hardware-events', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateMobilePosHardwareEventSync, mobilePosController.syncHardwareEvents);
router.post('/sync/checkpoint', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateMobilePosCheckpointAck, mobilePosController.acknowledgeCheckpoint);

export default router;

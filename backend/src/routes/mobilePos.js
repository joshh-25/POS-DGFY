import express from 'express';
import * as mobilePosController from '../controllers/mobilePosController.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { mobilePosFreeSyncLimiter, posLimiter } from '../middleware/rateLimiter.js';
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
router.use(posLimiter);

// No requirePremium gate here (B2): free tenants get the same offline-sync
// API as premium, just capped at 2 pushes/day server-side via
// mobilePosFreeSyncLimiter below (bypassed entirely for premium tenants).
// See dgfy-mobile docs/architecture/SYNC-ARCHITECTURE.md.
//
// Bootstrap (Channel B, reference/config) is read-only and opportunistic -
// intentionally NOT capped for either tier.
router.get('/bootstrap/catalog', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateMobilePosCatalogBootstrapQuery, mobilePosController.getCatalogBootstrap);
router.get('/bootstrap/settings', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), mobilePosController.getSettingsBootstrap);
router.get('/bootstrap/device-policy', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), mobilePosController.getDevicePolicy);

// Sync (Channel A, ledger) is where the free-tier daily cap applies. All
// four routes share the same limiter instance, so the 2/day budget is one
// shared quota per business across a whole sync round, not per-endpoint.
router.post('/sync/checkouts', mobilePosFreeSyncLimiter, checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateMobilePosCheckoutSync, mobilePosController.syncCheckouts);
router.post('/sync/shifts', mobilePosFreeSyncLimiter, checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateMobilePosShiftSync, mobilePosController.syncShifts);
router.post('/sync/hardware-events', mobilePosFreeSyncLimiter, checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateMobilePosHardwareEventSync, mobilePosController.syncHardwareEvents);
router.post('/sync/checkpoint', mobilePosFreeSyncLimiter, checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateMobilePosCheckpointAck, mobilePosController.acknowledgeCheckpoint);

export default router;

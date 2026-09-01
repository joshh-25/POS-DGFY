import express from 'express';
import * as mobilePosController from '../controllers/mobilePosController.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { mobilePosFreeSyncRoundLimiter, posLimiter } from '../middleware/rateLimiter.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    validateMobilePosCatalogBootstrapQuery,
    validateMobilePosCheckoutSync,
    validateMobilePosTransactionCheckpointQuery,
    validateMobilePosVoidSync,
    validateMobilePosRefundSync,
    validateMobilePosOrderActionSync,
    validateMobilePosItemSync,
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
router.get('/sync/transactions', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateMobilePosTransactionCheckpointQuery, mobilePosController.getTransactionCheckpoint);

// Sync (Channel A, ledger) is where the free-tier daily cap applies. All
// routes share a round-aware limiter. One stable client_sync_run_id can span
// dependency-ordered endpoint calls without consuming the free device's two
// daily full-sync slots more than once.
router.post('/sync/checkouts', mobilePosFreeSyncRoundLimiter, checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateMobilePosCheckoutSync, mobilePosController.syncCheckouts);
router.post('/sync/voids', mobilePosFreeSyncRoundLimiter, checkPermission(PERMISSIONS.POS.actions.VOID_POS_TRANSACTION), validateMobilePosVoidSync, mobilePosController.syncVoids);
// Refund permission depends on the workflow, so it is enforced per entry by
// buildSyncMobilePosRefundsUseCase. Cash requires drawer-adjust authority;
// external/provider require void authority; split accepts either.
router.post('/sync/refunds', mobilePosFreeSyncRoundLimiter, validateMobilePosRefundSync, mobilePosController.syncRefunds);
router.post('/sync/order-actions', mobilePosFreeSyncRoundLimiter, checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateMobilePosOrderActionSync, mobilePosController.syncOrderActions);

// Item/catalog sync is NOT behind mobilePosFreeSyncLimiter - unlike the
// transaction ledger above, item CRUD has never been plan-tier gated
// anywhere in this app (web included), so folding it into the same 2/day
// budget would make catalog management unusable for free-tier tenants. No
// route-level checkPermission either: a batch can mix create/update/delete
// entries (the op lives inside each entry's payload, not the entry itself -
// see validateMobilePosItemSync), so permission (items:create/edit/delete)
// is enforced per-entry inside buildSyncMobilePosItemsUseCase instead of
// gating the whole route.
router.post('/sync/items', validateMobilePosItemSync, mobilePosController.syncItems);
router.post('/sync/shifts', mobilePosFreeSyncRoundLimiter, checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateMobilePosShiftSync, mobilePosController.syncShifts);
router.post('/sync/hardware-events', mobilePosFreeSyncRoundLimiter, checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateMobilePosHardwareEventSync, mobilePosController.syncHardwareEvents);
router.post('/sync/checkpoint', mobilePosFreeSyncRoundLimiter, checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateMobilePosCheckpointAck, mobilePosController.acknowledgeCheckpoint);

export default router;

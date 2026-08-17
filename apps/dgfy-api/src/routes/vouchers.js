import express from 'express';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    validateCreateVoucher,
    validateUpdateVoucher,
    validateVoucherIdParam,
    validateVoucherListQuery
} from '../validators/voucherValidator.js';
import {
    activateVoucher,
    archiveVoucher,
    createVoucher,
    getVoucher,
    listVouchers,
    pauseVoucher,
    updateVoucher
} from '../modules/vouchers/controllers/voucherHandlers.js';

// Voucher campaign administration (#614, Phase 103). Governed by ADR 0066.
//
// Permissions deliberately reuse SYSTEM `settings:view` / `settings:edit` -- the same pair
// `routes/tenantLocations.js` uses -- rather than introducing a `PERMISSIONS.VOUCHERS` group. A new
// permission string is not free here: tenant roles store their permissions as a persisted array, so a
// new action would need a data migration across every existing role before anyone could use this API
// at all. A dedicated group is worthwhile follow-up work, not something to smuggle into this phase.
//
// There is no DELETE route by design: archive IS the delete. `voucher_redemptions.voucher_id`
// declares no `onDelete`, and the ledger is the authoritative record (ADR 0066 decision 4), so the
// parent campaign row has to outlive the campaign.
const router = express.Router();

router.get(
    '/',
    authenticate,
    checkPermission(PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS),
    validateVoucherListQuery,
    listVouchers
);

router.get(
    '/:voucher_id',
    authenticate,
    checkPermission(PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS),
    validateVoucherIdParam,
    getVoucher
);

router.post(
    '/',
    authenticate,
    checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
    validateCreateVoucher,
    createVoucher
);

router.put(
    '/:voucher_id',
    authenticate,
    checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
    validateVoucherIdParam,
    validateUpdateVoucher,
    updateVoucher
);

router.post(
    '/:voucher_id/activate',
    authenticate,
    checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
    validateVoucherIdParam,
    activateVoucher
);

router.post(
    '/:voucher_id/pause',
    authenticate,
    checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
    validateVoucherIdParam,
    pauseVoucher
);

router.post(
    '/:voucher_id/archive',
    authenticate,
    checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
    validateVoucherIdParam,
    archiveVoucher
);

export default router;

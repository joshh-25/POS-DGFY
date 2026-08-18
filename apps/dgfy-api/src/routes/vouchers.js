import express from 'express';
import { authenticate, checkAnyPermission } from '../middleware/auth.js';
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
// Phase 103 deliberately reused SYSTEM `settings:view` / `settings:edit` here (the same pair
// `routes/tenantLocations.js` uses) rather than introducing a dedicated group, since a new
// permission string needed the deploy-time backfill (scripts/backfill-role-permissions.js) to reach
// every existing tenant role before it was usable. #655 adds that dedicated `PERMISSIONS.VOUCHERS`
// group. Every route below is **dual-gated for one release**: `VOUCHERS.*` OR the legacy `SYSTEM.*`
// pair, via `checkAnyPermission`. This is load-bearing, not belt-and-suspenders --
// `resolveEffectivePermissions` (utils/userPermissions.js) only falls back to role defaults when a
// user's *stored* permissions array is empty, so a hard swap to `VOUCHERS`-only would lock out any
// existing admin/manager whose stored array predates this change, on any deploy path that skips
// `scripts/deploy.sh`'s backfill step (e.g. the containerized GHCR path). Drop the legacy `SYSTEM.*`
// arm in a follow-up once the backfill has had a full deploy cycle to run everywhere -- tracked via
// `pm`, not dated here since that depends on the next deploy, not this PR.
//
// There is no DELETE route by design: archive IS the delete. `voucher_redemptions.voucher_id`
// declares no `onDelete`, and the ledger is the authoritative record (ADR 0066 decision 4), so the
// parent campaign row has to outlive the campaign.
const router = express.Router();

const canViewVouchers = checkAnyPermission([
    PERMISSIONS.VOUCHERS.actions.VIEW,
    PERMISSIONS.VOUCHERS.actions.MANAGE,
    PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
    PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
]);

const canManageVouchers = checkAnyPermission([
    PERMISSIONS.VOUCHERS.actions.MANAGE,
    PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
]);

router.get(
    '/',
    authenticate,
    canViewVouchers,
    validateVoucherListQuery,
    listVouchers
);

router.get(
    '/:voucher_id',
    authenticate,
    canViewVouchers,
    validateVoucherIdParam,
    getVoucher
);

router.post(
    '/',
    authenticate,
    canManageVouchers,
    validateCreateVoucher,
    createVoucher
);

router.put(
    '/:voucher_id',
    authenticate,
    canManageVouchers,
    validateVoucherIdParam,
    validateUpdateVoucher,
    updateVoucher
);

router.post(
    '/:voucher_id/activate',
    authenticate,
    canManageVouchers,
    validateVoucherIdParam,
    activateVoucher
);

router.post(
    '/:voucher_id/pause',
    authenticate,
    canManageVouchers,
    validateVoucherIdParam,
    pauseVoucher
);

router.post(
    '/:voucher_id/archive',
    authenticate,
    canManageVouchers,
    validateVoucherIdParam,
    archiveVoucher
);

export default router;

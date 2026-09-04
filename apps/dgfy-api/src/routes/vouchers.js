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
// group and dual-gated every route below for one release: `VOUCHERS.*` OR the legacy `SYSTEM.*`
// pair, via `checkAnyPermission`.
//
// #1493 (Phase 263) retires that legacy arm **on the management routes only**. The retirement
// condition #655 itself set -- "once the backfill has had a full deploy cycle to run everywhere" --
// is now met: 33bd92646 (the `PERMISSIONS.VOUCHERS` group, which is what
// `scripts/backfill-role-permissions.js` reads) and 34224d4c3 (this dual-gate) both landed
// 2026-08-18 and have been on `origin/main` across several releases since, so `scripts/deploy.sh`'s
// backfill step has had every deploy cycle in between to write `vouchers:manage` into the stored
// permission arrays of admins whose arrays predate #655.
//
// Why retiring it is the point and not a tidy-up: `settings:edit` is a permission every manager
// holds by default, so while that arm stood, "restrict voucher management to Admin + Accounting"
// was unenforceable no matter what `DEFAULT_ROLE_PERMISSIONS` said.
//
// `canViewVouchers` deliberately KEEPS both legacy `SYSTEM.*` arms -- #1493 restricts management,
// not read access, and a settings-capable manager losing the ability to *see* campaigns is a
// regression this issue never asked for. `routes/pricelists.js` is untouched for the same reason:
// it shares the `VOUCHERS.*` group (#732) but is a separate capability, and the `settings:edit`
// arm that route still accepts is what keeps managers managing pricelists after this change.
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

// Admin + Accounting only (#1493). Admin reaches this via `DEFAULT_ROLE_PERMISSIONS.admin`
// (`getAllPermissions()`) or any `*_admin` preset; Accounting via the mode-native `*_accounting`
// presets added in config/modeRolePresets.js. `is_master_admin` bypasses the check entirely, inside
// `checkAnyPermission` itself.
const canManageVouchers = checkAnyPermission([
    PERMISSIONS.VOUCHERS.actions.MANAGE
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

import express from 'express';
import { authenticate, checkAnyPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    validateCreatePricelist,
    validatePricelistIdParam,
    validatePricelistListQuery,
    validateReplacePricelistItems,
    validateUpdatePricelist
} from '../validators/pricelistValidator.js';
import {
    archivePricelist,
    createPricelist,
    getPricelist,
    listPricelists,
    publishPricelist,
    replacePricelistItems,
    updatePricelist
} from '../modules/vouchers/controllers/pricelistHandlers.js';

// Pricelist administration (#696, extends #584/ADR 0066) -- a per-item price set a `fixed_price`
// voucher may attach instead of its single `fixed_unit_price_centavos`. Gated on the same
// `PERMISSIONS.VOUCHERS` group `routes/vouchers.js` uses, deliberately: a pricelist is
// voucher-authoring data, and a dedicated `PERMISSIONS.PRICELISTS` group would need
// `scripts/backfill-role-permissions.js` plus a full deploy cycle before any existing tenant role
// could actually use it -- exactly the transition #655/#686 are already working through for
// vouchers themselves.
//
// #718: reusing `PERMISSIONS.VOUCHERS` does NOT sidestep that transition -- an earlier version of
// this comment claimed it did, which was backwards. `VOUCHERS` is exactly the new group that
// needs the backfill; reusing it here means this route inherits the SAME unmet-backfill exposure
// `routes/vouchers.js` already carries and already dual-gates against (see its own comment). Every
// route below is now dual-gated the identical way, for the identical reason: `VOUCHERS.*` OR the
// legacy `SYSTEM.*` pair, via `checkAnyPermission` -- load-bearing, not belt-and-suspenders, since
// `resolveEffectivePermissions` (utils/userPermissions.js) only falls back to role defaults when a
// user's *stored* permissions array is empty. Drop the legacy `SYSTEM.*` arm here in the SAME
// follow-up that drops it from `routes/vouchers.js` (#686) -- not before, and not separately; a
// pricelist and a voucher share one authoring surface, and this file must not fall out of sync
// with the file it was always meant to mirror.
//
// No DELETE route by design, matching vouchers: archive IS the delete.
const router = express.Router();

const canViewPricelists = checkAnyPermission([
    PERMISSIONS.VOUCHERS.actions.VIEW,
    PERMISSIONS.VOUCHERS.actions.MANAGE,
    PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
    PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
]);

const canManagePricelists = checkAnyPermission([
    PERMISSIONS.VOUCHERS.actions.MANAGE,
    PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
]);

router.get(
    '/',
    authenticate,
    canViewPricelists,
    validatePricelistListQuery,
    listPricelists
);

router.get(
    '/:pricelist_id',
    authenticate,
    canViewPricelists,
    validatePricelistIdParam,
    getPricelist
);

router.post(
    '/',
    authenticate,
    canManagePricelists,
    validateCreatePricelist,
    createPricelist
);

router.put(
    '/:pricelist_id',
    authenticate,
    canManagePricelists,
    validatePricelistIdParam,
    validateUpdatePricelist,
    updatePricelist
);

router.put(
    '/:pricelist_id/items',
    authenticate,
    canManagePricelists,
    validatePricelistIdParam,
    validateReplacePricelistItems,
    replacePricelistItems
);

router.post(
    '/:pricelist_id/publish',
    authenticate,
    canManagePricelists,
    validatePricelistIdParam,
    publishPricelist
);

router.post(
    '/:pricelist_id/archive',
    authenticate,
    canManagePricelists,
    validatePricelistIdParam,
    archivePricelist
);

export default router;

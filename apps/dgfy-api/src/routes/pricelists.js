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
// vouchers themselves. Reusing VOUCHERS sidesteps that entirely.
//
// No DELETE route by design, matching vouchers: archive IS the delete.
const router = express.Router();

const canViewPricelists = checkAnyPermission([
    PERMISSIONS.VOUCHERS.actions.VIEW,
    PERMISSIONS.VOUCHERS.actions.MANAGE
]);

const canManagePricelists = checkAnyPermission([
    PERMISSIONS.VOUCHERS.actions.MANAGE
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

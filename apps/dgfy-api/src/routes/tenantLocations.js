import express from 'express';
import * as tenantLocationController from '../controllers/tenantLocationController.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import dbStore from '../utils/dbStore.js';
import {
    validateCreateTenantLocation,
    validateDineInPaymentPolicyUpdate,
    validateUpdateTenantLocation,
    validateTenantLocationIdParam,
    validateTenantLocationsQuery
} from '../validators/tenantLocationValidator.js';

const router = express.Router();

const hasTenantWideBranchAccess = (req) => {
    const role = String(req.user?.role || '').trim().toLowerCase();
    return req.user?.is_master_admin === true
        || role === 'admin';
};

const checkDineInPaymentPolicyLocationAccess = async (req, res, next) => {
    if (hasTenantWideBranchAccess(req)) return next();

    const UserLocationGrant = dbStore.get('UserLocationGrant');
    if (!UserLocationGrant?.findOne) {
        return res.status(503).json({
            success: false,
            message: 'Branch access validation is temporarily unavailable.',
            error_code: 'BRANCH_ACCESS_VALIDATION_UNAVAILABLE'
        });
    }

    try {
        const locationId = Number(req.validatedParams?.id || req.params.id);
        const grant = await UserLocationGrant.findOne({
            where: {
                user_id: req.user?.user_id,
                location_id: locationId
            }
        });
        if (grant) return next();
        return res.status(403).json({
            success: false,
            message: 'This user is not assigned to the selected branch.',
            error_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED',
            errors: { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' }
        });
    } catch (error) {
        return next(error);
    }
};

router.use(authenticate);

router.get('/', validateTenantLocationsQuery, tenantLocationController.listTenantLocations);
router.post(
    '/',
    checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
    validateCreateTenantLocation,
    tenantLocationController.createTenantLocation
);
router.put(
    '/:id/dine-in-payment-policy',
    checkPermission(PERMISSIONS.DOWNPAYMENT.actions.MANAGE_DOWNPAYMENT_SETTINGS),
    validateTenantLocationIdParam,
    checkDineInPaymentPolicyLocationAccess,
    validateDineInPaymentPolicyUpdate,
    tenantLocationController.updateDineInPaymentPolicy
);
router.put(
    '/:id',
    checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
    validateTenantLocationIdParam,
    validateUpdateTenantLocation,
    tenantLocationController.updateTenantLocation
);
router.delete(
    '/:id/permanent',
    checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
    validateTenantLocationIdParam,
    tenantLocationController.deleteTenantLocation
);
router.delete(
    '/:id',
    checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
    validateTenantLocationIdParam,
    tenantLocationController.deactivateTenantLocation
);

export default router;

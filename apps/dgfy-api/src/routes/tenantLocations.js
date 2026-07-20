import express from 'express';
import * as tenantLocationController from '../controllers/tenantLocationController.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    validateCreateTenantLocation,
    validateUpdateTenantLocation,
    validateTenantLocationIdParam,
    validateTenantLocationsQuery
} from '../validators/tenantLocationValidator.js';

const router = express.Router();

router.use(authenticate);

router.get('/', validateTenantLocationsQuery, tenantLocationController.listTenantLocations);
router.post(
    '/',
    checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS),
    validateCreateTenantLocation,
    tenantLocationController.createTenantLocation
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

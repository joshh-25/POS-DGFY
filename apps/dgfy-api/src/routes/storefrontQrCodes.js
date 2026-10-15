import express from 'express';
import * as controller from '../modules/storefrontQrCodes/controllers/storefrontQrCodeHandlers.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { requireWorkflowCapability } from '../middleware/workflowModeCapability.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    validateCreateStorefrontQrCode,
    validateListStorefrontQrCodesQuery,
    validateStorefrontQrCodeIdParam,
    validateUpdateStorefrontQrCode
} from '../validators/storefrontQrCodeValidator.js';

const router = express.Router();

router.use(authenticate);
router.use(requireWorkflowCapability('catalog', 'Catalog'));

router.get('/', checkPermission(PERMISSIONS.INVENTORY.actions.VIEW_ITEMS), validateListStorefrontQrCodesQuery, controller.list);
router.post('/', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateCreateStorefrontQrCode, controller.create);
router.patch('/:id', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateStorefrontQrCodeIdParam, validateUpdateStorefrontQrCode, controller.update);
router.delete('/:id', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateStorefrontQrCodeIdParam, controller.deactivate);

export default router;

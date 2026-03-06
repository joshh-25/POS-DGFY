import express from 'express';
import * as dispatchOrderController from '../controllers/dispatchOrderController.js';
import {
    validateCreateDispatchOrder,
    validateUpdateDispatchOrder,
    validateDispatchLines,
    validateCancelDispatchOrder
} from '../validators/dispatchOrderValidator.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();
router.use(authenticate);

// Read operations — any authenticated user with do:view
router.get('/stats', checkPermission(PERMISSIONS.DISPATCH.actions.VIEW_DO), dispatchOrderController.getDispatchStats);
router.get('/export', checkPermission(PERMISSIONS.DISPATCH.actions.VIEW_DO), dispatchOrderController.exportDispatchOrders);
router.get('/', checkPermission(PERMISSIONS.DISPATCH.actions.VIEW_DO), dispatchOrderController.getDispatchOrders);
router.get('/:id', checkPermission(PERMISSIONS.DISPATCH.actions.VIEW_DO), dispatchOrderController.getDispatchOrderById);

// Create and edit draft — do:create
router.post('/', checkPermission(PERMISSIONS.DISPATCH.actions.CREATE_DO), validateCreateDispatchOrder, dispatchOrderController.createDispatchOrder);
router.put('/:id', checkPermission(PERMISSIONS.DISPATCH.actions.CREATE_DO), validateUpdateDispatchOrder, dispatchOrderController.updateDispatchOrder);
router.post('/:id/confirm', checkPermission(PERMISSIONS.DISPATCH.actions.CREATE_DO), dispatchOrderController.confirmDispatchOrder);

// Execute dispatch — do:dispatch (stock deduction)
router.post('/:id/dispatch', checkPermission(PERMISSIONS.DISPATCH.actions.DISPATCH_DO), validateDispatchLines, dispatchOrderController.dispatchLines);

// Cancel and archive — do:delete
router.post('/:id/cancel', checkPermission(PERMISSIONS.DISPATCH.actions.DELETE_DO), validateCancelDispatchOrder, dispatchOrderController.cancelDispatchOrder);
router.post('/:id/archive', checkPermission(PERMISSIONS.DISPATCH.actions.DELETE_DO), dispatchOrderController.archiveDispatchOrder);

export default router;

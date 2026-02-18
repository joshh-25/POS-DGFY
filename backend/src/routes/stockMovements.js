import express from 'express';
import * as stockMovementController from '../controllers/stockMovementController.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
  validateCreateStockMovement,
  validateVoidMovement,
  validateBulkCreate
} from '../validators/stockMovementValidator.js';

const router = express.Router();
router.use(authenticate);

// Read operations - all authenticated users
router.get('/stats', stockMovementController.getMovementStats);
router.get('/export', stockMovementController.exportMovements); // Export route
router.get('/', stockMovementController.getStockMovements);
router.get('/:id', stockMovementController.getMovementById);

// Create operations - managers and admins only
router.post('/', checkPermission(PERMISSIONS.STOCK.actions.CREATE_ADJUSTMENT), validateCreateStockMovement, stockMovementController.createStockMovement);
router.post('/bulk', checkPermission(PERMISSIONS.STOCK.actions.CREATE_ADJUSTMENT), validateBulkCreate, stockMovementController.createBulkMovements); // Bulk create
router.post('/:id/void', checkPermission(PERMISSIONS.STOCK.actions.CREATE_ADJUSTMENT), validateVoidMovement, stockMovementController.voidMovement); // Void movement

export default router;

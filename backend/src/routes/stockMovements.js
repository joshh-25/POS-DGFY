import express from 'express';
import * as stockMovementController from '../controllers/stockMovementController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// Read operations - all authenticated users
router.get('/stats', stockMovementController.getMovementStats);
router.get('/export', stockMovementController.exportMovements); // Export route
router.get('/', stockMovementController.getStockMovements);
router.get('/:id', stockMovementController.getMovementById);

// Create operations - managers and admins only
router.post('/', authorize('admin', 'manager'), stockMovementController.createStockMovement);
router.post('/bulk', authorize('admin', 'manager'), stockMovementController.createBulkMovements); // Bulk create
router.post('/:id/void', authorize('admin', 'manager'), stockMovementController.voidMovement); // Void movement

export default router;

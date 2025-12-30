import express from 'express';
import * as stockMovementController from '../controllers/stockMovementController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// Read operations - all authenticated users
router.get('/', stockMovementController.getStockMovements);

// Create operations - managers and admins only
router.post('/', authorize('admin', 'manager'), stockMovementController.createStockMovement);

export default router;


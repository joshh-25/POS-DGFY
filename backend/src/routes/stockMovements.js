import express from 'express';
import * as stockMovementController from '../controllers/stockMovementController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', stockMovementController.getStockMovements);
router.post('/', stockMovementController.createStockMovement);

export default router;


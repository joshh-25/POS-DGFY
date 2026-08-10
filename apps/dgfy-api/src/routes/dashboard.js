import express from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/stats', dashboardController.getStats);
router.get('/low-stock', dashboardController.getLowStock);
router.get('/recent-movements', dashboardController.getRecentMovements);

export default router;


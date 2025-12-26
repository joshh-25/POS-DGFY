import express from 'express';
import * as reportController from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/stock-aging', reportController.getStockAging);
router.get('/surplus-shortage', reportController.getSurplusShortage);
router.get('/financial-summary', reportController.getFinancialSummary);
router.get('/supplier-performance', reportController.getSupplierPerformance);

export default router;


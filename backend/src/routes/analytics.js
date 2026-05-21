import express from 'express';
import * as analyticsController from '../controllers/analyticsController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All analytics routes require authentication
router.use(authenticate);

// Supplier Analysis
router.get('/supplier/:id', analyticsController.getSupplierPerformance);

// Anomaly Detection
router.get('/anomalies', analyticsController.getAnomalies);

// Financial Analysis
router.get('/costs', analyticsController.getCostAnalysis);

// Item Specific Analysis
router.get('/burn-rate/:itemId', analyticsController.getItemBurnRate);

export default router;

import express from 'express';
import * as reportController from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// Legacy reports
router.get('/stock-aging', reportController.getStockAging);
router.get('/surplus-shortage', reportController.getSurplusShortage);
router.get('/financial-summary', reportController.getFinancialSummary);
router.get('/supplier-performance', reportController.getSupplierPerformance);

// New comprehensive reports (with date filtering support)
router.get('/expiry', reportController.getExpiryReport);
router.get('/stock-aging-enhanced', reportController.getEnhancedStockAging);
router.get('/production', reportController.getProductionReport);
router.get('/po-analysis', reportController.getPurchaseOrderAnalysis);
router.get('/executive-summary', reportController.getExecutiveSummary);
router.get('/compliance-package', reportController.getComplianceBooksPackage);
router.get('/compliance-package/export', reportController.exportComplianceBooksPackage);

// Snapshot management
router.get('/snapshots', reportController.getSnapshots);
router.get('/snapshots/:id', reportController.getSnapshotById);
router.post('/snapshots', reportController.saveSnapshot);

// CSV Export
router.get('/export', reportController.exportReportCSV);

export default router;


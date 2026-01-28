import express from 'express';
import * as itemController from '../controllers/itemController.js';
import * as csvImportController from '../controllers/csvImportController.js';
import * as csvExportController from '../controllers/csvExportController.js';
import { validateCreateItem, validateUpdateItem, validateCreateItemDraft } from '../validators/itemValidator.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// CSV Import routes - must be before :item_id routes to avoid conflicts
router.get('/import/template', authorize('admin', 'manager'), csvImportController.getTemplate);
router.post('/import/preview', authorize('admin', 'manager'), csvImportController.previewImport);
router.post('/import/confirm', authorize('admin', 'manager'), csvImportController.confirmImport);

// CSV Export routes
router.get('/export', authorize('admin', 'manager'), csvExportController.exportItems);
router.post('/export', authorize('admin', 'manager'), csvExportController.exportItems);
router.get('/export/preview', authorize('admin', 'manager'), csvExportController.previewExport);
router.get('/export/all', authorize('admin', 'manager'), csvExportController.exportAllItems);

// Supplier coverage - must be before :item_id to avoid route conflicts
router.get('/supplier-coverage', itemController.getItemSupplierCoverage);

// Read-only operations - all authenticated users
router.get('/', itemController.getItems);
router.get('/:item_id', itemController.getItemById);
router.get('/:item_id/stock-history', itemController.getItemStockHistory);
router.get('/:item_id/batches', itemController.getItemBatches);
router.get('/:item_id/movements', itemController.getItemMovements);

// Composition validation - for nested products feature
router.post('/validate-composition', authorize('admin', 'manager'), itemController.validateComposition);

// Create/Update operations - managers and admins only
router.post('/', authorize('admin', 'manager'), (req, res, next) => {
  // Use draft validator if save_as_draft query param is true
  const isDraft = req.query.save_as_draft === 'true' || req.body.status === 'draft';
  if (isDraft) {
    validateCreateItemDraft(req, res, next);
  } else {
    validateCreateItem(req, res, next);
  }
}, itemController.createItem);
router.put('/:item_id', authorize('admin', 'manager'), validateUpdateItem, itemController.updateItem);

// Finalize draft - managers and admins only
router.patch('/:item_id/finalize', authorize('admin', 'manager'), itemController.finalizeItem);

// Delete operations - admins only
router.delete('/:item_id', authorize('admin'), itemController.deleteItem);

export default router;


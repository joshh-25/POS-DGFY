import express from 'express';
import * as itemController from '../controllers/itemController.js';
import * as csvImportController from '../controllers/csvImportController.js';
import * as csvExportController from '../controllers/csvExportController.js';
import { validateCreateItem, validateUpdateItem, validateCreateItemDraft } from '../validators/itemValidator.js';
import { authenticate, checkPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// CSV Import routes - must be before :item_id routes to avoid conflicts
router.get('/import/template', checkPermission(PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS), csvImportController.getTemplate);
router.post('/import/preview', checkPermission(PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS), csvImportController.previewImport);
router.post('/import/confirm', checkPermission(PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS), csvImportController.confirmImport);

// CSV Export routes
router.get('/export', checkPermission(PERMISSIONS.INVENTORY.actions.EXPORT_ITEMS), csvExportController.exportItems);
router.post('/export', checkPermission(PERMISSIONS.INVENTORY.actions.EXPORT_ITEMS), csvExportController.exportItems);
router.get('/export/preview', checkPermission(PERMISSIONS.INVENTORY.actions.EXPORT_ITEMS), csvExportController.previewExport);
router.get('/export/all', checkPermission(PERMISSIONS.INVENTORY.actions.EXPORT_ITEMS), csvExportController.exportAllItems);

// Supplier coverage - must be before :item_id to avoid route conflicts
router.get('/supplier-coverage', itemController.getItemSupplierCoverage);

// Folder management - must be before :item_id
router.get('/folders', itemController.getFolders);
router.post('/folders', checkPermission(PERMISSIONS.INVENTORY.actions.CREATE_ITEMS), itemController.createFolder);
router.delete('/folders/:folder_id', checkPermission(PERMISSIONS.INVENTORY.actions.DELETE_ITEMS), itemController.deleteFolder);

// Read-only operations - all authenticated users
router.get('/', itemController.getItems);
router.get('/:item_id', itemController.getItemById);
router.get('/:item_id/stock-history', itemController.getItemStockHistory);
router.get('/:item_id/batches', itemController.getItemBatches);
router.get('/:item_id/movements', itemController.getItemMovements);

// Composition validation - for nested products feature
router.post('/validate-composition', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), itemController.validateComposition);

// Create/Update operations - managers and admins only
router.post('/', checkPermission(PERMISSIONS.INVENTORY.actions.CREATE_ITEMS), (req, res, next) => {
  // Use draft validator if save_as_draft query param is true
  const isDraft = req.query.save_as_draft === 'true' || req.body.status === 'draft';
  console.log('DEBUG: POST /items', { query: req.query, bodyStatus: req.body.status, isDraft });
  if (isDraft) {
    validateCreateItemDraft(req, res, next);
  } else {
    validateCreateItem(req, res, next);
  }
}, itemController.createItem);
router.put('/:item_id', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateUpdateItem, itemController.updateItem);

// Finalize draft - managers and admins only
router.patch('/:item_id/finalize', checkPermission(PERMISSIONS.INVENTORY.actions.CREATE_ITEMS), itemController.finalizeItem);

// Delete operations - admins only
router.delete('/:item_id', checkPermission(PERMISSIONS.INVENTORY.actions.DELETE_ITEMS), itemController.deleteItem);

export default router;


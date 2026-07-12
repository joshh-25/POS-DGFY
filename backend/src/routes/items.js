import express from 'express';
import * as itemController from '../controllers/itemController.js';
import * as csvImportController from '../controllers/csvImportController.js';
import * as csvExportController from '../controllers/csvExportController.js';
import {
  validateCreateItem,
  validateUpdateItem,
  validateCreateItemDraft,
  validateFolderIdParam,
  validateItemIdParam,
  validateBarcodeIdParam,
  validateBarcodeResolveQuery,
  validateAttachBarcode,
  validateGenerateBarcode,
  validateUpdateBarcode,
  validateBarcodeConflictResolution,
  validateBarcodeLabelQuery,
  validateStorefrontCatalogOverridesQuery,
  validateUpdateStorefrontCatalogOverride,
  validateCreateFolder,
  validateUpdateFolder,
  validateDeleteFolder,
  validateReplaceItemSuppliers
} from '../validators/itemValidator.js';
import { authenticate, checkPermission, requireTenantAdmin } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
  storefrontCatalogBulkImageUpload,
  storefrontCatalogGalleryImageUpload,
  storefrontCatalogImageUpload
} from '../config/uploadConfig.js';

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

// Storefront catalog controls - must be before :item_id routes to avoid conflicts
router.get('/storefront-overrides', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateStorefrontCatalogOverridesQuery, itemController.listStorefrontCatalogOverrides);
router.patch('/storefront-overrides/bulk', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), itemController.updateBulkStorefrontCatalogOverrides);
router.post('/storefront-images/bulk', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), storefrontCatalogBulkImageUpload.array('images', 50), itemController.uploadBulkStorefrontCatalogImages);
router.patch('/:item_id/storefront-override', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, validateUpdateStorefrontCatalogOverride, itemController.updateStorefrontCatalogOverride);
router.post('/:item_id/storefront-image', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, storefrontCatalogImageUpload.single('image'), itemController.uploadStorefrontCatalogImage);
router.post('/:item_id/storefront-images', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, storefrontCatalogGalleryImageUpload.array('images', 5), itemController.uploadStorefrontCatalogGalleryImages);
router.patch('/:item_id/storefront-images/gallery', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, itemController.updateStorefrontCatalogGallery);
router.delete('/:item_id/storefront-images/:image_index', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, itemController.deleteStorefrontCatalogGalleryImage);
router.delete('/:item_id/storefront-image', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, itemController.deleteStorefrontCatalogImage);

// Barcode identity and labels - must be before :item_id read routes
router.get('/barcodes/resolve', validateBarcodeResolveQuery, itemController.resolveItemBarcode);
router.post('/barcodes/conflicts/resolve', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateBarcodeConflictResolution, itemController.resolveItemBarcodeConflict);
router.get('/:item_id/barcodes', validateItemIdParam, itemController.listItemBarcodes);
router.post('/:item_id/barcodes', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, validateAttachBarcode, itemController.attachItemBarcode);
router.post('/:item_id/barcodes/generate', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, validateGenerateBarcode, itemController.generateItemBarcode);
router.get('/:item_id/barcode-label', validateItemIdParam, validateBarcodeLabelQuery, itemController.renderItemBarcodeLabel);
router.patch('/:item_id/barcodes/:barcode_id', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateBarcodeIdParam, validateUpdateBarcode, itemController.updateItemBarcode);
router.delete('/:item_id/barcodes/:barcode_id', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateBarcodeIdParam, itemController.deactivateItemBarcode);
router.post('/:item_id/barcodes/:barcode_id/primary', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateBarcodeIdParam, itemController.setPrimaryItemBarcode);

// Folder management - must be before :item_id
router.get('/folders', itemController.getFolders);
router.post('/folders', requireTenantAdmin, validateCreateFolder, itemController.createFolder);
router.patch('/folders/:folder_id', requireTenantAdmin, validateFolderIdParam, validateUpdateFolder, itemController.updateFolder);
router.delete('/folders/:folder_id', requireTenantAdmin, validateFolderIdParam, validateDeleteFolder, itemController.deleteFolder);

// Read-only operations - all authenticated users
router.get('/', itemController.getItems);
router.get('/:item_id', itemController.getItemById);
router.get('/:item_id/stock-history', itemController.getItemStockHistory);
router.get('/:item_id/batches', itemController.getItemBatches);
router.get('/:item_id/movements', itemController.getItemMovements);
router.put('/:item_id/suppliers', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateReplaceItemSuppliers, itemController.replaceItemSuppliers);

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

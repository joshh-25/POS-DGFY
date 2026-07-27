import express from 'express';
import * as itemController from '../controllers/itemController.js';
import * as csvImportController from '../controllers/csvImportController.js';
import * as csvExportController from '../controllers/csvExportController.js';
import * as menuImportController from '../controllers/menuImportController.js';
import { requireMenuImportConfig, menuImportDisabledMessage } from '../config/menuImportFeature.js';
import {
  validateCreateItem,
  validateUpdateItem,
  validateCreateItemDraft,
  validateFolderIdParam,
  validateItemIdParam,
  validateBarcodeIdParam,
  validateBarcodeResolveQuery,
  validateExternalProductLookupQuery,
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
import { requireLocalInventoryLedgerOwnership, bodyDeclaresCurrentStock } from '../middleware/inventoryAuthorityGate.js';
import { PERMISSIONS } from '../config/permissions.js';
import { itemOperationsLimiter } from '../middleware/rateLimiter.js';
import {
  storefrontCatalogBulkImageUpload,
  storefrontCatalogGalleryImageUpload,
  storefrontCatalogImageUpload,
  upload,
  menuImportFileUpload
} from '../config/uploadConfig.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
// Authenticated item traffic is exempt from generalLimiter's shared IP bucket
// (see isAuthenticatedItemOperation in rateLimiter.js) so a busy store network
// doesn't block ordinary inventory work. This tenant/user-scoped limiter is
// what stands in that bucket's place instead of leaving these routes uncapped.
router.use(itemOperationsLimiter);
// CSV Import routes - must be before :item_id routes to avoid conflicts
router.get('/import/template', checkPermission(PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS), csvImportController.getTemplate);
router.post('/import/preview', checkPermission(PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS), csvImportController.previewImport);
router.post('/import/confirm', checkPermission(PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS), csvImportController.confirmImport);

// Menu Import routes (PDF or PNG/JPG photo) - quick/temporary feature, env-gated
// (MENU_IMPORT_ENABLED, default OFF). 404s when disabled/unconfigured rather than
// exposing a dead endpoint. Must be before :item_id routes to avoid conflicts.
const requireMenuImportEnabled = (req, res, next) => {
  const { configured, missing } = requireMenuImportConfig();
  if (!configured) {
    const notEnabled = missing.includes('MENU_IMPORT_ENABLED');
    return res.status(notEnabled ? 404 : 503).json({
      success: false,
      message: notEnabled ? menuImportDisabledMessage : 'PDF menu import is enabled but not fully configured.',
      missing: notEnabled ? undefined : missing
    });
  }
  return next();
};
router.post(
  '/import/pdf/preview',
  requireMenuImportEnabled,
  checkPermission(PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS),
  menuImportFileUpload.single('file'),
  menuImportController.previewPdfImport
);
router.post(
  '/import/pdf/confirm',
  requireMenuImportEnabled,
  checkPermission(PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS),
  menuImportController.confirmPdfImport
);

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
router.get('/barcodes/external-lookup', checkPermission(PERMISSIONS.INVENTORY.actions.CREATE_ITEMS), validateExternalProductLookupQuery, itemController.lookupExternalProduct);
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
// Phase 9: do NOT gate item create/update wholesale on inventory_authority -
// most of what this endpoint edits (name, price, category, barcodes) is
// catalog metadata a delegated tenant still needs to manage locally. Only
// block the one thing that actually overwrites the local stock ledger
// outside the normal movement flow: a request body that declares
// current_stock directly (see bodyDeclaresCurrentStock).
router.post(
  '/',
  checkPermission(PERMISSIONS.INVENTORY.actions.CREATE_ITEMS),
  requireLocalInventoryLedgerOwnership('Setting an item opening stock balance', { shouldBlock: bodyDeclaresCurrentStock }),
  (req, res, next) => {
    // Use draft validator if save_as_draft query param is true
    const isDraft = req.query.save_as_draft === 'true' || req.body.status === 'draft';
    if (isDraft) {
      validateCreateItemDraft(req, res, next);
    } else {
      validateCreateItem(req, res, next);
    }
  },
  itemController.createItem
);
router.put(
  '/:item_id',
  checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS),
  requireLocalInventoryLedgerOwnership('Directly editing an item stock balance', { shouldBlock: bodyDeclaresCurrentStock }),
  validateUpdateItem,
  itemController.updateItem
);

// Finalize draft - managers and admins only
router.patch('/:item_id/finalize', checkPermission(PERMISSIONS.INVENTORY.actions.CREATE_ITEMS), itemController.finalizeItem);

// Delete operations - admins only
router.delete('/:item_id', checkPermission(PERMISSIONS.INVENTORY.actions.DELETE_ITEMS), itemController.deleteItem);

export default router;

import express from 'express';
import * as itemController from '../controllers/itemController.js';
import * as csvImportController from '../controllers/csvImportController.js';
import * as csvExportController from '../controllers/csvExportController.js';
import * as menuImportController from '../controllers/menuImportController.js';
import * as menuImportBatchHandlers from '../modules/menuImport/controllers/menuImportBatchHandlers.js';
import {
  requireMenuImportConfig,
  menuImportDisabledMessage,
  requireMenuBatchImportConfig,
  menuImportBatchDisabledMessage
} from '../config/menuImportFeature.js';
import { markLegacyMenuImportDeprecated } from '../middleware/menuImportDeprecation.js';
import {
  validateCreateItem,
  validateUpdateItem,
  validateCreateItemDraft,
  validateFolderIdParam,
  validateItemIdParam,
  validateBarcodeIdParam,
  validateBarcodeResolveQuery,
  validateExternalProductLookupQuery,
  validateExternalProductImageImport,
  validateAttachBarcode,
  validateGenerateBarcode,
  validateUpdateBarcode,
  validateBarcodeConflictResolution,
  validateBarcodeLabelQuery,
  validateStorefrontCatalogOverridesQuery,
  validateUpdateStorefrontCatalogOverride,
  validateCreateFolder,
  validateUpdateFolder,
  validateReorderFolders,
  validateDeleteFolder,
  validateReplaceItemSuppliers,
  validateReplaceItemFolderMemberships
} from '../validators/itemValidator.js';
import { authenticate, checkPermission, requireTenantAdmin } from '../middleware/auth.js';
import { requireLocalInventoryLedgerOwnership, bodyDeclaresCurrentStock } from '../middleware/inventoryAuthorityGate.js';
import { requireWorkflowCapability } from '../middleware/workflowModeCapability.js';
import { PERMISSIONS } from '../config/permissions.js';
import { itemOperationsLimiter } from '../middleware/rateLimiter.js';
import {
  storefrontCatalogBulkImageUpload,
  storefrontCatalogGalleryImageUpload,
  storefrontCatalogImageUpload,
  preserveTenantContext,
  menuImportFileUpload,
  menuImportBatchUpload
} from '../config/uploadConfig.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);
// `catalog` is held by every mode, so this changes nothing today; it makes the
// capability real so a Store Profile that can subtract modules has a working
// off-switch for the whole item-catalog surface.
router.use(requireWorkflowCapability('catalog', 'Catalog'));
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
// Deprecated in favour of the batch endpoints below (see ADR 0049). Still
// served — this is the only menu importer that has run in production, and the
// only one that works without Redis — but every call is announced as
// deprecated and logged, and MENU_IMPORT_LEGACY_SINGLE_FILE_ENABLED=false
// retires it per-environment without a deploy.
router.post(
  '/import/pdf/preview',
  requireMenuImportEnabled,
  markLegacyMenuImportDeprecated,
  checkPermission(PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS),
  preserveTenantContext(menuImportFileUpload.single('file')),
  menuImportController.previewPdfImport
);
router.post(
  '/import/pdf/confirm',
  requireMenuImportEnabled,
  markLegacyMenuImportDeprecated,
  checkPermission(PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS),
  menuImportController.confirmPdfImport
);

// Batch Menu Import routes (multiple PDFs/photos, extracted asynchronously by
// workers/menuImportWorker.js) - a second capability tier on top of the
// single-file routes above, separately gated
// (MENU_IMPORT_BATCH_ENABLED, default OFF; also requires REDIS_URL since job
// state lives only in Redis). Must be before :item_id routes to avoid conflicts.
const requireMenuImportBatchEnabled = (req, res, next) => {
  const { configured, missing } = requireMenuBatchImportConfig();
  if (!configured) {
    const notEnabled = missing.includes('MENU_IMPORT_ENABLED') || missing.includes('MENU_IMPORT_BATCH_ENABLED');
    return res.status(notEnabled ? 404 : 503).json({
      success: false,
      message: notEnabled ? menuImportBatchDisabledMessage : 'Batch menu import is enabled but not fully configured.',
      missing: notEnabled ? undefined : missing
    });
  }
  return next();
};
router.post(
  '/import/menu/jobs',
  requireMenuImportBatchEnabled,
  checkPermission(PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS),
  preserveTenantContext(menuImportBatchUpload.array('files')),
  menuImportBatchHandlers.createMenuImportJob
);
router.get(
  '/import/menu/jobs/:jobId',
  requireMenuImportBatchEnabled,
  checkPermission(PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS),
  menuImportBatchHandlers.getMenuImportJob
);
router.post(
  '/import/menu/jobs/:jobId/preview',
  requireMenuImportBatchEnabled,
  checkPermission(PERMISSIONS.INVENTORY.actions.IMPORT_ITEMS),
  menuImportBatchHandlers.previewMenuImportJob
);
// Confirm is identical to the single-file path's confirm — there is nothing
// batch-specific about persisting already-previewed rows, so this reuses the
// same handler rather than duplicating it (see D8 in the menu batch import ADR).
// Not wrapped in markLegacyMenuImportDeprecated: this route belongs to the
// batch (successor) path, not the deprecated single-file one, even though it
// happens to share confirmPdfImport's implementation.
router.post(
  '/import/menu/confirm',
  requireMenuImportBatchEnabled,
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
router.post('/storefront-images/bulk', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), preserveTenantContext(storefrontCatalogBulkImageUpload.array('images', 50)), itemController.uploadBulkStorefrontCatalogImages);
// "Generate an Image" for existing items (#197) — reuses the shared
// itemImageGenerationService.js built for menu-import (#176); this is its
// second caller, not a second implementation. Bulk skips items that already
// have a photo by default (overwrite_existing: true opts back in) since a
// multi-select can easily include items never meant to be touched.
router.post('/storefront-images/generate/bulk', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), itemController.bulkGenerateItemImages);
router.patch('/:item_id/storefront-override', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, validateUpdateStorefrontCatalogOverride, itemController.updateStorefrontCatalogOverride);
router.post('/:item_id/storefront-image/external', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, validateExternalProductImageImport, itemController.importExternalStorefrontCatalogImage);
router.post('/:item_id/storefront-image/generate', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, itemController.generateItemImage);
router.get('/:item_id/storefront-image/generation-status', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, itemController.getItemImageGenerationStatus);
router.post('/:item_id/storefront-image/async', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, preserveTenantContext(storefrontCatalogImageUpload.single('image')), itemController.queueStorefrontCatalogImage);
router.get('/:item_id/storefront-image/async-status', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, itemController.getStorefrontCatalogImageUploadStatus);
router.post('/:item_id/storefront-images/async', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, preserveTenantContext(storefrontCatalogGalleryImageUpload.array('images', 5)), itemController.queueStorefrontCatalogGalleryImages);
router.post('/:item_id/storefront-image', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, preserveTenantContext(storefrontCatalogImageUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'image_medium', maxCount: 1 }, { name: 'image_thumbnail', maxCount: 1 }])), itemController.uploadStorefrontCatalogImage);
router.post('/:item_id/storefront-images', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateItemIdParam, preserveTenantContext(storefrontCatalogGalleryImageUpload.array('images', 5)), itemController.uploadStorefrontCatalogGalleryImages);
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
router.put('/folders/order', requireTenantAdmin, validateReorderFolders, itemController.reorderFolders);
router.patch('/folders/:folder_id', requireTenantAdmin, validateFolderIdParam, validateUpdateFolder, itemController.updateFolder);
router.delete('/folders/:folder_id', requireTenantAdmin, validateFolderIdParam, validateDeleteFolder, itemController.deleteFolder);

// Read-only operations - all authenticated users
router.get('/', itemController.getItems);
router.get('/:item_id', itemController.getItemById);
router.get('/:item_id/stock-history', itemController.getItemStockHistory);
router.get('/:item_id/batches', itemController.getItemBatches);
router.get('/:item_id/movements', itemController.getItemMovements);
router.put('/:item_id/suppliers', checkPermission(PERMISSIONS.INVENTORY.actions.EDIT_ITEMS), validateReplaceItemSuppliers, itemController.replaceItemSuppliers);

// Secondary category memberships (Phase 257, #1318) - foundation only, not
// wired into any existing catalog read yet. Never touches the primary
// items.folder_id pointer. requireTenantAdmin (the categories:manage
// permission check - see its own doc comment), matching the folder CRUD
// routes above and ADR 0049's permission rule.
router.get('/:item_id/folders', requireTenantAdmin, validateItemIdParam, itemController.listItemFolders);
router.put('/:item_id/folders', requireTenantAdmin, validateItemIdParam, validateReplaceItemFolderMemberships, itemController.replaceItemFolders);

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

// Restore operations - admins only. Reverses the one-way deactivate above; reuses the delete
// permission rather than a separate grant, matching the PO/JO restore precedent.
router.post('/:item_id/restore', checkPermission(PERMISSIONS.INVENTORY.actions.DELETE_ITEMS), validateItemIdParam, itemController.restoreItem);

export default router;

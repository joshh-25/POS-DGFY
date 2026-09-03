import fs from 'fs/promises';
import {
  getItemsUseCase,
  getItemByIdUseCase,
  createItemUseCase,
  updateItemUseCase,
  finalizeItemUseCase,
  deleteItemUseCase,
  restoreItemUseCase,
  getItemStockHistoryUseCase,
  getItemBatchesUseCase,
  getItemMovementsUseCase,
  validateCompositionUseCase,
  getItemSupplierCoverageUseCase,
  replaceItemSuppliersUseCase,
  listStorefrontCatalogOverridesUseCase,
  updateStorefrontCatalogOverrideUseCase,
  updateBulkStorefrontCatalogOverridesUseCase,
  uploadStorefrontCatalogImageUseCase,
  uploadStorefrontCatalogGalleryImagesUseCase,
  uploadBulkStorefrontCatalogImagesUseCase,
  updateStorefrontCatalogGalleryUseCase,
  deleteStorefrontCatalogGalleryImageUseCase,
  deleteStorefrontCatalogImageUseCase,
  listItemBarcodesUseCase,
  attachItemBarcodeUseCase,
  generateItemBarcodeUseCase,
  updateItemBarcodeUseCase,
  deactivateItemBarcodeUseCase,
  setPrimaryItemBarcodeUseCase,
  resolveItemBarcodeUseCase,
  lookupExternalProductUseCase,
  importExternalProductImageUseCase,
  generateItemImageUseCase,
  bulkGenerateItemImageUseCase,
  resolveItemBarcodeConflictUseCase,
  renderItemBarcodeLabelUseCase,
  getFoldersUseCase,
  createFolderUseCase,
  updateFolderUseCase,
  deleteFolderUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import { hasEffectivePermission } from '../../../utils/userPermissions.js';
import { enqueueItemImageGeneration } from '../../../workers/itemImageWorker.js';
import { setItemImageStatus, getItemImageStatus } from '../../../workers/itemImageStatusStore.js';
import {
  enqueueCatalogImageUpload
} from '../../../workers/catalogImageUploadWorker.js';
import { getCatalogImageUploadStatus } from '../../../workers/catalogImageUploadStatusStore.js';
import logger from '../../../config/logger.js';
import { publishCatalogChange } from '../../shared/services/catalogChangeEventBus.js';
import { resolveEffectivePermissions } from '../../../utils/userPermissions.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;
const publishCatalogInvalidation = async (req, reason, itemIds = []) => {
  if (!req.user?.tenant_id && !req.tenant?.id) return;
  await publishCatalogChange({
    tenantId: req.user?.tenant_id || req.tenant?.id,
    reason,
    itemIds
  });
};
const defaultErrorPayload = (req, res, failure) => ({
  success: false,
  data: null,
  message: failure.message,
  error_code: failure.code,
  errors: failure.details,
  request_id: requestId(req, res),
  timestamp: timestamp()
});

const statusCodeToDomainErrorCode = (statusCode) => {
  if (statusCode === 401) return DomainErrorCode.AUTHENTICATION_FAILED;
  if (statusCode === 403) return DomainErrorCode.AUTHORIZATION_FAILED;
  if (statusCode === 404) return DomainErrorCode.RESOURCE_NOT_FOUND;
  if (statusCode === 409) return DomainErrorCode.CONFLICT;
  if (statusCode >= 400 && statusCode < 500) return DomainErrorCode.VALIDATION_FAILED;
  return DomainErrorCode.INTERNAL_ERROR;
};

const mapInventoryControllerError = (error, fallbackMessage) => {
  if (isDomainError(error)) {
    return error;
  }

  const message = error?.message || fallbackMessage || 'Inventory request failed';
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : undefined;
  const hasNotFoundMessage = /not found/i.test(message);

  return new DomainError(
    hasNotFoundMessage ? DomainErrorCode.RESOURCE_NOT_FOUND : statusCodeToDomainErrorCode(statusCode || 500),
    message,
    {
      statusCode: statusCode || (hasNotFoundMessage ? 404 : undefined),
      details: error?.details || null
    }
  );
};

const runInventoryUseCase = async (runner, fallbackMessage) => {
  try {
    const data = await runner();
    return ok(data);
  } catch (error) {
    return fail(mapInventoryControllerError(error, fallbackMessage));
  }
};

export const getItems = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => getItemsUseCase({ query: req.query, user: req.user }),
      'Failed to retrieve items'
    );
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'inventory_items_viewed',
      surface: 'inventory',
      action: 'list_items',
      result,
      successMetadataResolver: (data) => ({
        result_count: Array.isArray(data?.items) ? data.items.length : 0,
        has_search: Boolean(req?.query?.search),
        location_id: req?.query?.location_id || null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getItemById = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const result = await runInventoryUseCase(
      () => getItemByIdUseCase({ itemId: item_id, query: req.query, user: req.user }),
      'Failed to retrieve item'
    );
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'inventory_item_viewed',
      surface: 'inventory',
      action: 'view_item',
      result,
      successMetadataResolver: (data) => ({
        item_id: data?.item_id ?? item_id,
        status: data?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const createItem = async (req, res, next) => {
  try {
    const itemData = req.validatedData;
    const userId = req.user.user_id;
    const canManageCategories = hasEffectivePermission(
      req.user,
      PERMISSIONS.SYSTEM.actions.MANAGE_CATEGORIES
    );
    const result = await runInventoryUseCase(
      () => createItemUseCase({ itemData, userId, canManageCategories }),
      'Failed to create item'
    );
    if (result.success) {
      await publishCatalogInvalidation(req, 'item_created', [result.data?.item_id]);
    }
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'inventory_item_created',
      surface: 'inventory',
      action: 'create_item',
      result,
      successMetadataResolver: (item) => ({
        item_id: item?.item_id ?? null,
        status: item?.status ?? null,
        category: item?.category ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => {
        const item = result.data;
        const message = item.status === 'draft' ? 'Item draft saved successfully' : 'Item created successfully';

        return {
          success: true,
          data: {
            item_id: item.item_id,
            sku_code: item.sku_code,
            name: item.name,
            category: item.category,
            status: item.status,
            folder_id: item.folder_id ?? null,
            product_folder: item.product_folder ?? null
          },
          message,
          timestamp: timestamp()
        };
      },
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const updateItem = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const itemData = req.validatedData;
    const userId = req.user.user_id;
    const canManageCategories = hasEffectivePermission(
      req.user,
      PERMISSIONS.SYSTEM.actions.MANAGE_CATEGORIES
    );
    const result = await runInventoryUseCase(
      () => updateItemUseCase({ itemId: item_id, itemData, userId, canManageCategories }),
      'Failed to update item'
    );
    if (result.success) {
      await publishCatalogInvalidation(req, 'item_updated', [item_id]);
    }
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'inventory_item_updated',
      surface: 'inventory',
      action: 'update_item',
      result,
      successMetadataResolver: (item) => ({
        item_id: item?.item_id ?? item_id,
        status: item?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Item updated successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const finalizeItem = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const itemData = req.validatedData || req.body || {};
    const userId = req.user.user_id;
    const result = await runInventoryUseCase(
      () => finalizeItemUseCase({ itemId: item_id, itemData, userId }),
      'Failed to finalize item'
    );
    if (result.success) {
      await publishCatalogInvalidation(req, 'item_finalized', [item_id]);
    }
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'inventory_item_finalized',
      surface: 'inventory',
      action: 'finalize_item',
      result,
      successMetadataResolver: (item) => ({
        item_id: item?.item_id ?? item_id,
        status: item?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Item finalized successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const deleteItem = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const userId = req.user.user_id;

    const result = await runInventoryUseCase(
      () => deleteItemUseCase({ itemId: item_id, userId }),
      'Failed to delete item'
    );
    if (result.success) {
      await publishCatalogInvalidation(req, 'item_deleted', [item_id]);
    }
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'inventory_item_deleted',
      surface: 'inventory',
      action: 'delete_item',
      result,
      successMetadataResolver: () => ({
        item_id
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: null,
        message: 'Item deleted successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => ({
        ...defaultErrorPayload(req, res, failure),
        details: failure.details
      })
    });
  } catch (error) {
    next(error);
  }
};

export const restoreItem = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const userId = req.user.user_id;

    const result = await runInventoryUseCase(
      () => restoreItemUseCase({ itemId: item_id, userId }),
      'Failed to restore item'
    );
    if (result.success) {
      await publishCatalogInvalidation(req, 'item_restored', [item_id]);
    }
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'inventory_item_restored',
      surface: 'inventory',
      action: 'restore_item',
      result,
      successMetadataResolver: () => ({
        item_id
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Item restored successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getItemStockHistory = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const result = await runInventoryUseCase(
      () => getItemStockHistoryUseCase({ itemId: item_id, query: req.query }),
      'Failed to retrieve item stock history'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: { movements: result.data },
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getItemBatches = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const result = await runInventoryUseCase(
      () => getItemBatchesUseCase({ itemId: item_id, locationId: req.query?.location_id ?? null }),
      'Failed to retrieve item batches'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: { batches: result.data },
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getItemMovements = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const result = await runInventoryUseCase(
      () => getItemMovementsUseCase({ itemId: item_id }),
      'Failed to retrieve item movements'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: { movements: result.data },
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const validateComposition = async (req, res, next) => {
  try {
    const { product_id, ingredient_ids } = req.body;

    if (!ingredient_ids || !Array.isArray(ingredient_ids)) {
      const validationResult = fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'ingredient_ids must be an array',
        { statusCode: 400 }
      ));

      return sendUseCaseResult(res, validationResult, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    const result = await runInventoryUseCase(
      () => validateCompositionUseCase({
        productId: product_id,
        ingredientIds: ingredient_ids
      }),
      'Failed to validate composition'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getItemSupplierCoverage = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => getItemSupplierCoverageUseCase(),
      'Failed to retrieve item supplier coverage'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const replaceItemSuppliers = async (req, res, next) => {
  try {
    const { item_id } = req.params;
    const result = await runInventoryUseCase(
      () => replaceItemSuppliersUseCase({
        itemId: item_id,
        suppliers: req.validatedData?.suppliers || []
      }),
      'Failed to sync item suppliers'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Item suppliers synced successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

const sendBarcodeResult = (req, res, result, { statusCode = 200, message = null } = {}) => sendUseCaseResult(res, result, {
  successStatusCodeResolver: () => statusCode,
  successPayloadResolver: () => ({
    success: true,
    data: result.data,
    ...(message ? { message } : {}),
    timestamp: timestamp()
  }),
  errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
});

export const listItemBarcodes = async (req, res, next) => {
  try {
    const result = await listItemBarcodesUseCase({
      itemId: req.validatedParams?.item_id || req.params.item_id,
      query: req.query || {}
    });
    return sendBarcodeResult(req, res, result);
  } catch (error) {
    next(error);
  }
};

export const attachItemBarcode = async (req, res, next) => {
  try {
    const result = await attachItemBarcodeUseCase({
      itemId: req.validatedParams?.item_id || req.params.item_id,
      payload: req.validatedData || req.body || {},
      userId: req.user?.user_id || null
    });
    return sendBarcodeResult(req, res, result, {
      statusCode: 201,
      message: 'Barcode attached successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const generateItemBarcode = async (req, res, next) => {
  try {
    const result = await generateItemBarcodeUseCase({
      itemId: req.validatedParams?.item_id || req.params.item_id,
      payload: req.validatedData || req.body || {},
      userId: req.user?.user_id || null
    });
    return sendBarcodeResult(req, res, result, {
      statusCode: 201,
      message: 'Internal barcode generated successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const updateItemBarcode = async (req, res, next) => {
  try {
    const result = await updateItemBarcodeUseCase({
      itemId: req.validatedParams?.item_id || req.params.item_id,
      barcodeId: req.validatedParams?.barcode_id || req.params.barcode_id,
      payload: req.validatedData || req.body || {},
      userId: req.user?.user_id || null
    });
    return sendBarcodeResult(req, res, result, {
      message: 'Barcode updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const deactivateItemBarcode = async (req, res, next) => {
  try {
    const result = await deactivateItemBarcodeUseCase({
      itemId: req.validatedParams?.item_id || req.params.item_id,
      barcodeId: req.validatedParams?.barcode_id || req.params.barcode_id,
      userId: req.user?.user_id || null
    });
    return sendBarcodeResult(req, res, result, {
      message: 'Barcode deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const setPrimaryItemBarcode = async (req, res, next) => {
  try {
    const result = await setPrimaryItemBarcodeUseCase({
      itemId: req.validatedParams?.item_id || req.params.item_id,
      barcodeId: req.validatedParams?.barcode_id || req.params.barcode_id,
      userId: req.user?.user_id || null
    });
    return sendBarcodeResult(req, res, result, {
      message: 'Primary barcode updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const resolveItemBarcode = async (req, res, next) => {
  try {
    const result = await resolveItemBarcodeUseCase({
      code: req.validatedQuery?.code || req.query.code,
      query: req.validatedQuery || req.query || {},
      userId: req.user?.user_id || null
    });
    return sendBarcodeResult(req, res, result);
  } catch (error) {
    next(error);
  }
};

export const lookupExternalProduct = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => lookupExternalProductUseCase({
        code: req.validatedQuery?.code || req.query.code
      }),
      'Failed to look up external product'
    );
    return sendBarcodeResult(req, res, result);
  } catch (error) {
    next(error);
  }
};

export const resolveItemBarcodeConflict = async (req, res, next) => {
  try {
    const result = await resolveItemBarcodeConflictUseCase({
      payload: req.validatedData || req.body || {},
      userId: req.user?.user_id || null
    });
    return sendBarcodeResult(req, res, result, {
      message: 'Barcode conflict action processed'
    });
  } catch (error) {
    next(error);
  }
};

export const renderItemBarcodeLabel = async (req, res, next) => {
  try {
    const result = await renderItemBarcodeLabelUseCase({
      itemId: req.validatedParams?.item_id || req.params.item_id,
      query: req.validatedQuery || req.query || {},
      userId: req.user?.user_id || null
    });
    return sendBarcodeResult(req, res, result);
  } catch (error) {
    next(error);
  }
};

export const listStorefrontCatalogOverrides = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => listStorefrontCatalogOverridesUseCase({ query: req.validatedQuery || req.query || {} }),
      'Failed to retrieve storefront catalog overrides'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const updateStorefrontCatalogOverride = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => updateStorefrontCatalogOverrideUseCase({
        itemId: req.validatedParams?.item_id || req.params.item_id,
        payload: req.validatedData || req.body || {},
        user: req.user
      }),
      'Failed to update storefront catalog override'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Storefront catalog override updated successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const updateBulkStorefrontCatalogOverrides = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => updateBulkStorefrontCatalogOverridesUseCase({
        payload: req.validatedData || req.body || {},
        user: req.user
      }),
      'Failed to update storefront catalog overrides in bulk'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Storefront catalog overrides updated',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const uploadStorefrontCatalogImage = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => uploadStorefrontCatalogImageUseCase({
        itemId: req.validatedParams?.item_id || req.params.item_id,
        file: req.file,
        user: req.user
      }),
      'Failed to upload storefront catalog image'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Storefront catalog image uploaded successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

const cleanupQueuedCatalogImageFiles = async (files = []) => {
  await Promise.all((Array.isArray(files) ? files : []).map(async (file) => {
    if (!file?.path) return;
    try {
      await fs.unlink(file.path);
    } catch {
      // The scheduled temp-file cleanup is the final backstop.
    }
  }));
};

const queueStorefrontCatalogImages = async ({ req, res, mode, files }) => {
  const itemId = req.validatedParams?.item_id || req.params.item_id;
  const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  if (normalizedFiles.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one image file is required.',
      error_code: 'VALIDATION_FAILED',
      request_id: requestId(req, res),
      timestamp: timestamp()
    });
  }

  try {
    const item = await getItemByIdUseCase({ itemId });
    if (!item) {
      await cleanupQueuedCatalogImageFiles(normalizedFiles);
      return res.status(404).json({
        success: false,
        message: `Item ${itemId} was not found.`,
        error_code: 'RESOURCE_NOT_FOUND',
        request_id: requestId(req, res),
        timestamp: timestamp()
      });
    }

    const queued = await enqueueCatalogImageUpload({
      tenantId: req.user?.tenant_id,
      user: {
        ...req.user,
        permissions: resolveEffectivePermissions(req.user)
      },
      itemId,
      mode,
      files: normalizedFiles
    });

    return res.status(202).json({
      success: true,
      data: queued,
      message: 'Image received. It will be optimized in the background.',
      timestamp: timestamp()
    });
  } catch (error) {
    await cleanupQueuedCatalogImageFiles(normalizedFiles);
    throw error;
  }
};

export const queueStorefrontCatalogImage = async (req, res, next) => {
  try {
    return await queueStorefrontCatalogImages({
      req,
      res,
      mode: 'single',
      files: req.file ? [req.file] : []
    });
  } catch (error) {
    next(error);
  }
};

export const queueStorefrontCatalogGalleryImages = async (req, res, next) => {
  try {
    return await queueStorefrontCatalogImages({
      req,
      res,
      mode: 'gallery',
      files: req.files || []
    });
  } catch (error) {
    next(error);
  }
};

export const getStorefrontCatalogImageUploadStatus = async (req, res, next) => {
  try {
    const itemId = req.validatedParams?.item_id || req.params.item_id;
    const record = await getCatalogImageUploadStatus(req.user?.tenant_id, itemId);
    return res.status(200).json({
      success: true,
      data: record || {
        item_id: Number(itemId),
        job_id: null,
        status: 'unknown',
        error_code: null,
        error_message: null,
        updated_at: null
      },
      timestamp: timestamp()
    });
  } catch (error) {
    next(error);
  }
};

export const importExternalStorefrontCatalogImage = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => importExternalProductImageUseCase({
        itemId: req.validatedParams?.item_id || req.params.item_id,
        code: req.validatedData?.code,
        user: req.user
      }),
      'Failed to import external product image'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'External product image imported successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

// Enqueueing happens here, not inside a use case — generateItemImageUseCase /
// bulkGenerateItemImageUseCase deliberately resolve/validate only, to avoid
// importing workers/itemImageWorker.js from modules/inventory (that worker
// itself imports uploadStorefrontCatalogImageUseCase from this module's
// index.js, so the reverse import would be circular). Mirrors how
// menuImportController.js enqueues item-image generation directly rather
// than through a use case, for the same reason.
export const generateItemImage = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => generateItemImageUseCase({
        itemId: req.validatedParams?.item_id || req.params.item_id,
        user: req.user
      }),
      'Failed to queue AI image generation'
    );

    if (result?.success) {
      try {
        await enqueueItemImageGeneration({
          user: result.data.generation_user,
          itemId: result.data.item_id,
          name: result.data.name,
          description: result.data.description,
          category: result.data.category
        });
        await setItemImageStatus(req.user.tenant_id, result.data.item_id, { status: 'queued' });
      } catch (error) {
        logger.error('[ItemHandlers] Failed to enqueue item image generation', {
          itemId: result.data.item_id,
          reason: error?.message
        });
        return res.status(503).json({
          success: false,
          message: 'Image generation queue is temporarily unavailable. Please try again shortly.',
          error_code: 'QUEUE_UNAVAILABLE',
          request_id: requestId(req, res),
          timestamp: timestamp()
        });
      }
    }

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 202,
      successPayloadResolver: () => ({
        success: true,
        data: { item_id: result.data.item_id, queued: true },
        message: 'Image generation queued — this item will get a photo shortly.',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

// A thin Redis read, not a use case: itemImageStatusStore.js has no model
// access and no business rule to validate beyond "does a record exist" —
// the same reasoning that already puts enqueueItemImageGeneration's import
// directly in this controller rather than behind a use case.
export const getItemImageGenerationStatus = async (req, res, next) => {
  try {
    const itemId = req.validatedParams?.item_id || req.params.item_id;
    const record = await getItemImageStatus(req.user.tenant_id, itemId);
    return res.status(200).json({
      success: true,
      data: record || { status: 'unknown', error_code: null, error_message: null, updated_at: null },
      timestamp: timestamp()
    });
  } catch (error) {
    next(error);
  }
};

export const bulkGenerateItemImages = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => bulkGenerateItemImageUseCase({
        itemIds: req.body?.item_ids,
        overwriteExisting: req.body?.overwrite_existing === true,
        user: req.user
      }),
      'Failed to queue AI image generation'
    );

    if (!result?.success) {
      return sendUseCaseResult(res, result, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    const { generation_user: generationUser, candidates } = result.data;
    const results = await Promise.all(candidates.map(async (candidate) => {
      if (candidate.status !== 'eligible') return candidate;
      try {
        await enqueueItemImageGeneration({
          user: generationUser,
          itemId: candidate.item_id,
          name: candidate.name,
          description: candidate.description,
          category: candidate.category
        });
        await setItemImageStatus(req.user.tenant_id, candidate.item_id, { status: 'queued' });
        return { item_id: candidate.item_id, status: 'queued' };
      } catch (error) {
        logger.error('[ItemHandlers] Failed to enqueue bulk item image generation', {
          itemId: candidate.item_id,
          reason: error?.message
        });
        return { item_id: candidate.item_id, status: 'failed', reason: 'queue_unavailable' };
      }
    }));

    const summary = {
      queued: results.filter((entry) => entry.status === 'queued').length,
      skipped: results.filter((entry) => entry.status === 'skipped').length,
      not_found: results.filter((entry) => entry.status === 'not_found').length,
      failed: results.filter((entry) => entry.status === 'failed').length
    };

    return res.status(202).json({
      success: true,
      data: { summary, results },
      message: `${summary.queued} image(s) queued for AI generation.${summary.skipped ? ` ${summary.skipped} skipped (already have a photo).` : ''}`,
      timestamp: timestamp()
    });
  } catch (error) {
    next(error);
  }
};

export const uploadStorefrontCatalogGalleryImages = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => uploadStorefrontCatalogGalleryImagesUseCase({
        itemId: req.validatedParams?.item_id || req.params.item_id,
        files: req.files,
        user: req.user
      }),
      'Failed to upload storefront catalog image gallery'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Storefront catalog image gallery uploaded successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const uploadBulkStorefrontCatalogImages = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => uploadBulkStorefrontCatalogImagesUseCase({
        files: req.files,
        user: req.user
      }),
      'Failed to upload storefront catalog images in bulk'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Storefront catalog images processed',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const updateStorefrontCatalogGallery = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => updateStorefrontCatalogGalleryUseCase({
        itemId: req.validatedParams?.item_id || req.params.item_id,
        payload: req.body,
        user: req.user
      }),
      'Failed to update storefront catalog image gallery'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Storefront catalog image gallery updated successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const deleteStorefrontCatalogGalleryImage = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => deleteStorefrontCatalogGalleryImageUseCase({
        itemId: req.validatedParams?.item_id || req.params.item_id,
        imageIndex: req.params.image_index,
        user: req.user
      }),
      'Failed to delete storefront catalog gallery image'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Storefront catalog gallery image deleted successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const deleteStorefrontCatalogImage = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => deleteStorefrontCatalogImageUseCase({
        itemId: req.validatedParams?.item_id || req.params.item_id,
        user: req.user
      }),
      'Failed to delete storefront catalog image'
    );

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Storefront catalog image deleted successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getFolders = async (req, res, next) => {
  try {
    const result = await runInventoryUseCase(
      () => getFoldersUseCase(),
      'Failed to retrieve folders'
    );
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'inventory_folders_viewed',
      surface: 'inventory',
      action: 'list_folders',
      result,
      successMetadataResolver: (data) => ({
        folder_count: Array.isArray(data?.folders) ? data.folders.length : Array.isArray(data) ? data.length : 0
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const createFolder = async (req, res, next) => {
  try {
    const { name, description } = req.validatedData || req.body || {};
    const result = await runInventoryUseCase(
      () => createFolderUseCase({ name, description }),
      'Failed to create folder'
    );
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'inventory_folder_created',
      surface: 'inventory',
      action: 'create_folder',
      result,
      successMetadataResolver: (data) => ({
        folder_id: data?.folder_id ?? null,
        name: data?.name ?? name ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const deleteFolder = async (req, res, next) => {
  try {
    const folder_id = req.validatedParams?.folder_id || req.params.folder_id;
    const replacementFolderId = req.validatedData?.replacement_folder_id;
    const result = await runInventoryUseCase(
      () => deleteFolderUseCase({ folderId: folder_id, replacementFolderId, userId: req.user?.user_id || null }),
      'Failed to delete folder'
    );
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'inventory_folder_deleted',
      surface: 'inventory',
      action: 'delete_folder',
      result,
      successMetadataResolver: (data) => ({
        folder_id,
        replacement_folder_id: data?.replacement_folder_id ?? null,
        deleted_items_moved: data?.items_moved ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: result.data?.message,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const updateFolder = async (req, res, next) => {
  try {
    const folder_id = req.validatedParams?.folder_id || req.params.folder_id;
    const result = await runInventoryUseCase(
      () => updateFolderUseCase({ folderId: folder_id, payload: req.validatedData || req.body || {} }),
      'Failed to update folder'
    );
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'inventory_folder_updated',
      surface: 'inventory',
      action: 'update_folder',
      result,
      successMetadataResolver: (data) => ({
        folder_id,
        is_active: data?.is_active ?? null,
        show_in_pos_filter: data?.show_in_pos_filter ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: result.data?.message,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getItems,
  getItemById,
  createItem,
  updateItem,
  finalizeItem,
  deleteItem,
  restoreItem,
  getItemStockHistory,
  getItemBatches,
  getItemMovements,
  validateComposition,
  getItemSupplierCoverage,
  replaceItemSuppliers,
  listItemBarcodes,
  attachItemBarcode,
  generateItemBarcode,
  updateItemBarcode,
  deactivateItemBarcode,
  setPrimaryItemBarcode,
  resolveItemBarcode,
  resolveItemBarcodeConflict,
  renderItemBarcodeLabel,
  listStorefrontCatalogOverrides,
  updateStorefrontCatalogOverride,
  updateBulkStorefrontCatalogOverrides,
  uploadStorefrontCatalogImage,
  queueStorefrontCatalogImage,
  queueStorefrontCatalogGalleryImages,
  getStorefrontCatalogImageUploadStatus,
  uploadStorefrontCatalogGalleryImages,
  uploadBulkStorefrontCatalogImages,
  updateStorefrontCatalogGallery,
  deleteStorefrontCatalogGalleryImage,
  deleteStorefrontCatalogImage,
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder
};

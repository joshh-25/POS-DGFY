import {
  getItemsUseCase,
  getItemByIdUseCase,
  createItemUseCase,
  updateItemUseCase,
  finalizeItemUseCase,
  deleteItemUseCase,
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

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;
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
      () => getItemsUseCase({ query: req.query }),
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
        has_search: Boolean(req?.query?.search)
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
      () => getItemByIdUseCase({ itemId: item_id, query: req.query }),
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
    const result = await runInventoryUseCase(
      () => createItemUseCase({ itemData, userId }),
      'Failed to create item'
    );
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
            status: item.status
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
    const result = await runInventoryUseCase(
      () => updateItemUseCase({ itemId: item_id, itemData, userId }),
      'Failed to update item'
    );
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
    const { name, description } = req.body || {};
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
    const { folder_id } = req.params;
    const result = await runInventoryUseCase(
      () => deleteFolderUseCase({ folderId: folder_id }),
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

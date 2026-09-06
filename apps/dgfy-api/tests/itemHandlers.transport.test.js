import { jest } from '@jest/globals';

const mockGetItemsUseCase = jest.fn();
const mockGetItemByIdUseCase = jest.fn();
const mockCreateItemUseCase = jest.fn();
const mockUpdateItemUseCase = jest.fn();
const mockFinalizeItemUseCase = jest.fn();
const mockDeleteItemUseCase = jest.fn();
const mockRestoreItemUseCase = jest.fn();
const mockGetItemStockHistoryUseCase = jest.fn();
const mockGetItemBatchesUseCase = jest.fn();
const mockGetItemMovementsUseCase = jest.fn();
const mockValidateCompositionUseCase = jest.fn();
const mockGetItemSupplierCoverageUseCase = jest.fn();
const mockReplaceItemSuppliersUseCase = jest.fn();
const mockListStorefrontCatalogOverridesUseCase = jest.fn();
const mockUpdateStorefrontCatalogOverrideUseCase = jest.fn();
const mockUpdateBulkStorefrontCatalogOverridesUseCase = jest.fn();
const mockUploadStorefrontCatalogImageUseCase = jest.fn();
const mockImportExternalProductImageUseCase = jest.fn();
const mockUploadStorefrontCatalogGalleryImagesUseCase = jest.fn();
const mockUploadBulkStorefrontCatalogImagesUseCase = jest.fn();
const mockUpdateStorefrontCatalogGalleryUseCase = jest.fn();
const mockDeleteStorefrontCatalogGalleryImageUseCase = jest.fn();
const mockDeleteStorefrontCatalogImageUseCase = jest.fn();
const mockListItemBarcodesUseCase = jest.fn();
const mockAttachItemBarcodeUseCase = jest.fn();
const mockGenerateItemBarcodeUseCase = jest.fn();
const mockUpdateItemBarcodeUseCase = jest.fn();
const mockDeactivateItemBarcodeUseCase = jest.fn();
const mockSetPrimaryItemBarcodeUseCase = jest.fn();
const mockResolveItemBarcodeUseCase = jest.fn();
const mockLookupExternalProductUseCase = jest.fn();
const mockResolveItemBarcodeConflictUseCase = jest.fn();
const mockRenderItemBarcodeLabelUseCase = jest.fn();
const mockGetFoldersUseCase = jest.fn();
const mockCreateFolderUseCase = jest.fn();
const mockUpdateFolderUseCase = jest.fn();
const mockDeleteFolderUseCase = jest.fn();
// #1124/#1469: added alongside #1318's list/replace item category membership API.
const mockListItemFoldersUseCase = jest.fn();
const mockReplaceItemFoldersUseCase = jest.fn();
const mockGenerateItemImageUseCase = jest.fn();
const mockBulkGenerateItemImageUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();
const mockEnqueueItemImageGeneration = jest.fn();
const mockSetItemImageStatus = jest.fn();
const mockGetItemImageStatus = jest.fn();
// #1410 review RF-3: regression coverage for the 6 storefront-catalog-image
// handlers that now call publishCatalogInvalidation on success.
const mockPublishCatalogChange = jest.fn();

jest.unstable_mockModule('../src/modules/inventory/index.js', () => ({
  getItemsUseCase: mockGetItemsUseCase,
  getItemByIdUseCase: mockGetItemByIdUseCase,
  createItemUseCase: mockCreateItemUseCase,
  updateItemUseCase: mockUpdateItemUseCase,
  finalizeItemUseCase: mockFinalizeItemUseCase,
  deleteItemUseCase: mockDeleteItemUseCase,
  restoreItemUseCase: mockRestoreItemUseCase,
  getItemStockHistoryUseCase: mockGetItemStockHistoryUseCase,
  getItemBatchesUseCase: mockGetItemBatchesUseCase,
  getItemMovementsUseCase: mockGetItemMovementsUseCase,
  validateCompositionUseCase: mockValidateCompositionUseCase,
  getItemSupplierCoverageUseCase: mockGetItemSupplierCoverageUseCase,
  replaceItemSuppliersUseCase: mockReplaceItemSuppliersUseCase,
  listStorefrontCatalogOverridesUseCase: mockListStorefrontCatalogOverridesUseCase,
  updateStorefrontCatalogOverrideUseCase: mockUpdateStorefrontCatalogOverrideUseCase,
  updateBulkStorefrontCatalogOverridesUseCase: mockUpdateBulkStorefrontCatalogOverridesUseCase,
  uploadStorefrontCatalogImageUseCase: mockUploadStorefrontCatalogImageUseCase,
  importExternalProductImageUseCase: mockImportExternalProductImageUseCase,
  uploadStorefrontCatalogGalleryImagesUseCase: mockUploadStorefrontCatalogGalleryImagesUseCase,
  uploadBulkStorefrontCatalogImagesUseCase: mockUploadBulkStorefrontCatalogImagesUseCase,
  updateStorefrontCatalogGalleryUseCase: mockUpdateStorefrontCatalogGalleryUseCase,
  deleteStorefrontCatalogGalleryImageUseCase: mockDeleteStorefrontCatalogGalleryImageUseCase,
  deleteStorefrontCatalogImageUseCase: mockDeleteStorefrontCatalogImageUseCase,
  listItemBarcodesUseCase: mockListItemBarcodesUseCase,
  attachItemBarcodeUseCase: mockAttachItemBarcodeUseCase,
  generateItemBarcodeUseCase: mockGenerateItemBarcodeUseCase,
  updateItemBarcodeUseCase: mockUpdateItemBarcodeUseCase,
  deactivateItemBarcodeUseCase: mockDeactivateItemBarcodeUseCase,
  setPrimaryItemBarcodeUseCase: mockSetPrimaryItemBarcodeUseCase,
  resolveItemBarcodeUseCase: mockResolveItemBarcodeUseCase,
  lookupExternalProductUseCase: mockLookupExternalProductUseCase,
  resolveItemBarcodeConflictUseCase: mockResolveItemBarcodeConflictUseCase,
  renderItemBarcodeLabelUseCase: mockRenderItemBarcodeLabelUseCase,
  getFoldersUseCase: mockGetFoldersUseCase,
  createFolderUseCase: mockCreateFolderUseCase,
  updateFolderUseCase: mockUpdateFolderUseCase,
  deleteFolderUseCase: mockDeleteFolderUseCase,
  listItemFoldersUseCase: mockListItemFoldersUseCase,
  replaceItemFoldersUseCase: mockReplaceItemFoldersUseCase,
  generateItemImageUseCase: mockGenerateItemImageUseCase,
  bulkGenerateItemImageUseCase: mockBulkGenerateItemImageUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

jest.unstable_mockModule('../src/workers/itemImageWorker.js', () => ({
  enqueueItemImageGeneration: mockEnqueueItemImageGeneration
}));

jest.unstable_mockModule('../src/workers/itemImageStatusStore.js', () => ({
  setItemImageStatus: mockSetItemImageStatus,
  getItemImageStatus: mockGetItemImageStatus
}));

jest.unstable_mockModule('../src/modules/shared/services/catalogChangeEventBus.js', () => ({
  publishCatalogChange: mockPublishCatalogChange
}));

let getItems;
let createItem;
let deleteItem;
let restoreItem;
let validateComposition;
let updateFolder;
let deleteFolder;
let replaceItemSuppliers;
let resolveItemBarcode;
let importExternalStorefrontCatalogImage;
let generateItemImage;
let bulkGenerateItemImages;
let getItemImageGenerationStatus;
let uploadStorefrontCatalogImage;
let uploadStorefrontCatalogGalleryImages;
let uploadBulkStorefrontCatalogImages;
let updateStorefrontCatalogGallery;
let deleteStorefrontCatalogGalleryImage;
let deleteStorefrontCatalogImage;

beforeAll(async () => {
  const mod = await import('../src/modules/inventory/controllers/itemHandlers.js');
  getItems = mod.getItems;
  uploadStorefrontCatalogImage = mod.uploadStorefrontCatalogImage;
  uploadStorefrontCatalogGalleryImages = mod.uploadStorefrontCatalogGalleryImages;
  uploadBulkStorefrontCatalogImages = mod.uploadBulkStorefrontCatalogImages;
  updateStorefrontCatalogGallery = mod.updateStorefrontCatalogGallery;
  deleteStorefrontCatalogGalleryImage = mod.deleteStorefrontCatalogGalleryImage;
  deleteStorefrontCatalogImage = mod.deleteStorefrontCatalogImage;
  createItem = mod.createItem;
  deleteItem = mod.deleteItem;
  restoreItem = mod.restoreItem;
  validateComposition = mod.validateComposition;
  updateFolder = mod.updateFolder;
  deleteFolder = mod.deleteFolder;
  replaceItemSuppliers = mod.replaceItemSuppliers;
  resolveItemBarcode = mod.resolveItemBarcode;
  importExternalStorefrontCatalogImage = mod.importExternalStorefrontCatalogImage;
  generateItemImage = mod.generateItemImage;
  bulkGenerateItemImages = mod.bulkGenerateItemImages;
  getItemImageGenerationStatus = mod.getItemImageGenerationStatus;
});

const createRes = () => {
  const res = {
    locals: {},
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('itemHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
    mockPublishCatalogChange.mockResolvedValue(true);
  });

  it('getItems returns stable success payload', async () => {
    mockGetItemsUseCase.mockResolvedValue({
      items: [{ item_id: 1, name: 'Flour' }],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 }
    });

    const req = { query: {}, requestId: 'req-item-list', user: { user_id: 2, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getItems(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        items: [{ item_id: 1, name: 'Flour' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 }
      },
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'inventory_items_viewed',
      surface: 'inventory',
      action: 'list_items'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('createItem preserves draft success message contract', async () => {
    mockCreateItemUseCase.mockResolvedValue({
      item_id: 11,
      sku_code: 'RM-011',
      name: 'Sugar',
      category: 'raw_material',
      status: 'draft'
    });

    const req = {
      validatedData: { name: 'Sugar', sku_code: 'RM-011' },
      user: { user_id: 2 },
      requestId: 'req-item-create'
    };
    const res = createRes();
    const next = jest.fn();

    await createItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        item_id: 11,
        sku_code: 'RM-011',
        name: 'Sugar',
        category: 'raw_material',
        status: 'draft',
        folder_id: null,
        product_folder: null
      },
      message: 'Item draft saved successfully',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'inventory_item_created',
      surface: 'inventory',
      action: 'create_item'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('deleteItem returns standardized error payload with details', async () => {
    const error = new Error('Cannot delete item');
    error.statusCode = 400;
    error.details = ['Referenced in 1 purchase order(s): PO-001 (pending)'];
    mockDeleteItemUseCase.mockRejectedValue(error);

    const req = {
      params: { item_id: '10' },
      user: { user_id: 2 },
      requestId: 'req-item-delete'
    };
    const res = createRes();
    const next = jest.fn();

    await deleteItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'Cannot delete item',
      error_code: 'VALIDATION_FAILED',
      errors: ['Referenced in 1 purchase order(s): PO-001 (pending)'],
      request_id: 'req-item-delete',
      timestamp: expect.any(String),
      details: ['Referenced in 1 purchase order(s): PO-001 (pending)']
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'inventory_item_deleted',
      surface: 'inventory',
      action: 'delete_item'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('restoreItem returns success payload and fires restore telemetry (#1495 Part A)', async () => {
    mockRestoreItemUseCase.mockResolvedValue({ item_id: 10, name: 'Sugar', status: 'active' });

    const req = {
      params: { item_id: '10' },
      user: { user_id: 2, tenant_id: 'tenant-1' },
      requestId: 'req-item-restore'
    };
    const res = createRes();
    const next = jest.fn();

    await restoreItem(req, res, next);

    expect(mockRestoreItemUseCase).toHaveBeenCalledWith({ itemId: '10', userId: 2 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { item_id: 10, name: 'Sugar', status: 'active' },
      message: 'Item restored successfully',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'inventory_item_restored',
      surface: 'inventory',
      action: 'restore_item'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('restoreItem returns standardized error payload when the item is not deleted (#1495 Part A)', async () => {
    const error = new Error('Item is not deleted');
    error.statusCode = 400;
    mockRestoreItemUseCase.mockRejectedValue(error);

    const req = {
      params: { item_id: '10' },
      user: { user_id: 2 },
      requestId: 'req-item-restore-rejected'
    };
    const res = createRes();
    const next = jest.fn();

    await restoreItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'Item is not deleted',
      error_code: 'VALIDATION_FAILED',
      errors: null,
      request_id: 'req-item-restore-rejected',
      timestamp: expect.any(String)
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('validateComposition rejects non-array ingredient_ids with standardized payload', async () => {
    const req = {
      body: {
        product_id: 1,
        ingredient_ids: 'not-array'
      },
      requestId: 'req-item-validate'
    };
    const res = createRes();
    const next = jest.fn();

    await validateComposition(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'ingredient_ids must be an array',
      error_code: 'VALIDATION_FAILED',
      errors: null,
      request_id: 'req-item-validate',
      timestamp: expect.any(String)
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('updateFolder returns stable success payload and uses validated params/body', async () => {
    mockUpdateFolderUseCase.mockResolvedValue({
      folder_id: 33,
      name: 'FG',
      show_in_pos_filter: false,
      message: 'Folder "FG" updated successfully.'
    });

    const req = {
      params: { folder_id: '33' },
      validatedParams: { folder_id: 33 },
      validatedData: { show_in_pos_filter: false },
      user: { user_id: 2, tenant_id: 'tenant-1' },
      requestId: 'req-folder-update'
    };
    const res = createRes();
    const next = jest.fn();

    await updateFolder(req, res, next);

    expect(mockUpdateFolderUseCase).toHaveBeenCalledWith({
      folderId: 33,
      payload: { show_in_pos_filter: false }
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        folder_id: 33,
        name: 'FG',
        show_in_pos_filter: false,
        message: 'Folder "FG" updated successfully.'
      },
      message: 'Folder "FG" updated successfully.',
      timestamp: expect.any(String)
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('deleteFolder passes through secondary_items_affected on a successful delete (#1318)', async () => {
    mockDeleteFolderUseCase.mockResolvedValue({
      success: true,
      replacement_folder_id: null,
      items_moved: 0,
      secondary_items_affected: 2,
      message: 'Category "Legacy Folder" deleted successfully. 2 item(s) also list this as a secondary category and will lose that link.'
    });

    const req = {
      params: { folder_id: '7' },
      validatedParams: { folder_id: 7 },
      validatedData: {},
      user: { user_id: 2 },
      requestId: 'req-folder-delete-success'
    };
    const res = createRes();
    const next = jest.fn();

    await deleteFolder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        replacement_folder_id: null,
        items_moved: 0,
        secondary_items_affected: 2,
        message: 'Category "Legacy Folder" deleted successfully. 2 item(s) also list this as a secondary category and will lose that link.'
      },
      message: 'Category "Legacy Folder" deleted successfully. 2 item(s) also list this as a secondary category and will lose that link.',
      timestamp: expect.any(String)
    });
    expect(next).not.toHaveBeenCalled();
  });

  // #1578 review RF-1: itemRepository.deleteFolder set a bare
  // `error.secondary_items_affected` property on the raw 409 error, but
  // defaultErrorPayload only ever serializes `failure.details` as the response's
  // `errors` field (a bare top-level property is dropped, whether or not
  // mapInventoryControllerError's isDomainError() duck-typing passes the error
  // through unchanged, as it does here, or reconstructs it) -- so the count never
  // actually reached this transport layer, only the message string did. This is
  // the regression test for the fix (itemRepository.js now also sets
  // `error.details = { secondary_items_affected }`).
  it('deleteFolder returns secondary_items_affected in the 409 reassignment-required error payload (#1578 review RF-1)', async () => {
    const error = new Error('Category "Mains" is assigned to 1 item(s). Choose an active replacement category before deleting it. 1 item(s) also list this as a secondary category and will lose that link.');
    error.statusCode = 409;
    error.code = 'CATEGORY_REASSIGNMENT_REQUIRED';
    error.secondary_items_affected = 1;
    error.details = { secondary_items_affected: 1 };
    mockDeleteFolderUseCase.mockRejectedValue(error);

    const req = {
      params: { folder_id: '7' },
      validatedParams: { folder_id: 7 },
      validatedData: {},
      user: { user_id: 2 },
      requestId: 'req-folder-delete-conflict'
    };
    const res = createRes();
    const next = jest.fn();

    await deleteFolder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: error.message,
      // error.code and error.message are both strings, so isDomainError()'s duck
      // typing treats the raw repository error as already-domain-shaped and
      // mapInventoryControllerError returns it unchanged (the original app-specific
      // code, not a re-mapped generic DomainErrorCode).
      error_code: 'CATEGORY_REASSIGNMENT_REQUIRED',
      errors: { secondary_items_affected: 1 },
      request_id: 'req-folder-delete-conflict',
      timestamp: expect.any(String)
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('replaceItemSuppliers returns standardized success payload', async () => {
    mockReplaceItemSuppliersUseCase.mockResolvedValue({
      item_id: 100,
      supplier_count: 2,
      suppliers: [
        { supplier_id: 1, supplier_name: 'Vendor A', moq: 2, price_per_unit: 15 },
        { supplier_id: 2, supplier_name: 'Vendor B', moq: 3, price_per_unit: 14.5 }
      ]
    });

    const req = {
      params: { item_id: '100' },
      validatedData: {
        suppliers: [
          { supplier_id: 1, moq: 2, price_per_unit: 15 },
          { supplier_id: 2, moq: 3, price_per_unit: 14.5 }
        ]
      },
      requestId: 'req-item-supplier-sync'
    };
    const res = createRes();
    const next = jest.fn();

    await replaceItemSuppliers(req, res, next);

    expect(mockReplaceItemSuppliersUseCase).toHaveBeenCalledWith({
      itemId: '100',
      suppliers: [
        { supplier_id: 1, moq: 2, price_per_unit: 15 },
        { supplier_id: 2, moq: 3, price_per_unit: 14.5 }
      ]
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        item_id: 100,
        supplier_count: 2,
        suppliers: [
          { supplier_id: 1, supplier_name: 'Vendor A', moq: 2, price_per_unit: 15 },
          { supplier_id: 2, supplier_name: 'Vendor B', moq: 3, price_per_unit: 14.5 }
        ]
      },
      message: 'Item suppliers synced successfully',
      timestamp: expect.any(String)
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('resolveItemBarcode forwards scan operation and location context to the use case', async () => {
    mockResolveItemBarcodeUseCase.mockResolvedValue({
      success: true,
      data: {
        status: 'resolved',
        barcode: { code: 'CASE-24' },
        item: { item_id: 44, name: 'Case Item' }
      },
      error: null,
      message: null
    });

    const req = {
      query: { code: 'case-24', operation: 'receiving', location_id: '7' },
      validatedQuery: { code: 'case-24', operation: 'receiving', location_id: 7 },
      user: { user_id: 99 },
      requestId: 'req-barcode-resolve'
    };
    const res = createRes();
    const next = jest.fn();

    await resolveItemBarcode(req, res, next);

    expect(mockResolveItemBarcodeUseCase).toHaveBeenCalledWith({
      code: 'case-24',
      query: { code: 'case-24', operation: 'receiving', location_id: 7 },
      userId: 99
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        status: 'resolved'
      })
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('importExternalStorefrontCatalogImage forwards only the accepted barcode and authenticated context', async () => {
    mockImportExternalProductImageUseCase.mockResolvedValue({
      item_id: 44,
      storefront_image_url: '/uploads/storefront-catalog/item-44.webp'
    });

    const req = {
      params: { item_id: '44' },
      validatedParams: { item_id: 44 },
      validatedData: { code: '049000042566' },
      user: { user_id: 99, tenant_id: 'tenant-1' },
      requestId: 'req-external-image-import'
    };
    const res = createRes();
    const next = jest.fn();

    await importExternalStorefrontCatalogImage(req, res, next);

    expect(mockImportExternalProductImageUseCase).toHaveBeenCalledWith({
      itemId: 44,
      code: '049000042566',
      user: req.user
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        item_id: 44,
        storefront_image_url: '/uploads/storefront-catalog/item-44.webp'
      },
      message: 'External product image imported successfully',
      timestamp: expect.any(String)
    });
    expect(next).not.toHaveBeenCalled();
  });

  describe('generateItemImage (#197)', () => {
    it('resolves the item then enqueues generation with the use case-resolved fields', async () => {
      const generationUser = { user_id: 9, tenant_id: 'tenant-1', is_master_admin: false, permissions: ['items:edit'] };
      mockGenerateItemImageUseCase.mockResolvedValue({
        item_id: 44,
        name: 'Sisig',
        description: 'Pork sisig',
        category: 'Mains',
        generation_user: generationUser
      });
      mockEnqueueItemImageGeneration.mockResolvedValue(undefined);

      const req = {
        params: { item_id: '44' },
        validatedParams: { item_id: 44 },
        user: { user_id: 9, tenant_id: 'tenant-1' },
        requestId: 'req-generate-image'
      };
      const res = createRes();
      const next = jest.fn();

      await generateItemImage(req, res, next);

      expect(mockGenerateItemImageUseCase).toHaveBeenCalledWith({ itemId: 44, user: req.user });
      expect(mockEnqueueItemImageGeneration).toHaveBeenCalledWith({
        user: generationUser,
        itemId: 44,
        name: 'Sisig',
        description: 'Pork sisig',
        category: 'Mains'
      });
      expect(mockSetItemImageStatus).toHaveBeenCalledWith('tenant-1', 44, { status: 'queued' });
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { item_id: 44, queued: true },
        message: 'Image generation queued — this item will get a photo shortly.',
        timestamp: expect.any(String)
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('responds 503 without crashing when the queue is unavailable', async () => {
      mockGenerateItemImageUseCase.mockResolvedValue({
        item_id: 44,
        name: 'Sisig',
        description: null,
        category: null,
        generation_user: { user_id: 9, tenant_id: 'tenant-1', is_master_admin: false, permissions: ['items:edit'] }
      });
      mockEnqueueItemImageGeneration.mockRejectedValue(new Error('Redis unavailable'));

      const req = { params: { item_id: '44' }, validatedParams: { item_id: 44 }, user: { user_id: 9 }, requestId: 'req-generate-image-2' };
      const res = createRes();
      const next = jest.fn();

      await generateItemImage(req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error_code: 'QUEUE_UNAVAILABLE'
      }));
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('bulkGenerateItemImages (#197)', () => {
    it('enqueues only the eligible candidates and reports a summary', async () => {
      const generationUser = { user_id: 9, tenant_id: 'tenant-1', is_master_admin: false, permissions: ['items:edit'] };
      mockBulkGenerateItemImageUseCase.mockResolvedValue({
        generation_user: generationUser,
        candidates: [
          { item_id: 1, status: 'eligible', name: 'Adobo', description: null, category: 'Mains' },
          { item_id: 2, status: 'skipped', reason: 'has_existing_photo' },
          { item_id: 3, status: 'not_found' }
        ]
      });
      mockEnqueueItemImageGeneration.mockResolvedValue(undefined);

      const req = { body: { item_ids: [1, 2, 3] }, user: { user_id: 9, tenant_id: 'tenant-1' }, requestId: 'req-bulk-generate' };
      const res = createRes();
      const next = jest.fn();

      await bulkGenerateItemImages(req, res, next);

      expect(mockEnqueueItemImageGeneration).toHaveBeenCalledTimes(1);
      expect(mockEnqueueItemImageGeneration).toHaveBeenCalledWith({
        user: generationUser,
        itemId: 1,
        name: 'Adobo',
        description: null,
        category: 'Mains'
      });
      // Only the eligible, successfully-enqueued candidate gets a status
      // record — skipped/not_found candidates never reach the queue.
      expect(mockSetItemImageStatus).toHaveBeenCalledTimes(1);
      expect(mockSetItemImageStatus).toHaveBeenCalledWith('tenant-1', 1, { status: 'queued' });
      expect(res.status).toHaveBeenCalledWith(202);
      const [payload] = res.json.mock.calls[0];
      expect(payload.data.summary).toEqual({ queued: 1, skipped: 1, not_found: 1, failed: 0 });
      expect(payload.data.results).toEqual(expect.arrayContaining([
        expect.objectContaining({ item_id: 1, status: 'queued' }),
        expect.objectContaining({ item_id: 2, status: 'skipped' }),
        expect.objectContaining({ item_id: 3, status: 'not_found' })
      ]));
      expect(next).not.toHaveBeenCalled();
    });

    it('marks a candidate failed rather than crashing when enqueueing it throws', async () => {
      mockBulkGenerateItemImageUseCase.mockResolvedValue({
        generation_user: { user_id: 9, tenant_id: 'tenant-1', is_master_admin: false, permissions: ['items:edit'] },
        candidates: [{ item_id: 1, status: 'eligible', name: 'Adobo', description: null, category: null }]
      });
      mockEnqueueItemImageGeneration.mockRejectedValue(new Error('Redis unavailable'));

      const req = { body: { item_ids: [1] }, user: { user_id: 9 }, requestId: 'req-bulk-generate-2' };
      const res = createRes();
      const next = jest.fn();

      await bulkGenerateItemImages(req, res, next);

      const [payload] = res.json.mock.calls[0];
      expect(payload.data.summary).toEqual({ queued: 0, skipped: 0, not_found: 0, failed: 1 });
      expect(payload.data.results[0]).toEqual({ item_id: 1, status: 'failed', reason: 'queue_unavailable' });
    });
  });

  describe('getItemImageGenerationStatus', () => {
    it('returns the stored status record for the item', async () => {
      mockGetItemImageStatus.mockResolvedValue({
        status: 'completed',
        error_code: null,
        error_message: null,
        updated_at: '2026-08-03T10:00:00.000Z'
      });

      const req = {
        params: { item_id: '44' },
        validatedParams: { item_id: 44 },
        user: { user_id: 9, tenant_id: 'tenant-1' },
        requestId: 'req-image-status'
      };
      const res = createRes();
      const next = jest.fn();

      await getItemImageGenerationStatus(req, res, next);

      expect(mockGetItemImageStatus).toHaveBeenCalledWith('tenant-1', 44);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          status: 'completed',
          error_code: null,
          error_message: null,
          updated_at: '2026-08-03T10:00:00.000Z'
        },
        timestamp: expect.any(String)
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('reports status "unknown" when nothing was ever queued (or the record expired)', async () => {
      mockGetItemImageStatus.mockResolvedValue(null);

      const req = {
        params: { item_id: '44' },
        validatedParams: { item_id: 44 },
        user: { user_id: 9, tenant_id: 'tenant-1' },
        requestId: 'req-image-status-2'
      };
      const res = createRes();
      const next = jest.fn();

      await getItemImageGenerationStatus(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const [payload] = res.json.mock.calls[0];
      expect(payload.data.status).toBe('unknown');
    });
  });

  // Phase 301 (#265): uploadStorefrontCatalogImage's route now parses via multer .fields(), so
  // the controller reads req.files (not req.file) and forwards a parsed client_image_manifest.
  describe('uploadStorefrontCatalogImage -- .fields() multipart transport (#265 Phase 301)', () => {
    it('forwards the required image plus optional client-derived variants and manifest', async () => {
      mockUploadStorefrontCatalogImageUseCase.mockResolvedValue({
        item_id: 55,
        storefront_image_url: '/uploads/storefront.webp'
      });

      const imageFile = { path: '/tmp/sf-image.jpg', originalname: 'image.jpg', mimetype: 'image/jpeg', size: 1000 };
      const mediumFile = { path: '/tmp/sf-medium.webp', originalname: 'medium.webp', mimetype: 'image/webp', size: 200 };
      const thumbnailFile = { path: '/tmp/sf-thumb.webp', originalname: 'thumb.webp', mimetype: 'image/webp', size: 50 };
      const req = {
        validatedParams: { item_id: 55 },
        params: { item_id: '55' },
        files: { image: [imageFile], image_medium: [mediumFile], image_thumbnail: [thumbnailFile] },
        body: { client_image_manifest: JSON.stringify({ source_mime_hint: 'image/png', large_pre_optimized: true }) },
        user: { user_id: 1, is_master_admin: true, permissions: ['items:edit'] }
      };
      const res = createRes();
      const next = jest.fn();

      await uploadStorefrontCatalogImage(req, res, next);

      expect(mockUploadStorefrontCatalogImageUseCase).toHaveBeenCalledWith({
        itemId: 55,
        files: { image: [imageFile], image_medium: [mediumFile], image_thumbnail: [thumbnailFile] },
        clientImageManifest: { sourceMimeHint: 'image/png', largePreOptimized: true },
        user: req.user
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('still works with only the required image field present (no variants, no manifest)', async () => {
      mockUploadStorefrontCatalogImageUseCase.mockResolvedValue({
        item_id: 56,
        storefront_image_url: '/uploads/storefront.webp'
      });

      const imageFile = { path: '/tmp/sf-image-only.jpg', originalname: 'image-only.jpg', mimetype: 'image/jpeg', size: 1000 };
      const req = {
        validatedParams: { item_id: 56 },
        params: { item_id: '56' },
        files: { image: [imageFile] },
        body: {},
        user: { user_id: 1, is_master_admin: true, permissions: ['items:edit'] }
      };
      const res = createRes();
      const next = jest.fn();

      await uploadStorefrontCatalogImage(req, res, next);

      expect(mockUploadStorefrontCatalogImageUseCase).toHaveBeenCalledWith({
        itemId: 56,
        files: { image: [imageFile] },
        clientImageManifest: null,
        user: req.user
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('ignores a malformed client_image_manifest rather than failing the request', async () => {
      mockUploadStorefrontCatalogImageUseCase.mockResolvedValue({
        item_id: 57,
        storefront_image_url: '/uploads/storefront.webp'
      });

      const imageFile = { path: '/tmp/sf-image-bad-manifest.jpg', originalname: 'image.jpg', mimetype: 'image/jpeg', size: 1000 };
      const req = {
        validatedParams: { item_id: 57 },
        params: { item_id: '57' },
        files: { image: [imageFile] },
        body: { client_image_manifest: '{not valid json' },
        user: { user_id: 1, is_master_admin: true, permissions: ['items:edit'] }
      };
      const res = createRes();
      const next = jest.fn();

      await uploadStorefrontCatalogImage(req, res, next);

      expect(mockUploadStorefrontCatalogImageUseCase).toHaveBeenCalledWith({
        itemId: 57,
        files: { image: [imageFile] },
        clientImageManifest: null,
        user: req.user
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // #1410 review RF-3: regression coverage for the 6 storefront-catalog-image handlers'
  // publishCatalogInvalidation call sites -- these controller-to-event-bus paths previously had
  // no coverage at all, so the bug (image uploaded, POS terminal never refetches) shipped silent.
  describe('#1410 catalog invalidation on storefront-catalog-image mutations', () => {
    describe('uploadStorefrontCatalogImage', () => {
      it('invalidates the POS catalog cache for the uploaded item on success', async () => {
        mockUploadStorefrontCatalogImageUseCase.mockResolvedValue({
          item_id: 60,
          storefront_image_url: '/uploads/storefront-60.webp'
        });

        const imageFile = { path: '/tmp/sf-60.jpg', originalname: 'sf-60.jpg', mimetype: 'image/jpeg', size: 10 };
        const req = {
          validatedParams: { item_id: 60 },
          params: { item_id: '60' },
          files: { image: [imageFile] },
          body: {},
          user: { user_id: 1, tenant_id: 'tenant-1', is_master_admin: true, permissions: ['items:edit'] }
        };
        const res = createRes();
        const next = jest.fn();

        await uploadStorefrontCatalogImage(req, res, next);

        expect(mockPublishCatalogChange).toHaveBeenCalledTimes(1);
        expect(mockPublishCatalogChange).toHaveBeenCalledWith({
          tenantId: 'tenant-1',
          reason: 'storefront_catalog_image_uploaded',
          itemIds: [60]
        });
      });

      it('does not invalidate the catalog when the use case fails', async () => {
        mockUploadStorefrontCatalogImageUseCase.mockRejectedValue(new Error('upload failed'));

        const imageFile = { path: '/tmp/sf-60.jpg', originalname: 'sf-60.jpg', mimetype: 'image/jpeg', size: 10 };
        const req = {
          validatedParams: { item_id: 60 },
          params: { item_id: '60' },
          files: { image: [imageFile] },
          body: {},
          user: { user_id: 1, tenant_id: 'tenant-1' }
        };
        const res = createRes();
        const next = jest.fn();

        await uploadStorefrontCatalogImage(req, res, next);

        expect(mockPublishCatalogChange).not.toHaveBeenCalled();
      });
    });

    describe('uploadStorefrontCatalogGalleryImages', () => {
      it('invalidates the POS catalog cache for the item on success', async () => {
        mockUploadStorefrontCatalogGalleryImagesUseCase.mockResolvedValue({ item_id: 61 });

        const req = {
          validatedParams: { item_id: 61 },
          params: { item_id: '61' },
          files: [{ path: '/tmp/gallery-1.jpg', originalname: 'gallery-1.jpg', mimetype: 'image/jpeg', size: 10 }],
          user: { user_id: 1, tenant_id: 'tenant-1' }
        };
        const res = createRes();
        const next = jest.fn();

        await uploadStorefrontCatalogGalleryImages(req, res, next);

        expect(mockPublishCatalogChange).toHaveBeenCalledTimes(1);
        expect(mockPublishCatalogChange).toHaveBeenCalledWith({
          tenantId: 'tenant-1',
          reason: 'storefront_catalog_gallery_images_uploaded',
          itemIds: [61]
        });
      });

      it('does not invalidate the catalog when the use case fails', async () => {
        mockUploadStorefrontCatalogGalleryImagesUseCase.mockRejectedValue(new Error('gallery upload failed'));

        const req = {
          validatedParams: { item_id: 61 },
          params: { item_id: '61' },
          files: [{ path: '/tmp/gallery-1.jpg', originalname: 'gallery-1.jpg', mimetype: 'image/jpeg', size: 10 }],
          user: { user_id: 1, tenant_id: 'tenant-1' }
        };
        const res = createRes();
        const next = jest.fn();

        await uploadStorefrontCatalogGalleryImages(req, res, next);

        expect(mockPublishCatalogChange).not.toHaveBeenCalled();
      });
    });

    describe('uploadBulkStorefrontCatalogImages', () => {
      it('invalidates the POS catalog cache once with the deduplicated uploaded item ids', async () => {
        // Two result rows for item 70 (large + medium variant of the same SKU) must collapse to
        // one id; the unmatched row (null item_id) must be excluded entirely.
        mockUploadBulkStorefrontCatalogImagesUseCase.mockResolvedValue({
          summary: { uploaded: 2, failed: 0, unmatched: 1, duplicate_filename: 0, duplicate_variant_for_sku: 0, blocked_readiness: 0 },
          results: [
            { filename: 'RM-1.jpg', sku_code: 'RM-1', item_id: 70, status: 'uploaded' },
            { filename: 'RM-1__medium.jpg', sku_code: 'RM-1', item_id: 70, status: 'uploaded' },
            { filename: 'RM-2.jpg', sku_code: 'RM-2', item_id: 71, status: 'uploaded' },
            { filename: 'RM-3.jpg', sku_code: 'RM-3', item_id: null, status: 'unmatched' }
          ]
        });

        const req = {
          files: [{ path: '/tmp/bulk-1.jpg', originalname: 'RM-1.jpg', mimetype: 'image/jpeg', size: 10 }],
          user: { user_id: 1, tenant_id: 'tenant-1' }
        };
        const res = createRes();
        const next = jest.fn();

        await uploadBulkStorefrontCatalogImages(req, res, next);

        expect(mockPublishCatalogChange).toHaveBeenCalledTimes(1);
        expect(mockPublishCatalogChange).toHaveBeenCalledWith({
          tenantId: 'tenant-1',
          reason: 'storefront_catalog_images_bulk_uploaded',
          itemIds: [70, 71]
        });
      });

      it('does not invalidate the catalog when nothing was actually uploaded', async () => {
        mockUploadBulkStorefrontCatalogImagesUseCase.mockResolvedValue({
          summary: { uploaded: 0, failed: 0, unmatched: 1, duplicate_filename: 0, duplicate_variant_for_sku: 0, blocked_readiness: 0 },
          results: [
            { filename: 'RM-9.jpg', sku_code: 'RM-9', item_id: null, status: 'unmatched' }
          ]
        });

        const req = {
          files: [{ path: '/tmp/bulk-9.jpg', originalname: 'RM-9.jpg', mimetype: 'image/jpeg', size: 10 }],
          user: { user_id: 1, tenant_id: 'tenant-1' }
        };
        const res = createRes();
        const next = jest.fn();

        await uploadBulkStorefrontCatalogImages(req, res, next);

        expect(mockPublishCatalogChange).not.toHaveBeenCalled();
      });

      it('does not invalidate the catalog when the use case fails', async () => {
        mockUploadBulkStorefrontCatalogImagesUseCase.mockRejectedValue(new Error('bulk upload failed'));

        const req = {
          files: [{ path: '/tmp/bulk-1.jpg', originalname: 'RM-1.jpg', mimetype: 'image/jpeg', size: 10 }],
          user: { user_id: 1, tenant_id: 'tenant-1' }
        };
        const res = createRes();
        const next = jest.fn();

        await uploadBulkStorefrontCatalogImages(req, res, next);

        expect(mockPublishCatalogChange).not.toHaveBeenCalled();
      });
    });

    describe('updateStorefrontCatalogGallery', () => {
      it('invalidates the POS catalog cache for the item on success', async () => {
        mockUpdateStorefrontCatalogGalleryUseCase.mockResolvedValue({ item_id: 62 });

        const req = {
          validatedParams: { item_id: 62 },
          params: { item_id: '62' },
          body: { gallery: [] },
          user: { user_id: 1, tenant_id: 'tenant-1' }
        };
        const res = createRes();
        const next = jest.fn();

        await updateStorefrontCatalogGallery(req, res, next);

        expect(mockPublishCatalogChange).toHaveBeenCalledTimes(1);
        expect(mockPublishCatalogChange).toHaveBeenCalledWith({
          tenantId: 'tenant-1',
          reason: 'storefront_catalog_gallery_updated',
          itemIds: [62]
        });
      });

      it('does not invalidate the catalog when the use case fails', async () => {
        mockUpdateStorefrontCatalogGalleryUseCase.mockRejectedValue(new Error('gallery update failed'));

        const req = {
          validatedParams: { item_id: 62 },
          params: { item_id: '62' },
          body: { gallery: [] },
          user: { user_id: 1, tenant_id: 'tenant-1' }
        };
        const res = createRes();
        const next = jest.fn();

        await updateStorefrontCatalogGallery(req, res, next);

        expect(mockPublishCatalogChange).not.toHaveBeenCalled();
      });
    });

    describe('deleteStorefrontCatalogGalleryImage', () => {
      it('invalidates the POS catalog cache for the item on success', async () => {
        mockDeleteStorefrontCatalogGalleryImageUseCase.mockResolvedValue({ item_id: 63 });

        const req = {
          validatedParams: { item_id: 63 },
          params: { item_id: '63', image_index: '0' },
          user: { user_id: 1, tenant_id: 'tenant-1' }
        };
        const res = createRes();
        const next = jest.fn();

        await deleteStorefrontCatalogGalleryImage(req, res, next);

        expect(mockPublishCatalogChange).toHaveBeenCalledTimes(1);
        expect(mockPublishCatalogChange).toHaveBeenCalledWith({
          tenantId: 'tenant-1',
          reason: 'storefront_catalog_gallery_image_deleted',
          itemIds: [63]
        });
      });

      it('does not invalidate the catalog when the use case fails', async () => {
        mockDeleteStorefrontCatalogGalleryImageUseCase.mockRejectedValue(new Error('gallery delete failed'));

        const req = {
          validatedParams: { item_id: 63 },
          params: { item_id: '63', image_index: '0' },
          user: { user_id: 1, tenant_id: 'tenant-1' }
        };
        const res = createRes();
        const next = jest.fn();

        await deleteStorefrontCatalogGalleryImage(req, res, next);

        expect(mockPublishCatalogChange).not.toHaveBeenCalled();
      });
    });

    describe('deleteStorefrontCatalogImage', () => {
      it('invalidates the POS catalog cache for the item on success', async () => {
        mockDeleteStorefrontCatalogImageUseCase.mockResolvedValue({ item_id: 64 });

        const req = {
          validatedParams: { item_id: 64 },
          params: { item_id: '64' },
          user: { user_id: 1, tenant_id: 'tenant-1' }
        };
        const res = createRes();
        const next = jest.fn();

        await deleteStorefrontCatalogImage(req, res, next);

        expect(mockPublishCatalogChange).toHaveBeenCalledTimes(1);
        expect(mockPublishCatalogChange).toHaveBeenCalledWith({
          tenantId: 'tenant-1',
          reason: 'storefront_catalog_image_deleted',
          itemIds: [64]
        });
      });

      it('does not invalidate the catalog when the use case fails', async () => {
        mockDeleteStorefrontCatalogImageUseCase.mockRejectedValue(new Error('delete failed'));

        const req = {
          validatedParams: { item_id: 64 },
          params: { item_id: '64' },
          user: { user_id: 1, tenant_id: 'tenant-1' }
        };
        const res = createRes();
        const next = jest.fn();

        await deleteStorefrontCatalogImage(req, res, next);

        expect(mockPublishCatalogChange).not.toHaveBeenCalled();
      });
    });
  });
});

import { jest } from '@jest/globals';

const mockGetItemsUseCase = jest.fn();
const mockGetItemByIdUseCase = jest.fn();
const mockCreateItemUseCase = jest.fn();
const mockUpdateItemUseCase = jest.fn();
const mockFinalizeItemUseCase = jest.fn();
const mockDeleteItemUseCase = jest.fn();
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
const mockGenerateItemImageUseCase = jest.fn();
const mockBulkGenerateItemImageUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();
const mockEnqueueItemImageGeneration = jest.fn();

jest.unstable_mockModule('../src/modules/inventory/index.js', () => ({
  getItemsUseCase: mockGetItemsUseCase,
  getItemByIdUseCase: mockGetItemByIdUseCase,
  createItemUseCase: mockCreateItemUseCase,
  updateItemUseCase: mockUpdateItemUseCase,
  finalizeItemUseCase: mockFinalizeItemUseCase,
  deleteItemUseCase: mockDeleteItemUseCase,
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
  generateItemImageUseCase: mockGenerateItemImageUseCase,
  bulkGenerateItemImageUseCase: mockBulkGenerateItemImageUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

jest.unstable_mockModule('../src/workers/itemImageWorker.js', () => ({
  enqueueItemImageGeneration: mockEnqueueItemImageGeneration
}));

let getItems;
let createItem;
let deleteItem;
let validateComposition;
let updateFolder;
let replaceItemSuppliers;
let resolveItemBarcode;
let importExternalStorefrontCatalogImage;
let generateItemImage;
let bulkGenerateItemImages;

beforeAll(async () => {
  const mod = await import('../src/modules/inventory/controllers/itemHandlers.js');
  getItems = mod.getItems;
  createItem = mod.createItem;
  deleteItem = mod.deleteItem;
  validateComposition = mod.validateComposition;
  updateFolder = mod.updateFolder;
  replaceItemSuppliers = mod.replaceItemSuppliers;
  resolveItemBarcode = mod.resolveItemBarcode;
  importExternalStorefrontCatalogImage = mod.importExternalStorefrontCatalogImage;
  generateItemImage = mod.generateItemImage;
  bulkGenerateItemImages = mod.bulkGenerateItemImages;
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
});

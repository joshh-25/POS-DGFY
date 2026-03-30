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
const mockGetFoldersUseCase = jest.fn();
const mockCreateFolderUseCase = jest.fn();
const mockUpdateFolderUseCase = jest.fn();
const mockDeleteFolderUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

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
  getFoldersUseCase: mockGetFoldersUseCase,
  createFolderUseCase: mockCreateFolderUseCase,
  updateFolderUseCase: mockUpdateFolderUseCase,
  deleteFolderUseCase: mockDeleteFolderUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let getItems;
let createItem;
let deleteItem;
let validateComposition;
let updateFolder;

beforeAll(async () => {
  const mod = await import('../src/modules/inventory/controllers/itemHandlers.js');
  getItems = mod.getItems;
  createItem = mod.createItem;
  deleteItem = mod.deleteItem;
  validateComposition = mod.validateComposition;
  updateFolder = mod.updateFolder;
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
        status: 'draft'
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
});

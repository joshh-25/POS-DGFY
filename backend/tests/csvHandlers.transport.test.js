import { jest } from '@jest/globals';

const mockExportByIdsUseCase = jest.fn();
const mockExportFilteredUseCase = jest.fn();
const mockExportAllItemsUseCase = jest.fn();
const mockPreviewItemsImportUseCase = jest.fn();
const mockConfirmItemsImportUseCase = jest.fn();
const mockGetItemsTemplateHeadersUseCase = jest.fn();
const mockExportSuppliersUseCase = jest.fn();
const mockGetSupplierTemplateHeadersUseCase = jest.fn();
const mockPreviewSuppliersImportUseCase = jest.fn();
const mockConfirmSuppliersImportUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/csv/index.js', () => ({
  exportByIdsUseCase: mockExportByIdsUseCase,
  exportFilteredUseCase: mockExportFilteredUseCase,
  exportAllItemsUseCase: mockExportAllItemsUseCase,
  previewItemsImportUseCase: mockPreviewItemsImportUseCase,
  confirmItemsImportUseCase: mockConfirmItemsImportUseCase,
  getItemsTemplateHeadersUseCase: mockGetItemsTemplateHeadersUseCase,
  exportSuppliersUseCase: mockExportSuppliersUseCase,
  getSupplierTemplateHeadersUseCase: mockGetSupplierTemplateHeadersUseCase,
  previewSuppliersImportUseCase: mockPreviewSuppliersImportUseCase,
  confirmSuppliersImportUseCase: mockConfirmSuppliersImportUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let exportItems;
let previewImportItems;
let confirmImportSuppliers;

beforeAll(async () => {
  const exportMod = await import('../src/modules/csv/controllers/itemCsvExportHandlers.js');
  const importMod = await import('../src/modules/csv/controllers/itemCsvImportHandlers.js');
  const supplierMod = await import('../src/modules/csv/controllers/supplierCsvHandlers.js');

  exportItems = exportMod.exportItems;
  previewImportItems = importMod.previewImport;
  confirmImportSuppliers = supplierMod.confirmImport;
});

const createRes = () => {
  const res = {
    locals: {},
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
    send: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('csv handlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('item export sends CSV on success', async () => {
    mockExportByIdsUseCase.mockResolvedValue({
      success: true,
      data: {
        isZip: false,
        templateType: 'items',
        csvContent: 'sku_code,name\nRM-1,Flour'
      }
    });

    const req = {
      method: 'POST',
      body: { itemIds: [1, 2] },
      query: {},
      requestId: 'req-csv-export'
    };
    const res = createRes();

    await exportItems(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith('sku_code,name\nRM-1,Flour');
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'csv_items_exported',
      surface: 'csv',
      action: 'export_items_csv'
    }));
  });

  it('item preview import returns standardized error payload', async () => {
    mockPreviewItemsImportUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'csvContent must be a non-empty string',
        details: null,
        statusCode: 400
      }
    });

    const req = {
      body: { csvContent: '   ' },
      requestId: 'req-csv-preview'
    };
    const res = createRes();

    await previewImportItems(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'csvContent must be a non-empty string',
      error_code: 'VALIDATION_FAILED',
      errors: null,
      request_id: 'req-csv-preview',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'csv_items_import_previewed',
      surface: 'csv',
      action: 'preview_items_import'
    }));
  });

  it('supplier confirm import preserves success payload shape', async () => {
    mockConfirmSuppliersImportUseCase.mockResolvedValue({
      success: true,
      data: {
        createdCount: 2,
        updatedCount: 1,
        failedCount: 0
      }
    });

    const req = {
      body: { rows: [{ name: 'S1' }] },
      user: { user_id: 5 },
      requestId: 'req-supplier-import'
    };
    const res = createRes();

    await confirmImportSuppliers(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        createdCount: 2,
        updatedCount: 1,
        failedCount: 0
      },
      message: 'Import complete: 2 created, 1 updated'
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'csv_suppliers_import_confirmed',
      surface: 'csv',
      action: 'confirm_suppliers_import'
    }));
  });
});

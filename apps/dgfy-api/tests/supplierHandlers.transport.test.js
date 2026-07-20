import { jest } from '@jest/globals';

const mockGetSuppliersUseCase = jest.fn();
const mockCreateSupplierUseCase = jest.fn();
const mockDeleteSupplierUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/suppliers/index.js', () => ({
  getSuppliersUseCase: mockGetSuppliersUseCase,
  getSupplierByIdUseCase: jest.fn(),
  createSupplierUseCase: mockCreateSupplierUseCase,
  updateSupplierUseCase: jest.fn(),
  finalizeSupplierUseCase: jest.fn(),
  addSupplierItemUseCase: jest.fn(),
  deleteSupplierUseCase: mockDeleteSupplierUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let getSuppliers;
let createSupplier;
let deleteSupplier;

beforeAll(async () => {
  const mod = await import('../src/modules/suppliers/controllers/supplierHandlers.js');
  getSuppliers = mod.getSuppliers;
  createSupplier = mod.createSupplier;
  deleteSupplier = mod.deleteSupplier;
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

describe('supplierHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('returns stable getSuppliers success payload', async () => {
    mockGetSuppliersUseCase.mockResolvedValue({
      success: true,
      data: {
        suppliers: [{ supplier_id: 1, name: 'Supplier A' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 }
      }
    });

    const req = { query: {}, requestId: 'req-supplier-list', user: { user_id: 4, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getSuppliers(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        suppliers: [{ supplier_id: 1, name: 'Supplier A' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 }
      },
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'suppliers_viewed',
      surface: 'suppliers',
      action: 'list_suppliers'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns stable createSupplier success payload', async () => {
    mockCreateSupplierUseCase.mockResolvedValue({
      success: true,
      data: {
        supplier_id: 12,
        name: 'North Star Foods',
        status: 'draft'
      }
    });

    const req = {
      validatedData: { name: 'North Star Foods', status: 'draft' },
      user: { user_id: 4 },
      requestId: 'req-supplier-create'
    };
    const res = createRes();
    const next = jest.fn();

    await createSupplier(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        supplier_id: 12,
        name: 'North Star Foods',
        status: 'draft'
      },
      message: 'Supplier draft saved successfully',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'supplier_created',
      surface: 'suppliers',
      action: 'create_supplier'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('deleteSupplier keeps details compatibility on error payload', async () => {
    mockDeleteSupplierUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Cannot delete supplier "North Star Foods"',
        details: ['Supplier has 2 active purchase order(s) (draft, pending, or partial).'],
        statusCode: 400
      }
    });

    const req = {
      params: { supplier_id: '12' },
      user: { user_id: 4 },
      requestId: 'req-supplier-delete'
    };
    const res = createRes();
    const next = jest.fn();

    await deleteSupplier(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'Cannot delete supplier "North Star Foods"',
      error_code: 'VALIDATION_FAILED',
      errors: ['Supplier has 2 active purchase order(s) (draft, pending, or partial).'],
      details: ['Supplier has 2 active purchase order(s) (draft, pending, or partial).'],
      request_id: 'req-supplier-delete',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'supplier_deleted',
      surface: 'suppliers',
      action: 'delete_supplier'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

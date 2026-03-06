import { jest } from '@jest/globals';

const mockGetPurchaseOrdersUseCase = jest.fn();
const mockCreatePurchaseOrderUseCase = jest.fn();
const mockArchivePurchaseOrderUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/purchaseOrders/index.js', () => ({
  getPurchaseOrdersUseCase: mockGetPurchaseOrdersUseCase,
  getPurchaseOrderByIdUseCase: jest.fn(),
  createPurchaseOrderUseCase: mockCreatePurchaseOrderUseCase,
  finalizePurchaseOrderUseCase: jest.fn(),
  receivePurchaseOrderUseCase: jest.fn(),
  archivePurchaseOrderUseCase: mockArchivePurchaseOrderUseCase,
  restorePurchaseOrderUseCase: jest.fn()
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let getPurchaseOrders;
let createPurchaseOrder;
let archivePurchaseOrder;

beforeAll(async () => {
  const mod = await import('../src/modules/purchaseOrders/controllers/purchaseOrderHandlers.js');
  getPurchaseOrders = mod.getPurchaseOrders;
  createPurchaseOrder = mod.createPurchaseOrder;
  archivePurchaseOrder = mod.archivePurchaseOrder;
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

describe('purchaseOrderHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('getPurchaseOrders returns stable success payload', async () => {
    mockGetPurchaseOrdersUseCase.mockResolvedValue({
      success: true,
      data: {
        purchase_orders: [{ po_id: 1, po_number: 'PO-001', status: 'pending' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 }
      }
    });

    const req = { query: {}, requestId: 'req-po-list', user: { user_id: 2, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getPurchaseOrders(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        purchase_orders: [{ po_id: 1, po_number: 'PO-001', status: 'pending' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 }
      },
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'purchase_orders_viewed',
      surface: 'purchase_orders',
      action: 'list_purchase_orders'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('createPurchaseOrder preserves draft success message contract', async () => {
    mockCreatePurchaseOrderUseCase.mockResolvedValue({
      success: true,
      data: { po_id: 11, po_number: 'PO-011', status: 'draft' }
    });

    const req = {
      validatedData: { supplier_id: 5, status: 'draft' },
      user: { user_id: 2 },
      requestId: 'req-po-create'
    };
    const res = createRes();
    const next = jest.fn();

    await createPurchaseOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { po_id: 11, po_number: 'PO-011', status: 'draft' },
      message: 'Purchase order draft saved successfully',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'purchase_order_created',
      surface: 'purchase_orders',
      action: 'create_purchase_order'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('archivePurchaseOrder returns standardized error payload', async () => {
    mockArchivePurchaseOrderUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Purchase Order is already archived',
        details: null,
        statusCode: 409
      }
    });

    const req = {
      params: { po_id: '11' },
      user: { user_id: 2 },
      requestId: 'req-po-archive'
    };
    const res = createRes();
    const next = jest.fn();

    await archivePurchaseOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'Purchase Order is already archived',
      error_code: 'CONFLICT',
      errors: null,
      request_id: 'req-po-archive',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'purchase_order_archived',
      surface: 'purchase_orders',
      action: 'archive_purchase_order'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

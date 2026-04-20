import { jest } from '@jest/globals';

const mockGetPurchaseOrdersUseCase = jest.fn();
const mockGetPurchaseOrderByIdUseCase = jest.fn();
const mockCreatePurchaseOrderUseCase = jest.fn();
const mockReceivePurchaseOrderUseCase = jest.fn();
const mockArchivePurchaseOrderUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/purchaseOrders/index.js', () => ({
  getPurchaseOrdersUseCase: mockGetPurchaseOrdersUseCase,
  getPurchaseOrderByIdUseCase: mockGetPurchaseOrderByIdUseCase,
  createPurchaseOrderUseCase: mockCreatePurchaseOrderUseCase,
  finalizePurchaseOrderUseCase: jest.fn(),
  receivePurchaseOrderUseCase: mockReceivePurchaseOrderUseCase,
  archivePurchaseOrderUseCase: mockArchivePurchaseOrderUseCase,
  restorePurchaseOrderUseCase: jest.fn()
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let getPurchaseOrders;
let getPurchaseOrderById;
let createPurchaseOrder;
let receivePurchaseOrder;
let archivePurchaseOrder;

beforeAll(async () => {
  const mod = await import('../src/modules/purchaseOrders/controllers/purchaseOrderHandlers.js');
  getPurchaseOrders = mod.getPurchaseOrders;
  getPurchaseOrderById = mod.getPurchaseOrderById;
  createPurchaseOrder = mod.createPurchaseOrder;
  receivePurchaseOrder = mod.receivePurchaseOrder;
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

  it('getPurchaseOrderById forwards valuation_location_id query to use-case', async () => {
    mockGetPurchaseOrderByIdUseCase.mockResolvedValue({
      success: true,
      data: { po_id: 22, status: 'pending' }
    });

    const req = {
      params: { po_id: '22' },
      query: { valuation_location_id: '5' },
      requestId: 'req-po-detail',
      user: { user_id: 4, tenant_id: 'tenant-1' }
    };
    const res = createRes();
    const next = jest.fn();

    await getPurchaseOrderById(req, res, next);

    expect(mockGetPurchaseOrderByIdUseCase).toHaveBeenCalledWith({
      poId: '22',
      valuationLocationId: '5'
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { po_id: 22, status: 'pending' },
      timestamp: expect.any(String)
    });
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

  it('receivePurchaseOrder returns deterministic 422 payload for missing location fields', async () => {
    mockReceivePurchaseOrderUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'location_id is required and must be a positive integer for PO receiving',
        details: null,
        statusCode: 422
      }
    });

    const req = {
      params: { po_id: '88' },
      body: { line_items: [{ line_item_id: 1, quantity_received: 2 }] },
      user: { user_id: 2 },
      requestId: 'req-po-receive-422'
    };
    const res = createRes();
    const next = jest.fn();

    await receivePurchaseOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'location_id is required and must be a positive integer for PO receiving',
      error_code: 'VALIDATION_FAILED',
      errors: null,
      request_id: 'req-po-receive-422',
      timestamp: expect.any(String)
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('receivePurchaseOrder returns deterministic 403 payload for location access denial', async () => {
    mockReceivePurchaseOrderUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'AUTHORIZATION_FAILED',
        message: 'You do not have location access to perform PO receive at location 7.',
        details: null,
        statusCode: 403
      }
    });

    const req = {
      params: { po_id: '88' },
      body: { location_id: 7, line_items: [{ line_item_id: 1, quantity_received: 2 }] },
      user: { user_id: 2 },
      requestId: 'req-po-receive-403'
    };
    const res = createRes();
    const next = jest.fn();

    await receivePurchaseOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'You do not have location access to perform PO receive at location 7.',
      error_code: 'AUTHORIZATION_FAILED',
      errors: null,
      request_id: 'req-po-receive-403',
      timestamp: expect.any(String)
    });
    expect(next).not.toHaveBeenCalled();
  });
});

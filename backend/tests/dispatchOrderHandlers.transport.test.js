import { jest } from '@jest/globals';

const mockGetDispatchOrdersUseCase = jest.fn();
const mockCreateDispatchOrderUseCase = jest.fn();
const mockExportDispatchOrdersUseCase = jest.fn();
const mockArchiveDispatchOrderUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/dispatchOrders/index.js', () => ({
  getDispatchOrdersUseCase: mockGetDispatchOrdersUseCase,
  getDispatchOrderByIdUseCase: jest.fn(),
  getDispatchStatsUseCase: jest.fn(),
  exportDispatchOrdersUseCase: mockExportDispatchOrdersUseCase,
  createDispatchOrderUseCase: mockCreateDispatchOrderUseCase,
  updateDispatchOrderUseCase: jest.fn(),
  confirmDispatchOrderUseCase: jest.fn(),
  dispatchLinesUseCase: jest.fn(),
  cancelDispatchOrderUseCase: jest.fn(),
  archiveDispatchOrderUseCase: mockArchiveDispatchOrderUseCase,
  getEarningsReportUseCase: jest.fn(),
  updateLineSalePriceUseCase: jest.fn()
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let getDispatchOrders;
let createDispatchOrder;
let exportDispatchOrders;
let archiveDispatchOrder;

beforeAll(async () => {
  const mod = await import('../src/modules/dispatchOrders/controllers/dispatchOrderHandlers.js');
  getDispatchOrders = mod.getDispatchOrders;
  createDispatchOrder = mod.createDispatchOrder;
  exportDispatchOrders = mod.exportDispatchOrders;
  archiveDispatchOrder = mod.archiveDispatchOrder;
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

describe('dispatchOrderHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('getDispatchOrders returns stable success payload', async () => {
    mockGetDispatchOrdersUseCase.mockResolvedValue({
      success: true,
      data: {
        dispatchOrders: [{ do_id: 1, do_number: 'DO-001', status: 'confirmed' }],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 }
      }
    });

    const req = { query: {}, requestId: 'req-do-list', user: { user_id: 3, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getDispatchOrders(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        dispatchOrders: [{ do_id: 1, do_number: 'DO-001', status: 'confirmed' }],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 }
      },
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'dispatch_orders_viewed',
      surface: 'dispatch_orders',
      action: 'list_dispatch_orders'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('createDispatchOrder preserves success payload/message contract', async () => {
    mockCreateDispatchOrderUseCase.mockResolvedValue({
      success: true,
      data: { do_id: 7, do_number: 'DO-2026-000007', status: 'draft' }
    });

    const req = {
      validatedData: { recipient_name: 'Warehouse B', lines: [{ item_id: 9, qty_ordered: 3 }] },
      user: { user_id: 3 },
      requestId: 'req-do-create'
    };
    const res = createRes();
    const next = jest.fn();

    await createDispatchOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { do_id: 7, do_number: 'DO-2026-000007', status: 'draft' },
      message: 'Dispatch Order DO-2026-000007 created successfully',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'dispatch_order_created',
      surface: 'dispatch_orders',
      action: 'create_dispatch_order'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('exportDispatchOrders sends CSV when format=csv', async () => {
    mockExportDispatchOrdersUseCase.mockResolvedValue({
      success: true,
      data: 'DO Number,Status\nDO-001,confirmed'
    });

    const req = { query: { format: 'csv' }, requestId: 'req-do-csv', user: { user_id: 3, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await exportDispatchOrders(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('dispatch-orders-')
    );
    expect(res.send).toHaveBeenCalledWith('DO Number,Status\nDO-001,confirmed');
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'dispatch_orders_exported',
      surface: 'dispatch_orders',
      action: 'export_dispatch_orders'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('archiveDispatchOrder returns standardized error payload', async () => {
    mockArchiveDispatchOrderUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Only completed or cancelled Dispatch Orders can be archived',
        details: null,
        statusCode: 400
      }
    });

    const req = {
      params: { id: '10' },
      user: { user_id: 3 },
      requestId: 'req-do-archive'
    };
    const res = createRes();
    const next = jest.fn();

    await archiveDispatchOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'Only completed or cancelled Dispatch Orders can be archived',
      error_code: 'VALIDATION_FAILED',
      errors: null,
      request_id: 'req-do-archive',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'dispatch_order_archived',
      surface: 'dispatch_orders',
      action: 'archive_dispatch_order'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

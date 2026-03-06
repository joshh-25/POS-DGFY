import { jest } from '@jest/globals';

const mockGetStockMovementsUseCase = jest.fn();
const mockVoidMovementUseCase = jest.fn();
const mockExportMovementsUseCase = jest.fn();
const mockCreateBulkMovementsUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/stockMovements/index.js', () => ({
  getStockMovementsUseCase: mockGetStockMovementsUseCase,
  getMovementByIdUseCase: jest.fn(),
  getMovementStatsUseCase: jest.fn(),
  createStockMovementUseCase: jest.fn(),
  voidMovementUseCase: mockVoidMovementUseCase,
  exportMovementsUseCase: mockExportMovementsUseCase,
  createBulkMovementsUseCase: mockCreateBulkMovementsUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let getStockMovements;
let voidMovement;
let exportMovements;
let createBulkMovements;

beforeAll(async () => {
  const mod = await import('../src/modules/stockMovements/controllers/stockMovementHandlers.js');
  getStockMovements = mod.getStockMovements;
  voidMovement = mod.voidMovement;
  exportMovements = mod.exportMovements;
  createBulkMovements = mod.createBulkMovements;
});

const createRes = () => {
  const res = {
    locals: {},
    status: jest.fn(),
    json: jest.fn(),
    header: jest.fn(),
    attachment: jest.fn(),
    send: jest.fn()
  };
  res.status.mockReturnValue(res);
  res.header.mockReturnValue(res);
  res.attachment.mockReturnValue(res);
  return res;
};

describe('stockMovementHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('getStockMovements returns stable success payload', async () => {
    mockGetStockMovementsUseCase.mockResolvedValue({
      success: true,
      data: {
        movements: [{ movement_id: 1, movement_type: 'adjustment' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 }
      }
    });

    const req = { query: {}, requestId: 'req-sm-list', user: { user_id: 9, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getStockMovements(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        movements: [{ movement_id: 1, movement_type: 'adjustment' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 }
      },
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'stock_movements_viewed',
      surface: 'stock_movements',
      action: 'list_stock_movements'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('voidMovement keeps success payload/message contract', async () => {
    mockVoidMovementUseCase.mockResolvedValue({
      success: true,
      data: { movement_id: 22, movement_type: 'return', quantity: -40 }
    });

    const req = {
      params: { id: '22' },
      body: { reason: 'Correction' },
      user: { user_id: 9 },
      requestId: 'req-sm-void'
    };
    const res = createRes();
    const next = jest.fn();

    await voidMovement(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { movement_id: 22, movement_type: 'return', quantity: -40 },
      message: 'Movement voided successfully',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'stock_movement_voided',
      surface: 'stock_movements',
      action: 'void_stock_movement'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('voidMovement returns standardized error payload', async () => {
    mockVoidMovementUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Cannot void this movement: batch already used downstream',
        details: null,
        statusCode: 409
      }
    });

    const req = {
      params: { id: '22' },
      body: { reason: 'Correction' },
      user: { user_id: 9 },
      requestId: 'req-sm-409'
    };
    const res = createRes();
    const next = jest.fn();

    await voidMovement(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'Cannot void this movement: batch already used downstream',
      error_code: 'CONFLICT',
      errors: null,
      request_id: 'req-sm-409',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'stock_movement_voided',
      surface: 'stock_movements',
      action: 'void_stock_movement'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('exportMovements sends CSV when format=csv', async () => {
    mockExportMovementsUseCase.mockResolvedValue({
      success: true,
      data: [
        {
          'Movement ID': 1,
          Date: '2026-03-01 10:00',
          'Item Name': 'Soy Sauce',
          Type: 'adjustment',
          Quantity: 5
        }
      ]
    });

    const req = { query: { format: 'csv' }, requestId: 'req-sm-csv', user: { user_id: 9, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await exportMovements(req, res, next);

    expect(res.header).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.attachment).toHaveBeenCalledWith(expect.stringMatching(/^stock_movements_/));
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Movement ID'));
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'stock_movements_exported',
      surface: 'stock_movements',
      action: 'export_stock_movements'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('createBulkMovements preserves count-based success message', async () => {
    mockCreateBulkMovementsUseCase.mockResolvedValue({
      success: true,
      data: [{ movement_id: 1 }, { movement_id: 2 }]
    });

    const req = {
      body: { movements: [{ item_id: 1 }, { item_id: 2 }] },
      user: { user_id: 5 },
      requestId: 'req-sm-bulk'
    };
    const res = createRes();
    const next = jest.fn();

    await createBulkMovements(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ movement_id: 1 }, { movement_id: 2 }],
      message: '2 movements recorded successfully',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'stock_bulk_movements_created',
      surface: 'stock_movements',
      action: 'create_bulk_stock_movements'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

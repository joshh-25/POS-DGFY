import { jest } from '@jest/globals';

const mockGetJobOrdersUseCase = jest.fn();
const mockCreateJobOrderUseCase = jest.fn();
const mockArchiveJobOrderUseCase = jest.fn();
const mockCompleteJobOrderUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/jobOrders/index.js', () => ({
  getJobOrdersUseCase: mockGetJobOrdersUseCase,
  getJobOrderByIdUseCase: jest.fn(),
  createJobOrderUseCase: mockCreateJobOrderUseCase,
  finalizeJobOrderUseCase: jest.fn(),
  completeJobOrderUseCase: mockCompleteJobOrderUseCase,
  archiveJobOrderUseCase: mockArchiveJobOrderUseCase,
  restoreJobOrderUseCase: jest.fn()
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let getJobOrders;
let createJobOrder;
let completeJobOrder;
let archiveJobOrder;

beforeAll(async () => {
  const mod = await import('../src/modules/jobOrders/controllers/jobOrderHandlers.js');
  getJobOrders = mod.getJobOrders;
  createJobOrder = mod.createJobOrder;
  completeJobOrder = mod.completeJobOrder;
  archiveJobOrder = mod.archiveJobOrder;
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

describe('jobOrderHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('getJobOrders returns stable success payload', async () => {
    mockGetJobOrdersUseCase.mockResolvedValue({
      success: true,
      data: {
        job_orders: [{ jo_id: 1, jo_number: 'JO-001', status: 'in_progress' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 }
      }
    });

    const req = { query: {}, requestId: 'req-jo-list', user: { user_id: 7, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getJobOrders(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        job_orders: [{ jo_id: 1, jo_number: 'JO-001', status: 'in_progress' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 }
      },
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'job_orders_viewed',
      surface: 'job_orders',
      action: 'list_job_orders'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('createJobOrder preserves draft success message contract', async () => {
    mockCreateJobOrderUseCase.mockResolvedValue({
      success: true,
      data: { jo_id: 10, jo_number: null, status: 'draft' }
    });

    const req = {
      validatedData: { product_id: 3, quantity_to_produce: 8, status: 'draft' },
      user: { user_id: 7 },
      requestId: 'req-jo-create'
    };
    const res = createRes();
    const next = jest.fn();

    await createJobOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { jo_id: 10, jo_number: null, status: 'draft' },
      message: 'Job order draft saved successfully',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'job_order_created',
      surface: 'job_orders',
      action: 'create_job_order'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('completeJobOrder preserves success payload and message', async () => {
    mockCompleteJobOrderUseCase.mockResolvedValue({
      success: true,
      data: { jo_id: 10, jo_number: 'JO-010', status: 'completed' }
    });

    const req = {
      params: { jo_id: '10' },
      body: { notes: 'Done' },
      user: { user_id: 7 },
      requestId: 'req-jo-complete'
    };
    const res = createRes();
    const next = jest.fn();

    await completeJobOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { jo_id: 10, jo_number: 'JO-010', status: 'completed' },
      message: 'Job order completed successfully',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'job_order_completed',
      surface: 'job_orders',
      action: 'complete_job_order'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('archiveJobOrder returns standardized error payload', async () => {
    mockArchiveJobOrderUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Job Order is already archived',
        details: null,
        statusCode: 400
      }
    });

    const req = {
      params: { jo_id: '10' },
      user: { user_id: 7 },
      requestId: 'req-jo-archive'
    };
    const res = createRes();
    const next = jest.fn();

    await archiveJobOrder(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'Job Order is already archived',
      error_code: 'VALIDATION_FAILED',
      errors: null,
      request_id: 'req-jo-archive',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'job_order_archived',
      surface: 'job_orders',
      action: 'archive_job_order'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

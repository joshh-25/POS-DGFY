import { jest } from '@jest/globals';

const mockGetStatsUseCase = jest.fn();
const mockGetLowStockUseCase = jest.fn();
const mockGetRecentMovementsUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/dashboard/index.js', () => ({
  getStatsUseCase: mockGetStatsUseCase,
  getLowStockUseCase: mockGetLowStockUseCase,
  getRecentMovementsUseCase: mockGetRecentMovementsUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let getStats;
let getRecentMovements;

beforeAll(async () => {
  const mod = await import('../src/modules/dashboard/controllers/dashboardHandlers.js');
  getStats = mod.getStats;
  getRecentMovements = mod.getRecentMovements;
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

describe('dashboardHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('getStats returns stable success payload', async () => {
    mockGetStatsUseCase.mockResolvedValue({
      success: true,
      data: {
        totalItems: 50,
        totalSuppliers: 10
      }
    });

    const req = { requestId: 'req-dashboard-1', user: { user_id: 7, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getStats(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        totalItems: 50,
        totalSuppliers: 10
      },
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'dashboard_stats_viewed',
      surface: 'dashboard',
      action: 'view_stats'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('getRecentMovements returns standardized error payload on failure result', async () => {
    mockGetRecentMovementsUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'limit must be a positive integer',
        details: null,
        statusCode: 400
      }
    });

    const req = {
      query: { limit: 'invalid' },
      requestId: 'req-dashboard-400',
      user: { user_id: 7, tenant_id: 'tenant-1' }
    };
    const res = createRes();
    const next = jest.fn();

    await getRecentMovements(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'limit must be a positive integer',
      error_code: 'VALIDATION_FAILED',
      errors: null,
      request_id: 'req-dashboard-400',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'dashboard_recent_movements_viewed',
      surface: 'dashboard',
      action: 'view_recent_movements'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

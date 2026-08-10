import { jest } from '@jest/globals';

const mockGetSupplierPerformanceUseCase = jest.fn();
const mockGetAnomaliesUseCase = jest.fn();
const mockGetCostAnalysisUseCase = jest.fn();
const mockGetItemBurnRateUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/analytics/index.js', () => ({
  getSupplierPerformanceUseCase: mockGetSupplierPerformanceUseCase,
  getAnomaliesUseCase: mockGetAnomaliesUseCase,
  getCostAnalysisUseCase: mockGetCostAnalysisUseCase,
  getItemBurnRateUseCase: mockGetItemBurnRateUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let getSupplierPerformance;
let getAnomalies;

beforeAll(async () => {
  const mod = await import('../src/modules/analytics/controllers/analyticsHandlers.js');
  getSupplierPerformance = mod.getSupplierPerformance;
  getAnomalies = mod.getAnomalies;
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

describe('analyticsHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('getAnomalies returns stable success payload with count', async () => {
    mockGetAnomaliesUseCase.mockResolvedValue({
      success: true,
      data: [{ type: 'HIGH_LOSS_EVENT' }, { type: 'CONSUMPTION_SPIKE' }]
    });

    const req = {
      query: {},
      requestId: 'req-analytics-1',
      user: { user_id: 3, tenant_id: 'tenant-1' }
    };
    const res = createRes();
    const next = jest.fn();

    await getAnomalies(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ type: 'HIGH_LOSS_EVENT' }, { type: 'CONSUMPTION_SPIKE' }],
      count: 2,
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'analytics_anomalies_viewed',
      surface: 'analytics',
      action: 'view_anomalies'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('getSupplierPerformance returns standardized error payload on failure result', async () => {
    mockGetSupplierPerformanceUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Supplier not found',
        details: null,
        statusCode: 404
      }
    });

    const req = {
      params: { id: '404' },
      requestId: 'req-analytics-404',
      user: { user_id: 3, tenant_id: 'tenant-1' }
    };
    const res = createRes();
    const next = jest.fn();

    await getSupplierPerformance(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'Supplier not found',
      error_code: 'RESOURCE_NOT_FOUND',
      errors: null,
      request_id: 'req-analytics-404',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'analytics_supplier_performance_viewed',
      surface: 'analytics',
      action: 'view_supplier_performance'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

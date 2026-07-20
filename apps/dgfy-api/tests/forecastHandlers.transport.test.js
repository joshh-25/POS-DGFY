import { jest } from '@jest/globals';

const mockGetStockForecastUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/forecasts/index.js', () => ({
  getStockForecastUseCase: mockGetStockForecastUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let getStockForecast;

beforeAll(async () => {
  const mod = await import('../src/modules/forecasts/controllers/forecastHandlers.js');
  getStockForecast = mod.getStockForecast;
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

describe('forecastHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('returns stable success payload', async () => {
    mockGetStockForecastUseCase.mockResolvedValue({
      success: true,
      data: [{ item_id: 1, projected_stock: 20 }]
    });

    const req = { query: { days: '30' }, requestId: 'req-forecast-1', user: { user_id: 3, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getStockForecast(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { forecasts: [{ item_id: 1, projected_stock: 20 }] },
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'forecast_stock_levels_viewed',
      surface: 'forecast',
      action: 'view_stock_forecast'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns standardized error payload', async () => {
    mockGetStockForecastUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'daysAhead must be a positive integer',
        details: null,
        statusCode: 400
      }
    });

    const req = { query: { days: 'bad' }, requestId: 'req-forecast-400', user: { user_id: 3, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getStockForecast(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'daysAhead must be a positive integer',
      error_code: 'VALIDATION_FAILED',
      errors: null,
      request_id: 'req-forecast-400',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'forecast_stock_levels_viewed',
      surface: 'forecast',
      action: 'view_stock_forecast'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

import { jest } from '@jest/globals';

const mockGenerateAlertsUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/alerts/index.js', () => ({
  generateAlertsUseCase: mockGenerateAlertsUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let generateAlerts;

beforeAll(async () => {
  const mod = await import('../src/modules/alerts/controllers/alertHandlers.js');
  generateAlerts = mod.generateAlerts;
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

describe('alertHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('returns stable success payload', async () => {
    mockGenerateAlertsUseCase.mockResolvedValue({
      success: true,
      data: [{ type: 'LOW_STOCK', item_id: 1 }]
    });

    const req = { requestId: 'req-alerts-1', user: { user_id: 3, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await generateAlerts(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { alerts: [{ type: 'LOW_STOCK', item_id: 1 }] },
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'alerts_viewed',
      surface: 'alerts',
      action: 'view_alerts'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns standardized error payload', async () => {
    mockGenerateAlertsUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Alerts unavailable',
        details: null,
        statusCode: 500
      }
    });

    const req = { requestId: 'req-alerts-500', user: { user_id: 3, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await generateAlerts(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'Alerts unavailable',
      error_code: 'INTERNAL_ERROR',
      errors: null,
      request_id: 'req-alerts-500',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'alerts_viewed',
      surface: 'alerts',
      action: 'view_alerts'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

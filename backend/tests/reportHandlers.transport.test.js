import { jest } from '@jest/globals';

const mockGetExpiryReportUseCase = jest.fn();
const mockGetSnapshotsUseCase = jest.fn();
const mockSaveSnapshotUseCase = jest.fn();
const mockGetStockAgingUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/reports/index.js', () => ({
  getExpiryReportUseCase: mockGetExpiryReportUseCase,
  getEnhancedStockAgingUseCase: jest.fn(),
  getProductionReportUseCase: jest.fn(),
  getPurchaseOrderAnalysisUseCase: jest.fn(),
  getExecutiveSummaryUseCase: jest.fn(),
  getSnapshotsUseCase: mockGetSnapshotsUseCase,
  getSnapshotByIdUseCase: jest.fn(),
  saveSnapshotUseCase: mockSaveSnapshotUseCase,
  getStockAgingUseCase: mockGetStockAgingUseCase,
  getSurplusShortageUseCase: jest.fn(),
  getFinancialSummaryUseCase: jest.fn(),
  getSupplierPerformanceUseCase: jest.fn()
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let getExpiryReport;
let getSnapshots;
let saveSnapshot;
let getStockAging;

beforeAll(async () => {
  const mod = await import('../src/modules/reports/controllers/reportHandlers.js');
  getExpiryReport = mod.getExpiryReport;
  getSnapshots = mod.getSnapshots;
  saveSnapshot = mod.saveSnapshot;
  getStockAging = mod.getStockAging;
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

describe('reportHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('getExpiryReport returns stable success payload', async () => {
    mockGetExpiryReportUseCase.mockResolvedValue({
      success: true,
      data: {
        summary: { total_expired_batches: 1 },
        expired: [],
        critical: [],
        warning: [],
        upcoming: []
      }
    });

    const req = { query: {}, requestId: 'req-report-expiry', user: { user_id: 7, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getExpiryReport(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        summary: { total_expired_batches: 1 },
        expired: [],
        critical: [],
        warning: [],
        upcoming: []
      },
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'report_expiry_viewed',
      surface: 'reports',
      action: 'view_expiry_report'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('getSnapshots returns standardized error payload for failed result', async () => {
    mockGetSnapshotsUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Report type is required',
        details: null,
        statusCode: 400
      }
    });

    const req = { query: { limit: 20 }, requestId: 'req-report-snapshots', user: { user_id: 7, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getSnapshots(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'Report type is required',
      error_code: 'VALIDATION_FAILED',
      errors: null,
      request_id: 'req-report-snapshots',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'report_snapshots_viewed',
      surface: 'reports',
      action: 'view_report_snapshots'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('saveSnapshot preserves 201 success payload shape', async () => {
    mockSaveSnapshotUseCase.mockResolvedValue({
      success: true,
      data: { snapshot_id: 11, report_type: 'expiry' }
    });

    const req = {
      body: {
        reportType: 'expiry',
        snapshotData: { summary: { total_expired_batches: 3 } },
        dateRange: {},
        reportName: 'Monthly Snapshot'
      },
      user: { user_id: 7 },
      requestId: 'req-report-save'
    };
    const res = createRes();
    const next = jest.fn();

    await saveSnapshot(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { snapshot_id: 11, report_type: 'expiry' },
      message: 'Snapshot saved successfully',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'report_snapshot_saved',
      surface: 'reports',
      action: 'save_report_snapshot'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('getStockAging preserves nested success data shape', async () => {
    mockGetStockAgingUseCase.mockResolvedValue({
      success: true,
      data: [{ item_id: 1, name: 'Soy Sauce', days_in_stock: 18 }]
    });

    const req = { requestId: 'req-report-aging', user: { user_id: 7, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getStockAging(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { aging: [{ item_id: 1, name: 'Soy Sauce', days_in_stock: 18 }] },
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'report_stock_aging_viewed',
      surface: 'reports',
      action: 'view_stock_aging_report'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

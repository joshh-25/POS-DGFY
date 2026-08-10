import { jest } from '@jest/globals';

const mockGetExpiryReportUseCase = jest.fn();
const mockGetPurchaseOrderAnalysisUseCase = jest.fn();
const mockGetExecutiveSummaryUseCase = jest.fn();
const mockGetComplianceBooksPackageUseCase = jest.fn();
const mockExportComplianceBooksPackageUseCase = jest.fn();
const mockGetSnapshotsUseCase = jest.fn();
const mockSaveSnapshotUseCase = jest.fn();
const mockGetStockAgingUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();
const mockRecordComplianceSecuritySignalUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/reports/index.js', () => ({
  getExpiryReportUseCase: mockGetExpiryReportUseCase,
  getEnhancedStockAgingUseCase: jest.fn(),
  getProductionReportUseCase: jest.fn(),
  getPurchaseOrderAnalysisUseCase: mockGetPurchaseOrderAnalysisUseCase,
  getExecutiveSummaryUseCase: mockGetExecutiveSummaryUseCase,
  getComplianceBooksPackageUseCase: mockGetComplianceBooksPackageUseCase,
  exportComplianceBooksPackageUseCase: mockExportComplianceBooksPackageUseCase,
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

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
  recordComplianceSecuritySignalUseCase: mockRecordComplianceSecuritySignalUseCase
}));

let getExpiryReport;
let getComplianceBooksPackage;
let exportComplianceBooksPackage;
let getSnapshots;
let saveSnapshot;
let getStockAging;
let exportReportCSV;

beforeAll(async () => {
  const mod = await import('../src/modules/reports/controllers/reportHandlers.js');
  getExpiryReport = mod.getExpiryReport;
  getComplianceBooksPackage = mod.getComplianceBooksPackage;
  exportComplianceBooksPackage = mod.exportComplianceBooksPackage;
  getSnapshots = mod.getSnapshots;
  saveSnapshot = mod.saveSnapshot;
  getStockAging = mod.getStockAging;
  exportReportCSV = mod.exportReportCSV;
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
    mockRecordComplianceSecuritySignalUseCase.mockResolvedValue({
      success: true,
      data: { recorded: true, signal_code: 'mass_export_threshold_reached', severity: 'warning' }
    });
    mockExportComplianceBooksPackageUseCase.mockResolvedValue({
      success: true,
      data: {
        bundle_name: 'compliance-submission-dgfy-2026-04-08.json',
        filing_profile: 'dgfy',
        record_counts: { sales_journal: 2, purchase_journal: 1, inventory_book: 1, special_discount_journal: 0 },
        files: []
      }
    });
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

  it('getComplianceBooksPackage preserves standardized success payload', async () => {
    mockGetComplianceBooksPackageUseCase.mockResolvedValue({
      success: true,
      data: {
        schema_version: 'compliance-books.v1',
        record_counts: { sales_journal: 2, purchase_journal: 1, inventory_book: 4, special_discount_journal: 1 }
      }
    });

    const req = { query: {}, requestId: 'req-report-compliance-package', user: { user_id: 3, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getComplianceBooksPackage(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        schema_version: 'compliance-books.v1',
        record_counts: { sales_journal: 2, purchase_journal: 1, inventory_book: 4, special_discount_journal: 1 }
      },
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'report_compliance_package_viewed',
      surface: 'reports',
      action: 'view_compliance_package'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('getComplianceBooksPackage records security signal on large exports', async () => {
    mockGetComplianceBooksPackageUseCase.mockResolvedValue({
      success: true,
      data: {
        schema_version: 'compliance-books.v1',
        record_counts: {
          sales_journal: 700,
          purchase_journal: 200,
          inventory_book: 150,
          special_discount_journal: 25
        }
      }
    });

    const req = { query: {}, requestId: 'req-report-compliance-large', user: { user_id: 3, tenant_id: 'tenant-1' } };
    const res = createRes();
    const next = jest.fn();

    await getComplianceBooksPackage(req, res, next);

    expect(mockRecordComplianceSecuritySignalUseCase).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      signalCode: 'mass_export_threshold_reached',
      severity: 'warning',
      actorUser: expect.objectContaining({ user_id: 3 })
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

  it('exportReportCSV emits security signal when export size breaches threshold', async () => {
    const largeRows = Array.from({ length: 1005 }, (_, index) => ({
      batch_id: index + 1,
      item_name: 'Milk',
      sku_code: `SKU-${index + 1}`,
      category: 'dairy',
      expiry_date: '2026-04-08',
      days_until_expiry: 3,
      available_quantity: 1,
      unit_of_measure: 'pcs',
      cost_per_unit: 50,
      value_at_risk: 50,
      received_date: '2026-04-01',
      po_number: 'PO-1'
    }));

    mockGetExpiryReportUseCase.mockResolvedValue({
      success: true,
      data: {
        summary: {
          total_expired_batches: 0,
          total_critical_batches: 0,
          total_warning_batches: largeRows.length,
          total_upcoming_batches: 0,
          total_value_at_risk: 50250
        },
        expired: [],
        critical: [],
        warning: largeRows,
        upcoming: []
      }
    });

    const req = {
      query: { type: 'expiry' },
      requestId: 'req-report-export-large',
      user: { user_id: 9, tenant_id: 'tenant-1' }
    };
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
      status: jest.fn(),
      json: jest.fn()
    };
    res.status.mockReturnValue(res);
    const next = jest.fn();

    await exportReportCSV(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.send).toHaveBeenCalledWith(expect.any(String));
    expect(mockRecordComplianceSecuritySignalUseCase).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      signalCode: 'mass_export_threshold_reached',
      severity: 'warning'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('exportReportCSV includes weighted variance sections for po_analysis export', async () => {
    mockGetPurchaseOrderAnalysisUseCase.mockResolvedValue({
      success: true,
      data: {
        summary: { total_orders: 2, total_order_value: 1000, fulfillment_rate: 50 },
        pending_deliveries: [],
        cost_variance: {
          baseline_scope: 'location',
          baseline_location_id: 3,
          summary: {
            ordered_supplier_value: 1000,
            ordered_weighted_baseline_value: 920,
            ordered_vs_weighted_variance_value: 80,
            ordered_vs_weighted_variance_percent: 8.7,
            received_supplier_value: 500,
            received_weighted_baseline_value: 470,
            received_vs_weighted_variance_value: 30,
            received_vs_weighted_variance_percent: 6.4
          },
          by_supplier: [{
            supplier_name: 'Prime Supply',
            ordered_supplier_value: 1000,
            ordered_weighted_baseline_value: 920,
            ordered_vs_weighted_variance_value: 80,
            ordered_vs_weighted_variance_percent: 8.7
          }],
          by_item: [{
            item_name: 'Flour',
            sku_code: 'FLR-001',
            total_value: 700,
            weighted_baseline_value: 650,
            ordered_vs_weighted_variance_value: 50,
            ordered_vs_weighted_variance_percent: 7.7
          }]
        }
      }
    });

    const req = {
      query: { type: 'po_analysis' },
      requestId: 'req-report-export-po-analysis',
      user: { user_id: 9, tenant_id: 'tenant-1' }
    };
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
      status: jest.fn(),
      json: jest.fn()
    };
    res.status.mockReturnValue(res);
    const next = jest.fn();

    await exportReportCSV(req, res, next);

    expect(res.send).toHaveBeenCalledWith(expect.any(String));
    const csvOutput = res.send.mock.calls[0][0];
    expect(csvOutput).toContain('COST VARIANCE SUMMARY');
    expect(csvOutput).toContain('TOP SUPPLIER VARIANCE');
    expect(csvOutput).toContain('Ordered vs Weighted Variance Value');
    expect(next).not.toHaveBeenCalled();
  });

  it('exportReportCSV includes weighted inventory and procurement fields for executive_summary export', async () => {
    mockGetExecutiveSummaryUseCase.mockResolvedValue({
      success: true,
      data: {
        generated_at: '2026-04-20T00:00:00.000Z',
        inventory_overview: {
          total_inventory_value: 120000,
          legacy_total_inventory_value: 120000,
          weighted_total_inventory_value: 118700,
          weighted_total_available_qty: 4840,
          weighted_average_cost_per_unit: 24.52,
          inventory_value_delta: -1300,
          total_items: 55
        },
        stock_health: { low_stock_count: 4 },
        expiry_risk: { expired_count: 1, expired_value: 300, total_value_at_risk: 1200 },
        production_overview: { total_job_orders: 6, completion_rate: 82.5, production_efficiency: 91.2 },
        procurement_overview: {
          total_orders: 12,
          pending_orders: 4,
          total_order_value: 92840,
          fulfillment_rate: 66.7,
          ordered_vs_weighted_variance_value: 2740,
          ordered_vs_weighted_variance_percent: 3.0
        }
      }
    });

    const req = {
      query: { type: 'executive_summary' },
      requestId: 'req-report-export-exec',
      user: { user_id: 9, tenant_id: 'tenant-1' }
    };
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
      status: jest.fn(),
      json: jest.fn()
    };
    res.status.mockReturnValue(res);
    const next = jest.fn();

    await exportReportCSV(req, res, next);

    expect(res.send).toHaveBeenCalledWith(expect.any(String));
    const csvOutput = res.send.mock.calls[0][0];
    expect(csvOutput).toContain('Weighted Total Inventory Value');
    expect(csvOutput).toContain('Weighted Average Cost Per Unit');
    expect(csvOutput).toContain('Ordered vs Weighted Variance Value');
    expect(next).not.toHaveBeenCalled();
  });

  it('exportComplianceBooksPackage sets attachment header and returns success payload', async () => {
    const req = {
      query: { filing_profile: 'dgfy' },
      requestId: 'req-report-compliance-export',
      user: { user_id: 11, tenant_id: 'tenant-1' }
    };
    const res = {
      locals: {},
      setHeader: jest.fn(),
      status: jest.fn(),
      json: jest.fn()
    };
    res.status.mockReturnValue(res);
    const next = jest.fn();

    await exportComplianceBooksPackage(req, res, next);

    expect(mockExportComplianceBooksPackageUseCase).toHaveBeenCalledWith(expect.objectContaining({
      filingProfile: 'dgfy'
    }));
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="compliance-submission-dgfy-2026-04-08.json"'
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        bundle_name: 'compliance-submission-dgfy-2026-04-08.json'
      })
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

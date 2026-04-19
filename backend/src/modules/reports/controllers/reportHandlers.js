import {
  getExpiryReportUseCase,
  getEnhancedStockAgingUseCase,
  getProductionReportUseCase,
  getPurchaseOrderAnalysisUseCase,
  getExecutiveSummaryUseCase,
  getComplianceBooksPackageUseCase,
  exportComplianceBooksPackageUseCase,
  getSnapshotsUseCase,
  getSnapshotByIdUseCase,
  saveSnapshotUseCase,
  getStockAgingUseCase,
  getSurplusShortageUseCase,
  getFinancialSummaryUseCase,
  getSupplierPerformanceUseCase
} from '../index.js';
import { recordComplianceSecuritySignalUseCase } from '../../compliance/index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { unwrapApplicationResultOrThrow } from '../../shared/contracts/applicationResultHelpers.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;
const defaultErrorPayload = (req, res, failure) => ({
  success: false,
  data: null,
  message: failure.message,
  error_code: failure.code,
  errors: failure.details,
  request_id: requestId(req, res),
  timestamp: timestamp()
});
const MASS_EXPORT_ALERT_ROW_THRESHOLD = 1000;
const MASS_EXPORT_SIGNAL_CODE = 'mass_export_threshold_reached';

const toSafeInteger = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

const countCompliancePackageRows = (recordCounts = {}) => (
  toSafeInteger(recordCounts?.sales_journal)
  + toSafeInteger(recordCounts?.purchase_journal)
  + toSafeInteger(recordCounts?.inventory_book)
  + toSafeInteger(recordCounts?.special_discount_journal)
);

const maybeRecordMassExportSignal = async ({
  req,
  exportedRows,
  exportType,
  filters
}) => {
  if (toSafeInteger(exportedRows) < MASS_EXPORT_ALERT_ROW_THRESHOLD) {
    return;
  }

  const tenantId = req?.user?.tenant_id || null;
  if (!tenantId) return;

  try {
    await recordComplianceSecuritySignalUseCase({
      tenantId,
      signalCode: MASS_EXPORT_SIGNAL_CODE,
      severity: 'warning',
      actorUser: req.user || null,
      metadata: {
        export_type: exportType || 'unknown',
        exported_rows: toSafeInteger(exportedRows),
        threshold: MASS_EXPORT_ALERT_ROW_THRESHOLD,
        filters: filters || null
      }
    });
  } catch {
    // Security signal should not block report delivery.
  }
};

const extractDateFilters = (req) => {
  const filters = {};
  const maxRangeDays = 365;

  let start = req.query.startDate ? new Date(req.query.startDate) : null;
  let end = req.query.endDate ? new Date(req.query.endDate) : null;

  if (start && Number.isNaN(start.getTime())) {
    start = null;
  }
  if (end && Number.isNaN(end.getTime())) {
    end = null;
  }

  if (!start && !end) {
    end = new Date();
    start = new Date();
    start.setDate(end.getDate() - 30);
  } else if (start && !end) {
    end = new Date();
  } else if (!start && end) {
    start = new Date(end);
    start.setDate(end.getDate() - 30);
  }

  if (start > end) {
    const temp = start;
    start = end;
    end = temp;
  }

  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > maxRangeDays) {
    end = new Date(start);
    end.setDate(start.getDate() + maxRangeDays);
  }

  filters.startDate = start.toISOString();
  filters.endDate = end.toISOString();
  const locationId = Number.parseInt(req.query.location_id, 10);
  if (Number.isInteger(locationId) && locationId > 0) {
    filters.location_id = locationId;
  }

  return filters;
};

export const getExpiryReport = async (req, res, next) => {
  try {
    const filters = extractDateFilters(req);
    const result = await getExpiryReportUseCase({ filters });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'report_expiry_viewed',
      surface: 'reports',
      action: 'view_expiry_report',
      result,
      successMetadataResolver: () => ({
        start_date: filters.startDate,
        end_date: filters.endDate
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getEnhancedStockAging = async (req, res, next) => {
  try {
    const filters = extractDateFilters(req);
    const result = await getEnhancedStockAgingUseCase({ filters });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getProductionReport = async (req, res, next) => {
  try {
    const filters = extractDateFilters(req);
    const result = await getProductionReportUseCase({ filters });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getPurchaseOrderAnalysis = async (req, res, next) => {
  try {
    const filters = extractDateFilters(req);
    const result = await getPurchaseOrderAnalysisUseCase({ filters });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getExecutiveSummary = async (req, res, next) => {
  try {
    const filters = extractDateFilters(req);
    const result = await getExecutiveSummaryUseCase({ filters });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getComplianceBooksPackage = async (req, res, next) => {
  try {
    const filters = extractDateFilters(req);
    const result = await getComplianceBooksPackageUseCase({ filters });
    const complianceExportRows = countCompliancePackageRows(result?.data?.record_counts || {});
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'report_compliance_package_viewed',
      surface: 'reports',
      action: 'view_compliance_package',
      result,
      successMetadataResolver: (data) => ({
        start_date: filters.startDate,
        end_date: filters.endDate,
        sales_rows: Number(data?.record_counts?.sales_journal || 0),
        purchase_rows: Number(data?.record_counts?.purchase_journal || 0),
        inventory_rows: Number(data?.record_counts?.inventory_book || 0)
      })
    });
    await maybeRecordMassExportSignal({
      req,
      exportedRows: complianceExportRows,
      exportType: 'compliance_package_view',
      filters
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const exportComplianceBooksPackage = async (req, res, next) => {
  try {
    const filters = extractDateFilters(req);
    const filingProfile = String(req.query?.filing_profile || 'dgfy').trim().toLowerCase() || 'dgfy';
    const result = await exportComplianceBooksPackageUseCase({ filters, filingProfile });
    const complianceExportRows = countCompliancePackageRows(result?.data?.record_counts || {});
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'report_compliance_package_exported',
      surface: 'reports',
      action: 'export_compliance_package',
      result,
      successMetadataResolver: (data) => ({
        filing_profile: filingProfile,
        start_date: filters.startDate,
        end_date: filters.endDate,
        sales_rows: Number(data?.record_counts?.sales_journal || 0),
        purchase_rows: Number(data?.record_counts?.purchase_journal || 0),
        inventory_rows: Number(data?.record_counts?.inventory_book || 0)
      })
    });
    await maybeRecordMassExportSignal({
      req,
      exportedRows: complianceExportRows,
      exportType: 'compliance_package_export',
      filters
    });

    if (result?.success) {
      const bundleName = String(result?.data?.bundle_name || `compliance-submission-${filingProfile}.json`);
      res.setHeader('Content-Disposition', `attachment; filename="${bundleName}"`);
    }

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getSnapshots = async (req, res, next) => {
  try {
    const { type } = req.query;
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    const result = await getSnapshotsUseCase({ type, limit });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'report_snapshots_viewed',
      surface: 'reports',
      action: 'view_report_snapshots',
      result,
      successMetadataResolver: (data) => ({
        type: type || null,
        limit,
        snapshot_count: Array.isArray(data) ? data.length : 0
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: { snapshots: result.data },
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getSnapshotById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await getSnapshotByIdUseCase({ id });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const saveSnapshot = async (req, res, next) => {
  try {
    const { reportType, snapshotData, dateRange, reportName } = req.body;
    const userId = req.user?.user_id || req.user?.id || null;

    const result = await saveSnapshotUseCase({
      reportType,
      snapshotData,
      dateRange: dateRange || {},
      userId,
      reportName
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'report_snapshot_saved',
      surface: 'reports',
      action: 'save_report_snapshot',
      result,
      successMetadataResolver: (data) => ({
        snapshot_id: data?.snapshot_id ?? null,
        report_type: data?.report_type ?? reportType ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Snapshot saved successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const exportReportCSV = async (req, res, next) => {
  try {
    const { type } = req.query;
    const filters = extractDateFilters(req);

    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Report type is required'
      });
    }

    let data;
    let filename;
    let csvContent;
    const dateSuffix = new Date().toISOString().split('T')[0];

    switch (type) {
      case 'expiry':
        data = unwrapApplicationResultOrThrow(
          await getExpiryReportUseCase({ filters }),
          'Failed to build expiry report export'
        );
        filename = `expiry_report_${dateSuffix}.csv`;
        csvContent = generateExpiryCSV(data);
        break;
      case 'stock_aging':
        data = unwrapApplicationResultOrThrow(
          await getEnhancedStockAgingUseCase({ filters }),
          'Failed to build stock aging report export'
        );
        filename = `stock_aging_report_${dateSuffix}.csv`;
        csvContent = generateAgingCSV(data);
        break;
      case 'production':
        data = unwrapApplicationResultOrThrow(
          await getProductionReportUseCase({ filters }),
          'Failed to build production report export'
        );
        filename = `production_report_${dateSuffix}.csv`;
        csvContent = generateProductionCSV(data);
        break;
      case 'po_analysis':
        data = unwrapApplicationResultOrThrow(
          await getPurchaseOrderAnalysisUseCase({ filters }),
          'Failed to build purchase order analysis export'
        );
        filename = `po_analysis_report_${dateSuffix}.csv`;
        csvContent = generatePOAnalysisCSV(data);
        break;
      case 'executive_summary':
        data = unwrapApplicationResultOrThrow(
          await getExecutiveSummaryUseCase({ filters }),
          'Failed to build executive summary export'
        );
        filename = `executive_summary_${dateSuffix}.csv`;
        csvContent = generateExecutiveSummaryCSV(data);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `Unknown report type: ${type}`
        });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const exportedRows = Math.max(0, String(csvContent || '').split('\n').length - 1);
    await maybeRecordMassExportSignal({
      req,
      exportedRows,
      exportType: `csv:${type}`,
      filters
    });
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
};

const escapeCSV = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const generateExpiryCSV = (data) => {
  const headers = [
    'Status',
    'Batch ID',
    'Location',
    'Item Name',
    'SKU',
    'Category',
    'Expiry Date',
    'Days Until Expiry',
    'Available Qty',
    'Unit',
    'Cost/Unit',
    'Value at Risk',
    'Received Date',
    'PO Number'
  ];
  const rows = [headers.join(',')];

  rows.push(`"SUMMARY - Expired: ${data.summary.total_expired_batches}, Critical: ${data.summary.total_critical_batches}, Warning: ${data.summary.total_warning_batches}, Upcoming: ${data.summary.total_upcoming_batches}, Total Value at Risk: ${data.summary.total_value_at_risk.toFixed(2)}"`);
  rows.push('');

  const addBatches = (batches, status) => {
    batches.forEach((batch) => {
      rows.push([
        status,
        batch.batch_id,
        escapeCSV(batch.location_name || (batch.location_id ? `#${batch.location_id}` : 'N/A')),
        escapeCSV(batch.item_name),
        escapeCSV(batch.sku_code),
        escapeCSV(batch.category),
        batch.expiry_date,
        batch.days_until_expiry,
        batch.available_quantity,
        escapeCSV(batch.unit_of_measure),
        batch.cost_per_unit?.toFixed(2) || '0.00',
        batch.value_at_risk?.toFixed(2) || '0.00',
        batch.received_date,
        escapeCSV(batch.po_number)
      ].join(','));
    });
  };

  addBatches(data.expired, 'EXPIRED');
  addBatches(data.critical, 'CRITICAL');
  addBatches(data.warning, 'WARNING');
  addBatches(data.upcoming, 'UPCOMING');

  return rows.join('\n');
};

const generateAgingCSV = (data) => {
  const headers = [
    'Batch ID',
    'Location',
    'Item Name',
    'SKU',
    'Category',
    'Received Date',
    'Days in Stock',
    'Status',
    'Original Qty',
    'Consumed Qty',
    'Available Qty',
    'Turnover Rate %',
    'Value at Risk'
  ];
  const rows = [headers.join(',')];

  rows.push(`"SUMMARY - Total Batches: ${data.summary.total_batches}, Fresh: ${data.summary.fresh_batches}, Aging: ${data.summary.aging_batches}, Critical: ${data.summary.critical_batches}"`);
  rows.push('');

  data.batches.forEach((batch) => {
    rows.push([
      batch.batch_id,
      escapeCSV(batch.location_name || (batch.location_id ? `#${batch.location_id}` : 'N/A')),
      escapeCSV(batch.item_name),
      escapeCSV(batch.sku_code),
      escapeCSV(batch.category),
      batch.received_date,
      batch.days_in_stock,
      batch.aging_status.toUpperCase(),
      batch.original_quantity,
      batch.consumed_quantity,
      batch.available_quantity,
      batch.turnover_rate?.toFixed(1) || '0.0',
      batch.value_at_risk?.toFixed(2) || '0.00'
    ].join(','));
  });

  return rows.join('\n');
};

const generateProductionCSV = (data) => {
  const headers = [
    'JO ID',
    'JO Number',
    'Product Name',
    'Qty to Produce',
    'Qty Produced',
    'Completion %',
    'Status',
    'Created Date',
    'Completion Date'
  ];
  const rows = [headers.join(',')];

  rows.push(`"SUMMARY - Total JOs: ${data.summary.total_job_orders}, Completion Rate: ${data.summary.completion_rate.toFixed(1)}%, Efficiency: ${data.summary.production_efficiency.toFixed(1)}%, Waste: ${data.summary.waste_percentage.toFixed(1)}%"`);
  rows.push('');

  data.job_orders.forEach((jobOrder) => {
    rows.push([
      jobOrder.jo_id,
      escapeCSV(jobOrder.jo_number),
      escapeCSV(jobOrder.product_name),
      jobOrder.quantity_to_produce,
      jobOrder.quantity_produced,
      jobOrder.completion_percentage?.toFixed(1) || '0.0',
      jobOrder.status.toUpperCase(),
      jobOrder.created_date,
      jobOrder.completion_date || ''
    ].join(','));
  });

  return rows.join('\n');
};

const generatePOAnalysisCSV = (data) => {
  const headers = ['PO ID', 'PO Number', 'Supplier', 'Order Date', 'Expected Delivery', 'Status', 'Total Amount'];
  const rows = [headers.join(',')];

  rows.push(`"SUMMARY - Total Orders: ${data.summary.total_orders}, Total Value: ${data.summary.total_order_value.toFixed(2)}, Fulfillment Rate: ${data.summary.fulfillment_rate.toFixed(1)}%"`);
  rows.push('');

  rows.push('"--- PENDING DELIVERIES ---"');
  data.pending_deliveries.forEach((purchaseOrder) => {
    rows.push([
      purchaseOrder.po_id,
      escapeCSV(purchaseOrder.po_number),
      escapeCSV(purchaseOrder.supplier_name),
      purchaseOrder.order_date,
      purchaseOrder.expected_delivery_date || '',
      purchaseOrder.status.toUpperCase(),
      purchaseOrder.total_amount?.toFixed(2) || '0.00'
    ].join(','));
  });

  return rows.join('\n');
};

const generateExecutiveSummaryCSV = (data) => {
  const rows = [];

  rows.push('"EXECUTIVE SUMMARY REPORT"');
  rows.push(`"Generated At","${data.generated_at}"`);
  rows.push('');

  rows.push('"INVENTORY OVERVIEW"');
  rows.push(`"Total Inventory Value","${data.inventory_overview.total_inventory_value.toFixed(2)}"`);
  rows.push(`"Total Items","${data.inventory_overview.total_items}"`);
  rows.push('');

  rows.push('"STOCK HEALTH"');
  rows.push(`"Low Stock Items Count","${data.stock_health.low_stock_count}"`);
  rows.push('');

  rows.push('"EXPIRY RISK"');
  rows.push(`"Expired Batches","${data.expiry_risk.expired_count}"`);
  rows.push(`"Expired Value","${data.expiry_risk.expired_value.toFixed(2)}"`);
  rows.push(`"Total Value at Risk","${data.expiry_risk.total_value_at_risk.toFixed(2)}"`);
  rows.push('');

  rows.push('"PRODUCTION OVERVIEW"');
  rows.push(`"Total Job Orders","${data.production_overview.total_job_orders}"`);
  rows.push(`"Completion Rate","${data.production_overview.completion_rate.toFixed(1)}%"`);
  rows.push(`"Production Efficiency","${data.production_overview.production_efficiency.toFixed(1)}%"`);
  rows.push('');

  rows.push('"PROCUREMENT OVERVIEW"');
  rows.push(`"Total Orders","${data.procurement_overview.total_orders}"`);
  rows.push(`"Pending Orders","${data.procurement_overview.pending_orders}"`);
  rows.push(`"Fulfillment Rate","${data.procurement_overview.fulfillment_rate.toFixed(1)}%"`);

  return rows.join('\n');
};

export const getStockAging = async (req, res, next) => {
  try {
    const result = await getStockAgingUseCase();
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'report_stock_aging_viewed',
      surface: 'reports',
      action: 'view_stock_aging_report',
      result,
      successMetadataResolver: (data) => ({
        row_count: Array.isArray(data) ? data.length : 0
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: { aging: result.data },
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getSurplusShortage = async (req, res, next) => {
  try {
    const result = await getSurplusShortageUseCase();
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: { items: result.data },
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getFinancialSummary = async (req, res, next) => {
  try {
    const result = await getFinancialSummaryUseCase();
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getSupplierPerformance = async (req, res, next) => {
  try {
    const result = await getSupplierPerformanceUseCase();
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: { suppliers: result.data },
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getExpiryReport,
  getEnhancedStockAging,
  getProductionReport,
  getPurchaseOrderAnalysis,
  getExecutiveSummary,
  getComplianceBooksPackage,
  getSnapshots,
  getSnapshotById,
  saveSnapshot,
  exportReportCSV,
  getStockAging,
  getSurplusShortage,
  getFinancialSummary,
  getSupplierPerformance
};

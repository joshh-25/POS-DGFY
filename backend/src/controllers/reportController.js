import * as reportService from '../services/reportService.js';

// Helper to extract date filters from request
const extractDateFilters = (req) => {
  const filters = {};
  const MAX_RANGE_DAYS = 365;

  let start = req.query.startDate ? new Date(req.query.startDate) : null;
  let end = req.query.endDate ? new Date(req.query.endDate) : null;

  // Validate dates
  if (start && isNaN(start.getTime())) start = null;
  if (end && isNaN(end.getTime())) end = null;

  // Default logic: If no dates, default to last 30 days
  if (!start && !end) {
    end = new Date();
    start = new Date();
    start.setDate(end.getDate() - 30);
  } else if (start && !end) {
    end = new Date(); // From start until now
  } else if (!start && end) {
    start = new Date(end);
    start.setDate(end.getDate() - 30); // 30 days ending at end date
  }

  // Ensure start <= end
  if (start > end) {
    const temp = start;
    start = end;
    end = temp;
  }

  // enforce max range
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > MAX_RANGE_DAYS) {
    // Cap at start + MAX_RANGE
    end = new Date(start);
    end.setDate(start.getDate() + MAX_RANGE_DAYS);
  }

  filters.startDate = start.toISOString();
  filters.endDate = end.toISOString();

  return filters;
};

// ============================================
// NEW REPORTS
// ============================================

export const getExpiryReport = async (req, res, next) => {
  try {
    const filters = extractDateFilters(req);
    const data = await reportService.getExpiryReport(filters);
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getEnhancedStockAging = async (req, res, next) => {
  try {
    const filters = extractDateFilters(req);
    const data = await reportService.getEnhancedStockAgingReport(filters);
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getProductionReport = async (req, res, next) => {
  try {
    const filters = extractDateFilters(req);
    const data = await reportService.getProductionReport(filters);
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getPurchaseOrderAnalysis = async (req, res, next) => {
  try {
    const filters = extractDateFilters(req);
    const data = await reportService.getPurchaseOrderAnalysis(filters);
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getExecutiveSummary = async (req, res, next) => {
  try {
    const filters = extractDateFilters(req);
    const data = await reportService.getExecutiveSummary(filters);
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// SNAPSHOT MANAGEMENT
// ============================================

export const getSnapshots = async (req, res, next) => {
  try {
    const { type } = req.query;
    const limit = parseInt(req.query.limit) || 20;

    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Report type is required'
      });
    }

    const data = await reportService.getReportSnapshots(type, limit);
    res.status(200).json({
      success: true,
      data: { snapshots: data },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getSnapshotById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await reportService.getReportSnapshotById(id);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Snapshot not found'
      });
    }

    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const saveSnapshot = async (req, res, next) => {
  try {
    const { reportType, snapshotData, dateRange, reportName } = req.body;
    const userId = req.user?.id || null;

    if (!reportType || !snapshotData) {
      return res.status(400).json({
        success: false,
        error: 'Report type and snapshot data are required'
      });
    }

    const data = await reportService.saveReportSnapshot(
      reportType,
      snapshotData,
      dateRange || {},
      userId,
      reportName
    );

    res.status(201).json({
      success: true,
      data,
      message: 'Snapshot saved successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// CSV EXPORT
// ============================================

export const exportReportCSV = async (req, res, next) => {
  try {
    const { type } = req.query;
    const filters = extractDateFilters(req);

    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Report type is required'
      });
    }

    let data;
    let filename;
    let csvContent;

    switch (type) {
      case 'expiry':
        data = await reportService.getExpiryReport(filters);
        filename = `expiry_report_${new Date().toISOString().split('T')[0]}.csv`;
        csvContent = generateExpiryCSV(data);
        break;
      case 'stock_aging':
        data = await reportService.getEnhancedStockAgingReport(filters);
        filename = `stock_aging_report_${new Date().toISOString().split('T')[0]}.csv`;
        csvContent = generateAgingCSV(data);
        break;
      case 'production':
        data = await reportService.getProductionReport(filters);
        filename = `production_report_${new Date().toISOString().split('T')[0]}.csv`;
        csvContent = generateProductionCSV(data);
        break;
      case 'po_analysis':
        data = await reportService.getPurchaseOrderAnalysis(filters);
        filename = `po_analysis_report_${new Date().toISOString().split('T')[0]}.csv`;
        csvContent = generatePOAnalysisCSV(data);
        break;
      case 'executive_summary':
        data = await reportService.getExecutiveSummary(filters);
        filename = `executive_summary_${new Date().toISOString().split('T')[0]}.csv`;
        csvContent = generateExecutiveSummaryCSV(data);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown report type: ${type}`
        });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
};

// CSV Generation Helpers
const escapeCSV = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const generateExpiryCSV = (data) => {
  const headers = ['Status', 'Batch ID', 'Item Name', 'SKU', 'Category', 'Expiry Date', 'Days Until Expiry', 'Available Qty', 'Unit', 'Cost/Unit', 'Value at Risk', 'Received Date', 'PO Number'];
  const rows = [headers.join(',')];

  // Add summary row
  rows.push(`"SUMMARY - Expired: ${data.summary.total_expired_batches}, Critical: ${data.summary.total_critical_batches}, Warning: ${data.summary.total_warning_batches}, Upcoming: ${data.summary.total_upcoming_batches}, Total Value at Risk: ${data.summary.total_value_at_risk.toFixed(2)}"`);
  rows.push(''); // Empty row separator

  const addBatches = (batches, status) => {
    batches.forEach(b => {
      rows.push([
        status,
        b.batch_id,
        escapeCSV(b.item_name),
        escapeCSV(b.sku_code),
        escapeCSV(b.category),
        b.expiry_date,
        b.days_until_expiry,
        b.available_quantity,
        escapeCSV(b.unit_of_measure),
        b.cost_per_unit?.toFixed(2) || '0.00',
        b.value_at_risk?.toFixed(2) || '0.00',
        b.received_date,
        escapeCSV(b.po_number)
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
  const headers = ['Batch ID', 'Item Name', 'SKU', 'Category', 'Received Date', 'Days in Stock', 'Status', 'Original Qty', 'Consumed Qty', 'Available Qty', 'Turnover Rate %', 'Value at Risk'];
  const rows = [headers.join(',')];

  rows.push(`"SUMMARY - Total Batches: ${data.summary.total_batches}, Fresh: ${data.summary.fresh_batches}, Aging: ${data.summary.aging_batches}, Critical: ${data.summary.critical_batches}"`);
  rows.push('');

  data.batches.forEach(b => {
    rows.push([
      b.batch_id,
      escapeCSV(b.item_name),
      escapeCSV(b.sku_code),
      escapeCSV(b.category),
      b.received_date,
      b.days_in_stock,
      b.aging_status.toUpperCase(),
      b.original_quantity,
      b.consumed_quantity,
      b.available_quantity,
      b.turnover_rate?.toFixed(1) || '0.0',
      b.value_at_risk?.toFixed(2) || '0.00'
    ].join(','));
  });

  return rows.join('\n');
};

const generateProductionCSV = (data) => {
  const headers = ['JO ID', 'JO Number', 'Product Name', 'Qty to Produce', 'Qty Produced', 'Completion %', 'Status', 'Created Date', 'Completion Date'];
  const rows = [headers.join(',')];

  rows.push(`"SUMMARY - Total JOs: ${data.summary.total_job_orders}, Completion Rate: ${data.summary.completion_rate.toFixed(1)}%, Efficiency: ${data.summary.production_efficiency.toFixed(1)}%, Waste: ${data.summary.waste_percentage.toFixed(1)}%"`);
  rows.push('');

  data.job_orders.forEach(jo => {
    rows.push([
      jo.jo_id,
      escapeCSV(jo.jo_number),
      escapeCSV(jo.product_name),
      jo.quantity_to_produce,
      jo.quantity_produced,
      jo.completion_percentage?.toFixed(1) || '0.0',
      jo.status.toUpperCase(),
      jo.created_date,
      jo.completion_date || ''
    ].join(','));
  });

  return rows.join('\n');
};

const generatePOAnalysisCSV = (data) => {
  const headers = ['PO ID', 'PO Number', 'Supplier', 'Order Date', 'Expected Delivery', 'Status', 'Total Amount'];
  const rows = [headers.join(',')];

  rows.push(`"SUMMARY - Total Orders: ${data.summary.total_orders}, Total Value: ${data.summary.total_order_value.toFixed(2)}, Fulfillment Rate: ${data.summary.fulfillment_rate.toFixed(1)}%"`);
  rows.push('');

  // Add pending deliveries section
  rows.push('"--- PENDING DELIVERIES ---"');
  data.pending_deliveries.forEach(po => {
    rows.push([
      po.po_id,
      escapeCSV(po.po_number),
      escapeCSV(po.supplier_name),
      po.order_date,
      po.expected_delivery_date || '',
      po.status.toUpperCase(),
      po.total_amount?.toFixed(2) || '0.00'
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

// ============================================
// LEGACY REPORTS
// ============================================

export const getStockAging = async (req, res, next) => {
  try {
    const data = await reportService.getStockAgingReport();
    res.status(200).json({
      success: true,
      data: { aging: data },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getSurplusShortage = async (req, res, next) => {
  try {
    const data = await reportService.getSurplusShortageReport();
    res.status(200).json({
      success: true,
      data: { items: data },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getFinancialSummary = async (req, res, next) => {
  try {
    const data = await reportService.getFinancialSummary();
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

export const getSupplierPerformance = async (req, res, next) => {
  try {
    const data = await reportService.getSupplierPerformanceReport();
    res.status(200).json({
      success: true,
      data: { suppliers: data },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

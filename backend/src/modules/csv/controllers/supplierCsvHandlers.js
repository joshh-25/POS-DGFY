import fs from 'fs/promises';
import {
  exportSuppliersUseCase,
  getSupplierTemplateHeadersUseCase,
  previewSuppliersImportUseCase,
  confirmSuppliersImportUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';

const readCsvContentFromRequest = async (req) => {
  if (!req.body.csvContent && !req.file) {
    const error = new Error('No CSV content provided');
    error.statusCode = 400;
    throw error;
  }

  if (req.file) {
    // Multer diskStorage saves to req.file.path
    if (req.file.path) {
      return fs.readFile(req.file.path, 'utf-8');
    }
    // Multer memoryStorage saves to req.file.buffer
    if (req.file.buffer) {
      return req.file.buffer.toString('utf-8');
    }
  }

  return req.body.csvContent;
};

const cleanupTempFile = async (req) => {
  if (req.file?.path) {
    try {
      await fs.unlink(req.file.path);
    } catch {
      // Ignore cleanup failures.
    }
  }
};

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

export const exportSuppliers = async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      status: req.query.status,
      ids: req.query.ids ? String(req.query.ids).split(',') : undefined
    };

    const result = await exportSuppliersUseCase({ filters });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'csv_suppliers_exported',
      surface: 'csv',
      action: 'export_suppliers_csv',
      result,
      successMetadataResolver: () => ({
        status_filter: filters.status || null,
        has_search: Boolean(filters.search)
      })
    });

    if (!result?.success) {
      return sendUseCaseResult(res, result, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    const exportData = result.data || {};

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `suppliers_export_${timestamp}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(exportData.csvContent);
  } catch (error) {
    console.error('Supplier export error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export suppliers',
      error: error.message
    });
  }
};

export const getTemplate = async (req, res) => {
  try {
    const result = await getSupplierTemplateHeadersUseCase();
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'csv_suppliers_template_downloaded',
      surface: 'csv',
      action: 'download_suppliers_template',
      result
    });
    if (!result?.success) {
      return sendUseCaseResult(res, result, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    const headers = result.data || [];
    const csvContent = `${headers.join(',')}\n`;
    const filename = 'suppliers_import_template.csv';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvContent);
  } catch (error) {
    console.error('Template generation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate template',
      error: error.message
    });
  }
};

export const previewImport = async (req, res) => {
  try {
    const csvContent = await readCsvContentFromRequest(req);
    const result = await previewSuppliersImportUseCase({ csvContent });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'csv_suppliers_import_previewed',
      surface: 'csv',
      action: 'preview_suppliers_import',
      result,
      successMetadataResolver: (data) => ({
        valid_rows: data?.validRows ?? null
      })
    });

    if (!result?.success) {
      return sendUseCaseResult(res, result, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    const previewData = result.data || {};

    return res.status(200).json({
      success: true,
      data: previewData,
      message: `Preview complete: ${previewData.validRows} valid rows`
    });
  } catch (error) {
    console.error('Preview error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Failed to preview import',
      error: error.statusCode ? undefined : error.message
    });
  } finally {
    await cleanupTempFile(req);
  }
};

export const confirmImport = async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const result = await confirmSuppliersImportUseCase({ rows: req.body.rows, userId });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'csv_suppliers_import_confirmed',
      surface: 'csv',
      action: 'confirm_suppliers_import',
      result,
      successMetadataResolver: (data) => ({
        created_count: data?.createdCount ?? null,
        updated_count: data?.updatedCount ?? null,
        failed_count: data?.failedCount ?? null
      })
    });

    if (!result?.success) {
      return sendUseCaseResult(res, result, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    const importData = result.data || {};

    return res.status(200).json({
      success: true,
      data: importData,
      message: `Import complete: ${importData.createdCount} created, ${importData.updatedCount} updated`
    });
  } catch (error) {
    console.error('Import confirmation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to confirm import',
      error: error.message
    });
  }
};

export default {
  exportSuppliers,
  getTemplate,
  previewImport,
  confirmImport
};

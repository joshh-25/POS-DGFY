import fs from 'fs/promises';
import {
  previewItemsImportUseCase,
  confirmItemsImportUseCase,
  getItemsTemplateHeadersUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';

const readCsvContentFromRequest = async (req) => {
  if (!req.body.csvContent && !req.file) {
    const error = new Error('No CSV content provided. Send csvContent in body or upload a file.');
    error.statusCode = 400;
    throw error;
  }

  if (req.file?.path) {
    return fs.readFile(req.file.path, 'utf-8');
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

export const previewImport = async (req, res) => {
  try {
    const csvContent = await readCsvContentFromRequest(req);
    const result = await previewItemsImportUseCase({ csvContent });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'csv_items_import_previewed',
      surface: 'csv',
      action: 'preview_items_import',
      result,
      successMetadataResolver: (data) => ({
        valid_rows: data?.validRows ?? null,
        invalid_rows: data?.invalidRows ?? null
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
      message: `Preview complete: ${previewData.validRows} valid rows, ${previewData.invalidRows} with errors`
    });
  } catch (error) {
    console.error('CSV preview error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Failed to preview CSV import',
      error: error.statusCode ? undefined : error.message
    });
  } finally {
    await cleanupTempFile(req);
  }
};

export const confirmImport = async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const result = await confirmItemsImportUseCase({ rows: req.body.rows, userId });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'csv_items_import_confirmed',
      surface: 'csv',
      action: 'confirm_items_import',
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
      message: `Import complete: ${importData.createdCount} created, ${importData.updatedCount} updated, ${importData.failedCount} failed`
    });
  } catch (error) {
    console.error('CSV import error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to execute CSV import',
      error: error.message
    });
  }
};

export const getTemplate = async (req, res) => {
  try {
    const templateType = req.query.type || 'master';
    const result = await getItemsTemplateHeadersUseCase({ templateType });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'csv_items_template_downloaded',
      surface: 'csv',
      action: 'download_items_template',
      result,
      successMetadataResolver: () => ({
        template_type: templateType
      })
    });
    if (!result?.success) {
      return sendUseCaseResult(res, result, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    const headers = result.data || [];
    let sampleRows = [];
    let filename = 'item_import_template.csv';

    if (templateType === 'items') {
      filename = 'items_import_template.csv';
      sampleRows = [
        ['RM-001', 'Flour - All Purpose', 'raw_material', 'High quality wheat flour', '500', '1000', '100', '50', 'kg', '45.00', 'TRUE', '365', '30', 'wheat', '', '', '', '', '', ''],
        ['PKG-001', 'Cake Box - 8 inch', 'packaging', 'Standard cake box', '250', '500', '50', '25', 'pcs', '15.00', 'FALSE', '', '', '', '8', '8', '4', 'Cardboard', 'White with logo', '1 cake'],
        ['SUP-001', 'Disposable Gloves - M', 'supplies', 'Medium size latex gloves', '800', '1000', '200', '100', 'pcs', '2.50', 'FALSE', '', '', '', '', '', '', '', '', '']
      ];
    } else if (templateType === 'products') {
      filename = 'products_import_template.csv';
      sampleRows = [
        ['FG-001', 'Chocolate Cake 8inch', 'product', 'finished_goods', 'Premium chocolate cake', 'Cakes', '10', '50', '10', 'pcs', '450.00', 'TRUE', '5', '2', '1', '95', '5', 'Store in cool place'],
        ['WIP-001', 'Cake Base Mix', 'product', 'work_in_progress', 'Pre-mixed cake base', 'Preparations', '25', '100', '20', 'kg', '120.00', 'TRUE', '14', '7', '10', '98', '2', 'Keep refrigerated']
      ];
    } else {
      sampleRows = [
        ['RM-001', 'Flour - All Purpose', 'raw_material', '', 'High quality wheat flour', '', '1000', '500', '100', '50', 'kg', '45.00', 'TRUE', '365', '30', '', '', '', '', '', '', '', '', '', '', 'wheat'],
        ['PKG-001', 'Cake Box - 8 inch', 'packaging', '', 'Standard cake box', '', '500', '250', '50', '25', 'pcs', '15.00', 'FALSE', '', '', '', '', '', '', '8', '8', '4', 'Cardboard', 'White with logo', '1 cake'],
        ['FG-001', 'Chocolate Cake 8inch', 'product', 'finished_goods', 'Premium chocolate cake', 'Cakes', '50', '10', '10', '5', 'pcs', '450.00', 'TRUE', '5', '2', '1', '95', '5', 'Store in cool place', '', '', '', '', '', '', 'milk,eggs,wheat'],
        ['SUP-001', 'Disposable Gloves - M', 'supplies', '', 'Medium size latex gloves', '', '1000', '800', '200', '100', 'pcs', '2.50', 'FALSE', '', '', '', '', '', '', '', '', '', '', '', '', '']
      ];
    }

    let csvContent = `${headers.join(',')}\n`;
    for (const row of sampleRows) {
      csvContent += row.map((cell) => {
        if (cell.includes(',') || cell.includes('"')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
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

export default {
  previewImport,
  confirmImport,
  getTemplate
};

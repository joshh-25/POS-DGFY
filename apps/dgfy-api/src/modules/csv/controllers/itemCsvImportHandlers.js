import fs from 'fs/promises';
import {
  previewItemsImportUseCase,
  confirmItemsImportUseCase,
  getItemsTemplateHeadersUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';

const readCsvContentFromRequest = async (req) => {
  console.log('DEBUG CSV UPLOAD - req.body:', Object.keys(req.body));
  console.log('DEBUG CSV UPLOAD - req.file:', req.file);

  if (!req.body.csvContent && !req.file) {
    const error = new Error('No CSV content provided. Send csvContent in body or upload a file.');
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
    const workflowMode = req.query.workflow_mode;
    const result = await getItemsTemplateHeadersUseCase({ templateType, workflowMode });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'csv_items_template_downloaded',
      surface: 'csv',
      action: 'download_items_template',
      result,
      successMetadataResolver: () => ({
        template_type: templateType,
        workflow_mode: workflowMode || null
      })
    });
    if (!result?.success) {
      return sendUseCaseResult(res, result, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    const templateData = result.data || {};
    const headers = templateData.headers || [];
    const sampleRows = templateData.sampleRows || [];
    const filename = templateData.filename || 'manufacturing_items_import_template.csv';

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

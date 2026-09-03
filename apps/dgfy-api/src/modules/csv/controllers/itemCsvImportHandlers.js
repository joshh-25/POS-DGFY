import fs from 'fs/promises';
import {
  previewItemsImportUseCase,
  confirmItemsImportUseCase,
  getItemsTemplateHeadersUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';
import { publishCatalogChange } from '../../shared/services/catalogChangeEventBus.js';
import { hasEffectivePermission } from '../../../utils/userPermissions.js';
import { PERMISSIONS } from '../../../config/permissions.js';

const readCsvContentFromRequest = async (req) => {

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
const publishCatalogInvalidation = async (req, itemIds = []) => {
  const tenantId = req.user?.tenant_id || req.tenant?.id;
  if (!tenantId || itemIds.length === 0) return;
  await publishCatalogChange({
    tenantId,
    reason: 'csv_items_imported',
    itemIds
  });
};
// Only ever 'append' or 'sync' leaves this function; anything else is passed through untouched so
// the use case can reject it as a 400 rather than this helper silently normalizing a typo away.
const normalizeRequestedImportMode = (req) => req.body?.mode;

// #1495 Part B: sync mode deactivates items that are absent from the uploaded file, so it needs
// the item-*delete* permission on top of the import permission the route already checks. Without
// this, anyone who can import could deactivate the whole catalog through a CSV -- a strictly wider
// blast radius than the single-item deactivate route (`DELETE /items/:item_id`), which is gated on
// DELETE_ITEMS. Append mode is unaffected and stays on IMPORT_ITEMS alone.
const denySyncModeWithoutDeletePermission = (req, res) => {
  if (normalizeRequestedImportMode(req) !== 'sync') return false;
  if (hasEffectivePermission(req.user, PERMISSIONS.INVENTORY.actions.DELETE_ITEMS)) return false;

  res.status(403).json({
    success: false,
    data: null,
    message: 'Sync-mode import deactivates items and requires the item delete permission.',
    error_code: 'SYNC_IMPORT_FORBIDDEN',
    request_id: requestId(req, res),
    timestamp: timestamp()
  });
  return true;
};

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
    if (denySyncModeWithoutDeletePermission(req, res)) return undefined;
    const csvContent = await readCsvContentFromRequest(req);
    const mode = normalizeRequestedImportMode(req);
    const result = await previewItemsImportUseCase({ csvContent, mode });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'csv_items_import_previewed',
      surface: 'csv',
      action: 'preview_items_import',
      result,
      successMetadataResolver: (data) => ({
        valid_rows: data?.validRows ?? null,
        invalid_rows: data?.invalidRows ?? null,
        mode: data?.mode ?? null,
        deactivate_count: data?.deactivateCount ?? null
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
      message: previewData.mode === 'sync'
        ? `Preview complete: ${previewData.validRows} valid rows, ${previewData.invalidRows} with errors, ${previewData.deactivateCount} item(s) to deactivate`
        : `Preview complete: ${previewData.validRows} valid rows, ${previewData.invalidRows} with errors`
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
    if (denySyncModeWithoutDeletePermission(req, res)) return undefined;
    const userId = req.user?.user_id;
    const result = await confirmItemsImportUseCase({
      rows: req.body.rows,
      userId,
      mode: normalizeRequestedImportMode(req),
      deactivateSkus: req.body.deactivateSkus
    });
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
        failed_count: data?.failedCount ?? null,
        mode: data?.mode ?? null,
        reactivated_count: data?.reactivatedCount ?? null,
        deactivated_count: data?.deactivatedCount ?? null,
        deactivation_skipped_count: data?.deactivationSkippedCount ?? null
      })
    });

    if (!result?.success) {
      return sendUseCaseResult(res, result, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    const importData = result.data || {};
    // #1495 Part B: reactivated and deactivated items change catalog visibility just as much as a
    // create or update does -- a deactivated item left in the storefront's cached catalog is
    // exactly the stale-listing bug this invalidation exists to prevent.
    const importedItemIds = [
      ...(importData.results?.created || []),
      ...(importData.results?.updated || []),
      ...(importData.results?.reactivated || []),
      ...(importData.results?.deactivated || [])
    ]
      .map((entry) => entry?.item_id)
      .filter(Boolean);
    await publishCatalogInvalidation(req, importedItemIds);

    return res.status(200).json({
      success: true,
      data: importData,
      message: `Import complete: ${importData.createdCount} created, ${importData.updatedCount} updated`
        + `, ${importData.reactivatedCount || 0} reactivated`
        + (importData.mode === 'sync' ? `, ${importData.deactivatedCount || 0} deactivated` : '')
        + (importData.deactivationSkippedCount ? `, ${importData.deactivationSkippedCount} deactivation(s) skipped` : '')
        + `, ${importData.failedCount} failed`
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

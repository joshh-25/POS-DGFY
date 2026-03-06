import {
  exportByIdsUseCase,
  exportFilteredUseCase,
  exportAllItemsUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';

const buildExportFilters = (query) => ({
  category: query.category,
  search: query.search,
  fifo: query.fifo,
  folder: query.folder
});

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

const respondCsvOrZip = (res, resultData) => {
  const timestamp = new Date().toISOString().split('T')[0];

  if (resultData.isZip && resultData.zipBuffer) {
    const filename = `inventory_export_${timestamp}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', resultData.zipBuffer.length);
    return res.send(resultData.zipBuffer);
  }

  const typePrefix = resultData.templateType === 'products' ? 'products' : 'items';
  const filename = `${typePrefix}_export_${timestamp}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(resultData.csvContent);
};

export const exportItems = async (req, res) => {
  try {
    let result;

    if (req.method === 'POST' && req.body.itemIds) {
      result = await exportByIdsUseCase({ itemIds: req.body.itemIds });
    } else {
      result = await exportFilteredUseCase({ filters: buildExportFilters(req.query) });
    }

    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'csv_items_exported',
      surface: 'csv',
      action: 'export_items_csv',
      result,
      successMetadataResolver: (data) => ({
        method: req.method,
        is_zip: Boolean(data?.isZip),
        template_type: data?.templateType || null
      })
    });

    if (!result?.success) {
      return sendUseCaseResult(res, result, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    return respondCsvOrZip(res, result.data);
  } catch (error) {
    console.error('CSV export error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export items',
      error: error.message
    });
  }
};

export const exportAllItems = async (req, res) => {
  try {
    const result = await exportAllItemsUseCase();
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'csv_all_items_exported',
      surface: 'csv',
      action: 'export_all_items_csv',
      result,
      successMetadataResolver: (data) => ({
        is_zip: Boolean(data?.isZip),
        template_type: data?.templateType || null
      })
    });

    if (!result?.success) {
      return sendUseCaseResult(res, result, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    return respondCsvOrZip(res, result.data);
  } catch (error) {
    console.error('Export all error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export all items',
      error: error.message
    });
  }
};

export const previewExport = async (req, res) => {
  try {
    const result = await exportFilteredUseCase({ filters: buildExportFilters(req.query) });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'csv_items_export_previewed',
      surface: 'csv',
      action: 'preview_items_export',
      result,
      successMetadataResolver: (data) => ({
        count: data?.count ?? null,
        is_zip: Boolean(data?.isZip)
      })
    });

    if (!result?.success) {
      return sendUseCaseResult(res, result, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    const exportData = result.data || {};

    return res.status(200).json({
      success: true,
      data: {
        count: exportData.count,
        isZip: exportData.isZip || false,
        itemsCount: exportData.itemsCount,
        productsCount: exportData.productsCount
      },
      message: exportData.isZip
        ? `${exportData.count} items would be exported as ZIP (${exportData.itemsCount} items + ${exportData.productsCount} products)`
        : `${exportData.count} items would be exported`
    });
  } catch (error) {
    console.error('Export preview error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to preview export',
      error: error.message
    });
  }
};

export default {
  exportItems,
  exportAllItems,
  previewExport
};

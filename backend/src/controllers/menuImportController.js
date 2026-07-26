/**
 * PDF Menu Import controller.
 *
 * Preview extracts menu items from an uploaded PDF (menuExtractionService) and
 * hands the result to the SAME csv-import preview/confirm use cases that power
 * CSV item import (modules/csv), so PDF-imported rows get identical server-side
 * re-validation, de-duplication, and bulk-create behavior as CSV rows. This
 * controller adds no new persistence logic.
 *
 * Gated by config/menuImportFeature.js (env-flag, default OFF) — see
 * routes/items.js for the guard middleware.
 */
import fs from 'fs/promises';
import { previewItemsImportUseCase, confirmItemsImportUseCase } from '../modules/csv/index.js';
import { extractMenuCsvFromFile, MenuExtractionError } from '../services/menuExtractionService.js';
import { sendUseCaseResult } from '../modules/shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../services/productUsageTelemetryService.js';
import logger from '../config/logger.js';

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

const cleanupTempFile = async (req) => {
    if (req.file?.path) {
        try {
            await fs.unlink(req.file.path);
        } catch {
            // Ignore cleanup failures.
        }
    }
};

export const previewPdfImport = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file provided. Upload a PDF, PNG, or JPG under the "file" field.'
            });
        }

        const fileBuffer = req.file.path
            ? await fs.readFile(req.file.path)
            : req.file.buffer;

        let extraction;
        try {
            extraction = await extractMenuCsvFromFile(fileBuffer, req.file.mimetype, req.user);
        } catch (error) {
            if (error instanceof MenuExtractionError) {
                return res.status(422).json({
                    success: false,
                    message: error.message,
                    error_code: error.code,
                    errors: error.details
                });
            }
            throw error;
        }

        const result = await previewItemsImportUseCase({ csvContent: extraction.csvContent });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pdf_menu_import_previewed',
            surface: 'pdf_menu_import',
            action: 'preview_pdf_menu_import',
            result,
            successMetadataResolver: (data) => ({
                extracted_items: extraction.itemCount,
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
            message: `Extracted ${extraction.itemCount} menu item(s): ${previewData.validRows} valid, ${previewData.invalidRows} with errors`
        });
    } catch (error) {
        logger.error('PDF menu import preview error:', error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : 'Failed to preview PDF menu import',
            error: error.statusCode ? undefined : error.message
        });
    } finally {
        await cleanupTempFile(req);
    }
};

export const confirmPdfImport = async (req, res) => {
    try {
        const userId = req.user?.user_id;
        const result = await confirmItemsImportUseCase({ rows: req.body.rows, userId });
        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'pdf_menu_import_confirmed',
            surface: 'pdf_menu_import',
            action: 'confirm_pdf_menu_import',
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
        logger.error('PDF menu import confirm error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to execute PDF menu import',
            error: error.message
        });
    }
};

export default { previewPdfImport, confirmPdfImport };

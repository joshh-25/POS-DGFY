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
import { resolveMenuImportCategories } from '../services/menuImportCategoryService.js';
import { hasEffectivePermission, resolveEffectivePermissions } from '../utils/userPermissions.js';
import { PERMISSIONS } from '../config/permissions.js';
import { enqueueItemImageGeneration } from '../workers/itemImageWorker.js';
import {
    ITEM_IMAGE_GENERATION_ENABLED,
    ITEM_IMAGE_MAX_PER_BATCH,
    ITEM_IMAGE_DAILY_USD_BUDGET
} from '../config/itemImageFeature.js';
import { AI_USAGE_FEATURES } from '../config/aiUsageFeatures.js';
import { getTenantAiSpendSince } from '../modules/menuImport/repositories/menuImportBudgetRepository.js';
import logger from '../config/logger.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
        // pages/pages_total/truncated only apply to PDFs that fell back to
        // rasterization (Phase 3) — extraction.pages is undefined for the
        // image and fast-text-path cases, so this stays absent for those.
        const extractionMeta = extraction.truncated
            ? { pages: extraction.pages, pages_total: extraction.pages_total, truncated: true }
            : {};
        return res.status(200).json({
            success: true,
            data: { ...previewData, ...extractionMeta },
            message: extraction.truncated
                ? `Extracted ${extraction.itemCount} menu item(s) from ${extraction.pages} of ${extraction.pages_total} page(s) — the rest weren't processed (see pages_total). ${previewData.validRows} valid, ${previewData.invalidRows} with errors`
                : `Extracted ${extraction.itemCount} menu item(s): ${previewData.validRows} valid, ${previewData.invalidRows} with errors`
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

/**
 * Enqueues async image generation (#176) for confirmed rows that opted in
 * via a `generate_image: true` flag — the sibling to the existing `included`
 * checkbox in MenuImportBatchModal.jsx's review table
 * (frontend/Components/items/MenuImportBatchModal.jsx). The legacy
 * single-file import UI never sets this flag, so it naturally enqueues
 * nothing without any path-specific branching here.
 *
 * Item creation has already happened by the time this runs — generation is
 * fire-and-forget from the request's perspective and never blocks or fails
 * the confirm response. Every skip reason is still reported back so the
 * client can show the operator what did and didn't happen.
 *
 * @param {Object} params
 * @param {Array} params.rows - the request body rows (source of generate_image + row.data)
 * @param {Object} params.importData - confirmItemsImportUseCase's result.data (has results.created)
 * @param {Object} params.req - the Express request (for req.user)
 * @returns {Promise<{queued: number, skipped: Array<{rowNumber: number, reason: string}>}>}
 */
const enqueueGeneratedImages = async ({ rows, importData, req }) => {
    const requestedRows = (rows || []).filter((row) => row?.generate_image === true);
    if (requestedRows.length === 0) {
        return { queued: 0, skipped: [] };
    }

    const createdByRowNumber = new Map(
        (importData?.results?.created || []).map((entry) => [entry.rowNumber, entry.item_id])
    );
    const candidateRows = requestedRows
        .map((row) => ({ row, itemId: createdByRowNumber.get(row.rowNumber) }))
        .filter((entry) => Number.isInteger(entry.itemId));
    const notCreatedSkips = requestedRows
        .filter((row) => !createdByRowNumber.has(row.rowNumber))
        .map((row) => ({ rowNumber: row.rowNumber, reason: 'row_not_created' }));

    if (candidateRows.length === 0) {
        return { queued: 0, skipped: notCreatedSkips };
    }

    if (!ITEM_IMAGE_GENERATION_ENABLED) {
        return {
            queued: 0,
            skipped: [...notCreatedSkips, ...candidateRows.map(({ row }) => ({ rowNumber: row.rowNumber, reason: 'feature_disabled' }))]
        };
    }

    // Gated on items:edit, not items:import — generating and attaching an
    // image is an edit to the item, and an importer without edit rights
    // should never get that capability for free through the import path
    // (same boundary decision as the menu-categories permission work).
    if (!hasEffectivePermission(req.user, PERMISSIONS.INVENTORY.actions.EDIT_ITEMS)) {
        return {
            queued: 0,
            skipped: [...notCreatedSkips, ...candidateRows.map(({ row }) => ({ rowNumber: row.rowNumber, reason: 'permission_denied' }))]
        };
    }

    const tenantId = req.user?.tenant_id;
    const since = new Date(Date.now() - ONE_DAY_MS);
    const spentToday = await getTenantAiSpendSince(tenantId, since, { features: [AI_USAGE_FEATURES.ITEM_IMAGE_GENERATION] });
    if (spentToday >= ITEM_IMAGE_DAILY_USD_BUDGET) {
        return {
            queued: 0,
            skipped: [...notCreatedSkips, ...candidateRows.map(({ row }) => ({ rowNumber: row.rowNumber, reason: 'budget_exceeded' }))]
        };
    }

    const withinCap = candidateRows.slice(0, ITEM_IMAGE_MAX_PER_BATCH);
    const overCap = candidateRows.slice(ITEM_IMAGE_MAX_PER_BATCH)
        .map(({ row }) => ({ rowNumber: row.rowNumber, reason: 'batch_cap_exceeded' }));

    // Resolved once, not re-read per task: the worker runs minutes later with
    // no request context, so it needs an explicit permissions array rather
    // than a role it could re-resolve against defaults that may since have
    // changed (see itemImageWorker.js's enqueueItemImageGeneration doc).
    const user = {
        user_id: req.user?.user_id,
        tenant_id: tenantId,
        is_master_admin: req.user?.is_master_admin === true,
        permissions: resolveEffectivePermissions(req.user)
    };

    const enqueueResults = await Promise.all(withinCap.map(async ({ row, itemId }) => {
        try {
            await enqueueItemImageGeneration({
                user,
                itemId,
                name: row.data?.name,
                description: row.data?.description || null,
                // Menu-import rows carry their category as `product_folder`
                // free text (see menuImportCategoryService.js's own header
                // comment) — items.category is an unrelated fixed ENUM, and
                // this row shape has no `category` key at all.
                category: row.data?.product_folder || null
            });
            return { rowNumber: row.rowNumber, queued: true };
        } catch (error) {
            logger.error('[MenuImportController] Failed to enqueue item image generation', {
                tenantId,
                rowNumber: row.rowNumber,
                reason: error?.message
            });
            return { rowNumber: row.rowNumber, queued: false, reason: 'queue_unavailable' };
        }
    }));

    const queued = enqueueResults.filter((entry) => entry.queued).length;
    const queueFailures = enqueueResults
        .filter((entry) => !entry.queued)
        .map((entry) => ({ rowNumber: entry.rowNumber, reason: entry.reason }));

    return { queued, skipped: [...notCreatedSkips, ...overCap, ...queueFailures] };
};

export const confirmPdfImport = async (req, res) => {
    try {
        const userId = req.user?.user_id;
        const rows = req.body.rows;

        // Resolve the extracted menu categories to real ItemFolders and stamp
        // folder_id onto the rows BEFORE persisting, so imported items are
        // selectable under their category in the POS rather than only carrying
        // the legacy product_folder string. Shared by the batch and single-file
        // paths, which both route through this handler.
        const categories = await resolveMenuImportCategories({
            rows,
            canManageCategories: hasEffectivePermission(req.user, PERMISSIONS.SYSTEM.actions.MANAGE_CATEGORIES)
        });

        const result = await confirmItemsImportUseCase({ rows, userId });
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
        const categoryNotice = categories.skipped.length > 0
            ? ` ${categories.skipped.length} categor${categories.skipped.length === 1 ? 'y' : 'ies'} could not be created (admin access required): ${categories.skipped.join(', ')}.`
            : '';

        // Fire-and-forget: items above are already created/persisted, so a
        // problem enqueueing image generation must never fail this response
        // — see enqueueGeneratedImages's own doc comment.
        const images = await enqueueGeneratedImages({ rows, importData, req });
        const imageNotice = images.queued > 0
            ? ` ${images.queued} image${images.queued === 1 ? '' : 's'} queued for AI generation.`
            : '';

        return res.status(200).json({
            success: true,
            data: {
                ...importData,
                categories_created: categories.created,
                categories_linked: categories.linked,
                categories_skipped: categories.skipped,
                images_queued: images.queued,
                images_skipped: images.skipped
            },
            message: `Import complete: ${importData.createdCount} created, ${importData.updatedCount} updated, ${importData.failedCount} failed.${categoryNotice}${imageNotice}`
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

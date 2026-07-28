/**
 * Batch Menu Import controller (transport only).
 *
 * Upload accepts up to MENU_IMPORT_MAX_FILES_PER_BATCH PDFs/photos, creates a
 * Redis-backed job, and returns immediately — extraction happens
 * asynchronously in workers/menuImportWorker.js. The client polls
 * GET /jobs/:jobId until the job reaches a terminal status, then calls the
 * preview/confirm endpoints (added in a later phase) to actually create
 * items. Confirm reuses the existing single-file confirmPdfImport handler
 * directly at the route level (see routes/items.js) — there is nothing
 * batch-specific about confirming already-previewed rows.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import { createMenuImportJobUseCase, getMenuImportJobUseCase } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';
import logger from '../../../config/logger.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;
const defaultErrorPayload = (req, res, failure) => ({
    success: false,
    data: null,
    message: failure.message,
    // Feature-specific reasons (e.g. WORKFLOW_MODE_NOT_FNB) live in
    // details.code; fall back to the generic DomainErrorCode when a use case
    // hasn't set one.
    error_code: failure.details?.code || failure.code,
    errors: failure.details,
    request_id: requestId(req, res),
    timestamp: timestamp()
});

const cleanupUploadedFiles = async (files = []) => {
    await Promise.all(files.map(async (file) => {
        if (!file?.path) return;
        try {
            await fs.unlink(file.path);
        } catch {
            // Ignore cleanup failures — cleanupService.js's 15-min sweep is the backstop.
        }
    }));
};

export const createMenuImportJob = async (req, res) => {
    const uploadedFiles = req.files || [];
    try {
        if (uploadedFiles.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files provided. Upload one or more PDF, PNG, or JPG files under the "files" field.'
            });
        }

        const files = uploadedFiles.map((file) => ({
            file_id: crypto.randomUUID(),
            path: file.path,
            mime_type: file.mimetype,
            size: file.size,
            original_name: file.originalname
        }));

        const result = await createMenuImportJobUseCase({
            tenantId: req.user?.tenant_id,
            userId: req.user?.user_id,
            files
        });

        await trackProductUsageFromResult({
            req,
            user: req.user,
            eventType: 'menu_batch_import_job_created',
            surface: 'menu_import',
            action: 'create_menu_import_job',
            result,
            successMetadataResolver: (data) => ({ total_files: data?.total_files ?? null })
        });

        if (!result?.success) {
            await cleanupUploadedFiles(uploadedFiles);
            return sendUseCaseResult(res, result, {
                errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
            });
        }

        return res.status(202).json({
            success: true,
            data: result.data,
            message: `Menu import job created for ${result.data.total_files} file(s). Poll GET /import/menu/jobs/${result.data.job_id} for status.`
        });
    } catch (error) {
        logger.error('Menu batch import job creation error:', error);
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(500).json({
            success: false,
            message: 'Failed to create menu import job',
            error: error.message
        });
    }
};

export const getMenuImportJob = async (req, res) => {
    try {
        const result = await getMenuImportJobUseCase({
            tenantId: req.user?.tenant_id,
            jobId: req.params.jobId
        });

        if (!result?.success) {
            return sendUseCaseResult(res, result, {
                errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
            });
        }

        return res.status(200).json({ success: true, data: result.data });
    } catch (error) {
        logger.error('Menu batch import job status error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to read menu import job status',
            error: error.message
        });
    }
};

export default { createMenuImportJob, getMenuImportJob };

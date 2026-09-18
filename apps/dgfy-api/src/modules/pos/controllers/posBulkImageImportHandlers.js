import { posRepository } from '../repositories/posRepository.js';
import { posBulkImageImportJobRepository } from '../repositories/posBulkImageImportJobRepository.js';
import { posBulkImageImportStorage } from '../repositories/posBulkImageImportStorage.js';
import { createPosBulkImageImportUseCases } from '../usecases/posBulkImageImportUseCases.js';

const useCases = createPosBulkImageImportUseCases({
    jobRepository: posBulkImageImportJobRepository,
    storage: posBulkImageImportStorage,
    posRepository
});

const success = (res, status, data) => res.status(status).json({
    success: true,
    data,
    timestamp: new Date().toISOString()
});

export const createCatalogImageImport = async (req, res, next) => {
    try {
        const data = await useCases.createUpload({
            user: req.user,
            idempotencyToken: req.get('Idempotency-Key'),
            payload: req.body
        });
        return success(res, data.replayed ? 200 : 201, data);
    } catch (error) {
        return next(error);
    }
};

export const uploadCatalogImageImportChunk = async (req, res, next) => {
    try {
        const data = await useCases.uploadChunk({
            user: req.user,
            jobId: req.params.job_id,
            index: req.params.chunk_index,
            declaredSha256: req.get('X-Chunk-SHA256'),
            bytes: req.body
        });
        return success(res, data.replayed ? 200 : 201, data);
    } catch (error) {
        return next(error);
    }
};

export const completeCatalogImageImport = async (req, res, next) => {
    try {
        return success(res, 202, await useCases.completeUpload({ user: req.user, jobId: req.params.job_id }));
    } catch (error) {
        return next(error);
    }
};

export const getCatalogImageImport = async (req, res, next) => {
    try {
        return success(res, 200, await useCases.getUpload({
            user: req.user,
            jobId: req.params.job_id,
            page: Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1),
            pageSize: Math.min(100, Math.max(1, Number.parseInt(req.query.page_size || '50', 10) || 50))
        }));
    } catch (error) {
        return next(error);
    }
};

export const retryCatalogImageImportFailures = async (req, res, next) => {
    try {
        return success(res, 202, await useCases.retryFailed({ user: req.user, jobId: req.params.job_id }));
    } catch (error) {
        return next(error);
    }
};

import crypto from 'crypto';
import { createReadStream } from 'fs';
import {
    POS_BULK_IMAGE_IMPORT_CHUNK_BYTES,
    POS_BULK_IMAGE_IMPORT_MAX_ARCHIVE_BYTES,
    isPosBulkImageImportEnabled
} from '../../../config/posBulkImageImportFeature.js';
import { parsePosBulkImageImportManifest } from '../domain/posBulkImageImportManifest.js';

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,200}$/;

const httpError = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });

const requireEnabled = () => {
    if (!isPosBulkImageImportEnabled()) {
        throw httpError(404, 'POS_IMAGE_IMPORT_DISABLED', 'POS bulk image import is not enabled');
    }
};

const requireIdentity = (user) => {
    const tenantId = String(user?.tenant_id || '').trim();
    const userId = String(user?.user_id || '').trim();
    if (!tenantId || !userId) throw httpError(401, 'AUTHENTICATION_REQUIRED', 'Authenticated tenant user required');
    return { tenantId, userId };
};

const requirePositiveInteger = (value, field, maximum) => {
    const normalized = Number(value);
    if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
        throw httpError(400, 'VALIDATION_FAILED', `${field} is outside the allowed range`);
    }
    return normalized;
};

const normalizeSha256 = (value, field) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!SHA256_PATTERN.test(normalized)) throw httpError(400, 'VALIDATION_FAILED', `${field} must be a SHA-256 hex digest`);
    return normalized;
};

const hashFile = (filePath) => new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
});

export const createPosBulkImageImportUseCases = ({ jobRepository, storage, posRepository }) => ({
    async createUpload({ user, idempotencyToken, payload }) {
        requireEnabled();
        const { tenantId, userId } = requireIdentity(user);
        if (!IDEMPOTENCY_PATTERN.test(String(idempotencyToken || ''))) {
            throw httpError(400, 'VALIDATION_FAILED', 'Idempotency-Key must contain 16 to 200 safe characters');
        }
        const manifestCsv = String(payload?.manifest_csv || '');
        const manifest = parsePosBulkImageImportManifest(manifestCsv);
        const archiveSize = requirePositiveInteger(payload?.archive_size, 'archive_size', POS_BULK_IMAGE_IMPORT_MAX_ARCHIVE_BYTES);
        const expectedChunkCount = Math.ceil(archiveSize / POS_BULK_IMAGE_IMPORT_CHUNK_BYTES);
        const chunkCount = requirePositiveInteger(payload?.chunk_count, 'chunk_count', expectedChunkCount);
        if (chunkCount !== expectedChunkCount) {
            throw httpError(400, 'VALIDATION_FAILED', `chunk_count must equal ${expectedChunkCount} for this archive`);
        }
        // The browser intentionally does not hash the entire archive: WebCrypto
        // requires one ArrayBuffer and would duplicate up to 512 MB in POS/APK
        // memory. Per-chunk hashes protect transport; the server streams and
        // records the final archive hash after assembly.
        const archiveSha256 = payload?.archive_sha256
            ? normalizeSha256(payload.archive_sha256, 'archive_sha256')
            : null;
        const requestHash = crypto.createHash('sha256').update(JSON.stringify({
            archiveSize,
            archiveSha256,
            chunkCount,
            manifest
        })).digest('hex');
        const result = await jobRepository.createUpload({
            tenantId,
            userId,
            idempotencyToken: String(idempotencyToken),
            requestHash,
            meta: {
                archive_size: archiveSize,
                archive_sha256: archiveSha256,
                chunk_count: chunkCount,
                manifest,
                actor: {
                    tenant_id: tenantId,
                    user_id: userId,
                    is_master_admin: user?.is_master_admin === true,
                    permissions: Array.isArray(user?.permissions) ? [...user.permissions] : []
                }
            }
        });
        if (!result.replayed) {
            try {
                await storage.create({ jobId: result.jobId, manifestCsv });
            } catch (error) {
                await jobRepository.setMeta({ tenantId, jobId: result.jobId, patch: {
                    status: 'rejected', error_code: 'STAGING_CREATE_FAILED'
                } }).catch(() => {});
                throw error;
            }
        }
        return { job_id: result.jobId, replayed: result.replayed, chunk_count: chunkCount, chunk_bytes: POS_BULK_IMAGE_IMPORT_CHUNK_BYTES };
    },

    async uploadChunk({ user, jobId, index, declaredSha256, bytes }) {
        const { tenantId } = requireIdentity(user);
        const job = await jobRepository.readInternal({ tenantId, jobId });
        if (!job) throw httpError(404, 'NOT_FOUND', 'POS image import job not found');
        if (job.status !== 'uploading') throw httpError(409, 'IMPORT_NOT_UPLOADING', 'POS image import is not accepting chunks');
        const chunkIndex = Number(index);
        if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= Number(job.chunk_count)) {
            throw httpError(400, 'VALIDATION_FAILED', 'chunk_index is outside this upload');
        }
        if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > POS_BULK_IMAGE_IMPORT_CHUNK_BYTES) {
            throw httpError(400, 'VALIDATION_FAILED', 'Chunk body is outside the allowed size');
        }
        const expectedSize = chunkIndex === Number(job.chunk_count) - 1
            ? Number(job.archive_size) - (chunkIndex * POS_BULK_IMAGE_IMPORT_CHUNK_BYTES)
            : POS_BULK_IMAGE_IMPORT_CHUNK_BYTES;
        if (bytes.length !== expectedSize) throw httpError(400, 'CHUNK_SIZE_MISMATCH', `Chunk ${chunkIndex} must contain ${expectedSize} bytes`);
        const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        if (sha256 !== normalizeSha256(declaredSha256, 'X-Chunk-SHA256')) {
            throw httpError(400, 'CHUNK_HASH_MISMATCH', `Chunk ${chunkIndex} hash does not match`);
        }
        const existing = job.chunks.find((chunk) => Number(chunk.index) === chunkIndex);
        if (existing) {
            if (existing.sha256 !== sha256 || Number(existing.size) !== bytes.length) {
                throw httpError(409, 'CHUNK_CONFLICT', `Chunk ${chunkIndex} conflicts with the stored chunk`);
            }
            return { ...existing, replayed: true };
        }
        try {
            await storage.writeChunk({ jobId, index: chunkIndex, buffer: bytes });
        } catch (error) {
            if (error?.code !== 'EEXIST') throw error;
            const storedHash = await storage.readChunkHash({ jobId, index: chunkIndex });
            if (storedHash !== sha256) throw httpError(409, 'CHUNK_CONFLICT', `Chunk ${chunkIndex} conflicts with the stored bytes`);
        }
        return jobRepository.registerChunk({ tenantId, jobId, index: chunkIndex, sha256, size: bytes.length });
    },

    async completeUpload({ user, jobId }) {
        const { tenantId } = requireIdentity(user);
        const job = await jobRepository.readInternal({ tenantId, jobId });
        if (!job) throw httpError(404, 'NOT_FOUND', 'POS image import job not found');
        if (!['uploading', 'validating'].includes(job.status)) return jobRepository.readPublic({ tenantId, jobId });
        if (job.chunks.length !== Number(job.chunk_count)) {
            throw httpError(409, 'CHUNKS_INCOMPLETE', 'All chunks must be uploaded before completion');
        }
        await jobRepository.setMeta({ tenantId, jobId, patch: { status: 'validating' } });
        try {
            for (const chunk of job.chunks) {
                const actual = await storage.readChunkHash({ jobId, index: chunk.index });
                if (actual !== chunk.sha256) throw httpError(409, 'CHUNK_HASH_MISMATCH', `Stored chunk ${chunk.index} failed verification`);
            }
            const assembled = await storage.assemble({ jobId, chunkCount: job.chunk_count });
            const archiveHash = await hashFile(assembled.archive_path);
            if ((job.archive_sha256 && archiveHash !== job.archive_sha256) || assembled.size !== Number(job.archive_size)) {
                throw httpError(409, 'ARCHIVE_MISMATCH', 'Assembled archive does not match the declared package');
            }
            await jobRepository.setMeta({ tenantId, jobId, patch: { archive_sha256: archiveHash } });
            const extracted = await storage.extractValidated({
                jobId,
                expectedFilenames: job.manifest.map((entry) => entry.image_filename)
            });
            const items = await posRepository.findItemsBySkuCodes(job.manifest.map((entry) => entry.sku_code));
            const itemBySku = new Map((items || []).map((item) => {
                const value = typeof item?.toJSON === 'function' ? item.toJSON() : item;
                return [String(value?.sku_code || '').trim().toUpperCase(), value];
            }));
            const missing = job.manifest.find((entry) => !itemBySku.has(entry.sku_code.toUpperCase()));
            if (missing) throw httpError(400, 'SKU_NOT_FOUND', `No item matched SKU ${missing.sku_code}`);
            const extractedByName = new Map(extracted.files.map((file) => [file.filename.toLowerCase(), file]));
            const files = job.manifest.map((entry) => {
                const source = extractedByName.get(entry.image_filename.toLowerCase());
                const item = itemBySku.get(entry.sku_code.toUpperCase());
                return {
                    file_id: crypto.randomUUID(),
                    filename: entry.image_filename,
                    sku_code: entry.sku_code,
                    item_id: Number(item.item_id),
                    replace_existing: entry.replace_existing,
                    path: source.path,
                    mimetype: source.mimetype,
                    size: source.size,
                    version: crypto.randomUUID(),
                    status: 'queued',
                    attempts: 0,
                    created_at: new Date().toISOString()
                };
            });
            await jobRepository.acceptFiles({ tenantId, jobId, files });
            await storage.cleanupChunks({ jobId, chunkCount: job.chunk_count });
            await storage.cleanupPackageArtifacts({ jobId });
            return jobRepository.readPublic({ tenantId, jobId });
        } catch (error) {
            await jobRepository.setMeta({ tenantId, jobId, patch: {
                status: 'rejected', error_code: error?.code || 'PACKAGE_VALIDATION_FAILED', error_message: error?.message
            } }).catch(() => {});
            throw error;
        }
    },

    async getUpload({ user, jobId, page, pageSize }) {
        const { tenantId } = requireIdentity(user);
        const result = await jobRepository.readPublic({ tenantId, jobId, page, pageSize });
        if (!result) throw httpError(404, 'NOT_FOUND', 'POS image import job not found');
        return result;
    },

    async retryFailed({ user, jobId }) {
        const { tenantId } = requireIdentity(user);
        const job = await jobRepository.readInternal({ tenantId, jobId });
        if (!job) throw httpError(404, 'NOT_FOUND', 'POS image import job not found');
        const queued = await jobRepository.retryFailed({ tenantId, jobId });
        return { job_id: jobId, queued };
    }
});

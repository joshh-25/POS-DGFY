/**
 * Menu Import Job Repository
 *
 * Job state lives only in Redis — one hash per job, TTL'd to match the temp
 * file lifetime, never a database table (see the menu batch import ADR for
 * why: a tenant table would need a migration replicated across every tenant
 * schema and would drag tenant DB context into the background worker, which
 * the design deliberately keeps DB-free; a landlord table would put
 * cross-tenant menu text in the shared DB for no durability benefit — the
 * durable trails already exist elsewhere: AiUsageLog, productUsageTelemetry,
 * and the item audit trail on confirm).
 *
 * Concurrency: each file within a job is queued as its own task
 * (`menu_import:queue` entry). Redis `rPop` is atomic, so exactly one worker
 * "owns" a given file task at a time — every write to a `file:<fileId>` hash
 * field is therefore made by exactly one writer, and there is no
 * read-modify-write race to guard against. Job-level status (queued /
 * running / completed / ...) is never stored — it is derived on read from the
 * per-file statuses, which avoids a second, easily-inconsistent aggregate
 * field entirely.
 */

import crypto from 'crypto';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';

const QUEUE_KEY = 'menu_import:queue';
const JOB_TTL_SECONDS = 3600; // Matches cleanupService.js's temp-file TTL — a job can never outlive its files.

const jobHashKey = (tenantId, jobId) => `menu_import:job:${tenantId}:${jobId}`;
const fileFieldKey = (fileId) => `file:${fileId}`;

export const isMenuImportQueueAvailable = () => isRedisConnected();

/**
 * Creates a job hash (one field per file, plus a `meta` field) and enqueues
 * one queue entry per file. Throws if Redis is unavailable — callers must
 * check `isMenuImportQueueAvailable()` (or requireMenuBatchImportConfig())
 * before calling this.
 * @param {Object} params
 * @param {string} params.tenantId
 * @param {number} params.userId
 * @param {Array<{file_id:string, path:string, mime_type:string, size:number, original_name:string}>} params.files
 * @returns {Promise<{jobId: string}>}
 */
export const createJob = async ({ tenantId, userId, files }) => {
    if (!isRedisConnected()) {
        throw new Error('Redis unavailable — cannot create menu import job');
    }
    const redis = getRedisClient();
    const jobId = crypto.randomUUID();
    const key = jobHashKey(tenantId, jobId);
    const fileOrder = files.map((file) => file.file_id);

    const hashEntries = {
        meta: JSON.stringify({
            tenant_id: tenantId,
            user_id: userId,
            created_at: new Date().toISOString(),
            total_files: files.length,
            file_order: fileOrder
        })
    };
    for (const file of files) {
        hashEntries[fileFieldKey(file.file_id)] = JSON.stringify({
            file_id: file.file_id,
            original_name: file.original_name,
            mime_type: file.mime_type,
            size: file.size,
            path: file.path,
            status: 'queued',
            // Duplicated from meta onto every file record so the worker can read
            // everything it needs to run extraction (path, mime_type, and the
            // {tenant_id, user_id} pair AiUsageLog logging expects) from the
            // single beginProcessingFile() call, rather than a second round trip
            // to fetch job-level meta.
            tenant_id: tenantId,
            user_id: userId
        });
    }

    await redis.hSet(key, hashEntries);
    await redis.expire(key, JOB_TTL_SECONDS);

    // Enqueue individually (rather than a single multi-value push) to match
    // the lPush/rPop FIFO convention workers/geoInventoryWorker.js already
    // establishes for this Redis client.
    for (const file of files) {
        await redis.lPush(QUEUE_KEY, JSON.stringify({ tenantId, jobId, fileId: file.file_id }));
    }

    return { jobId };
};

/**
 * Pops the next queued file task, if any. Returns null when the queue is
 * empty or Redis is unavailable (never throws — the worker treats both as
 * "nothing to do right now").
 * @returns {Promise<{tenantId: string, jobId: string, fileId: string}|null>}
 */
export const dequeueFileTask = async () => {
    if (!isRedisConnected()) return null;
    const raw = await getRedisClient().rPop(QUEUE_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

/**
 * Marks a single file task as actively being processed and returns its
 * stored record — the worker needs the record's `path`/`mime_type` to run
 * extraction, and this saves it a second round trip to fetch them
 * separately. Returns null if the file record is missing (e.g. the job's TTL
 * expired between enqueue and dequeue) — the worker treats that as
 * "nothing to do for this task."
 * @returns {Promise<Object|null>}
 */
export const beginProcessingFile = async ({ tenantId, jobId, fileId }) => {
    const redis = getRedisClient();
    if (!redis) return null;
    const key = jobHashKey(tenantId, jobId);
    const raw = await redis.hGet(key, fileFieldKey(fileId));
    if (!raw) return null;
    let record;
    try {
        record = JSON.parse(raw);
    } catch {
        return null;
    }
    record.status = 'processing';
    await redis.hSet(key, fileFieldKey(fileId), JSON.stringify(record));
    return record;
};

/**
 * Writes the terminal result for one file task — either
 * `{ status: 'completed', items, kind, pages }` or
 * `{ status: 'failed', error_code, error_message }`. Called exactly once per
 * file task by the worker that dequeued it, so this is a plain overwrite, not
 * a merge.
 */
export const setFileResult = async ({ tenantId, jobId, fileId, result }) => {
    const redis = getRedisClient();
    if (!redis) return;
    const key = jobHashKey(tenantId, jobId);
    const raw = await redis.hGet(key, fileFieldKey(fileId));
    let base = { file_id: fileId };
    if (raw) {
        try {
            base = JSON.parse(raw);
        } catch {
            // Fall back to the minimal base above.
        }
    }
    const record = {
        ...base,
        ...result,
        completed_at: new Date().toISOString()
    };
    await redis.hSet(key, fileFieldKey(fileId), JSON.stringify(record));
    // Keep the job alive as long as it's seeing activity.
    await redis.expire(key, JOB_TTL_SECONDS);
};

/**
 * Reads the full internal job record — including each file's extracted
 * `items` and on-disk `path`. Intended for server-side use only (the preview
 * use case needs `items`; the confirm/cleanup paths need `path`). Callers
 * that expose job state to the client (getMenuImportJobUseCase) must map this
 * down to a public-safe shape first.
 * @returns {Promise<Object|null>} null when the job doesn't exist or has expired.
 */
export const readJob = async ({ tenantId, jobId }) => {
    if (!isRedisConnected()) return null;
    const redis = getRedisClient();
    const key = jobHashKey(tenantId, jobId);
    const hash = await redis.hGetAll(key);
    if (!hash || Object.keys(hash).length === 0) return null;

    let meta;
    try {
        meta = JSON.parse(hash.meta);
    } catch {
        return null;
    }

    const files = meta.file_order
        .map((fileId) => {
            const raw = hash[fileFieldKey(fileId)];
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch {
                return null;
            }
        })
        .filter(Boolean);

    const completedFiles = files.filter((file) => file.status === 'completed');
    const failedFiles = files.filter((file) => file.status === 'failed');
    const settledCount = completedFiles.length + failedFiles.length;

    let status;
    if (settledCount === 0) {
        status = 'queued';
    } else if (settledCount < meta.total_files) {
        status = 'running';
    } else if (failedFiles.length === meta.total_files) {
        status = 'failed';
    } else if (failedFiles.length > 0) {
        status = 'completed_with_errors';
    } else {
        status = 'completed';
    }

    return {
        job_id: jobId,
        tenant_id: meta.tenant_id,
        user_id: meta.user_id,
        created_at: meta.created_at,
        status,
        totals: {
            files: meta.total_files,
            completed: completedFiles.length,
            failed: failedFiles.length,
            pending: meta.total_files - settledCount
        },
        files
    };
};

/**
 * Deletes a job's hash outright. Used when a job is confirmed (its result
 * has been persisted as real items — the Redis copy no longer serves a
 * purpose) or explicitly cancelled.
 */
export const deleteJob = async ({ tenantId, jobId }) => {
    const redis = getRedisClient();
    if (!redis) return;
    await redis.del(jobHashKey(tenantId, jobId));
};

export default {
    isMenuImportQueueAvailable,
    createJob,
    dequeueFileTask,
    beginProcessingFile,
    setFileResult,
    readJob,
    deleteJob
};

import crypto from 'crypto';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';
import {
    POS_BULK_IMAGE_IMPORT_LEASE_MS,
    POS_BULK_IMAGE_IMPORT_MAX_ATTEMPTS,
    POS_BULK_IMAGE_IMPORT_TTL_SECONDS
} from '../../../config/posBulkImageImportFeature.js';

const QUEUE_KEY = 'pos_image_import:queue';
const PROCESSING_KEY = 'pos_image_import:processing';
const WORKER_SLOTS_KEY = 'pos_image_import:worker_slots';
const JOB_INDEX_KEY = 'pos_image_import:jobs';
const tenantSegment = (tenantId) => crypto.createHash('sha256').update(String(tenantId || '')).digest('hex').slice(0, 24);
const jobKey = (tenantId, jobId) => `pos_image_import:job:${tenantSegment(tenantId)}:${jobId}`;
const idempotencyKey = (tenantId, userId, key) => `pos_image_import:idempotency:${tenantSegment(tenantId)}:${userId}:${crypto.createHash('sha256').update(key).digest('hex')}`;
const itemVersionKey = (tenantId, itemId) => `pos_image_import:item_version:${tenantSegment(tenantId)}:${itemId}`;
const fileField = (fileId) => `file:${fileId}`;
const chunkField = (index) => `chunk:${index}`;
const leaseKey = (tenantId, jobId, fileId) => `pos_image_import:lease:${tenantSegment(tenantId)}:${jobId}:${fileId}`;
const itemLeaseKey = (tenantId, itemId) => `pos_image_import:item_lease:${tenantSegment(tenantId)}:${itemId}`;

const requireRedis = () => {
    // Production invariant: this must fail closed when durable Redis is absent.
    // Local development should run Redis on localhost; do not add an in-memory
    // fallback here because it would hide restart/recovery defects from testing.
    if (!isRedisConnected() || !getRedisClient()) {
        const error = new Error('Redis unavailable — POS bulk image imports require durable queue metadata');
        error.code = 'POS_IMAGE_IMPORT_REDIS_UNAVAILABLE';
        error.statusCode = 503;
        throw error;
    }
    return getRedisClient();
};

const parse = (raw, fallback = null) => {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
};

const deriveStatus = (meta, files) => {
    if (meta.status === 'uploading' || meta.status === 'validating' || meta.status === 'rejected') return meta.status;
    const terminal = files.filter((file) => ['completed', 'failed', 'skipped_existing', 'superseded'].includes(file.status));
    if (terminal.length < files.length) return terminal.length === 0 ? 'queued' : 'processing';
    if (files.every((file) => file.status === 'failed')) return 'failed';
    if (files.some((file) => file.status === 'failed')) return 'completed_with_errors';
    return 'completed';
};

export const createPosBulkImageImportJobRepository = () => ({
    isAvailable: () => isRedisConnected(),

    async createUpload({ tenantId, userId, idempotencyToken, requestHash, meta }) {
        const redis = requireRedis();
        const replayKey = idempotencyKey(tenantId, userId, idempotencyToken);
        const replayRaw = await redis.get(replayKey);
        if (replayRaw) {
            const replay = parse(replayRaw);
            if (replay?.request_hash !== requestHash) {
                const error = new Error('Idempotency key was already used for a different POS image package');
                error.code = 'IDEMPOTENCY_CONFLICT';
                throw error;
            }
            return { jobId: replay.job_id, replayed: true };
        }

        const jobId = crypto.randomUUID();
        const key = jobKey(tenantId, jobId);
        const record = {
            ...meta,
            tenant_id: tenantId,
            user_id: userId,
            job_id: jobId,
            status: 'uploading',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            file_order: []
        };
        // One atomic reservation: concurrent requests must return the same job,
        // including when both callers observed an absent replay key above.
        const outcome = parse(await redis.eval(`
            local prior = redis.call('GET', KEYS[1])
            if prior then return prior end
            redis.call('HSET', KEYS[2], 'meta', ARGV[1])
            redis.call('EXPIRE', KEYS[2], ARGV[2])
            redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[2])
            redis.call('SADD', KEYS[3], ARGV[4])
            return ARGV[3]
        `, {
            keys: [replayKey, key, JOB_INDEX_KEY],
            arguments: [JSON.stringify(record), String(POS_BULK_IMAGE_IMPORT_TTL_SECONDS),
                JSON.stringify({ job_id: jobId, request_hash: requestHash }),
                JSON.stringify({ tenant_id: tenantId, job_id: jobId })]
        }));
        if (outcome?.request_hash !== requestHash) {
            const error = new Error('Idempotency key was already used for a different POS image package');
            error.code = 'IDEMPOTENCY_CONFLICT';
            throw error;
        }
        return { jobId: outcome.job_id, replayed: outcome.job_id !== jobId };
    },

    async readInternal({ tenantId, jobId }) {
        const redis = requireRedis();
        const hash = await redis.hGetAll(jobKey(tenantId, jobId));
        if (!hash || Object.keys(hash).length === 0) return null;
        const meta = parse(hash.meta);
        if (!meta) return null;
        const files = (meta.file_order || []).map((fileId) => parse(hash[fileField(fileId)])).filter(Boolean);
        const chunks = Object.entries(hash)
            .filter(([field]) => field.startsWith('chunk:'))
            .map(([, value]) => parse(value))
            .filter(Boolean);
        return { ...meta, status: deriveStatus(meta, files), files, chunks };
    },

    async registerChunk({ tenantId, jobId, index, sha256, size }) {
        const redis = requireRedis();
        const key = jobKey(tenantId, jobId);
        const record = { index: Number(index), sha256, size: Number(size), uploaded_at: new Date().toISOString() };
        const outcome = parse(await redis.eval(`
            if redis.call('EXISTS', KEYS[1]) == 0 then return cjson.encode({ outcome = 'missing' }) end
            local prior = redis.call('HGET', KEYS[1], ARGV[1])
            if prior then return cjson.encode({ outcome = 'existing', record = cjson.decode(prior) }) end
            redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
            redis.call('EXPIRE', KEYS[1], ARGV[3])
            return cjson.encode({ outcome = 'created', record = cjson.decode(ARGV[2]) })
        `, {
            keys: [key],
            arguments: [chunkField(index), JSON.stringify(record), String(POS_BULK_IMAGE_IMPORT_TTL_SECONDS)]
        }));
        if (outcome?.outcome === 'missing') throw new Error('POS image import job not found');
        if (outcome?.outcome === 'existing') {
            if (outcome.record?.sha256 !== sha256 || Number(outcome.record?.size) !== Number(size)) {
                const error = new Error(`Chunk ${index} conflicts with the previously uploaded bytes`);
                error.code = 'CHUNK_CONFLICT';
                throw error;
            }
            return { ...outcome.record, replayed: true };
        }
        return { ...record, replayed: false };
    },

    async setMeta({ tenantId, jobId, patch }) {
        const redis = requireRedis();
        const key = jobKey(tenantId, jobId);
        const current = parse(await redis.hGet(key, 'meta'));
        if (!current) return null;
        const next = { ...current, ...patch, updated_at: new Date().toISOString() };
        await redis.hSet(key, 'meta', JSON.stringify(next));
        await redis.expire(key, POS_BULK_IMAGE_IMPORT_TTL_SECONDS);
        return next;
    },

    async acceptFiles({ tenantId, jobId, files }) {
        const redis = requireRedis();
        const key = jobKey(tenantId, jobId);
        const current = parse(await redis.hGet(key, 'meta'));
        if (!current) throw new Error('POS image import job not found');
        const transaction = redis.multi();
        const order = [];
        for (const file of files) {
            order.push(file.file_id);
            transaction.hSet(key, fileField(file.file_id), JSON.stringify(file));
            if (file.status === 'queued') {
                transaction.set(itemVersionKey(tenantId, file.item_id), file.version, { EX: POS_BULK_IMAGE_IMPORT_TTL_SECONDS });
                transaction.lPush(QUEUE_KEY, JSON.stringify({ tenantId, jobId, fileId: file.file_id }));
            }
        }
        transaction.hSet(key, 'meta', JSON.stringify({
            ...current,
            status: 'accepted',
            accepted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            file_order: order,
            total_files: files.length
        }));
        transaction.expire(key, POS_BULK_IMAGE_IMPORT_TTL_SECONDS);
        await transaction.exec();
    },

    async dequeue() {
        if (!isRedisConnected()) return null;
        const raw = await getRedisClient().rPopLPush(QUEUE_KEY, PROCESSING_KEY);
        const task = parse(raw);
        return task ? { ...task, queueRaw: raw } : null;
    },

    async recoverAbandoned() {
        const redis = requireRedis();
        const entries = await redis.lRange(PROCESSING_KEY, 0, -1);
        let recovered = 0;
        for (const raw of entries) {
            const task = parse(raw);
            if (!task?.tenantId || !task?.jobId || !task?.fileId) {
                await redis.lRem(PROCESSING_KEY, 1, raw);
                continue;
            }
            if (await redis.exists(leaseKey(task.tenantId, task.jobId, task.fileId))) continue;
            const moved = await redis.eval(`
                if redis.call('LREM', KEYS[1], 1, ARGV[1]) == 1 then
                    redis.call('LPUSH', KEYS[2], ARGV[1])
                    return 1
                end
                return 0
            `, { keys: [PROCESSING_KEY, QUEUE_KEY], arguments: [raw] });
            recovered += Number(moved || 0);
        }
        return recovered;
    },

    async acquireWorkerSlot({ concurrency, leaseMs = POS_BULK_IMAGE_IMPORT_LEASE_MS }) {
        const redis = requireRedis();
        const token = crypto.randomUUID();
        const now = Date.now();
        const acquired = await redis.eval(`
            redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
            if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
            redis.call('ZADD', KEYS[1], ARGV[3], ARGV[4])
            redis.call('PEXPIRE', KEYS[1], ARGV[5])
            return 1
        `, {
            keys: [WORKER_SLOTS_KEY],
            arguments: [String(now), String(concurrency), String(now + leaseMs), token, String(leaseMs * 2)]
        });
        return Number(acquired) === 1 ? token : null;
    },

    async releaseWorkerSlot(token) {
        if (!token || !isRedisConnected()) return;
        await getRedisClient().zRem(WORKER_SLOTS_KEY, token);
    },

    async acquireItemLease({ tenantId, itemId, leaseMs = POS_BULK_IMAGE_IMPORT_LEASE_MS }) {
        const redis = requireRedis();
        const token = crypto.randomUUID();
        const acquired = await redis.set(itemLeaseKey(tenantId, itemId), token, { NX: true, PX: leaseMs });
        return acquired ? token : null;
    },

    async releaseItemLease({ tenantId, itemId, token }) {
        if (!token || !isRedisConnected()) return false;
        return Number(await getRedisClient().eval(`
            if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
            redis.call('DEL', KEYS[1])
            return 1
        `, { keys: [itemLeaseKey(tenantId, itemId)], arguments: [token] })) === 1;
    },

    async beginFile({ tenantId, jobId, fileId }) {
        const redis = requireRedis();
        const token = crypto.randomUUID();
        const lockKey = leaseKey(tenantId, jobId, fileId);
        const locked = await redis.set(lockKey, token, { NX: true, PX: POS_BULK_IMAGE_IMPORT_LEASE_MS });
        if (!locked) return null;
        const key = jobKey(tenantId, jobId);
        const record = parse(await redis.hGet(key, fileField(fileId)));
        if (!record || !['queued', 'retry_queued'].includes(record.status) || Number(record.attempts || 0) >= POS_BULK_IMAGE_IMPORT_MAX_ATTEMPTS) {
            await redis.eval(`
                if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
                return 0
            `, { keys: [lockKey], arguments: [token] });
            return null;
        }
        const next = {
            ...record,
            status: 'processing',
            attempts: Number(record.attempts || 0) + 1,
            lease_expires_at: new Date(Date.now() + POS_BULK_IMAGE_IMPORT_LEASE_MS).toISOString(),
            updated_at: new Date().toISOString()
        };
        await redis.hSet(key, fileField(fileId), JSON.stringify(next));
        return { record: next, leaseToken: token };
    },

    async isCurrentVersion({ tenantId, itemId, version }) {
        const redis = requireRedis();
        return await redis.get(itemVersionKey(tenantId, itemId)) === version;
    },

    async deferFile({ tenantId, jobId, fileId, leaseToken, queueRaw }) {
        const redis = requireRedis();
        const key = jobKey(tenantId, jobId);
        const current = parse(await redis.hGet(key, fileField(fileId)));
        if (!current) return false;
        const next = { ...current, status: 'queued', lease_expires_at: null, updated_at: new Date().toISOString() };
        return Number(await redis.eval(`
            if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
            redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
            redis.call('DEL', KEYS[1])
            redis.call('LREM', KEYS[3], 1, ARGV[4])
            redis.call('LPUSH', KEYS[4], ARGV[4])
            return 1
        `, {
            keys: [leaseKey(tenantId, jobId, fileId), key, PROCESSING_KEY, QUEUE_KEY],
            arguments: [leaseToken, fileField(fileId), JSON.stringify(next), queueRaw]
        })) === 1;
    },

    async advanceItemVersion({ tenantId, itemId }) {
        const redis = requireRedis();
        const version = crypto.randomUUID();
        await redis.set(itemVersionKey(tenantId, itemId), version, { EX: POS_BULK_IMAGE_IMPORT_TTL_SECONDS });
        return version;
    },

    async finishFile({ tenantId, jobId, fileId, leaseToken, queueRaw, result }) {
        const redis = requireRedis();
        const key = jobKey(tenantId, jobId);
        const current = parse(await redis.hGet(key, fileField(fileId)), { file_id: fileId });
        const next = {
            ...current,
            ...result,
            lease_expires_at: null,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        const lockKey = leaseKey(tenantId, jobId, fileId);
        const committed = await redis.eval(`
            if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
            redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
            redis.call('EXPIRE', KEYS[2], ARGV[4])
            redis.call('DEL', KEYS[1])
            if ARGV[5] ~= '' then redis.call('LREM', KEYS[3], 1, ARGV[5]) end
            return 1
        `, {
            keys: [lockKey, key, PROCESSING_KEY],
            arguments: [leaseToken, fileField(fileId), JSON.stringify(next), String(POS_BULK_IMAGE_IMPORT_TTL_SECONDS), queueRaw || '']
        });
        return Number(committed) === 1;
    },

    async retryFailed({ tenantId, jobId }) {
        const redis = requireRedis();
        const job = await this.readInternal({ tenantId, jobId });
        if (!job) return null;
        const key = jobKey(tenantId, jobId);
        let queued = 0;
        for (const file of job.files) {
            if (file.status !== 'failed' || Number(file.attempts || 0) >= POS_BULK_IMAGE_IMPORT_MAX_ATTEMPTS) continue;
            const next = { ...file, status: 'retry_queued', error_code: null, error_message: null };
            const task = JSON.stringify({ tenantId, jobId, fileId: file.file_id });
            const accepted = await redis.eval(`
                local current = redis.call('HGET', KEYS[1], ARGV[1])
                if not current then return 0 end
                local decoded = cjson.decode(current)
                if decoded.status ~= 'failed' or tonumber(decoded.attempts or 0) >= tonumber(ARGV[4]) then return 0 end
                redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
                redis.call('LPUSH', KEYS[2], ARGV[3])
                redis.call('EXPIRE', KEYS[1], ARGV[5])
                return 1
            `, {
                keys: [key, QUEUE_KEY],
                arguments: [fileField(file.file_id), JSON.stringify(next), task,
                    String(POS_BULK_IMAGE_IMPORT_MAX_ATTEMPTS), String(POS_BULK_IMAGE_IMPORT_TTL_SECONDS)]
            });
            queued += Number(accepted || 0);
        }
        return queued;
    },

    async readPublic({ tenantId, jobId, page = 1, pageSize = 50 }) {
        const job = await this.readInternal({ tenantId, jobId });
        if (!job) return null;
        const totals = job.files.reduce((summary, file) => {
            const key = ['completed', 'failed', 'skipped_existing', 'superseded'].includes(file.status) ? file.status : 'pending';
            summary[key] = (summary[key] || 0) + 1;
            return summary;
        }, { files: job.files.length, completed: 0, failed: 0, skipped_existing: 0, superseded: 0, pending: 0 });
        const offset = (page - 1) * pageSize;
        return {
            job_id: job.job_id,
            status: job.status,
            created_at: job.created_at,
            accepted_at: job.accepted_at || null,
            totals,
            pagination: { page, page_size: pageSize, total: job.files.length, pages: Math.max(1, Math.ceil(job.files.length / pageSize)) },
            files: job.files.slice(offset, offset + pageSize).map(({ path, version, permissions, ...file }) => file)
        };
    }
});

export const posBulkImageImportJobRepository = createPosBulkImageImportJobRepository();

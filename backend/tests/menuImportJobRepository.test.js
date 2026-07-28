import { jest } from '@jest/globals';

// tests/setup.js globally mocks config/redis.js with a plain-KV fake (no
// hash/list support) for the simple GET/SET/EXPIRE cases most suites need.
// This repository needs Redis hashes (hSet/hGet/hGetAll) and a list
// (lPush/rPop) for its job-state design (see menuImportJobRepository.js's
// header comment), so this suite swaps in a richer fake client on the
// already-mocked module — the same override technique
// tests/rateLimiterStoreMode.test.js uses (mockReturnValue on the jest.fn()
// the global setup already installed, no second unstable_mockModule call).
const makeFakeRedisClient = () => {
    const hashes = new Map(); // key -> Map(field -> value)
    const lists = new Map();  // key -> array, index 0 = head (mirrors real Redis LPUSH/RPOP)

    return {
        hSet: jest.fn(async (key, fieldOrEntries, maybeValue) => {
            if (!hashes.has(key)) hashes.set(key, new Map());
            const hash = hashes.get(key);
            if (maybeValue === undefined && fieldOrEntries && typeof fieldOrEntries === 'object') {
                for (const [field, value] of Object.entries(fieldOrEntries)) {
                    hash.set(field, value);
                }
            } else {
                hash.set(fieldOrEntries, maybeValue);
            }
            return 1;
        }),
        hGet: jest.fn(async (key, field) => {
            const hash = hashes.get(key);
            if (!hash || !hash.has(field)) return null;
            return hash.get(field);
        }),
        hGetAll: jest.fn(async (key) => {
            const hash = hashes.get(key);
            return hash ? Object.fromEntries(hash.entries()) : {};
        }),
        expire: jest.fn(async () => 1),
        lPush: jest.fn(async (key, value) => {
            if (!lists.has(key)) lists.set(key, []);
            lists.get(key).unshift(value);
            return lists.get(key).length;
        }),
        rPop: jest.fn(async (key) => {
            const list = lists.get(key);
            if (!list || list.length === 0) return null;
            return list.pop();
        }),
        del: jest.fn(async (key) => {
            const existed = hashes.delete(key);
            return existed ? 1 : 0;
        })
    };
};

const makeFile = (overrides = {}) => ({
    file_id: 'f1',
    path: '/tmp/f1.png',
    mime_type: 'image/png',
    size: 10,
    original_name: 'a.png',
    ...overrides
});

describe('menuImportJobRepository', () => {
    let redisModule;
    let repo;

    beforeEach(async () => {
        jest.clearAllMocks();
        redisModule = await import('../src/config/redis.js');
        redisModule.getRedisClient.mockReturnValue(makeFakeRedisClient());
        redisModule.isRedisConnected.mockReturnValue(true);
        repo = await import('../src/modules/menuImport/repositories/menuImportJobRepository.js');
    });

    describe('createJob / readJob', () => {
        it('persists one file record per file and derives status=queued before anything settles', async () => {
            const files = [
                makeFile({ file_id: 'f1', path: '/tmp/f1.pdf', mime_type: 'application/pdf', original_name: 'menu1.pdf' }),
                makeFile({ file_id: 'f2', path: '/tmp/f2.png', original_name: 'menu2.png' })
            ];

            const { jobId } = await repo.createJob({ tenantId: 'tenant-1', userId: 42, files });
            expect(jobId).toBeTruthy();

            const job = await repo.readJob({ tenantId: 'tenant-1', jobId });
            expect(job.status).toBe('queued');
            expect(job.totals).toEqual({ files: 2, completed: 0, failed: 0, pending: 2 });
            expect(job.files).toHaveLength(2);
            // File order is preserved (matches the order files were submitted in).
            expect(job.files.map((f) => f.file_id)).toEqual(['f1', 'f2']);
            expect(job.files[0]).toMatchObject({
                file_id: 'f1',
                status: 'queued',
                path: '/tmp/f1.pdf',
                mime_type: 'application/pdf',
                // Duplicated onto every file record so the worker can log AiUsageLog
                // without a second round trip to job-level meta (see repository comment).
                tenant_id: 'tenant-1',
                user_id: 42
            });
        });

        it('enqueues exactly one task per file, poppable via dequeueFileTask', async () => {
            const files = [makeFile({ file_id: 'f1' }), makeFile({ file_id: 'f2' })];
            const { jobId } = await repo.createJob({ tenantId: 'tenant-1', userId: 1, files });

            const seen = [await repo.dequeueFileTask(), await repo.dequeueFileTask()];
            expect(seen.map((t) => t.fileId).sort()).toEqual(['f1', 'f2']);
            expect(seen.every((t) => t.tenantId === 'tenant-1' && t.jobId === jobId)).toBe(true);
            expect(await repo.dequeueFileTask()).toBeNull();
        });

        it('throws when Redis is unavailable', async () => {
            redisModule.isRedisConnected.mockReturnValue(false);
            await expect(repo.createJob({ tenantId: 't1', userId: 1, files: [makeFile()] }))
                .rejects.toThrow('Redis unavailable');
        });

        it('returns null (not throw) for an unknown or expired job', async () => {
            await expect(repo.readJob({ tenantId: 'tenant-1', jobId: 'does-not-exist' })).resolves.toBeNull();
        });
    });

    describe('dequeueFileTask availability', () => {
        it('returns null rather than throwing when Redis is unavailable', async () => {
            redisModule.isRedisConnected.mockReturnValue(false);
            await expect(repo.dequeueFileTask()).resolves.toBeNull();
        });
    });

    describe('beginProcessingFile', () => {
        it('marks the file processing and returns its stored record', async () => {
            const { jobId } = await repo.createJob({ tenantId: 't1', userId: 1, files: [makeFile()] });

            const record = await repo.beginProcessingFile({ tenantId: 't1', jobId, fileId: 'f1' });
            expect(record).toMatchObject({ file_id: 'f1', status: 'processing', path: '/tmp/f1.png' });

            const job = await repo.readJob({ tenantId: 't1', jobId });
            expect(job.files[0].status).toBe('processing');
        });

        it('returns null when the file record is missing (job expired between enqueue and dequeue)', async () => {
            await expect(repo.beginProcessingFile({ tenantId: 't1', jobId: 'nonexistent', fileId: 'f1' })).resolves.toBeNull();
        });
    });

    describe('setFileResult / readJob status derivation', () => {
        it('derives status=running, then completed, as files settle successfully', async () => {
            const files = [makeFile({ file_id: 'f1' }), makeFile({ file_id: 'f2' })];
            const { jobId } = await repo.createJob({ tenantId: 't1', userId: 1, files });

            await repo.setFileResult({
                tenantId: 't1', jobId, fileId: 'f1',
                result: { status: 'completed', items: [{ name: 'A', price: 10 }], kind: 'image', pages: 1 }
            });
            let job = await repo.readJob({ tenantId: 't1', jobId });
            expect(job.status).toBe('running');
            expect(job.totals).toEqual({ files: 2, completed: 1, failed: 0, pending: 1 });

            await repo.setFileResult({
                tenantId: 't1', jobId, fileId: 'f2',
                result: { status: 'completed', items: [], kind: 'image', pages: 1 }
            });
            job = await repo.readJob({ tenantId: 't1', jobId });
            expect(job.status).toBe('completed');
            expect(job.totals).toEqual({ files: 2, completed: 2, failed: 0, pending: 0 });
        });

        it('derives status=completed_with_errors when some files fail and others succeed (per-file isolation)', async () => {
            const files = [makeFile({ file_id: 'f1' }), makeFile({ file_id: 'f2' })];
            const { jobId } = await repo.createJob({ tenantId: 't1', userId: 1, files });

            await repo.setFileResult({
                tenantId: 't1', jobId, fileId: 'f1',
                result: { status: 'completed', items: [{ name: 'A', price: 10 }], kind: 'image', pages: 1 }
            });
            await repo.setFileResult({
                tenantId: 't1', jobId, fileId: 'f2',
                result: { status: 'failed', error_code: 'PDF_TEXT_EMPTY', error_message: 'no text' }
            });

            const job = await repo.readJob({ tenantId: 't1', jobId });
            expect(job.status).toBe('completed_with_errors');
            expect(job.totals).toEqual({ files: 2, completed: 1, failed: 1, pending: 0 });
            expect(job.files.find((f) => f.file_id === 'f2')).toMatchObject({
                status: 'failed', error_code: 'PDF_TEXT_EMPTY', error_message: 'no text'
            });
        });

        it('derives status=failed when every file fails', async () => {
            const { jobId } = await repo.createJob({ tenantId: 't1', userId: 1, files: [makeFile()] });

            await repo.setFileResult({
                tenantId: 't1', jobId, fileId: 'f1',
                result: { status: 'failed', error_code: 'EXTRACTION_REQUEST_FAILED', error_message: 'boom' }
            });

            const job = await repo.readJob({ tenantId: 't1', jobId });
            expect(job.status).toBe('failed');
        });
    });

    describe('deleteJob', () => {
        it('removes the job hash entirely', async () => {
            const { jobId } = await repo.createJob({ tenantId: 't1', userId: 1, files: [makeFile()] });
            await repo.deleteJob({ tenantId: 't1', jobId });
            await expect(repo.readJob({ tenantId: 't1', jobId })).resolves.toBeNull();
        });
    });

    describe('isMenuImportQueueAvailable', () => {
        it('reflects isRedisConnected()', () => {
            redisModule.isRedisConnected.mockReturnValue(false);
            expect(repo.isMenuImportQueueAvailable()).toBe(false);
            redisModule.isRedisConnected.mockReturnValue(true);
            expect(repo.isMenuImportQueueAvailable()).toBe(true);
        });
    });
});

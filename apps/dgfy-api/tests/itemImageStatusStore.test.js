import { jest } from '@jest/globals';

// No per-test redis mock needed: tests/setup.js globally installs a working
// in-memory get/setEx fake on config/redis.js for exactly this kind of
// simple-KV usage (see menuImportJobRepository.test.js's header comment for
// the richer hash/list case this store doesn't need).

let setItemImageStatus;
let getItemImageStatus;
let mockIsRedisConnected;

beforeAll(async () => {
    const mod = await import('../src/workers/itemImageStatusStore.js');
    setItemImageStatus = mod.setItemImageStatus;
    getItemImageStatus = mod.getItemImageStatus;
    ({ isRedisConnected: mockIsRedisConnected } = await import('../src/config/redis.js'));
});

describe('itemImageStatusStore', () => {
    it('returns null for an item that was never queued', async () => {
        await expect(getItemImageStatus('tenant-1', 999)).resolves.toBeNull();
    });

    it('round-trips a status write through the read side', async () => {
        await setItemImageStatus('tenant-1', 42, { status: 'processing' });

        const record = await getItemImageStatus('tenant-1', 42);
        expect(record).toEqual(expect.objectContaining({
            status: 'processing',
            error_code: null,
            error_message: null
        }));
        expect(record.updated_at).toEqual(expect.any(String));
    });

    it('overwrites the previous record when the status transitions', async () => {
        await setItemImageStatus('tenant-1', 42, { status: 'processing' });
        await setItemImageStatus('tenant-1', 42, {
            status: 'failed',
            error_code: 'GENERATION_REQUEST_FAILED',
            error_message: 'boom'
        });

        const record = await getItemImageStatus('tenant-1', 42);
        expect(record).toEqual(expect.objectContaining({
            status: 'failed',
            error_code: 'GENERATION_REQUEST_FAILED',
            error_message: 'boom'
        }));
    });

    it('keeps records for different tenants/items independent', async () => {
        await setItemImageStatus('tenant-1', 1, { status: 'completed' });
        await setItemImageStatus('tenant-2', 1, { status: 'failed', error_code: 'ATTACH_FAILED' });

        await expect(getItemImageStatus('tenant-1', 1)).resolves.toEqual(expect.objectContaining({ status: 'completed' }));
        await expect(getItemImageStatus('tenant-2', 1)).resolves.toEqual(expect.objectContaining({ status: 'failed' }));
    });

    it('never throws when Redis is unavailable — write is a silent no-op, read returns null', async () => {
        mockIsRedisConnected.mockReturnValueOnce(false);
        await expect(setItemImageStatus('tenant-1', 7, { status: 'queued' })).resolves.toBeUndefined();

        mockIsRedisConnected.mockReturnValueOnce(false);
        await expect(getItemImageStatus('tenant-1', 7)).resolves.toBeNull();
    });
});

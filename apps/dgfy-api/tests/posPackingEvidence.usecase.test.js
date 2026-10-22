import { afterAll, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import dbStore from '../src/utils/dbStore.js';
import {
    buildAttachOrderPackingEvidenceUseCase,
    buildGetOrderPackingEvidenceImageUseCase,
    buildGetOrderPackingEvidenceListUseCase
} from '../src/modules/pos/usecases/posUseCases.js';

const JPEG_MAGIC_BYTES = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
const IMAGE_ONE = '11111111-1111-4111-8111-111111111111';
const IMAGE_TWO = '22222222-2222-4222-8222-222222222222';

const tempFiles = [];
const writeTempFile = async (bytes = JPEG_MAGIC_BYTES) => {
    const filePath = path.join(os.tmpdir(), `packing-evidence-test-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
    await fs.writeFile(filePath, bytes);
    tempFiles.push(filePath);
    return filePath;
};

afterAll(async () => {
    await Promise.all(tempFiles.map((filePath) => fs.unlink(filePath).catch(() => {})));
});

const createTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() { this.finished = true; }),
    rollback: jest.fn(async function rollback() { this.finished = true; })
});

const run = (callback, tenantId = 'packing-evidence-test') => {
    const sequelize = { transaction: jest.fn(async () => createTransaction()) };
    return dbStore.run({ tenantId, sequelize }, callback);
};

const buildRepository = (seed = {}) => {
    const order = {
        pos_transaction_id: 77,
        order_source: 'online_store',
        fulfillment_status: 'packed',
        packed_by: 12,
        packed_at: '2026-09-13T00:00:00.000Z',
        packing_evidence_images: [],
        ...seed.order
    };
    const audit = [];
    return {
        order,
        audit,
        getOrderByIdForLifecycle: jest.fn(async () => ({
            ...order,
            packing_evidence_images: Array.isArray(order.packing_evidence_images)
                ? [...order.packing_evidence_images]
                : order.packing_evidence_images
        })),
        updateOrderById: jest.fn(async (_id, payload) => {
            Object.assign(order, payload);
            return { ...order };
        }),
        createAuditLog: jest.fn(async (payload) => {
            audit.push(payload);
            return payload;
        })
    };
};

const buildStorage = ({ sha256 = 'a'.repeat(64) } = {}) => {
    const stored = [];
    const removed = [];
    return {
        stored,
        removed,
        store: jest.fn(async ({ orderId, imageId }) => {
            const entry = {
                storage_key: `packing-test/${orderId}/${imageId}.webp`,
                mime_type: 'image/webp',
                size_bytes: 1234,
                sha256
            };
            stored.push(entry);
            return entry;
        }),
        remove: jest.fn(async (storageKey) => { removed.push(storageKey); }),
        createReadStream: jest.fn(() => Readable.from([Buffer.from('fake-webp-bytes')]))
    };
};

const validFile = async (name = 'packing.jpg') => ({
    path: await writeTempFile(),
    originalname: name,
    mimetype: 'image/jpeg',
    size: JPEG_MAGIC_BYTES.length
});

describe('POS packing evidence attachments', () => {
    it('attaches a valid image, returns safe metadata, and writes one bounded audit event', async () => {
        const repository = buildRepository();
        const storage = buildStorage();
        const useCase = buildAttachOrderPackingEvidenceUseCase({
            posRepository: repository,
            packingEvidenceStorage: storage
        });

        const result = await run(async () => useCase({
            posTransactionId: 77,
            files: [await validFile()],
            user: { user_id: 12, permissions: ['pos:view', 'pos:transact'] }
        }));

        expect(result.success).toBe(true);
        expect(result.data.attached).toHaveLength(1);
        expect(result.data.total_count).toBe(1);
        expect(result.data.attached[0]).toEqual(expect.objectContaining({
            image_id: expect.any(String),
            mime_type: 'image/webp',
            size_bytes: 1234,
            attached_by: 12
        }));
        expect(result.data.attached[0].storage_key).toBeUndefined();
        expect(result.data.attached[0].sha256).toBeUndefined();
        expect(repository.order.packing_evidence_images[0].storage_key).toContain('/77/');
        expect(repository.audit).toHaveLength(1);
        expect(repository.audit[0].changes).toEqual({
            event: 'order_packing_evidence_attached',
            count: 1,
            images: [{ sha256: 'a'.repeat(64), size_bytes: 1234, mime_type: 'image/webp' }]
        });
        expect(repository.audit[0].changes.images[0].storage_key).toBeUndefined();
    });

    it('deduplicates a retry by normalized output SHA and removes the duplicate file', async () => {
        const repository = buildRepository({ order: { packing_evidence_images: [{
            image_id: IMAGE_ONE,
            storage_key: 'packing-test/77/one.webp',
            mime_type: 'image/webp',
            size_bytes: 1234,
            sha256: 'a'.repeat(64),
            attached_at: '2026-09-13T00:00:00.000Z',
            attached_by: 12
        }] } });
        const storage = buildStorage();
        const useCase = buildAttachOrderPackingEvidenceUseCase({
            posRepository: repository,
            packingEvidenceStorage: storage
        });

        const result = await run(async () => useCase({
            posTransactionId: 77,
            files: [await validFile('retry.jpg')],
            user: { user_id: 12, permissions: ['pos:view', 'pos:transact'] }
        }));

        expect(result.success).toBe(true);
        expect(result.data.attached).toEqual([]);
        expect(result.data.already_attached).toEqual([expect.objectContaining({ image_id: IMAGE_ONE })]);
        expect(result.data.total_count).toBe(1);
        expect(storage.remove).toHaveBeenCalledWith(expect.stringContaining('/77/'));
        expect(repository.updateOrderById).not.toHaveBeenCalled();
        expect(repository.audit).toHaveLength(0);
    });

    it('allows the narrow packing permission only for the staff member recorded on packed_by', async () => {
        const repository = buildRepository();
        const storage = buildStorage();
        const useCase = buildAttachOrderPackingEvidenceUseCase({
            posRepository: repository,
            packingEvidenceStorage: storage
        });

        const denied = await run(async () => useCase({
            posTransactionId: 77,
            files: [await validFile('wrong-staff.jpg')],
            user: { user_id: 99, permissions: ['orders:pack'] }
        }));
        expect(denied.success).toBe(false);
        expect(denied.error.statusCode).toBe(403);
        expect(denied.error.details.reason_code).toBe('NOT_YOUR_PACKING');
        expect(storage.store).not.toHaveBeenCalled();

        const allowed = await run(async () => useCase({
            posTransactionId: 77,
            files: [await validFile('same-staff.jpg')],
            user: { user_id: 12, permissions: ['orders:pack'] }
        }));
        expect(allowed.success).toBe(true);
    });

    it('rejects an unpermitted caller, an unpacked order, and the seventh persisted image', async () => {
        const repository = buildRepository();
        const storage = buildStorage();
        const useCase = buildAttachOrderPackingEvidenceUseCase({
            posRepository: repository,
            packingEvidenceStorage: storage
        });
        const file = await validFile('unauthorized.jpg');
        const denied = await run(async () => useCase({
            posTransactionId: 77,
            files: [file],
            user: { user_id: 12, permissions: [] }
        }));
        expect(denied.success).toBe(false);
        expect(denied.error.details.reason_code).toBe('NOT_PERMITTED');

        repository.order.packed_at = null;
        const unpacked = await run(async () => useCase({
            posTransactionId: 77,
            files: [await validFile('unpacked.jpg')],
            user: { user_id: 12, permissions: ['pos:view', 'pos:transact'] }
        }));
        expect(unpacked.success).toBe(false);
        expect(unpacked.error.statusCode).toBe(409);
        expect(unpacked.error.details.reason_code).toBe('ORDER_NOT_PACKED');

        repository.order.packed_at = '2026-09-13T00:00:00.000Z';
        repository.order.packing_evidence_images = Array.from({ length: 6 }, (_, index) => ({
            image_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            storage_key: `packing-test/77/${index}.webp`,
            sha256: `${index}`.padStart(64, '0'),
            mime_type: 'image/webp',
            size_bytes: 1,
            attached_by: 12,
            attached_at: '2026-09-13T00:00:00.000Z'
        }));
        const seventh = await run(async () => useCase({
            posTransactionId: 77,
            files: [await validFile('seventh.jpg')],
            user: { user_id: 12, permissions: ['pos:view', 'pos:transact'] }
        }));
        expect(seventh.success).toBe(false);
        expect(seventh.error.statusCode).toBe(409);
        expect(seventh.error.details.reason_code).toBe('PACKING_EVIDENCE_LIMIT_EXCEEDED');
        expect(storage.store).toHaveBeenCalledTimes(1);
    });

    it('rejects a renamed image whose magic bytes do not match and cleans the temp file', async () => {
        const repository = buildRepository();
        const storage = buildStorage();
        const useCase = buildAttachOrderPackingEvidenceUseCase({
            posRepository: repository,
            packingEvidenceStorage: storage
        });
        const filePath = await writeTempFile(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
        const result = await run(async () => useCase({
            posTransactionId: 77,
            files: [{ path: filePath, mimetype: 'image/jpeg', size: 8 }],
            user: { user_id: 12, permissions: ['pos:view', 'pos:transact'] }
        }));

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.details.reason_code).toBe('PACKING_EVIDENCE_IMAGE_REJECTED');
        expect(storage.store).not.toHaveBeenCalled();
        await expect(fs.access(filePath)).rejects.toThrow();
    });
});

describe('POS packing evidence reads', () => {
    it('returns count-only safe metadata and blocks a narrow reader who did not pack the order', async () => {
        const repository = buildRepository({ order: { packing_evidence_images: [{
            image_id: IMAGE_ONE,
            storage_key: 'packing-test/77/one.webp',
            mime_type: 'image/webp',
            size_bytes: 1234,
            sha256: 'a'.repeat(64),
            attached_at: '2026-09-13T00:00:00.000Z',
            attached_by: 12
        }] } });
        const listUseCase = buildGetOrderPackingEvidenceListUseCase({ posRepository: repository });
        const safeResult = await listUseCase({
            posTransactionId: 77,
            user: { user_id: 12, permissions: ['orders:pack'] }
        });
        expect(safeResult.success).toBe(true);
        expect(safeResult.data.images[0].storage_key).toBeUndefined();
        expect(safeResult.data.images[0].sha256).toBeUndefined();

        const deniedResult = await listUseCase({
            posTransactionId: 77,
            user: { user_id: 99, permissions: ['orders:pack'] }
        });
        expect(deniedResult.success).toBe(false);
        expect(deniedResult.error.statusCode).toBe(403);
        expect(deniedResult.error.details.reason_code).toBe('NOT_YOUR_PACKING');

        const imageUseCase = buildGetOrderPackingEvidenceImageUseCase({
            posRepository: repository,
            packingEvidenceStorage: buildStorage()
        });
        const deniedImage = await imageUseCase({
            posTransactionId: 77,
            imageId: IMAGE_ONE,
            user: { user_id: 99, permissions: ['orders:pack'] }
        });
        expect(deniedImage.success).toBe(false);
        expect(deniedImage.error.statusCode).toBe(403);
        expect(deniedImage.error.details.reason_code).toBe('NOT_YOUR_PACKING');
    });

    it('returns 404 for a missing image and streams a matching image for a broad reader', async () => {
        const repository = buildRepository({ order: { packing_evidence_images: [{
            image_id: IMAGE_TWO,
            storage_key: 'packing-test/77/two.webp',
            mime_type: 'image/webp',
            size_bytes: 987,
            sha256: 'b'.repeat(64),
            attached_at: '2026-09-13T00:00:00.000Z',
            attached_by: 12
        }] } });
        const storage = buildStorage({ sha256: 'b'.repeat(64) });
        const useCase = buildGetOrderPackingEvidenceImageUseCase({
            posRepository: repository,
            packingEvidenceStorage: storage
        });
        const missing = await useCase({
            posTransactionId: 77,
            imageId: IMAGE_ONE,
            user: { user_id: 99, permissions: ['pos:view'] }
        });
        expect(missing.success).toBe(false);
        expect(missing.error.statusCode).toBe(404);

        const result = await useCase({
            posTransactionId: 77,
            imageId: IMAGE_TWO,
            user: { user_id: 99, permissions: ['pos:view'] }
        });
        expect(result.success).toBe(true);
        expect(result.data.mime_type).toBe('image/webp');
        expect(result.data.size_bytes).toBe(987);
        expect(typeof result.data.stream.pipe).toBe('function');
        expect(storage.createReadStream).toHaveBeenCalledWith('packing-test/77/two.webp');
    });

    it('keeps image reads tenant-scoped when the same order id exists in another tenant', async () => {
        const repository = buildRepository({ order: { packing_evidence_images: [{
            image_id: IMAGE_ONE,
            storage_key: 'packing-test/77/one.webp',
            mime_type: 'image/webp',
            size_bytes: 1234,
            sha256: 'a'.repeat(64),
            attached_at: '2026-09-13T00:00:00.000Z',
            attached_by: 12
        }] } });
        repository.getOrderByIdForLifecycle = jest.fn(async () => (
            dbStore.getStore()?.tenantId === 'tenant-with-image'
                ? { ...repository.order }
                : { ...repository.order, packing_evidence_images: [] }
        ));
        const storage = buildStorage();
        const useCase = buildGetOrderPackingEvidenceImageUseCase({
            posRepository: repository,
            packingEvidenceStorage: storage
        });

        const sameTenant = await run(() => useCase({
            posTransactionId: 77,
            imageId: IMAGE_ONE,
            user: { user_id: 99, permissions: ['pos:view'] }
        }), 'tenant-with-image');
        expect(sameTenant.success).toBe(true);

        const otherTenant = await run(() => useCase({
            posTransactionId: 77,
            imageId: IMAGE_ONE,
            user: { user_id: 99, permissions: ['pos:view'] }
        }), 'tenant-without-image');
        expect(otherTenant.success).toBe(false);
        expect(otherTenant.error.statusCode).toBe(404);
        expect(storage.createReadStream).toHaveBeenCalledTimes(1);
    });

    it('supports a valid zero-image list for a packed order', async () => {
        const repository = buildRepository();
        const useCase = buildGetOrderPackingEvidenceListUseCase({ posRepository: repository });
        const result = await useCase({
            posTransactionId: 77,
            user: { user_id: 99, permissions: ['pos:view'] }
        });
        expect(result.success).toBe(true);
        expect(result.data).toEqual({ images: [], total_count: 0 });
    });
});

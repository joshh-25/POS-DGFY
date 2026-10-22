import { afterAll, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import dbStore from '../src/utils/dbStore.js';
import {
    buildAttachDeliveryCompletionEvidenceUseCase,
    buildGetDeliveryCompletionEvidenceUseCase,
    buildGetDeliveryCompletionEvidenceImageUseCase,
    buildGetDeliveryCompletionEvidenceSignatureUseCase
} from '../src/modules/pos/usecases/posUseCases.js';

const JPEG_MAGIC_BYTES = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const tempFiles = [];

const writeTempFile = async (bytes, label = 'evidence') => {
    const filePath = path.join(os.tmpdir(), `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
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

const run = (callback, models = {}) => dbStore.run({
    tenantId: 'delivery-evidence-test',
    sequelize: { transaction: jest.fn(async () => createTransaction()) },
    ...models
}, callback);

const buildRepository = ({ withEvidence = null } = {}) => {
    const order = {
        pos_transaction_id: 77,
        order_source: 'online_store',
        order_method: 'delivery',
        deliveryJob: {
            delivery_job_id: 901,
            provider: 'manual',
            status: 'picked_up',
            delivery_personnel_id: 99,
            delivery_run_id: 71
        }
    };
    let evidence = withEvidence;
    let nextImageId = 1;
    const audit = [];
    const replay = new Map();
    return {
        order,
        audit,
        replay,
        async getOrderByIdForLifecycle() { return { ...order, deliveryJob: { ...order.deliveryJob } }; },
        async findOperationReplayByKey({ operationKey, idempotencyKey }) {
            return replay.get(`${operationKey}:${idempotencyKey}`) || null;
        },
        async createOperationReplay(payload) {
            replay.set(`${payload.operation_key}:${payload.idempotency_key}`, { ...payload });
            return payload;
        },
        async findDeliveryCompletionEvidenceByDeliveryJobId() { return evidence ? { ...evidence, images: evidence.images || [] } : null; },
        async createDeliveryCompletionEvidence(payload) {
            evidence = {
                delivery_completion_evidence_id: 3001,
                ...payload,
                images: []
            };
            return { ...evidence };
        },
        async createDeliveryCompletionEvidenceImage(payload) {
            const row = { delivery_completion_evidence_image_id: nextImageId++, ...payload };
            evidence.images.push(row);
            return { ...row };
        },
        async findDeliveryCompletionEvidenceImageById(imageId, evidenceId) {
            return evidence?.delivery_completion_evidence_id === Number(evidenceId)
                ? (evidence.images || []).find((image) => image.delivery_completion_evidence_image_id === Number(imageId)) || null
                : null;
        },
        async createAuditLog(payload) { audit.push(payload); return payload; }
    };
};

const buildStorage = () => {
    const stored = [];
    const removed = [];
    return {
        stored,
        removed,
        async store({ posTransactionId, tempPath }) {
            const entry = {
                storage_key: `tenant/${posTransactionId}/${path.basename(tempPath)}.webp`,
                mime_type: 'image/webp',
                size_bytes: 1234,
                sha256: 'a'.repeat(64)
            };
            stored.push(entry);
            return entry;
        },
        async remove(storageKey) { removed.push(storageKey); },
        createReadStream() { return Readable.from([Buffer.from('private-webp')]); }
    };
};

const imageFile = (filePath, mimetype = 'image/jpeg') => ({
    path: filePath,
    mimetype,
    size: JPEG_MAGIC_BYTES.length
});

describe('POS delivery-completion evidence', () => {
    it('attaches staff images and an optional recipient signature with a public-safe response', async () => {
        const repository = buildRepository();
        const storage = buildStorage();
        const useCase = buildAttachDeliveryCompletionEvidenceUseCase({ posRepository: repository, evidenceStorage: storage });
        const imageOne = await writeTempFile(JPEG_MAGIC_BYTES, 'delivery-image-one');
        const imageTwo = await writeTempFile(JPEG_MAGIC_BYTES, 'delivery-image-two');
        const signature = await writeTempFile(PNG_MAGIC_BYTES, 'delivery-signature');

        const result = await run(() => useCase({
            posTransactionId: 77,
            files: { images: [imageFile(imageOne), imageFile(imageTwo)], signature: [imageFile(signature, 'image/png')] },
            payload: { idempotency_key: 'delivery-evidence-1' },
            user: { user_id: 12, permissions: ['pos:view', 'pos:transact'] }
        }));

        expect(result.success).toBe(true);
        expect(result.data.delivery_job_id).toBe(901);
        expect(result.data.images).toEqual({ count: 2, items: [{ image_id: 1 }, { image_id: 2 }] });
        expect(result.data.signature).toEqual({ present: true });
        expect(result.data).not.toHaveProperty('file_path');
        expect(result.data).not.toHaveProperty('sha256');
        expect(repository.audit).toHaveLength(1);
        expect(repository.audit[0].changes).toEqual(expect.objectContaining({
            event: 'delivery_completion_evidence_attached',
            image_count: 2,
            has_signature: true
        }));
        expect(JSON.stringify(repository.audit[0].changes)).not.toContain('tenant/');
        expect(storage.stored).toHaveLength(3);
    });

    it('accepts an all-empty completion evidence submission without writing a file', async () => {
        const repository = buildRepository();
        const storage = buildStorage();
        const useCase = buildAttachDeliveryCompletionEvidenceUseCase({ posRepository: repository, evidenceStorage: storage });

        const result = await run(() => useCase({
            posTransactionId: 77,
            files: {},
            user: { user_id: 12, permissions: ['pos:view', 'pos:transact'] }
        }));

        expect(result.success).toBe(true);
        expect(result.data.images).toEqual({ count: 0, items: [] });
        expect(result.data.signature).toEqual({ present: false });
        expect(storage.stored).toHaveLength(0);
    });

    it('replays the same idempotent submission without a second row or storage write', async () => {
        const repository = buildRepository();
        const storage = buildStorage();
        const useCase = buildAttachDeliveryCompletionEvidenceUseCase({ posRepository: repository, evidenceStorage: storage });
        const firstPath = await writeTempFile(JPEG_MAGIC_BYTES, 'delivery-replay-one');
        const secondPath = await writeTempFile(JPEG_MAGIC_BYTES, 'delivery-replay-two');
        const request = {
            posTransactionId: 77,
            payload: { idempotency_key: 'delivery-replay-1' },
            user: { user_id: 12, permissions: ['pos:view', 'pos:transact'] }
        };

        const first = await run(() => useCase({ ...request, files: { images: [imageFile(firstPath)] } }));
        const second = await run(() => useCase({ ...request, files: { images: [imageFile(secondPath)] } }));

        expect(first.success).toBe(true);
        expect(second.success).toBe(true);
        expect(second.data.idempotent_replay).toBe(true);
        expect(storage.stored).toHaveLength(1);
        expect(repository.audit).toHaveLength(1);
    });

    it('returns a 409 when an idempotency key is reused with different file content', async () => {
        const repository = buildRepository();
        const storage = buildStorage();
        const useCase = buildAttachDeliveryCompletionEvidenceUseCase({ posRepository: repository, evidenceStorage: storage });
        const firstPath = await writeTempFile(JPEG_MAGIC_BYTES, 'delivery-conflict-one');
        const secondPath = await writeTempFile(Buffer.concat([JPEG_MAGIC_BYTES, Buffer.from('different')]), 'delivery-conflict-two');
        const request = {
            posTransactionId: 77,
            payload: { idempotency_key: 'delivery-conflict-1' },
            user: { user_id: 12, permissions: ['pos:view', 'pos:transact'] }
        };

        await run(() => useCase({ ...request, files: { images: [imageFile(firstPath)] } }));
        const result = await run(() => useCase({ ...request, files: { images: [imageFile(secondPath)] } }));

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
        expect(storage.stored).toHaveLength(1);
    });

    it('rejects a magic-byte mismatch and removes the multipart temp file', async () => {
        const repository = buildRepository();
        const storage = buildStorage();
        const useCase = buildAttachDeliveryCompletionEvidenceUseCase({ posRepository: repository, evidenceStorage: storage });
        const filePath = await writeTempFile(PNG_MAGIC_BYTES, 'delivery-invalid');

        const result = await run(() => useCase({
            posTransactionId: 77,
            files: { images: [imageFile(filePath)] },
            user: { user_id: 12, permissions: ['pos:view', 'pos:transact'] }
        }));

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.details?.reason_code).toBe('DELIVERY_EVIDENCE_IMAGE_REJECTED');
        await expect(fs.access(filePath)).rejects.toThrow();
        expect(storage.stored).toHaveLength(0);
    });

    it('rejects a staff user without either broad POS or assigned-run permission', async () => {
        const repository = buildRepository();
        const storage = buildStorage();
        const useCase = buildAttachDeliveryCompletionEvidenceUseCase({ posRepository: repository, evidenceStorage: storage });

        const result = await run(() => useCase({
            posTransactionId: 77,
            files: {},
            user: { user_id: 12, permissions: [] }
        }));

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.details?.reason_code).toBe('NOT_PERMITTED');
    });

    it('rejects an assigned-run user who is neither the direct assignee nor a run member', async () => {
        const repository = buildRepository();
        const storage = buildStorage();
        const useCase = buildAttachDeliveryCompletionEvidenceUseCase({ posRepository: repository, evidenceStorage: storage });
        const models = {
            DeliveryJob: { findByPk: jest.fn(async () => ({ delivery_personnel_id: 99, delivery_run_id: 71 })) },
            DeliveryPersonnel: { findOne: jest.fn(async () => ({ delivery_personnel_id: 44 })) },
            DeliveryRunPersonnel: { findOne: jest.fn(async () => null) }
        };

        const result = await run(() => useCase({
            posTransactionId: 77,
            files: {},
            user: { user_id: 12, permissions: ['delivery_runs:act'] }
        }), models);

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.details?.reason_code).toBe('NO_LONGER_ASSIGNED');
    });
});

describe('POS delivery-completion evidence reads', () => {
    it('returns separate staff-image and recipient-signature metadata', async () => {
        const repository = buildRepository({ withEvidence: {
            delivery_completion_evidence_id: 3001,
            delivery_job_id: 901,
            signature_file_path: 'tenant/77/signature.webp',
            signature_mime_type: 'image/webp',
            signature_file_size_bytes: 55,
            attached_by: 12,
            attached_at: new Date('2026-09-13T04:00:00.000Z'),
            images: [{ delivery_completion_evidence_image_id: 4, sort_order: 0 }]
        } });
        const useCase = buildGetDeliveryCompletionEvidenceUseCase({ posRepository: repository });
        const result = await useCase({ posTransactionId: 77 });

        expect(result.success).toBe(true);
        expect(result.data.images).toEqual({ count: 1, items: [{ image_id: 4 }] });
        expect(result.data.signature).toEqual({ present: true });
        expect(result.data).not.toHaveProperty('signature_file_path');
    });

    it('streams image and signature files and returns 404 for a cross-order image id', async () => {
        const repository = buildRepository({ withEvidence: {
            delivery_completion_evidence_id: 3001,
            delivery_job_id: 901,
            signature_file_path: 'tenant/77/signature.webp',
            signature_mime_type: 'image/webp',
            signature_file_size_bytes: 55,
            images: [{ delivery_completion_evidence_image_id: 4, file_path: 'tenant/77/image.webp', mime_type: 'image/webp', file_size_bytes: 44 }]
        } });
        const storage = buildStorage();
        const imageUseCase = buildGetDeliveryCompletionEvidenceImageUseCase({ posRepository: repository, evidenceStorage: storage });
        const signatureUseCase = buildGetDeliveryCompletionEvidenceSignatureUseCase({ posRepository: repository, evidenceStorage: storage });

        const imageResult = await imageUseCase({ posTransactionId: 77, imageId: 4 });
        const signatureResult = await signatureUseCase({ posTransactionId: 77 });
        const crossOrderResult = await imageUseCase({ posTransactionId: 77, imageId: 999 });

        expect(imageResult.success).toBe(true);
        expect(typeof imageResult.data.stream.pipe).toBe('function');
        expect(signatureResult.success).toBe(true);
        expect(typeof signatureResult.data.stream.pipe).toBe('function');
        expect(crossOrderResult.success).toBe(false);
        expect(crossOrderResult.error.statusCode).toBe(404);
    });
});

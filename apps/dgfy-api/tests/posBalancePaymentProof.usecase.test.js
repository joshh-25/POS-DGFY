import { describe, expect, it, afterAll } from '@jest/globals';
import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import dbStore from '../src/utils/dbStore.js';
import {
    buildAttachOrderBalancePaymentProofUseCase,
    buildGetOrderBalancePaymentProofUseCase
} from '../src/modules/pos/usecases/posUseCases.js';

// Phase 204 (#965). Covers the attach-once proof-of-payment upload and the authed read path.
// Deliberately does not touch posOrderBalanceSettlement.usecase.test.js's own suite -- proving
// hashPayload/replay stay untouched by this phase is that file's job, not this one's.

const JPEG_MAGIC_BYTES = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

const tempFiles = [];
const writeTempFile = async (bytes) => {
    const filePath = path.join(os.tmpdir(), `proof-test-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
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

const run = (callback) => {
    const sequelize = { transaction: jest.fn(async () => createTransaction()) };
    return dbStore.run({ tenantId: 'balance-proof-test', sequelize }, callback);
};

const buildRepository = (seed = {}) => {
    const order = {
        pos_transaction_id: 77,
        order_source: 'online_store',
        ...seed.order
    };
    const paymentEntry = {
        pos_order_payment_id: 601,
        pos_transaction_id: 77,
        kind: 'balance',
        proof_file_path: null,
        ...seed.paymentEntry
    };
    const audit = [];
    return {
        order,
        paymentEntry,
        audit,
        async getOrderByIdForLifecycle() { return { ...order }; },
        async findOrderPaymentEntryById(id) {
            if (Number(id) !== Number(paymentEntry.pos_order_payment_id)) return null;
            return { ...paymentEntry };
        },
        async updateOrderPaymentEntryProof(_id, payload) {
            Object.assign(paymentEntry, payload);
            return { ...paymentEntry };
        },
        async createAuditLog(payload) { audit.push(payload); return payload; }
    };
};

const buildProofStorage = () => {
    const stored = [];
    const removed = [];
    return {
        stored,
        removed,
        async store({ orderId, tempPath }) {
            const entry = {
                storage_key: `tenant/${orderId}/${path.basename(tempPath)}.webp`,
                mime_type: 'image/webp',
                size_bytes: 1234,
                sha256: 'a'.repeat(64)
            };
            stored.push(entry);
            return entry;
        },
        async remove(storageKey) { removed.push(storageKey); },
        createReadStream() {
            return Readable.from([Buffer.from('fake-webp-bytes')]);
        }
    };
};

describe('POS balance-payment proof of payment', () => {
    it('happy path: stores the file, updates the ledger row, and writes one audit row', async () => {
        const repository = buildRepository();
        const proofStorage = buildProofStorage();
        const useCase = buildAttachOrderBalancePaymentProofUseCase({ posRepository: repository, proofStorage });
        const filePath = await writeTempFile(JPEG_MAGIC_BYTES);

        const result = await run(() => useCase({
            posTransactionId: 77,
            paymentId: 601,
            file: { path: filePath, mimetype: 'image/jpeg', size: JPEG_MAGIC_BYTES.length },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.has_payment_proof).toBe(true);
        expect(repository.paymentEntry.proof_file_path).toBe(proofStorage.stored[0].storage_key);
        expect(repository.paymentEntry.proof_attached_by).toBe(12);
        expect(repository.audit).toHaveLength(1);
        expect(repository.audit[0].changes.event).toBe('order_balance_payment_proof_attached');
        // Never the file bytes or a URL in the audit trail.
        expect(repository.audit[0].changes.proof_file_path).toBeUndefined();
        expect(proofStorage.removed).toHaveLength(0);
    });

    it('rejects a mismatched/renamed file type with 422 and unlinks the temp file', async () => {
        const repository = buildRepository();
        const proofStorage = buildProofStorage();
        const useCase = buildAttachOrderBalancePaymentProofUseCase({ posRepository: repository, proofStorage });
        // Reported as image/jpeg but the actual bytes are a PNG signature.
        const filePath = await writeTempFile(PNG_MAGIC_BYTES);

        const result = await run(() => useCase({
            posTransactionId: 77,
            paymentId: 601,
            file: { path: filePath, mimetype: 'image/jpeg', size: PNG_MAGIC_BYTES.length },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.details?.reason_code).toBe('BALANCE_PROOF_IMAGE_REJECTED');
        expect(proofStorage.stored).toHaveLength(0);
        await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('rejects a payment_id belonging to a different order with 404', async () => {
        const repository = buildRepository({ paymentEntry: { pos_transaction_id: 999 } });
        const proofStorage = buildProofStorage();
        const useCase = buildAttachOrderBalancePaymentProofUseCase({ posRepository: repository, proofStorage });
        const filePath = await writeTempFile(JPEG_MAGIC_BYTES);

        const result = await run(() => useCase({
            posTransactionId: 77,
            paymentId: 601,
            file: { path: filePath, mimetype: 'image/jpeg', size: JPEG_MAGIC_BYTES.length },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
    });

    it('attach-once: a second attach on a payment that already has proof returns 409', async () => {
        const repository = buildRepository({ paymentEntry: { proof_file_path: 'already/attached.webp' } });
        const proofStorage = buildProofStorage();
        const useCase = buildAttachOrderBalancePaymentProofUseCase({ posRepository: repository, proofStorage });
        const filePath = await writeTempFile(JPEG_MAGIC_BYTES);

        const result = await run(() => useCase({
            posTransactionId: 77,
            paymentId: 601,
            file: { path: filePath, mimetype: 'image/jpeg', size: JPEG_MAGIC_BYTES.length },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
        expect(result.error.details?.reason_code).toBe('BALANCE_PROOF_ALREADY_ATTACHED');
        expect(proofStorage.stored).toHaveLength(0);
    });

    it('rolls back and removes the stored file when the repository update fails after storage', async () => {
        const repository = buildRepository();
        repository.updateOrderPaymentEntryProof = async () => {
            throw new Error('simulated repository failure');
        };
        const proofStorage = buildProofStorage();
        const useCase = buildAttachOrderBalancePaymentProofUseCase({ posRepository: repository, proofStorage });
        const filePath = await writeTempFile(JPEG_MAGIC_BYTES);

        const result = await run(() => useCase({
            posTransactionId: 77,
            paymentId: 601,
            file: { path: filePath, mimetype: 'image/jpeg', size: JPEG_MAGIC_BYTES.length },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(proofStorage.stored).toHaveLength(1);
        expect(proofStorage.removed).toEqual([proofStorage.stored[0].storage_key]);
    });
});

describe('POS balance-payment proof of payment -- authed read', () => {
    it('returns 404 (never 403) when the row exists but carries no proof', async () => {
        const repository = buildRepository();
        const proofStorage = buildProofStorage();
        const useCase = buildGetOrderBalancePaymentProofUseCase({ posRepository: repository, proofStorage });

        const result = await useCase({ posTransactionId: 77, paymentId: 601 });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
    });

    it('returns 404 when the payment belongs to a different order', async () => {
        const repository = buildRepository({ paymentEntry: { pos_transaction_id: 999, proof_file_path: 'x.webp' } });
        const proofStorage = buildProofStorage();
        const useCase = buildGetOrderBalancePaymentProofUseCase({ posRepository: repository, proofStorage });

        const result = await useCase({ posTransactionId: 77, paymentId: 601 });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
    });

    it('streams the stored proof when it exists and belongs to this order', async () => {
        const repository = buildRepository({ paymentEntry: { proof_file_path: 'tenant/77/abc.webp', proof_mime_type: 'image/webp', proof_file_size_bytes: 999 } });
        const proofStorage = buildProofStorage();
        const useCase = buildGetOrderBalancePaymentProofUseCase({ posRepository: repository, proofStorage });

        const result = await useCase({ posTransactionId: 77, paymentId: 601 });

        expect(result.success).toBe(true);
        expect(result.data.mime_type).toBe('image/webp');
        expect(result.data.size_bytes).toBe(999);
        expect(typeof result.data.stream.pipe).toBe('function');
    });
});

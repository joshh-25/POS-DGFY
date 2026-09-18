import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';
import { createProcessPosBulkImageImportTask } from '../src/workers/posBulkImageImportWorker.js';

const task = Object.freeze({ tenantId: 'tenant-test', jobId: 'job-test', fileId: 'file-test', queueRaw: '{"task":1}' });

const buildHarness = async ({ currentVersions = [true, true], existing = null } = {}) => {
    const sourcePath = path.join(os.tmpdir(), `pos-bulk-worker-${Date.now()}-${Math.random()}.jpg`);
    await fs.writeFile(sourcePath, 'source');
    const record = {
        file_id: task.fileId,
        item_id: 41,
        filename: 'SKU-41.jpg',
        path: sourcePath,
        mimetype: 'image/jpeg',
        size: 6,
        replace_existing: true,
        version: 'version-1',
        attempts: 1
    };
    const finished = [];
    let versionIndex = 0;
    const jobRepository = {
        beginFile: jest.fn(async () => ({ record, leaseToken: 'file-lease' })),
        acquireItemLease: jest.fn(async () => 'item-lease'),
        releaseItemLease: jest.fn(async () => true),
        deferFile: jest.fn(),
        isCurrentVersion: jest.fn(async () => currentVersions[Math.min(versionIndex++, currentVersions.length - 1)]),
        readInternal: jest.fn(async () => ({
            actor: { tenant_id: task.tenantId, user_id: '7', permissions: ['items:edit'] },
            files: [{ ...record, status: finished[0]?.result?.status || 'processing' }]
        })),
        finishFile: jest.fn(async (payload) => { finished.push(payload); return true; })
    };
    const uploadImage = jest.fn(async () => ({ success: true, data: { pos_image_url: '/uploads/pos/41.webp' } }));
    const publishChange = jest.fn(async () => {});
    const importStorage = { cleanup: jest.fn(async () => {}) };
    const processTask = createProcessPosBulkImageImportTask({
        jobRepository,
        itemRepository: { findCatalogOverrideByItemId: jest.fn(async () => existing) },
        uploadImage,
        tenantContextBuilder: jest.fn(async () => ({ tenantId: task.tenantId })),
        publishChange,
        importStorage
    });
    return { sourcePath, record, finished, jobRepository, uploadImage, publishChange, importStorage, processTask };
};

describe('POS bulk image import worker', () => {
    test('commits a current image, acknowledges it, publishes, and cleans terminal staging', async () => {
        const harness = await buildHarness();
        try {
            await harness.processTask(task);
            expect(harness.uploadImage).toHaveBeenCalledWith(expect.objectContaining({
                itemId: 41,
                file: expect.objectContaining({ path: harness.sourcePath, originalname: 'SKU-41.jpg' }),
                user: expect.objectContaining({ user_id: '7' })
            }));
            expect(harness.finished).toHaveLength(1);
            expect(harness.finished[0]).toMatchObject({
                leaseToken: 'file-lease',
                queueRaw: task.queueRaw,
                result: { status: 'completed', image_url: '/uploads/pos/41.webp' }
            });
            expect(harness.publishChange).toHaveBeenCalledWith({
                tenantId: task.tenantId,
                reason: 'pos_bulk_image_import_file_completed',
                itemIds: [41]
            });
            expect(harness.importStorage.cleanup).toHaveBeenCalledWith({ jobId: task.jobId });
            expect(harness.jobRepository.releaseItemLease).toHaveBeenCalledWith({
                tenantId: task.tenantId, itemId: 41, token: 'item-lease'
            });
        } finally {
            await fs.unlink(harness.sourcePath).catch(() => {});
        }
    });

    test('supersedes a stale file without calling the image commit use case', async () => {
        const harness = await buildHarness({ currentVersions: [false] });
        await harness.processTask(task);
        expect(harness.uploadImage).not.toHaveBeenCalled();
        expect(harness.finished[0].result.status).toBe('superseded');
        await expect(fs.stat(harness.sourcePath)).rejects.toMatchObject({ code: 'ENOENT' });
    });
});

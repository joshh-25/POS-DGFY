import { describe, expect, it, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { enqueueCatalogImageUpload } from '../src/workers/catalogImageUploadWorker.js';
import {
    clearCatalogImageUploadStatuses,
    getCatalogImageUploadStatus
} from '../src/workers/catalogImageUploadStatusStore.js';

describe('catalog image upload worker queue', () => {
    beforeEach(() => {
        clearCatalogImageUploadStatuses();
    });

    it('acknowledges a catalog image quickly and records a queued status', async () => {
        const queued = await enqueueCatalogImageUpload({
            tenantId: 'tenant-a',
            user: { tenant_id: 'tenant-a', user_id: 7, permissions: ['items:edit'] },
            itemId: 22,
            mode: 'single',
            files: [{
                path: 'C:/tmp/image.jpg',
                originalname: 'image.jpg',
                mimetype: 'image/jpeg',
                size: 123
            }]
        });

        expect(queued).toEqual(expect.objectContaining({
            item_id: 22,
            queued: true
        }));
        await expect(getCatalogImageUploadStatus('tenant-a', 22)).resolves.toEqual(expect.objectContaining({
            job_id: queued.job_id,
            status: 'queued'
        }));
    });

    it('keeps local temporary-file tasks in the uploader process', () => {
        const testDir = path.dirname(fileURLToPath(import.meta.url));
        const workerSource = fs.readFileSync(
            path.join(testDir, '../src/workers/catalogImageUploadWorker.js'),
            'utf8'
        );

        expect(workerSource).not.toContain("catalog_image_upload:queue");
        expect(workerSource).not.toContain('.lPush(');
        expect(workerSource).toContain('localQueue.push(task)');
    });

    it('keeps edit gallery intent metadata with the queued files', async () => {
        const queued = await enqueueCatalogImageUpload({
            tenantId: 'tenant-a',
            user: { tenant_id: 'tenant-a', user_id: 7, permissions: ['items:edit'] },
            itemId: 23,
            mode: 'gallery',
            files: [{ path: 'C:/tmp/new.jpg', originalname: 'new.jpg', mimetype: 'image/jpeg', size: 123 }],
            galleryIntent: {
                base_keys: ['old.webp'],
                pending_keys: ['new.jpg|123|1|image/jpeg'],
                entries: [{ type: 'pending', key: 'new.jpg|123|1|image/jpeg' }]
            }
        });

        expect(queued).toEqual(expect.objectContaining({ item_id: 23, queued: true }));
        await expect(getCatalogImageUploadStatus('tenant-a', 23)).resolves.toEqual(expect.objectContaining({
            job_id: queued.job_id,
            status: 'queued'
        }));
    });
});

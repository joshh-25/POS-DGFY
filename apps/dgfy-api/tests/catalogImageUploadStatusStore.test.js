import { describe, expect, it, beforeEach } from '@jest/globals';
import {
    clearCatalogImageUploadStatuses,
    getCatalogImageUploadStatus,
    setCatalogImageUploadStatus
} from '../src/workers/catalogImageUploadStatusStore.js';

describe('catalog image upload status store', () => {
    beforeEach(() => {
        clearCatalogImageUploadStatuses();
    });

    it('keeps the latest status available without Redis for local POS/APK development', async () => {
        await setCatalogImageUploadStatus({
            tenantId: 'tenant-a',
            itemId: 22,
            jobId: 'job-1',
            status: 'queued'
        });
        await setCatalogImageUploadStatus({
            tenantId: 'tenant-a',
            itemId: 22,
            jobId: 'job-1',
            status: 'completed'
        });

        await expect(getCatalogImageUploadStatus('tenant-a', 22)).resolves.toEqual(expect.objectContaining({
            item_id: 22,
            job_id: 'job-1',
            status: 'completed'
        }));
    });
});

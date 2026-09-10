import { jest } from '@jest/globals';
import { createPosBulkImageImportUseCases } from '../src/modules/pos/usecases/posBulkImageImportUseCases.js';

const user = Object.freeze({ tenant_id: 'tenant-a', user_id: 'user-a', permissions: ['items:edit'] });

describe('POS bulk image import feature disabling', () => {
    const originalFlag = process.env.POS_BULK_IMAGE_IMPORT_ENABLED;

    afterEach(() => {
        if (originalFlag === undefined) delete process.env.POS_BULK_IMAGE_IMPORT_ENABLED;
        else process.env.POS_BULK_IMAGE_IMPORT_ENABLED = originalFlag;
    });

    test('rejects new submissions while preserving accepted-job result access', async () => {
        process.env.POS_BULK_IMAGE_IMPORT_ENABLED = 'false';
        const jobRepository = {
            readPublic: jest.fn(async () => ({ job_id: 'accepted-job', status: 'processing' }))
        };
        const useCases = createPosBulkImageImportUseCases({ jobRepository, storage: {}, posRepository: {} });

        await expect(useCases.createUpload({
            user,
            idempotencyToken: 'disabled-new-session',
            payload: { manifest_csv: 'sku_code,image_filename,replace_existing\nSKU-1,one.jpg,true\n' }
        })).rejects.toMatchObject({ code: 'POS_IMAGE_IMPORT_DISABLED', statusCode: 404 });

        await expect(useCases.getUpload({ user, jobId: 'accepted-job', page: 1, pageSize: 100 }))
            .resolves.toMatchObject({ job_id: 'accepted-job', status: 'processing' });
        expect(jobRepository.readPublic).toHaveBeenCalledWith({
            tenantId: 'tenant-a', jobId: 'accepted-job', page: 1, pageSize: 100
        });
    });
});

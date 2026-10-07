import { describe, expect, it, jest } from '@jest/globals';
import { Readable } from 'node:stream';
import { buildDownloadAdminCompanyRegistrationUploadUseCase } from '../src/modules/tenants/usecases/companyRegistrationUploadUseCases.js';

const admin = { id: 'admin-1' };
const tenantId = 'tenant-1';
const uploadId = 'upload-1';

const buildUpload = (overrides = {}) => ({
    id: uploadId,
    application: { id: 'application-1', tenant_id: tenantId },
    storage_key: 'tenant-1/attempt-1/menu/menu.png',
    mime_type: 'image/png',
    original_filename: 'menu.png',
    byte_size: 42,
    purged_at: null,
    revoked_at: null,
    ...overrides
});

const buildDependencies = (upload = buildUpload()) => {
    const repository = {
        findAdminRegistrationUpload: jest.fn(async () => upload),
        createEvent: jest.fn(async (payload) => payload)
    };
    const storage = {
        createReadStream: jest.fn(() => Readable.from([Buffer.from('private-upload')]))
    };
    return { repository, storage };
};

describe('admin registration upload download use case', () => {
    it('loads one tenant-scoped private upload and records the download event', async () => {
        const { repository, storage } = buildDependencies();
        const useCase = buildDownloadAdminCompanyRegistrationUploadUseCase({ repository, storage });

        const result = await useCase({ tenantId, uploadId, admin });

        expect(result).toMatchObject({ success: true, data: { statusCode: 200, data: {
            mimeType: 'image/png',
            filename: 'menu.png',
            size: 42
        } } });
        expect(repository.findAdminRegistrationUpload).toHaveBeenCalledWith({ tenantId, uploadId });
        expect(repository.createEvent).toHaveBeenCalledWith({
            application_id: 'application-1',
            event_type: 'upload_downloaded',
            actor_type: 'platform_admin',
            actor_id: 'admin-1',
            details: { upload_id: uploadId }
        });
        expect(storage.createReadStream).toHaveBeenCalledWith('tenant-1/attempt-1/menu/menu.png');
    });

    it('does not allow an upload from another application to be downloaded', async () => {
        const { repository, storage } = buildDependencies(null);
        const useCase = buildDownloadAdminCompanyRegistrationUploadUseCase({ repository, storage });

        const result = await useCase({ tenantId, uploadId, admin });

        expect(result).toMatchObject({ success: false, error: { statusCode: 404 } });
        expect(repository.createEvent).not.toHaveBeenCalled();
        expect(storage.createReadStream).not.toHaveBeenCalled();
    });

    it.each([
        ['revoked', { revoked_at: new Date() }],
        ['purged', { purged_at: new Date() }],
        ['missing storage key', { storage_key: null }]
    ])('returns gone for a %s upload without opening storage', async (_label, overrides) => {
        const { repository, storage } = buildDependencies(buildUpload(overrides));
        const useCase = buildDownloadAdminCompanyRegistrationUploadUseCase({ repository, storage });

        const result = await useCase({ tenantId, uploadId, admin });

        expect(result).toMatchObject({ success: false, error: { statusCode: 410 } });
        expect(repository.createEvent).not.toHaveBeenCalled();
        expect(storage.createReadStream).not.toHaveBeenCalled();
    });
});

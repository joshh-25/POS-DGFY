import {
    BULK_CATALOG_IMAGE_TRANSPORT_MAX_BYTES,
    BULK_CATALOG_IMAGE_TRANSPORT_MAX_FILES,
    CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES,
    posCatalogBulkImageUpload,
    posCatalogImageUpload,
    storefrontCatalogBulkImageUpload,
    storefrontCatalogGalleryImageUpload,
    storefrontCatalogImageUpload,
    preserveTenantContext
} from '../src/config/uploadConfig.js';
import dbStore from '../src/utils/dbStore.js';

const runFileFilter = (upload, file) => new Promise((resolve) => {
    upload.fileFilter({}, file, (error, accepted) => {
        resolve({ error, accepted });
    });
});

describe('uploadConfig catalog image transport contracts', () => {
    it('keeps the request tenant context after multipart parsing completes', async () => {
        const observedContext = await new Promise((resolve) => {
            dbStore.run({ tenantId: 'tenant-image-upload' }, () => {
                const middleware = preserveTenantContext((req, res, next) => {
                    setImmediate(() => dbStore.run({ tenantId: 'default' }, next));
                });
                middleware({}, {}, () => resolve(dbStore.getStore()));
            });
        });

        expect(observedContext).toEqual({ tenantId: 'tenant-image-upload' });
    });

    it('keeps single-image and gallery uploads strict at transport', async () => {
        await expect(runFileFilter(posCatalogImageUpload, {
            fieldname: 'image',
            mimetype: 'text/plain'
        })).resolves.toEqual(expect.objectContaining({
            accepted: false,
            error: expect.objectContaining({ code: 'LIMIT_UNEXPECTED_FILE' })
        }));
        await expect(runFileFilter(storefrontCatalogImageUpload, {
            fieldname: 'image',
            mimetype: 'text/plain'
        })).resolves.toEqual(expect.objectContaining({
            accepted: false,
            error: expect.objectContaining({ code: 'LIMIT_UNEXPECTED_FILE' })
        }));
        await expect(runFileFilter(storefrontCatalogGalleryImageUpload, {
            fieldname: 'images',
            mimetype: 'text/plain'
        })).resolves.toEqual(expect.objectContaining({
            accepted: false,
            error: expect.objectContaining({ code: 'LIMIT_UNEXPECTED_FILE' })
        }));

        expect(posCatalogImageUpload.limits).toMatchObject({
            fileSize: CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES,
            files: 1
        });
        expect(storefrontCatalogImageUpload.limits).toMatchObject({
            fileSize: CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES,
            files: 1
        });
        expect(storefrontCatalogGalleryImageUpload.limits).toMatchObject({
            fileSize: CATALOG_SINGLE_IMAGE_SOURCE_MAX_BYTES,
            files: 10
        });
    });

    it('keeps bulk catalog uploads lenient at transport for per-file use-case validation', async () => {
        await expect(runFileFilter(posCatalogBulkImageUpload, {
            fieldname: 'images',
            mimetype: 'text/plain'
        })).resolves.toEqual({ error: null, accepted: true });
        await expect(runFileFilter(storefrontCatalogBulkImageUpload, {
            fieldname: 'images',
            mimetype: 'application/octet-stream'
        })).resolves.toEqual({ error: null, accepted: true });

        expect(posCatalogBulkImageUpload.limits).toMatchObject({
            fileSize: BULK_CATALOG_IMAGE_TRANSPORT_MAX_BYTES,
            files: BULK_CATALOG_IMAGE_TRANSPORT_MAX_FILES
        });
        expect(storefrontCatalogBulkImageUpload.limits).toMatchObject({
            fileSize: BULK_CATALOG_IMAGE_TRANSPORT_MAX_BYTES,
            files: BULK_CATALOG_IMAGE_TRANSPORT_MAX_FILES
        });
    });
});

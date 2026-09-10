import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    buildUploadStorefrontCatalogImageUseCase,
    buildUploadStorefrontCatalogGalleryImagesUseCase,
    buildUploadBulkStorefrontCatalogImagesUseCase,
    buildUpdateStorefrontCatalogGalleryUseCase,
    buildDeleteStorefrontCatalogGalleryImageUseCase,
    buildDeleteStorefrontCatalogImageUseCase,
    buildUpdateStorefrontCatalogOverrideUseCase,
    buildUpdateBulkStorefrontCatalogOverridesUseCase
} from '../src/modules/inventory/usecases/storefrontCatalogUseCases.js';

const editableUser = { is_master_admin: false, permissions: ['items:edit'] };
const PNG_BYTES = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D
]);
const JPEG_BYTES = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00]);

const writeTempUpload = async ({ prefix, bytes = PNG_BYTES }) => {
    const tempPath = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await fs.writeFile(tempPath, bytes);
    return tempPath;
};

const pathExists = async (filePath) => {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
};

const createBulkStorefrontRepository = ({ items = [], existing = null, readiness = null, updateError = null } = {}) => ({
    findItemsBySkuCodes: jest.fn().mockResolvedValue(items),
    findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue(existing),
    getStorefrontCatalogReadinessByItemId: jest.fn().mockResolvedValue(readiness || {
        storefront_readiness: {
            ready: true,
            checks: { has_sale_price: true },
            missing_requirements: []
        }
    }),
    updateStorefrontCatalogImage: updateError
        ? jest.fn().mockRejectedValue(updateError)
        : jest.fn().mockResolvedValue({ item_id: 1, storefront_image_url: '/uploads/image.png' })
});

describe('storefront catalog use cases', () => {
    it('updates storefront visibility without mutating POS catalog state', async () => {
        const upsertStorefrontCatalogOverride = jest.fn().mockResolvedValue({
            item_id: 77,
            storefront_visible: false
        });
        const useCase = buildUpdateStorefrontCatalogOverrideUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 77 }),
                upsertStorefrontCatalogOverride
            }
        });

        const result = await useCase({
            itemId: 77,
            payload: { storefront_visible: false },
            user: editableUser
        });

        expect(result).toEqual(expect.objectContaining({
            item_id: 77,
            storefront_visible: false
        }));
        expect(upsertStorefrontCatalogOverride).toHaveBeenCalledWith(77, {
            storefront_visible: false
        });
    });

    it('allows enabling storefront visibility when the item has an explicit sale price', async () => {
        const upsertStorefrontCatalogOverride = jest.fn().mockResolvedValue({
            item_id: 78,
            storefront_visible: true
        });
        const useCase = buildUpdateStorefrontCatalogOverrideUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 78,
                    name: 'Storefront-ready item',
                    default_sale_price: 125
                }),
                upsertStorefrontCatalogOverride
            }
        });

        const result = await useCase({
            itemId: 78,
            payload: { storefront_visible: true },
            user: editableUser
        });

        expect(result).toEqual(expect.objectContaining({
            item_id: 78,
            storefront_visible: true
        }));
        expect(upsertStorefrontCatalogOverride).toHaveBeenCalledWith(78, {
            storefront_visible: true
        });
    });

    it('updates storefront branch availability without requiring global visibility changes', async () => {
        const upsertStorefrontCatalogOverride = jest.fn();
        const upsertStorefrontItemLocationAvailability = jest.fn().mockResolvedValue([
            { item_id: 80, location_id: 2, storefront_available: false }
        ]);
        const listStorefrontItemLocationAvailability = jest.fn().mockResolvedValue(new Map([
            [80, [
                { location_id: 1, name: 'Main', storefront_available: true },
                { location_id: 2, name: 'Branch', storefront_available: false }
            ]]
        ]));
        const useCase = buildUpdateStorefrontCatalogOverrideUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 80,
                    name: 'Branch item',
                    default_sale_price: 125
                }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 80,
                    storefront_visible: true
                }),
                upsertStorefrontCatalogOverride,
                upsertStorefrontItemLocationAvailability,
                listStorefrontItemLocationAvailability
            }
        });

        const result = await useCase({
            itemId: 80,
            payload: {
                location_availability: [
                    { location_id: 2, storefront_available: false }
                ]
            },
            user: editableUser
        });

        expect(upsertStorefrontCatalogOverride).not.toHaveBeenCalled();
        expect(upsertStorefrontItemLocationAvailability).toHaveBeenCalledWith(80, [
            { location_id: 2, storefront_available: false }
        ]);
        expect(result.location_availability).toEqual([
            { location_id: 1, name: 'Main', storefront_available: true },
            { location_id: 2, name: 'Branch', storefront_available: false }
        ]);
    });

    it('commits visibility and branch availability in one transaction when both are patched', async () => {
        const transaction = {
            finished: false,
            commit: jest.fn(async function commit() { this.finished = 'commit'; }),
            rollback: jest.fn(async function rollback() { this.finished = 'rollback'; })
        };
        const upsertStorefrontCatalogOverride = jest.fn().mockResolvedValue({
            item_id: 81,
            storefront_visible: true
        });
        const upsertStorefrontItemLocationAvailability = jest.fn().mockResolvedValue([
            { item_id: 81, location_id: 2, storefront_available: false }
        ]);
        const listStorefrontItemLocationAvailability = jest.fn().mockResolvedValue(new Map([
            [81, [{ location_id: 2, name: 'Branch', storefront_available: false }]]
        ]));
        const useCase = buildUpdateStorefrontCatalogOverrideUseCase({
            itemRepository: {
                beginTransaction: jest.fn().mockResolvedValue(transaction),
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 81,
                    name: 'Visible branch item',
                    default_sale_price: 125
                }),
                upsertStorefrontCatalogOverride,
                upsertStorefrontItemLocationAvailability,
                listStorefrontItemLocationAvailability
            }
        });

        const result = await useCase({
            itemId: 81,
            payload: {
                storefront_visible: true,
                location_availability: [
                    { location_id: 2, storefront_available: false }
                ]
            },
            user: editableUser
        });

        expect(result).toEqual(expect.objectContaining({
            item_id: 81,
            storefront_visible: true,
            location_availability: [{ location_id: 2, name: 'Branch', storefront_available: false }]
        }));
        expect(upsertStorefrontCatalogOverride).toHaveBeenCalledWith(81, {
            storefront_visible: true
        }, { transaction });
        expect(upsertStorefrontItemLocationAvailability).toHaveBeenCalledWith(81, [
            { location_id: 2, storefront_available: false }
        ], { transaction });
        expect(transaction.commit).toHaveBeenCalled();
        expect(transaction.rollback).not.toHaveBeenCalled();
    });

    it('rolls back visibility when branch availability write fails in a combined patch', async () => {
        const transaction = {
            finished: false,
            commit: jest.fn(async function commit() { this.finished = 'commit'; }),
            rollback: jest.fn(async function rollback() { this.finished = 'rollback'; })
        };
        const useCase = buildUpdateStorefrontCatalogOverrideUseCase({
            itemRepository: {
                beginTransaction: jest.fn().mockResolvedValue(transaction),
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 82,
                    name: 'Rollback branch item',
                    default_sale_price: 125
                }),
                upsertStorefrontCatalogOverride: jest.fn().mockResolvedValue({
                    item_id: 82,
                    storefront_visible: true
                }),
                upsertStorefrontItemLocationAvailability: jest.fn().mockRejectedValue(new Error('branch write failed')),
                listStorefrontItemLocationAvailability: jest.fn()
            }
        });

        await expect(useCase({
            itemId: 82,
            payload: {
                storefront_visible: true,
                location_availability: [
                    { location_id: 2, storefront_available: false }
                ]
            },
            user: editableUser
        })).rejects.toThrow('branch write failed');

        expect(transaction.rollback).toHaveBeenCalled();
        expect(transaction.commit).not.toHaveBeenCalled();
    });

    it('blocks enabling storefront visibility when sale price is missing or zero', async () => {
        const upsertStorefrontCatalogOverride = jest.fn();
        const useCase = buildUpdateStorefrontCatalogOverrideUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 79,
                    name: 'Cost-only storefront item',
                    default_sale_price: 0,
                    cost_per_unit: 90
                }),
                upsertStorefrontCatalogOverride
            }
        });

        await expect(useCase({
            itemId: 79,
            payload: { storefront_visible: true },
            user: editableUser
        })).rejects.toMatchObject({
            code: 'VALIDATION_FAILED',
            statusCode: 422,
            details: expect.objectContaining({
                reason_code: 'STOREFRONT_READINESS_INCOMPLETE',
                missing_requirements: expect.arrayContaining([
                    expect.objectContaining({ code: 'SALE_PRICE_MISSING' })
                ])
            })
        });
        expect(upsertStorefrontCatalogOverride).not.toHaveBeenCalled();
    });

    it('bulk storefront visibility blocks price-less rows and never calls POS override writes', async () => {
        const upsertStorefrontCatalogOverride = jest.fn().mockResolvedValue({
            item_id: 501,
            storefront_visible: true
        });
        const updatePosCatalogOverride = jest.fn();
        const getStorefrontCatalogReadinessByItemId = jest.fn()
            .mockResolvedValueOnce({
                item_id: 501,
                storefront_readiness: { ready: true, missing_requirements: [] }
            })
            .mockResolvedValueOnce({
                item_id: 502,
                storefront_readiness: {
                    ready: false,
                    missing_requirements: [{ code: 'SALE_PRICE_MISSING', label: 'Set a customer price' }]
                }
            });
        const useCase = buildUpdateBulkStorefrontCatalogOverridesUseCase({
            itemRepository: {
                getStorefrontCatalogReadinessByItemId,
                upsertStorefrontCatalogOverride,
                updatePosCatalogOverride
            }
        });

        const result = await useCase({
            payload: { item_ids: [501, 502], storefront_visible: true },
            user: editableUser
        });

        expect(result.summary).toEqual({
            updated: 1,
            blocked: 1,
            not_found: 0,
            failed: 0
        });
        expect(result.results).toEqual(expect.arrayContaining([
            expect.objectContaining({ item_id: 501, status: 'updated' }),
            expect.objectContaining({ item_id: 502, status: 'blocked' })
        ]));
        expect(upsertStorefrontCatalogOverride).toHaveBeenCalledWith(501, {
            storefront_visible: true
        });
        expect(updatePosCatalogOverride).not.toHaveBeenCalled();
    });

    it('uploadStorefrontCatalogImage preserves an existing hidden storefront visibility flag', async () => {
        const tempPath = path.join(os.tmpdir(), `storefront-image-${Date.now()}.png`);
        await fs.writeFile(tempPath, Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D
        ]));

        const updateStorefrontCatalogImage = jest.fn().mockResolvedValue({
            item_id: 88,
            storefront_visible: false,
            storefront_image_url: '/uploads/storefront.png'
        });
        const useCase = buildUploadStorefrontCatalogImageUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 88 }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 88,
                    storefront_visible: false,
                    storefront_image_path: null
                }),
                updateStorefrontCatalogImage
            },
            imageStorage: {
                store: jest.fn().mockResolvedValue({ path: 'uploads/storefront.png', url: '/uploads/storefront.png' }),
                remove: jest.fn()
            }
        });

        const result = await useCase({
            itemId: 88,
            file: {
                path: tempPath,
                mimetype: 'image/png',
                originalname: 'storefront.png',
                size: 12
            },
            user: editableUser
        });

        expect(result).toEqual(expect.objectContaining({
            item_id: 88,
            storefront_visible: false
        }));
        expect(updateStorefrontCatalogImage).toHaveBeenCalledWith(88, {
            path: 'uploads/storefront.png',
            url: '/uploads/storefront.png',
            gallery: [{
                path: 'uploads/storefront.png',
                url: '/uploads/storefront.png',
                variants: null,
                original_path: null,
                classification: null,
                source: { type: 'manual_upload' }
            }]
        }, {
            keepVisible: false
        });

        await fs.rm(tempPath, { force: true });
    });

    it('uploadStorefrontCatalogImage blocks visible default items without a sale price', async () => {
        const tempPath = path.join(os.tmpdir(), `storefront-image-price-${Date.now()}.png`);
        await fs.writeFile(tempPath, Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D
        ]));

        const updateStorefrontCatalogImage = jest.fn();
        const store = jest.fn().mockResolvedValue({ path: 'uploads/storefront.png', url: '/uploads/storefront.png' });
        const useCase = buildUploadStorefrontCatalogImageUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 188,
                    name: 'Default visible missing price',
                    category: 'product',
                    product_type: 'finished_goods',
                    default_sale_price: 0,
                    cost_per_unit: 90
                }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue(null),
                getStorefrontCatalogReadinessByItemId: jest.fn().mockResolvedValue({
                    item_id: 188,
                    storefront_visible: true
                }),
                updateStorefrontCatalogImage
            },
            imageStorage: {
                store,
                remove: jest.fn()
            }
        });

        await expect(useCase({
            itemId: 188,
            file: {
                path: tempPath,
                mimetype: 'image/png',
                originalname: 'storefront.png',
                size: 12
            },
            user: editableUser
        })).rejects.toMatchObject({
            code: 'VALIDATION_FAILED',
            statusCode: 422,
            details: expect.objectContaining({
                reason_code: 'STOREFRONT_READINESS_INCOMPLETE',
                missing_requirements: expect.arrayContaining([
                    expect.objectContaining({ code: 'SALE_PRICE_MISSING' })
                ])
            })
        });

        expect(store).not.toHaveBeenCalled();
        expect(updateStorefrontCatalogImage).not.toHaveBeenCalled();

        await fs.rm(tempPath, { force: true });
    });

    it('uploadStorefrontCatalogImage removes a newly stored file when the catalog update fails', async () => {
        const tempPath = path.join(os.tmpdir(), `storefront-image-fail-${Date.now()}.png`);
        await fs.writeFile(tempPath, Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D
        ]));

        const remove = jest.fn().mockResolvedValue(undefined);
        const useCase = buildUploadStorefrontCatalogImageUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 89,
                    name: 'Visible item with price',
                    default_sale_price: 125
                }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 89,
                    storefront_visible: true,
                    storefront_image_path: 'storefront-catalog/tenant/old.png'
                }),
                updateStorefrontCatalogImage: jest.fn().mockRejectedValue(new Error('database unavailable'))
            },
            imageStorage: {
                store: jest.fn().mockResolvedValue({
                    path: 'storefront-catalog/tenant/new.png',
                    url: '/uploads/storefront-catalog/tenant/new.png'
                }),
                remove
            }
        });

        await expect(useCase({
            itemId: 89,
            file: {
                path: tempPath,
                mimetype: 'image/png',
                originalname: 'storefront.png',
                size: 12
            },
            user: editableUser
        })).rejects.toThrow('database unavailable');

        expect(remove).toHaveBeenCalledWith({ path: 'storefront-catalog/tenant/new.png' });
        expect(remove).not.toHaveBeenCalledWith({ path: 'storefront-catalog/tenant/old.png' });

        await fs.rm(tempPath, { force: true });
    });

    it('uploadStorefrontCatalogImage ignores the client manifest and extra parts entirely when image_client_conversion is "off" (Phase 298, #265)', async () => {
        const tempPath = await writeTempUpload({ prefix: 'storefront-gate-off' });
        const mediumPath = await writeTempUpload({ prefix: 'storefront-gate-off-medium' });
        const store = jest.fn().mockResolvedValue({
            path: 'storefront-catalog/tenant/gate-off.png',
            url: '/uploads/storefront-catalog/tenant/gate-off.png'
        });
        const settingsRepository = {
            getSettingsByKeys: jest.fn().mockResolvedValue({
                image_client_conversion: { value: 'off' }
            })
        };
        const useCase = buildUploadStorefrontCatalogImageUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 300, name: 'Gate off item', default_sale_price: 125 }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({ item_id: 300, storefront_visible: true, storefront_image_path: null }),
                updateStorefrontCatalogImage: jest.fn().mockResolvedValue({ item_id: 300, storefront_visible: true })
            },
            imageStorage: { store, remove: jest.fn() },
            settingsRepository
        });

        const result = await useCase({
            itemId: 300,
            files: {
                image: [{ path: tempPath, mimetype: 'image/png', originalname: 'menu.png', size: 12 }],
                image_medium: [{ path: mediumPath, mimetype: 'image/png', originalname: 'menu__medium.png', size: 12 }]
            },
            clientImageManifest: { sourceMimeHint: 'image/heic', largePreOptimized: true },
            user: editableUser
        });

        expect(result).toEqual(expect.objectContaining({ item_id: 300 }));
        expect(store).toHaveBeenCalledWith(expect.objectContaining({
            sourceMimeHint: null,
            acceptedAsClientLarge: false,
            clientVariantFiles: null,
            imageClientConversionState: 'off',
            imageClientConversionScope: 'storefront_catalog_single'
        }));

        await fs.rm(tempPath, { force: true });
        await fs.rm(mediumPath, { force: true });
    });

    it('uploadStorefrontCatalogImage ignores the manifest and extra parts when "opt_in" excludes storefront_catalog_single', async () => {
        const tempPath = await writeTempUpload({ prefix: 'storefront-gate-excluded' });
        const mediumPath = await writeTempUpload({ prefix: 'storefront-gate-excluded-medium' });
        const store = jest.fn().mockResolvedValue({
            path: 'storefront-catalog/tenant/gate-excluded.png',
            url: '/uploads/storefront-catalog/tenant/gate-excluded.png'
        });
        const settingsRepository = {
            getSettingsByKeys: jest.fn().mockResolvedValue({
                image_client_conversion: { value: 'opt_in' },
                image_client_conversion_scopes: { value: ['pos_catalog_single'] }
            })
        };
        const useCase = buildUploadStorefrontCatalogImageUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 301, name: 'Gate excluded item', default_sale_price: 125 }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({ item_id: 301, storefront_visible: true, storefront_image_path: null }),
                updateStorefrontCatalogImage: jest.fn().mockResolvedValue({ item_id: 301, storefront_visible: true })
            },
            imageStorage: { store, remove: jest.fn() },
            settingsRepository
        });

        const result = await useCase({
            itemId: 301,
            files: {
                image: [{ path: tempPath, mimetype: 'image/png', originalname: 'menu.png', size: 12 }],
                image_medium: [{ path: mediumPath, mimetype: 'image/png', originalname: 'menu__medium.png', size: 12 }]
            },
            clientImageManifest: { sourceMimeHint: 'image/heic', largePreOptimized: true },
            user: editableUser
        });

        expect(result).toEqual(expect.objectContaining({ item_id: 301 }));
        expect(store).toHaveBeenCalledWith(expect.objectContaining({
            sourceMimeHint: null,
            acceptedAsClientLarge: false,
            clientVariantFiles: null,
            imageClientConversionState: 'opt_in',
            imageClientConversionScope: 'storefront_catalog_single'
        }));

        await fs.rm(tempPath, { force: true });
        await fs.rm(mediumPath, { force: true });
    });

    it('uploadStorefrontCatalogImage accepts the client manifest and extra parts when "opt_in" includes storefront_catalog_single', async () => {
        const tempPath = await writeTempUpload({ prefix: 'storefront-gate-included' });
        const mediumPath = await writeTempUpload({ prefix: 'storefront-gate-included-medium' });
        const store = jest.fn().mockResolvedValue({
            path: 'storefront-catalog/tenant/gate-included.png',
            url: '/uploads/storefront-catalog/tenant/gate-included.png'
        });
        const settingsRepository = {
            getSettingsByKeys: jest.fn().mockResolvedValue({
                image_client_conversion: { value: 'opt_in' },
                image_client_conversion_scopes: { value: ['storefront_catalog_single'] }
            })
        };
        const useCase = buildUploadStorefrontCatalogImageUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 302, name: 'Gate included item', default_sale_price: 125 }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({ item_id: 302, storefront_visible: true, storefront_image_path: null }),
                updateStorefrontCatalogImage: jest.fn().mockResolvedValue({ item_id: 302, storefront_visible: true })
            },
            imageStorage: { store, remove: jest.fn() },
            settingsRepository
        });

        const result = await useCase({
            itemId: 302,
            files: {
                image: [{ path: tempPath, mimetype: 'image/png', originalname: 'menu.png', size: 12 }],
                image_medium: [{ path: mediumPath, mimetype: 'image/png', originalname: 'menu__medium.png', size: 12 }]
            },
            clientImageManifest: { sourceMimeHint: 'image/heic', largePreOptimized: true },
            user: editableUser
        });

        expect(result).toEqual(expect.objectContaining({ item_id: 302 }));
        expect(store).toHaveBeenCalledWith(expect.objectContaining({
            sourceMimeHint: 'image/heic',
            acceptedAsClientLarge: true,
            clientVariantFiles: { medium: { tempPath: mediumPath, reportedMime: 'image/png' } },
            imageClientConversionState: 'opt_in',
            imageClientConversionScope: 'storefront_catalog_single'
        }));

        await fs.rm(tempPath, { force: true });
        await fs.rm(mediumPath, { force: true });
    });

    it('uploadStorefrontCatalogImage gates closed (fail-safe) when no settingsRepository is provided', async () => {
        const tempPath = await writeTempUpload({ prefix: 'storefront-gate-no-repo' });
        const store = jest.fn().mockResolvedValue({
            path: 'storefront-catalog/tenant/gate-no-repo.png',
            url: '/uploads/storefront-catalog/tenant/gate-no-repo.png'
        });
        const useCase = buildUploadStorefrontCatalogImageUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 303, name: 'No repo item', default_sale_price: 125 }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({ item_id: 303, storefront_visible: true, storefront_image_path: null }),
                updateStorefrontCatalogImage: jest.fn().mockResolvedValue({ item_id: 303, storefront_visible: true })
            },
            imageStorage: { store, remove: jest.fn() }
            // settingsRepository intentionally omitted -- matches every pre-Phase-298 test above.
        });

        const result = await useCase({
            itemId: 303,
            file: { path: tempPath, mimetype: 'image/png', originalname: 'menu.png', size: 12 },
            user: editableUser
        });

        expect(result).toEqual(expect.objectContaining({ item_id: 303 }));
        expect(store).toHaveBeenCalledWith(expect.objectContaining({
            imageClientConversionState: 'off',
            imageClientConversionScope: 'storefront_catalog_single'
        }));

        await fs.rm(tempPath, { force: true });
    });

    it('uploadStorefrontCatalogGalleryImages appends new images and keeps the first existing image as primary', async () => {
        const firstTempPath = path.join(os.tmpdir(), `storefront-gallery-a-${Date.now()}.png`);
        const secondTempPath = path.join(os.tmpdir(), `storefront-gallery-b-${Date.now()}.png`);
        const pngHeader = Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D
        ]);
        await fs.writeFile(firstTempPath, pngHeader);
        await fs.writeFile(secondTempPath, pngHeader);

        const updateStorefrontCatalogImage = jest.fn().mockResolvedValue({
            item_id: 90,
            storefront_visible: true,
            storefront_image_url: '/uploads/old-primary.png',
            storefront_image_gallery: [
                { url: '/uploads/old-primary.png', is_primary: true, sort_order: 0 },
                { url: '/uploads/old-second.png', is_primary: false, sort_order: 1 },
                { url: '/uploads/storefront-catalog/tenant/first.png', is_primary: false, sort_order: 2 },
                { url: '/uploads/storefront-catalog/tenant/second.png', is_primary: false, sort_order: 3 }
            ]
        });
        const store = jest.fn()
            .mockResolvedValueOnce({ path: 'storefront-catalog/tenant/first.png', url: '/uploads/storefront-catalog/tenant/first.png' })
            .mockResolvedValueOnce({ path: 'storefront-catalog/tenant/second.png', url: '/uploads/storefront-catalog/tenant/second.png' });
        const remove = jest.fn().mockResolvedValue(undefined);
        const useCase = buildUploadStorefrontCatalogGalleryImagesUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 90,
                    name: 'Gallery item',
                    default_sale_price: 125
                }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 90,
                    storefront_visible: true,
                    storefront_image_path: 'storefront-catalog/tenant/old-primary.png',
                    storefront_image_gallery: [
                        { path: 'storefront-catalog/tenant/old-primary.png', url: '/uploads/old-primary.png', is_primary: true, sort_order: 0 },
                        { path: 'storefront-catalog/tenant/old-second.png', url: '/uploads/old-second.png', is_primary: false, sort_order: 1 }
                    ]
                }),
                updateStorefrontCatalogImage
            },
            imageStorage: { store, remove }
        });

        const result = await useCase({
            itemId: 90,
            files: [
                { path: firstTempPath, mimetype: 'image/png', originalname: 'first.png', size: 12 },
                { path: secondTempPath, mimetype: 'image/png', originalname: 'second.png', size: 12 }
            ],
            user: editableUser
        });

        expect(result).toEqual(expect.objectContaining({
            item_id: 90,
            storefront_image_url: '/uploads/old-primary.png'
        }));
        expect(updateStorefrontCatalogImage).toHaveBeenCalledWith(90, {
            path: 'storefront-catalog/tenant/old-primary.png',
            url: '/uploads/old-primary.png',
            gallery: [
                {
                    path: 'storefront-catalog/tenant/old-primary.png',
                    url: '/uploads/old-primary.png',
                    variants: null,
                    original_path: null,
                    classification: null,
                    source: null,
                    is_primary: true,
                    sort_order: 0
                },
                {
                    path: 'storefront-catalog/tenant/old-second.png',
                    url: '/uploads/old-second.png',
                    variants: null,
                    original_path: null,
                    classification: null,
                    source: null,
                    is_primary: false,
                    sort_order: 1
                },
                {
                    path: 'storefront-catalog/tenant/first.png',
                    url: '/uploads/storefront-catalog/tenant/first.png',
                    variants: null,
                    original_path: null,
                    classification: null,
                    source: null,
                    is_primary: false,
                    sort_order: 2
                },
                {
                    path: 'storefront-catalog/tenant/second.png',
                    url: '/uploads/storefront-catalog/tenant/second.png',
                    variants: null,
                    original_path: null,
                    classification: null,
                    source: null,
                    is_primary: false,
                    sort_order: 3
                }
            ]
        }, {
            keepVisible: true
        });
        expect(remove).not.toHaveBeenCalled();

        await fs.rm(firstTempPath, { force: true });
        await fs.rm(secondTempPath, { force: true });
    });

    it('uploadStorefrontCatalogGalleryImages applies an edit gallery intent atomically', async () => {
        const tempPath = await writeTempUpload({ prefix: 'storefront-gallery-intent' });
        const updateStorefrontCatalogImage = jest.fn().mockResolvedValue({
            item_id: 94,
            storefront_visible: true,
            storefront_image_url: '/uploads/new-primary.png',
            storefront_image_gallery: []
        });
        const remove = jest.fn().mockResolvedValue(undefined);
        const useCase = buildUploadStorefrontCatalogGalleryImagesUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 94, name: 'Intent item', default_sale_price: 125 }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 94,
                    storefront_visible: true,
                    storefront_image_path: 'storefront-catalog/tenant/old-primary.png',
                    storefront_image_gallery: [
                        { path: 'storefront-catalog/tenant/old-primary.png', url: '/uploads/old-primary.png' },
                        { path: 'storefront-catalog/tenant/old-keep.png', url: '/uploads/old-keep.png' }
                    ]
                }),
                updateStorefrontCatalogImage
            },
            imageStorage: {
                store: jest.fn().mockResolvedValue({
                    path: 'storefront-catalog/tenant/new-primary.png',
                    url: '/uploads/new-primary.png'
                }),
                remove
            }
        });

        await useCase({
            itemId: 94,
            files: [{
                path: tempPath,
                key: 'new.png|12|7|image/png',
                mimetype: 'image/png',
                originalname: 'new.png',
                size: PNG_BYTES.length
            }],
            galleryIntent: {
                base_keys: ['storefront-catalog/tenant/old-primary.png', 'storefront-catalog/tenant/old-keep.png'],
                pending_keys: ['new.png|12|7|image/png'],
                entries: [
                    { type: 'pending', key: 'new.png|12|7|image/png' },
                    { type: 'saved', path: 'storefront-catalog/tenant/old-keep.png', url: '/uploads/old-keep.png' }
                ]
            },
            user: editableUser
        });

        expect(updateStorefrontCatalogImage).toHaveBeenCalledWith(94, expect.objectContaining({
            path: 'storefront-catalog/tenant/new-primary.png',
            url: '/uploads/new-primary.png',
            gallery: [
                expect.objectContaining({ path: 'storefront-catalog/tenant/new-primary.png', is_primary: true, sort_order: 0 }),
                expect.objectContaining({ path: 'storefront-catalog/tenant/old-keep.png', is_primary: false, sort_order: 1 })
            ]
        }), expect.objectContaining({ keepVisible: true }));
        expect(remove).toHaveBeenCalledWith({ path: 'storefront-catalog/tenant/old-primary.png' });

        await fs.rm(tempPath, { force: true });
    });

    it('rejects an edit gallery intent when the saved gallery changed after the editor opened', async () => {
        const tempPath = await writeTempUpload({ prefix: 'storefront-gallery-intent-stale' });
        const store = jest.fn();
        const useCase = buildUploadStorefrontCatalogGalleryImagesUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 96, name: 'Stale intent item', default_sale_price: 125 }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 96,
                    storefront_visible: true,
                    storefront_image_gallery: [
                        { path: 'storefront-catalog/tenant/changed.png', url: '/uploads/changed.png' }
                    ]
                }),
                updateStorefrontCatalogImage: jest.fn()
            },
            imageStorage: { store, remove: jest.fn() }
        });

        await expect(useCase({
            itemId: 96,
            files: [{ path: tempPath, key: 'new.png|12|7|image/png', mimetype: 'image/png', originalname: 'new.png', size: PNG_BYTES.length }],
            galleryIntent: {
                base_keys: ['storefront-catalog/tenant/original.png'],
                pending_keys: ['new.png|12|7|image/png'],
                entries: [{ type: 'pending', key: 'new.png|12|7|image/png' }]
            },
            user: editableUser
        })).rejects.toMatchObject({
            code: 'CONFLICT',
            statusCode: 409,
            details: { reason_code: 'STOREFRONT_GALLERY_STALE' }
        });

        expect(store).not.toHaveBeenCalled();
        expect(await pathExists(tempPath)).toBe(false);
    });

    it('rejects an empty-base edit intent when another upload filled the gallery', async () => {
        const tempPath = await writeTempUpload({ prefix: 'storefront-gallery-intent-empty-stale' });
        const store = jest.fn();
        const useCase = buildUploadStorefrontCatalogGalleryImagesUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 97, name: 'Empty stale intent item', default_sale_price: 125 }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 97,
                    storefront_visible: true,
                    storefront_image_gallery: [{ path: 'storefront-catalog/tenant/other.png', url: '/uploads/other.png' }]
                }),
                updateStorefrontCatalogImage: jest.fn()
            },
            imageStorage: { store, remove: jest.fn() }
        });

        await expect(useCase({
            itemId: 97,
            files: [{ path: tempPath, key: 'new.png|12|7|image/png', mimetype: 'image/png', originalname: 'new.png', size: PNG_BYTES.length }],
            galleryIntent: {
                base_keys: [],
                pending_keys: ['new.png|12|7|image/png'],
                entries: [{ type: 'pending', key: 'new.png|12|7|image/png' }]
            },
            user: editableUser
        })).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });

        expect(store).not.toHaveBeenCalled();
        expect(await pathExists(tempPath)).toBe(false);
    });

    it('uploadStorefrontCatalogGalleryImages appends to legacy primary-only image rows', async () => {
        const tempPath = await writeTempUpload({ prefix: 'storefront-gallery-legacy-primary' });
        const updateStorefrontCatalogImage = jest.fn().mockResolvedValue({
            item_id: 91,
            storefront_visible: true,
            storefront_image_url: '/uploads/legacy-primary.png',
            storefront_image_gallery: [
                { path: 'storefront-catalog/tenant/legacy-primary.png', url: '/uploads/legacy-primary.png', is_primary: true, sort_order: 0 },
                { path: 'storefront-catalog/tenant/new.png', url: '/uploads/storefront-catalog/tenant/new.png', is_primary: false, sort_order: 1 }
            ]
        });
        const useCase = buildUploadStorefrontCatalogGalleryImagesUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 91,
                    name: 'Legacy primary item',
                    default_sale_price: 125
                }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 91,
                    storefront_visible: true,
                    storefront_image_path: 'storefront-catalog/tenant/legacy-primary.png',
                    storefront_image_url: '/uploads/legacy-primary.png',
                    storefront_image_gallery: null
                }),
                updateStorefrontCatalogImage
            },
            imageStorage: {
                store: jest.fn().mockResolvedValue({
                    path: 'storefront-catalog/tenant/new.png',
                    url: '/uploads/storefront-catalog/tenant/new.png'
                }),
                remove: jest.fn()
            }
        });

        await useCase({
            itemId: 91,
            files: [{ path: tempPath, mimetype: 'image/png', originalname: 'new.png', size: PNG_BYTES.length }],
            user: editableUser
        });

        expect(updateStorefrontCatalogImage).toHaveBeenCalledWith(91, {
            path: 'storefront-catalog/tenant/legacy-primary.png',
            url: '/uploads/legacy-primary.png',
            gallery: [
                {
                    path: 'storefront-catalog/tenant/legacy-primary.png',
                    url: '/uploads/legacy-primary.png',
                    variants: null,
                    original_path: null,
                    classification: null,
                    source: null,
                    is_primary: true,
                    sort_order: 0
                },
                {
                    path: 'storefront-catalog/tenant/new.png',
                    url: '/uploads/storefront-catalog/tenant/new.png',
                    variants: null,
                    original_path: null,
                    classification: null,
                    source: null,
                    is_primary: false,
                    sort_order: 1
                }
            ]
        }, {
            keepVisible: true
        });

        await fs.rm(tempPath, { force: true });
    });

    it('uploadStorefrontCatalogGalleryImages appends to database JSON string galleries', async () => {
        const tempPath = await writeTempUpload({ prefix: 'storefront-gallery-json-string' });
        const updateStorefrontCatalogImage = jest.fn().mockResolvedValue({
            item_id: 92,
            storefront_visible: true,
            storefront_image_url: '/uploads/primary.png',
            storefront_image_gallery: [
                { path: 'storefront-catalog/tenant/primary.png', url: '/uploads/primary.png', is_primary: true, sort_order: 0 },
                { path: 'storefront-catalog/tenant/second.png', url: '/uploads/second.png', is_primary: false, sort_order: 1 },
                { path: 'storefront-catalog/tenant/third.png', url: '/uploads/storefront-catalog/tenant/third.png', is_primary: false, sort_order: 2 }
            ]
        });
        const useCase = buildUploadStorefrontCatalogGalleryImagesUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 92,
                    name: 'JSON string gallery item',
                    default_sale_price: 125
                }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 92,
                    storefront_visible: true,
                    storefront_image_path: 'storefront-catalog/tenant/primary.png',
                    storefront_image_url: '/uploads/primary.png',
                    storefront_image_gallery: JSON.stringify([
                        { path: 'storefront-catalog/tenant/primary.png', url: '/uploads/primary.png', is_primary: true, sort_order: 0 },
                        { path: 'storefront-catalog/tenant/second.png', url: '/uploads/second.png', is_primary: false, sort_order: 1 }
                    ])
                }),
                updateStorefrontCatalogImage
            },
            imageStorage: {
                store: jest.fn().mockResolvedValue({
                    path: 'storefront-catalog/tenant/third.png',
                    url: '/uploads/storefront-catalog/tenant/third.png'
                }),
                remove: jest.fn()
            }
        });

        await useCase({
            itemId: 92,
            files: [{ path: tempPath, mimetype: 'image/png', originalname: 'third.png', size: PNG_BYTES.length }],
            user: editableUser
        });

        expect(updateStorefrontCatalogImage).toHaveBeenCalledWith(92, {
            path: 'storefront-catalog/tenant/primary.png',
            url: '/uploads/primary.png',
            gallery: [
                {
                    path: 'storefront-catalog/tenant/primary.png',
                    url: '/uploads/primary.png',
                    variants: null,
                    original_path: null,
                    classification: null,
                    source: null,
                    is_primary: true,
                    sort_order: 0
                },
                {
                    path: 'storefront-catalog/tenant/second.png',
                    url: '/uploads/second.png',
                    variants: null,
                    original_path: null,
                    classification: null,
                    source: null,
                    is_primary: false,
                    sort_order: 1
                },
                {
                    path: 'storefront-catalog/tenant/third.png',
                    url: '/uploads/storefront-catalog/tenant/third.png',
                    variants: null,
                    original_path: null,
                    classification: null,
                    source: null,
                    is_primary: false,
                    sort_order: 2
                }
            ]
        }, {
            keepVisible: true
        });

        await fs.rm(tempPath, { force: true });
    });

    it('classifies image processing failures with a safe diagnostic code and cleans the upload', async () => {
        const tempPath = await writeTempUpload({ prefix: 'storefront-gallery-processing-error' });
        const store = jest.fn().mockRejectedValue(new Error('Input image exceeds pixel limit'));
        const remove = jest.fn();
        const useCase = buildUploadStorefrontCatalogGalleryImagesUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 94,
                    name: 'Processing error item',
                    default_sale_price: 125
                }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue(null),
                getStorefrontCatalogReadinessByItemId: jest.fn().mockResolvedValue({
                    storefront_visible: true
                }),
                updateStorefrontCatalogImage: jest.fn()
            },
            imageStorage: { store, remove }
        });

        await expect(useCase({
            itemId: 94,
            files: [{ path: tempPath, mimetype: 'image/png', originalname: 'large.png', size: PNG_BYTES.length }],
            user: editableUser
        })).rejects.toMatchObject({
            code: 'STOREFRONT_IMAGE_PROCESSING_FAILED',
            statusCode: 500,
            details: { reason_code: 'STOREFRONT_IMAGE_PROCESSING_FAILED', item_id: 94 },
            cause: expect.objectContaining({ message: 'Input image exceeds pixel limit' })
        });

        expect(await pathExists(tempPath)).toBe(false);
        expect(remove).not.toHaveBeenCalled();
    });

    it('classifies gallery persistence failures separately and removes stored assets', async () => {
        const tempPath = await writeTempUpload({ prefix: 'storefront-gallery-persist-error' });
        const stored = {
            path: 'storefront-catalog/tenant/persist-error.png',
            url: '/uploads/persist-error.png'
        };
        const store = jest.fn().mockResolvedValue(stored);
        const remove = jest.fn().mockResolvedValue(undefined);
        const updateStorefrontCatalogImage = jest.fn().mockRejectedValue(new Error('Database unavailable'));
        const useCase = buildUploadStorefrontCatalogGalleryImagesUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 95,
                    name: 'Persistence error item',
                    default_sale_price: 125
                }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue(null),
                getStorefrontCatalogReadinessByItemId: jest.fn().mockResolvedValue({
                    storefront_visible: true
                }),
                updateStorefrontCatalogImage
            },
            imageStorage: { store, remove }
        });

        await expect(useCase({
            itemId: 95,
            files: [{ path: tempPath, mimetype: 'image/png', originalname: 'persist-error.png', size: PNG_BYTES.length }],
            user: editableUser
        })).rejects.toMatchObject({
            code: 'STOREFRONT_IMAGE_PERSIST_FAILED',
            statusCode: 500,
            details: { reason_code: 'STOREFRONT_IMAGE_PERSIST_FAILED', item_id: 95 },
            cause: expect.objectContaining({ message: 'Database unavailable' })
        });

        expect(remove).toHaveBeenCalledWith({ path: stored.path });
        expect(await pathExists(tempPath)).toBe(false);
    });

    it('uploadStorefrontCatalogGalleryImages rejects requests that exceed five total item images', async () => {
        const store = jest.fn();
        const updateStorefrontCatalogImage = jest.fn();
        const useCase = buildUploadStorefrontCatalogGalleryImagesUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({
                    item_id: 93,
                    name: 'Gallery capped item',
                    default_sale_price: 125
                }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 93,
                    storefront_visible: true,
                    storefront_image_path: 'storefront-catalog/tenant/one.png',
                    storefront_image_url: '/uploads/one.png',
                    storefront_image_gallery: [
                        { path: 'storefront-catalog/tenant/one.png', url: '/uploads/one.png', is_primary: true, sort_order: 0 },
                        { path: 'storefront-catalog/tenant/two.png', url: '/uploads/two.png', is_primary: false, sort_order: 1 },
                        { path: 'storefront-catalog/tenant/three.png', url: '/uploads/three.png', is_primary: false, sort_order: 2 },
                        { path: 'storefront-catalog/tenant/four.png', url: '/uploads/four.png', is_primary: false, sort_order: 3 }
                    ]
                }),
                updateStorefrontCatalogImage
            },
            imageStorage: { store, remove: jest.fn() }
        });

        await expect(useCase({
            itemId: 93,
            files: [
                { mimetype: 'image/png', originalname: 'five.png', size: PNG_BYTES.length },
                { mimetype: 'image/png', originalname: 'six.png', size: PNG_BYTES.length }
            ],
            user: editableUser
        })).rejects.toThrow('Item image gallery is limited to 5 images per item.');

        expect(store).not.toHaveBeenCalled();
        expect(updateStorefrontCatalogImage).not.toHaveBeenCalled();
    });

    it('updateStorefrontCatalogGallery reorders an existing gallery and removes omitted files', async () => {
        const upsertStorefrontCatalogOverride = jest.fn().mockResolvedValue({
            item_id: 90,
            storefront_image_url: '/uploads/second.png',
            storefront_image_gallery: [
                { path: 'storefront-catalog/tenant/second.png', url: '/uploads/second.png', is_primary: true, sort_order: 0 },
                { path: 'storefront-catalog/tenant/first.png', url: '/uploads/first.png', is_primary: false, sort_order: 1 }
            ]
        });
        const remove = jest.fn().mockResolvedValue(undefined);
        const useCase = buildUpdateStorefrontCatalogGalleryUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 90, name: 'Gallery item', default_sale_price: 125 }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 90,
                    storefront_image_path: 'storefront-catalog/tenant/first.png',
                    storefront_image_gallery: [
                        { path: 'storefront-catalog/tenant/first.png', url: '/uploads/first.png', is_primary: true, sort_order: 0 },
                        { path: 'storefront-catalog/tenant/second.png', url: '/uploads/second.png', is_primary: false, sort_order: 1 },
                        { path: 'storefront-catalog/tenant/third.png', url: '/uploads/third.png', is_primary: false, sort_order: 2 }
                    ]
                }),
                upsertStorefrontCatalogOverride
            },
            imageStorage: { remove }
        });

        const result = await useCase({
            itemId: 90,
            payload: {
                gallery: [
                    { path: 'storefront-catalog/tenant/second.png', url: '/uploads/second.png' },
                    { path: 'storefront-catalog/tenant/first.png', url: '/uploads/first.png' }
                ]
            },
            user: editableUser
        });

        expect(result.storefront_image_url).toBe('/uploads/second.png');
        expect(upsertStorefrontCatalogOverride).toHaveBeenCalledWith(90, expect.objectContaining({
            storefront_image_path: 'storefront-catalog/tenant/second.png',
            storefront_image_url: '/uploads/second.png',
            storefront_image_gallery: [
                { path: 'storefront-catalog/tenant/second.png', url: '/uploads/second.png', variants: null, original_path: null, classification: null, source: null, is_primary: true, sort_order: 0 },
                { path: 'storefront-catalog/tenant/first.png', url: '/uploads/first.png', variants: null, original_path: null, classification: null, source: null, is_primary: false, sort_order: 1 }
            ]
        }));
        expect(remove).toHaveBeenCalledWith({ path: 'storefront-catalog/tenant/third.png' });
    });

    it('updateStorefrontCatalogGallery cleans omitted assets only after the atomic commit succeeds', async () => {
        const commitStorefrontCatalogGallery = jest.fn().mockResolvedValue({
            data: {
                item_id: 93,
                storefront_image_gallery: [{
                    path: 'storefront-catalog/tenant/first.png',
                    url: '/uploads/first.png'
                }]
            },
            previousGallery: [
                { path: 'storefront-catalog/tenant/first.png', url: '/uploads/first.png' },
                { path: 'storefront-catalog/tenant/second.png', url: '/uploads/second.png' }
            ],
            committedGallery: [
                { path: 'storefront-catalog/tenant/first.png', url: '/uploads/first.png' }
            ]
        });
        const remove = jest.fn().mockResolvedValue(undefined);
        const useCase = buildUpdateStorefrontCatalogGalleryUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 93, name: 'Atomic gallery item' }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 93,
                    storefront_image_path: 'storefront-catalog/tenant/first.png',
                    storefront_image_gallery: [
                        { path: 'storefront-catalog/tenant/first.png', url: '/uploads/first.png' },
                        { path: 'storefront-catalog/tenant/second.png', url: '/uploads/second.png' }
                    ]
                }),
                commitStorefrontCatalogGallery
            },
            imageStorage: { remove }
        });

        await useCase({
            itemId: 93,
            payload: {
                gallery: [{ path: 'storefront-catalog/tenant/first.png', url: '/uploads/first.png' }],
                expected_gallery_keys: [
                    'storefront-catalog/tenant/first.png',
                    'storefront-catalog/tenant/second.png'
                ]
            },
            user: editableUser
        });

        expect(commitStorefrontCatalogGallery).toHaveBeenCalledWith(93, expect.objectContaining({
            storefront_image_gallery: expect.any(Array)
        }), expect.objectContaining({
            expectedGalleryKeys: [
                'storefront-catalog/tenant/first.png',
                'storefront-catalog/tenant/second.png'
            ],
            allowNewEntries: false
        }));
        expect(remove).toHaveBeenCalledWith({ path: 'storefront-catalog/tenant/second.png' });
    });

    it('does not delete existing assets when the atomic gallery commit fails', async () => {
        const commitStorefrontCatalogGallery = jest.fn().mockRejectedValue(new Error('database unavailable'));
        const remove = jest.fn().mockResolvedValue(undefined);
        const useCase = buildUpdateStorefrontCatalogGalleryUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 94, name: 'Failed gallery item' }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 94,
                    storefront_image_path: 'storefront-catalog/tenant/old.png',
                    storefront_image_gallery: [{
                        path: 'storefront-catalog/tenant/old.png',
                        url: '/uploads/old.png'
                    }]
                }),
                commitStorefrontCatalogGallery
            },
            imageStorage: { remove }
        });

        await expect(useCase({
            itemId: 94,
            payload: { gallery: [], expected_gallery_keys: ['storefront-catalog/tenant/old.png'] },
            user: editableUser
        })).rejects.toThrow('database unavailable');
        expect(remove).not.toHaveBeenCalled();
    });

    it('keeps a successful gallery commit successful when post-commit cleanup fails', async () => {
        const commitStorefrontCatalogGallery = jest.fn().mockResolvedValue({
            data: { item_id: 95, storefront_image_gallery: [] },
            previousGallery: [{ path: 'storefront-catalog/tenant/old.png', url: '/uploads/old.png' }],
            committedGallery: []
        });
        const remove = jest.fn().mockRejectedValue(new Error('storage temporarily unavailable'));
        const useCase = buildUpdateStorefrontCatalogGalleryUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 95, name: 'Cleanup retry item' }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 95,
                    storefront_image_path: 'storefront-catalog/tenant/old.png',
                    storefront_image_gallery: [{
                        path: 'storefront-catalog/tenant/old.png',
                        url: '/uploads/old.png'
                    }]
                }),
                commitStorefrontCatalogGallery
            },
            imageStorage: { remove }
        });

        await expect(useCase({
            itemId: 95,
            payload: { gallery: [], expected_gallery_keys: ['storefront-catalog/tenant/old.png'] },
            user: editableUser
        })).resolves.toEqual({ item_id: 95, storefront_image_gallery: [] });
    });

    it('deleteStorefrontCatalogGalleryImage removes one image and promotes the next first image', async () => {
        const upsertStorefrontCatalogOverride = jest.fn().mockResolvedValue({
            item_id: 90,
            storefront_image_url: '/uploads/second.png'
        });
        const remove = jest.fn().mockResolvedValue(undefined);
        const useCase = buildDeleteStorefrontCatalogGalleryImageUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 90, name: 'Gallery item' }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 90,
                    storefront_image_path: 'storefront-catalog/tenant/first.png',
                    storefront_image_gallery: [
                        { path: 'storefront-catalog/tenant/first.png', url: '/uploads/first.png', is_primary: true, sort_order: 0 },
                        { path: 'storefront-catalog/tenant/second.png', url: '/uploads/second.png', is_primary: false, sort_order: 1 }
                    ]
                }),
                upsertStorefrontCatalogOverride,
                clearStorefrontCatalogImage: jest.fn()
            },
            imageStorage: { remove }
        });

        await useCase({ itemId: 90, imageIndex: 0, user: editableUser });

        expect(upsertStorefrontCatalogOverride).toHaveBeenCalledWith(90, expect.objectContaining({
            storefront_image_path: 'storefront-catalog/tenant/second.png',
            storefront_image_url: '/uploads/second.png',
            storefront_image_gallery: [
                { path: 'storefront-catalog/tenant/second.png', url: '/uploads/second.png', variants: null, original_path: null, classification: null, source: null, is_primary: true, sort_order: 0 }
            ]
        }));
        expect(remove).toHaveBeenCalledWith({ path: 'storefront-catalog/tenant/first.png' });
    });

    it('deleteStorefrontCatalogGalleryImage removes legacy primary-only image rows by index zero', async () => {
        const clearStorefrontCatalogImage = jest.fn().mockResolvedValue({
            item_id: 92,
            storefront_image_url: null,
            storefront_image_gallery: null
        });
        const remove = jest.fn().mockResolvedValue(undefined);
        const useCase = buildDeleteStorefrontCatalogGalleryImageUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 92, name: 'Legacy gallery item' }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 92,
                    storefront_image_path: 'storefront-catalog/tenant/legacy-primary.png',
                    storefront_image_url: '/uploads/legacy-primary.png',
                    storefront_image_gallery: null
                }),
                upsertStorefrontCatalogOverride: jest.fn(),
                clearStorefrontCatalogImage
            },
            imageStorage: { remove }
        });

        await useCase({ itemId: 92, imageIndex: 0, user: editableUser });

        expect(clearStorefrontCatalogImage).toHaveBeenCalledWith(92);
        expect(remove).toHaveBeenCalledWith({ path: 'storefront-catalog/tenant/legacy-primary.png' });
    });

    it('uploadBulkStorefrontCatalogImages blocks visible price-less rows per file', async () => {
        const tempPath = path.join(os.tmpdir(), `bulk-storefront-price-${Date.now()}.png`);
        await fs.writeFile(tempPath, Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D
        ]));
        const store = jest.fn();
        const updateStorefrontCatalogImage = jest.fn();
        const useCase = buildUploadBulkStorefrontCatalogImagesUseCase({
            itemRepository: {
                findItemsBySkuCodes: jest.fn().mockResolvedValue([{
                    item_id: 601,
                    sku_code: 'SF-601',
                    category: 'product',
                    product_type: 'finished_goods',
                    status: 'active',
                    default_sale_price: 0
                }]),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue(null),
                getStorefrontCatalogReadinessByItemId: jest.fn().mockResolvedValue({
                    item_id: 601,
                    storefront_readiness: {
                        ready: false,
                        checks: { has_sale_price: false },
                        missing_requirements: [{ code: 'SALE_PRICE_MISSING', label: 'Set a customer price' }]
                    }
                }),
                updateStorefrontCatalogImage
            },
            imageStorage: {
                store,
                remove: jest.fn()
            }
        });

        const result = await useCase({
            files: [{ path: tempPath, mimetype: 'image/png', originalname: 'SF-601.png', size: 12 }],
            user: editableUser
        });

        expect(result.summary).toMatchObject({
            uploaded: 0,
            blocked_readiness: 1
        });
        expect(result.results).toEqual([
            expect.objectContaining({
                item_id: 601,
                status: 'blocked_readiness',
                readiness_snapshot: expect.objectContaining({
                    missing_requirements: expect.arrayContaining([
                        expect.objectContaining({ code: 'SALE_PRICE_MISSING' })
                    ])
                })
            })
        ]);
        expect(store).not.toHaveBeenCalled();
        expect(updateStorefrontCatalogImage).not.toHaveBeenCalled();
    });

    it('uploadBulkStorefrontCatalogImages rejects unsupported MIME per file and removes temp upload', async () => {
        const tempPath = await writeTempUpload({
            prefix: 'bulk-storefront-unsupported',
            bytes: Buffer.from('not an image', 'utf8')
        });
        const store = jest.fn();
        const itemRepository = createBulkStorefrontRepository({
            items: [{ item_id: 701, sku_code: 'SF-701', default_sale_price: 100 }]
        });
        const useCase = buildUploadBulkStorefrontCatalogImagesUseCase({
            itemRepository,
            imageStorage: { store, remove: jest.fn() }
        });

        const result = await useCase({
            files: [{ path: tempPath, mimetype: 'text/plain', originalname: 'SF-701.txt', size: 12 }],
            user: editableUser
        });

        expect(result.summary).toMatchObject({ uploaded: 0, failed: 1 });
        expect(result.results).toEqual([
            expect.objectContaining({ filename: 'SF-701.txt', item_id: 701, status: 'failed' })
        ]);
        expect(store).not.toHaveBeenCalled();
        expect(await pathExists(tempPath)).toBe(false);
    });

    it('uploadBulkStorefrontCatalogImages rejects MIME/signature mismatch per file and removes temp upload', async () => {
        const tempPath = await writeTempUpload({ prefix: 'bulk-storefront-mismatch', bytes: JPEG_BYTES });
        const store = jest.fn();
        const itemRepository = createBulkStorefrontRepository({
            items: [{ item_id: 702, sku_code: 'SF-702', default_sale_price: 100 }]
        });
        const useCase = buildUploadBulkStorefrontCatalogImagesUseCase({
            itemRepository,
            imageStorage: { store, remove: jest.fn() }
        });

        const result = await useCase({
            files: [{ path: tempPath, mimetype: 'image/png', originalname: 'SF-702.png', size: JPEG_BYTES.length }],
            user: editableUser
        });

        expect(result.summary).toMatchObject({ uploaded: 0, failed: 1 });
        expect(result.results).toEqual([
            expect.objectContaining({ filename: 'SF-702.png', item_id: 702, status: 'failed' })
        ]);
        expect(store).not.toHaveBeenCalled();
        expect(await pathExists(tempPath)).toBe(false);
    });

    it('uploadBulkStorefrontCatalogImages rejects oversize images per file and removes temp upload', async () => {
        const tempPath = await writeTempUpload({ prefix: 'bulk-storefront-oversize' });
        const store = jest.fn();
        const itemRepository = createBulkStorefrontRepository({
            items: [{ item_id: 703, sku_code: 'SF-703', default_sale_price: 100 }]
        });
        const useCase = buildUploadBulkStorefrontCatalogImagesUseCase({
            itemRepository,
            imageStorage: { store, remove: jest.fn() }
        });

        const result = await useCase({
            files: [{ path: tempPath, mimetype: 'image/png', originalname: 'SF-703.png', size: 10 * 1024 * 1024 + 1 }],
            user: editableUser
        });

        expect(result.summary).toMatchObject({ uploaded: 0, failed: 1 });
        expect(result.results).toEqual([
            expect.objectContaining({ filename: 'SF-703.png', item_id: 703, status: 'failed' })
        ]);
        expect(store).not.toHaveBeenCalled();
        expect(await pathExists(tempPath)).toBe(false);
    });

    it('uploadBulkStorefrontCatalogImages uploads valid files while rejecting invalid batch peers', async () => {
        const validTempPath = await writeTempUpload({ prefix: 'bulk-storefront-valid' });
        const invalidTempPath = await writeTempUpload({
            prefix: 'bulk-storefront-invalid-peer',
            bytes: Buffer.from('not an image', 'utf8')
        });
        const store = jest.fn().mockResolvedValue({
            path: 'storefront-catalog/tenant/sf-704.png',
            url: '/uploads/storefront-catalog/tenant/sf-704.png'
        });
        const itemRepository = createBulkStorefrontRepository({
            items: [
                { item_id: 704, sku_code: 'SF-704', default_sale_price: 100 },
                { item_id: 705, sku_code: 'SF-705', default_sale_price: 100 }
            ]
        });
        const useCase = buildUploadBulkStorefrontCatalogImagesUseCase({
            itemRepository,
            imageStorage: { store, remove: jest.fn() }
        });

        const result = await useCase({
            files: [
                { path: validTempPath, mimetype: 'image/png', originalname: 'SF-704.png', size: PNG_BYTES.length },
                { path: invalidTempPath, mimetype: 'text/plain', originalname: 'SF-705.txt', size: 12 }
            ],
            user: editableUser
        });

        expect(result.summary).toMatchObject({ uploaded: 1, failed: 1 });
        expect(result.results).toEqual(expect.arrayContaining([
            expect.objectContaining({ filename: 'SF-704.png', item_id: 704, status: 'uploaded' }),
            expect.objectContaining({ filename: 'SF-705.txt', item_id: 705, status: 'failed' })
        ]));
        expect(store).toHaveBeenCalledTimes(1);
        expect(store).toHaveBeenCalledWith(expect.objectContaining({
            itemId: 704,
            tempPath: validTempPath
        }));
        expect(await pathExists(invalidTempPath)).toBe(false);
        await fs.rm(validTempPath, { force: true });
    });

    it('uploadBulkStorefrontCatalogImages removes newly stored files and temp uploads after write failure', async () => {
        const tempPath = await writeTempUpload({ prefix: 'bulk-storefront-write-failure' });
        const remove = jest.fn().mockResolvedValue(undefined);
        const itemRepository = createBulkStorefrontRepository({
            items: [{ item_id: 706, sku_code: 'SF-706', default_sale_price: 100 }],
            updateError: new Error('catalog write failed')
        });
        const useCase = buildUploadBulkStorefrontCatalogImagesUseCase({
            itemRepository,
            imageStorage: {
                store: jest.fn().mockResolvedValue({
                    path: 'storefront-catalog/tenant/sf-706.png',
                    url: '/uploads/storefront-catalog/tenant/sf-706.png'
                }),
                remove
            }
        });

        const result = await useCase({
            files: [{ path: tempPath, mimetype: 'image/png', originalname: 'SF-706.png', size: PNG_BYTES.length }],
            user: editableUser
        });

        expect(result.summary).toMatchObject({ uploaded: 0, failed: 1 });
        expect(result.results).toEqual([
            expect.objectContaining({
                filename: 'SF-706.png',
                item_id: 706,
                status: 'failed',
                errors: ['catalog write failed']
            })
        ]);
        expect(remove).toHaveBeenCalledWith({ path: 'storefront-catalog/tenant/sf-706.png' });
        expect(await pathExists(tempPath)).toBe(false);
    });

    // Phase 301 (#265): the <SKU>__<variant>.<ext> bulk correlation convention -- section 5 of
    // the corrected plan. A bare <SKU>.<ext> file is already covered by every test above this
    // point (unchanged behavior); these cover the new suffix-driven grouping specifically.
    it('uploadBulkStorefrontCatalogImages combines <SKU>__large/medium/thumbnail siblings into one store() call when the gate is "on"', async () => {
        const largePath = await writeTempUpload({ prefix: 'bulk-sf-variant-large' });
        const mediumPath = await writeTempUpload({ prefix: 'bulk-sf-variant-medium' });
        const thumbnailPath = await writeTempUpload({ prefix: 'bulk-sf-variant-thumb' });
        const store = jest.fn().mockResolvedValue({
            path: 'storefront-catalog/tenant/sf-800.webp',
            url: '/uploads/storefront-catalog/tenant/sf-800.webp'
        });
        const itemRepository = createBulkStorefrontRepository({
            items: [{ item_id: 800, sku_code: 'SF-800', default_sale_price: 100 }]
        });
        const settingsRepository = {
            getSettingsByKeys: jest.fn().mockResolvedValue({
                image_client_conversion: { value: 'on' }
            })
        };
        const useCase = buildUploadBulkStorefrontCatalogImagesUseCase({
            itemRepository,
            imageStorage: { store, remove: jest.fn() },
            settingsRepository
        });

        const result = await useCase({
            files: [
                { path: largePath, mimetype: 'image/png', originalname: 'SF-800__large.png', size: PNG_BYTES.length },
                { path: mediumPath, mimetype: 'image/png', originalname: 'SF-800__medium.png', size: PNG_BYTES.length },
                { path: thumbnailPath, mimetype: 'image/png', originalname: 'SF-800__thumbnail.png', size: PNG_BYTES.length }
            ],
            user: editableUser
        });

        expect(result.summary).toMatchObject({ uploaded: 1, failed: 0, unmatched: 0 });
        expect(store).toHaveBeenCalledTimes(1);
        expect(store).toHaveBeenCalledWith({
            itemId: 800,
            originalName: 'SF-800__large.png',
            reportedMime: 'image/png',
            tempPath: largePath,
            acceptedAsClientLarge: true,
            clientVariantFiles: {
                medium: { tempPath: mediumPath, reportedMime: 'image/png' },
                thumbnail: { tempPath: thumbnailPath, reportedMime: 'image/png' }
            },
            imageClientConversionState: 'on',
            imageClientConversionScope: 'storefront_catalog_bulk'
        });
        expect(result.results).toEqual(expect.arrayContaining([
            expect.objectContaining({ filename: 'SF-800__large.png', variant_key: 'large', status: 'uploaded' }),
            expect.objectContaining({ filename: 'SF-800__medium.png', variant_key: 'medium', status: 'uploaded' }),
            expect.objectContaining({ filename: 'SF-800__thumbnail.png', variant_key: 'thumbnail', status: 'uploaded' })
        ]));
    });

    // #1643 (298d, Finding 3): the bulk gate-check block below mirrors the four single-image gate
    // cases above (lines ~499-634) applied to the bulk usecase -- closed, opt_in-excluded,
    // opt_in-included, and unconditionally-on. Before this, a `<SKU>__large/medium` filename was
    // honored unconditionally regardless of `image_client_conversion`.
    it('uploadBulkStorefrontCatalogImages forces acceptedAsClientLarge/clientVariantFiles off when image_client_conversion is "off"', async () => {
        const largePath = await writeTempUpload({ prefix: 'bulk-sf-gate-off-large' });
        const mediumPath = await writeTempUpload({ prefix: 'bulk-sf-gate-off-medium' });
        const store = jest.fn().mockResolvedValue({
            path: 'storefront-catalog/tenant/sf-810.webp',
            url: '/uploads/storefront-catalog/tenant/sf-810.webp'
        });
        const itemRepository = createBulkStorefrontRepository({
            items: [{ item_id: 810, sku_code: 'SF-810', default_sale_price: 100 }]
        });
        const settingsRepository = {
            getSettingsByKeys: jest.fn().mockResolvedValue({
                image_client_conversion: { value: 'off' }
            })
        };
        const useCase = buildUploadBulkStorefrontCatalogImagesUseCase({
            itemRepository,
            imageStorage: { store, remove: jest.fn() },
            settingsRepository
        });

        const result = await useCase({
            files: [
                { path: largePath, mimetype: 'image/png', originalname: 'SF-810__large.png', size: PNG_BYTES.length },
                { path: mediumPath, mimetype: 'image/png', originalname: 'SF-810__medium.png', size: PNG_BYTES.length }
            ],
            user: editableUser
        });

        expect(result.summary).toMatchObject({ uploaded: 1, failed: 0 });
        expect(store).toHaveBeenCalledWith(expect.objectContaining({
            itemId: 810,
            acceptedAsClientLarge: false,
            clientVariantFiles: null,
            imageClientConversionState: 'off',
            imageClientConversionScope: 'storefront_catalog_bulk'
        }));
        // The physical variant labeling is unaffected by the gate -- the medium file is still
        // reported as 'medium' even though its bytes were never sent to imageStorage.store().
        expect(result.results).toEqual(expect.arrayContaining([
            expect.objectContaining({ filename: 'SF-810__medium.png', variant_key: 'medium', status: 'uploaded' })
        ]));
    });

    it('uploadBulkStorefrontCatalogImages forces off when "opt_in" excludes storefront_catalog_bulk', async () => {
        const largePath = await writeTempUpload({ prefix: 'bulk-sf-gate-excluded-large' });
        const store = jest.fn().mockResolvedValue({
            path: 'storefront-catalog/tenant/sf-811.webp',
            url: '/uploads/storefront-catalog/tenant/sf-811.webp'
        });
        const itemRepository = createBulkStorefrontRepository({
            items: [{ item_id: 811, sku_code: 'SF-811', default_sale_price: 100 }]
        });
        const settingsRepository = {
            getSettingsByKeys: jest.fn().mockResolvedValue({
                image_client_conversion: { value: 'opt_in' },
                image_client_conversion_scopes: { value: ['pos_catalog_bulk'] }
            })
        };
        const useCase = buildUploadBulkStorefrontCatalogImagesUseCase({
            itemRepository,
            imageStorage: { store, remove: jest.fn() },
            settingsRepository
        });

        const result = await useCase({
            files: [{ path: largePath, mimetype: 'image/png', originalname: 'SF-811__large.png', size: PNG_BYTES.length }],
            user: editableUser
        });

        expect(result.summary).toMatchObject({ uploaded: 1 });
        expect(store).toHaveBeenCalledWith(expect.objectContaining({
            itemId: 811,
            acceptedAsClientLarge: false,
            clientVariantFiles: null,
            imageClientConversionState: 'opt_in',
            imageClientConversionScope: 'storefront_catalog_bulk'
        }));
    });

    it('uploadBulkStorefrontCatalogImages honors the filename when "opt_in" includes storefront_catalog_bulk', async () => {
        const largePath = await writeTempUpload({ prefix: 'bulk-sf-gate-included-large' });
        const store = jest.fn().mockResolvedValue({
            path: 'storefront-catalog/tenant/sf-812.webp',
            url: '/uploads/storefront-catalog/tenant/sf-812.webp'
        });
        const itemRepository = createBulkStorefrontRepository({
            items: [{ item_id: 812, sku_code: 'SF-812', default_sale_price: 100 }]
        });
        const settingsRepository = {
            getSettingsByKeys: jest.fn().mockResolvedValue({
                image_client_conversion: { value: 'opt_in' },
                image_client_conversion_scopes: { value: ['storefront_catalog_bulk'] }
            })
        };
        const useCase = buildUploadBulkStorefrontCatalogImagesUseCase({
            itemRepository,
            imageStorage: { store, remove: jest.fn() },
            settingsRepository
        });

        const result = await useCase({
            files: [{ path: largePath, mimetype: 'image/png', originalname: 'SF-812__large.png', size: PNG_BYTES.length }],
            user: editableUser
        });

        expect(result.summary).toMatchObject({ uploaded: 1 });
        expect(store).toHaveBeenCalledWith(expect.objectContaining({
            itemId: 812,
            acceptedAsClientLarge: true,
            clientVariantFiles: null,
            imageClientConversionState: 'opt_in',
            imageClientConversionScope: 'storefront_catalog_bulk'
        }));
    });

    it('uploadBulkStorefrontCatalogImages flags two <SKU>__large files for the same SKU as duplicate_variant_for_sku', async () => {
        const firstPath = await writeTempUpload({ prefix: 'bulk-sf-dup-variant-a' });
        const secondPath = await writeTempUpload({ prefix: 'bulk-sf-dup-variant-b' });
        const store = jest.fn();
        const itemRepository = createBulkStorefrontRepository({ items: [] });
        const useCase = buildUploadBulkStorefrontCatalogImagesUseCase({
            itemRepository,
            imageStorage: { store, remove: jest.fn() }
        });

        const result = await useCase({
            files: [
                { path: firstPath, mimetype: 'image/png', originalname: 'SF-801__large.png', size: PNG_BYTES.length },
                { path: secondPath, mimetype: 'image/png', originalname: 'SF-801__large.jpg', size: PNG_BYTES.length }
            ],
            user: editableUser
        });

        expect(result.summary).toMatchObject({ duplicate_variant_for_sku: 2, duplicate_filename: 0, uploaded: 0 });
        expect(result.results).toEqual(expect.arrayContaining([
            expect.objectContaining({ filename: 'SF-801__large.png', status: 'duplicate_variant_for_sku' }),
            expect.objectContaining({ filename: 'SF-801__large.jpg', status: 'duplicate_variant_for_sku' })
        ]));
        expect(store).not.toHaveBeenCalled();
        expect(await pathExists(firstPath)).toBe(false);
        expect(await pathExists(secondPath)).toBe(false);
    });

    it('deleteStorefrontCatalogImage removes primary and gallery files before clearing only storefront image fields', async () => {
        const remove = jest.fn().mockResolvedValue(undefined);
        const clearStorefrontCatalogImage = jest.fn().mockResolvedValue({
            item_id: 99,
            storefront_visible: false,
            storefront_image_url: null
        });
        const useCase = buildDeleteStorefrontCatalogImageUseCase({
            itemRepository: {
                getItemById: jest.fn().mockResolvedValue({ item_id: 99, name: 'Catalog item' }),
                findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({
                    item_id: 99,
                    storefront_visible: false,
                    storefront_image_path: 'uploads/storefront/old.png',
                    storefront_image_gallery: [
                        { path: 'uploads/storefront/old.png', url: '/uploads/storefront/old.png', is_primary: true, sort_order: 0 },
                        { path: 'uploads/storefront/second.png', url: '/uploads/storefront/second.png', is_primary: false, sort_order: 1 }
                    ]
                }),
                clearStorefrontCatalogImage
            },
            imageStorage: {
                remove
            }
        });

        const result = await useCase({ itemId: 99, user: editableUser });

        expect(result).toEqual(expect.objectContaining({
            item_id: 99,
            storefront_visible: false,
            storefront_image_url: null
        }));
        expect(clearStorefrontCatalogImage).toHaveBeenCalledWith(99);
        expect(remove).toHaveBeenCalledWith({ path: 'uploads/storefront/old.png' });
        expect(remove).toHaveBeenCalledWith({ path: 'uploads/storefront/second.png' });
        expect(remove).toHaveBeenCalledTimes(2);
    });
});

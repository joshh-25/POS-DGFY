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

    it('deleteStorefrontCatalogGalleryImage removes one image and promotes the next first image', async () => {
        const upsertStorefrontCatalogOverride = jest.fn().mockResolvedValue({
            item_id: 90,
            storefront_image_url: '/uploads/second.png'
        });
        const remove = jest.fn().mockResolvedValue(undefined);
        const useCase = buildDeleteStorefrontCatalogGalleryImageUseCase({
            itemRepository: {
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

    it('deleteStorefrontCatalogImage removes primary and gallery files before clearing only storefront image fields', async () => {
        const remove = jest.fn().mockResolvedValue(undefined);
        const clearStorefrontCatalogImage = jest.fn().mockResolvedValue({
            item_id: 99,
            storefront_visible: false,
            storefront_image_url: null
        });
        const useCase = buildDeleteStorefrontCatalogImageUseCase({
            itemRepository: {
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

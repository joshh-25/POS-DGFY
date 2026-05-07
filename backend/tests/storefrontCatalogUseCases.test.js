import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    buildUploadStorefrontCatalogImageUseCase,
    buildDeleteStorefrontCatalogImageUseCase,
    buildUpdateStorefrontCatalogOverrideUseCase
} from '../src/modules/inventory/usecases/storefrontCatalogUseCases.js';

const editableUser = { is_master_admin: false, permissions: ['items:edit'] };

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
            url: '/uploads/storefront.png'
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

    it('deleteStorefrontCatalogImage clears only storefront image fields', async () => {
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
                    storefront_image_path: 'uploads/storefront/old.png'
                }),
                clearStorefrontCatalogImage
            },
            imageStorage: {
                remove: jest.fn().mockResolvedValue(undefined)
            }
        });

        const result = await useCase({ itemId: 99, user: editableUser });

        expect(result).toEqual(expect.objectContaining({
            item_id: 99,
            storefront_visible: false,
            storefront_image_url: null
        }));
        expect(clearStorefrontCatalogImage).toHaveBeenCalledWith(99);
    });
});

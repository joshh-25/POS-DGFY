import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import dbStore from '../src/utils/dbStore.js';
import { itemRepository } from '../src/modules/inventory/repositories/itemRepository.js';
import { createStorefrontCatalogImageStorage } from '../src/modules/inventory/repositories/storefrontCatalogImageStorage.js';
import { buildUploadStorefrontCatalogImageUseCase } from '../src/modules/inventory/usecases/storefrontCatalogUseCases.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const API_ROOT = path.resolve(__dirname, '..');
const UPLOADS_ROOT = path.join(API_ROOT, 'uploads');
const editableUser = { is_master_admin: false, permissions: ['items:edit'] };

const createStatefulStorefrontOverrideModel = () => {
    let record = null;

    const toRecord = (payload) => {
        const instance = {
            ...payload,
            async update(nextPayload) {
                Object.assign(instance, nextPayload);
                return instance;
            },
            toJSON() {
                const { update, toJSON, ...plain } = instance;
                return plain;
            }
        };
        return instance;
    };

    return {
        model: {
            findOne: jest.fn(async () => record),
            create: jest.fn(async (payload) => {
                record = toRecord(payload);
                return record;
            })
        },
        getRecord: () => record
    };
};

describe('storefront catalog single-image persistence integration', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('persists one optimized upload as exactly one gallery image after reopening the item', async () => {
        const tenantId = `single-image-${Date.now()}`;
        const tenantUploadRoot = path.join(UPLOADS_ROOT, 'storefront-catalog', tenantId);
        const tempPath = path.join(API_ROOT, `single-image-${Date.now()}.png`);
        const overrideState = createStatefulStorefrontOverrideModel();
        const localStorage = createStorefrontCatalogImageStorage();
        let storedImage = null;

        await sharp({
            create: {
                width: 640,
                height: 480,
                channels: 4,
                background: { r: 30, g: 90, b: 160, alpha: 1 }
            }
        }).png().toFile(tempPath);
        const sourceStat = await fs.stat(tempPath);

        jest.spyOn(dbStore, 'get').mockImplementation((name) => {
            if (name === 'StorefrontCatalogOverride') return overrideState.model;
            return {};
        });
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId });
        jest.spyOn(itemRepository, 'getStorefrontCatalogReadinessByItemId').mockResolvedValue({
            storefront_visible: true
        });

        const repositoryFacade = {
            getItemById: jest.fn().mockResolvedValue({
                item_id: 177,
                name: 'Single image item',
                default_sale_price: 100
            }),
            findStorefrontCatalogOverrideByItemId: (...args) => (
                itemRepository.findStorefrontCatalogOverrideByItemId(...args)
            ),
            getStorefrontCatalogReadinessByItemId: (...args) => (
                itemRepository.getStorefrontCatalogReadinessByItemId(...args)
            ),
            updateStorefrontCatalogImage: (...args) => itemRepository.updateStorefrontCatalogImage(...args)
        };
        const imageStorage = {
            async store(payload) {
                storedImage = await localStorage.store(payload);
                return storedImage;
            },
            remove: (payload) => localStorage.remove(payload)
        };
        const uploadImage = buildUploadStorefrontCatalogImageUseCase({
            itemRepository: repositoryFacade,
            imageStorage
        });

        try {
            await uploadImage({
                itemId: 177,
                file: {
                    path: tempPath,
                    mimetype: 'image/png',
                    originalname: 'single-image.png',
                    size: sourceStat.size
                },
                user: editableUser
            });

            const reopened = await itemRepository.findStorefrontCatalogOverrideByItemId(177);
            const plain = reopened.toJSON();

            expect(storedImage).toBeTruthy();
            expect(plain.storefront_image_path).toBe(storedImage.path);
            expect(plain.storefront_image_url).toBe(storedImage.url);
            expect(plain.storefront_image_gallery).toHaveLength(1);
            expect(plain.storefront_image_gallery[0]).toEqual(expect.objectContaining({
                path: storedImage.path,
                url: storedImage.url,
                is_primary: true,
                sort_order: 0
            }));
            expect(plain.optimization_version).toBe(2);
            expect(plain.processing_status).toBe('optimized');

            const assetDirectories = await fs.readdir(tenantUploadRoot);
            expect(assetDirectories).toHaveLength(1);
        } finally {
            await fs.rm(tempPath, { force: true });
            const resolvedTenantUploadRoot = path.resolve(tenantUploadRoot);
            const resolvedStorefrontRoot = path.resolve(UPLOADS_ROOT, 'storefront-catalog');
            if (resolvedTenantUploadRoot.startsWith(`${resolvedStorefrontRoot}${path.sep}`)) {
                await fs.rm(resolvedTenantUploadRoot, { recursive: true, force: true });
            }
        }
    });
});

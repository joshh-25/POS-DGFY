import { jest } from '@jest/globals';

// ITEM_IMAGE_GENERATION_ENABLED is captured at module import time (see
// config/itemImageFeature.js), not re-read per call — these env vars must be
// set before storefrontCatalogUseCases.js (which imports that config) is
// first imported. The "generation disabled" gate is covered separately in
// storefrontCatalogGenerateImageUseCases.disabled.test.js, which imports
// fresh with no flag set, since a single process can't un-capture this.
process.env.ITEM_IMAGE_GENERATION_ENABLED = 'true';
process.env.OPENAI_API_KEY = 'test-key';
process.env.REDIS_URL = 'redis://localhost:6379';

const { buildGenerateItemImageUseCase, buildBulkGenerateItemImageUseCase } = await import(
    '../src/modules/inventory/usecases/storefrontCatalogUseCases.js'
);

const editableUser = { user_id: 9, tenant_id: 'tenant-1', is_master_admin: false, permissions: ['items:edit'] };
const nonEditableUser = { user_id: 9, tenant_id: 'tenant-1', is_master_admin: false, permissions: ['items:import'] };

describe('buildGenerateItemImageUseCase (#197)', () => {
    it('rejects a non-positive-integer itemId', async () => {
        const useCase = buildGenerateItemImageUseCase({ itemRepository: { getItemById: jest.fn() } });
        await expect(useCase({ itemId: 'abc', user: editableUser })).rejects.toMatchObject({ code: expect.any(String) });
    });

    it('rejects a user without items:edit', async () => {
        const useCase = buildGenerateItemImageUseCase({ itemRepository: { getItemById: jest.fn() } });
        await expect(useCase({ itemId: 5, user: nonEditableUser })).rejects.toThrow(/permission/);
    });

    it('rejects when the item does not exist', async () => {
        const useCase = buildGenerateItemImageUseCase({ itemRepository: { getItemById: jest.fn().mockResolvedValue(null) } });
        await expect(useCase({ itemId: 5, user: editableUser })).rejects.toThrow(/was not found/);
    });

    it('resolves item fields and a generation_user with explicit permissions on success', async () => {
        const item = { item_id: 5, name: 'Sisig', description: 'Pork sisig', product_folder: 'Mains', toJSON() { return this; } };
        const useCase = buildGenerateItemImageUseCase({ itemRepository: { getItemById: jest.fn().mockResolvedValue(item) } });

        const result = await useCase({ itemId: 5, user: editableUser });

        expect(result).toEqual({
            item_id: 5,
            name: 'Sisig',
            description: 'Pork sisig',
            category: 'Mains',
            generation_user: {
                user_id: 9,
                tenant_id: 'tenant-1',
                is_master_admin: false,
                permissions: expect.arrayContaining(['items:edit'])
            }
        });
    });
});

describe('buildBulkGenerateItemImageUseCase (#197)', () => {
    it('rejects an empty itemIds array', async () => {
        const useCase = buildBulkGenerateItemImageUseCase({ itemRepository: {} });
        await expect(useCase({ itemIds: [], user: editableUser })).rejects.toThrow(/non-empty array/);
    });

    it('rejects a user without items:edit', async () => {
        const useCase = buildBulkGenerateItemImageUseCase({ itemRepository: {} });
        await expect(useCase({ itemIds: [1, 2], user: nonEditableUser })).rejects.toThrow(/permission/);
    });

    it('marks a missing item not_found, and defaults to skipping an item that already has a photo', async () => {
        const items = {
            1: { item_id: 1, name: 'Adobo', description: null, product_folder: 'Mains', toJSON() { return this; } },
            2: { item_id: 2, name: 'Halo-Halo', description: null, product_folder: 'Desserts', toJSON() { return this; } }
        };
        const itemRepository = {
            getItemById: jest.fn((id) => Promise.resolve(items[id] || null)),
            findStorefrontCatalogOverrideByItemId: jest.fn((id) => Promise.resolve(
                id === 2 ? { storefront_image_path: 'existing/path.webp' } : null
            ))
        };
        const useCase = buildBulkGenerateItemImageUseCase({ itemRepository });

        const result = await useCase({ itemIds: [1, 2, 3], user: editableUser });

        expect(result.candidates).toEqual([
            expect.objectContaining({ item_id: 1, status: 'eligible', name: 'Adobo', category: 'Mains' }),
            expect.objectContaining({ item_id: 2, status: 'skipped', reason: 'has_existing_photo' }),
            { item_id: 3, status: 'not_found' }
        ]);
        expect(result.generation_user.permissions).toEqual(expect.arrayContaining(['items:edit']));
    });

    it('includes an item with an existing photo as eligible when overwriteExisting is true', async () => {
        const itemRepository = {
            getItemById: jest.fn().mockResolvedValue({ item_id: 2, name: 'Halo-Halo', description: null, product_folder: 'Desserts', toJSON() { return this; } }),
            findStorefrontCatalogOverrideByItemId: jest.fn().mockResolvedValue({ storefront_image_path: 'existing/path.webp' })
        };
        const useCase = buildBulkGenerateItemImageUseCase({ itemRepository });

        const result = await useCase({ itemIds: [2], overwriteExisting: true, user: editableUser });

        expect(result.candidates).toEqual([
            expect.objectContaining({ item_id: 2, status: 'eligible' })
        ]);
    });
});

import { jest } from '@jest/globals';

// Deliberately does NOT set ITEM_IMAGE_GENERATION_ENABLED — this file
// verifies the disabled gate on a fresh module import, since the flag is
// captured at import time (config/itemImageFeature.js), not re-read per
// call. The enabled-path scenarios live in the sibling
// storefrontCatalogGenerateImageUseCases.test.js.

const { buildGenerateItemImageUseCase, buildBulkGenerateItemImageUseCase } = await import(
    '../src/modules/inventory/usecases/storefrontCatalogUseCases.js'
);

const editableUser = { user_id: 9, tenant_id: 'tenant-1', is_master_admin: false, permissions: ['items:edit'] };

describe('generate-image use cases with ITEM_IMAGE_GENERATION_ENABLED unset (#197)', () => {
    it('buildGenerateItemImageUseCase rejects before touching the repository', async () => {
        const getItemById = jest.fn();
        const useCase = buildGenerateItemImageUseCase({ itemRepository: { getItemById } });

        await expect(useCase({ itemId: 5, user: editableUser })).rejects.toThrow(/not enabled/);
        expect(getItemById).not.toHaveBeenCalled();
    });

    it('buildBulkGenerateItemImageUseCase rejects before touching the repository', async () => {
        const getItemById = jest.fn();
        const useCase = buildBulkGenerateItemImageUseCase({ itemRepository: { getItemById } });

        await expect(useCase({ itemIds: [5], user: editableUser })).rejects.toThrow(/not enabled/);
        expect(getItemById).not.toHaveBeenCalled();
    });
});

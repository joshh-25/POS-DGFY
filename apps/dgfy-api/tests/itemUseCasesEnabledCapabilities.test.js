import { jest } from '@jest/globals';
import { buildCreateItemUseCase } from '../src/modules/inventory/usecases/createItemUseCase.js';
import { buildUpdateItemUseCase } from '../src/modules/inventory/usecases/updateItemUseCase.js';
import { buildFinalizeItemUseCase } from '../src/modules/inventory/usecases/finalizeItemUseCase.js';

// Phase 6: the item create/update/finalize use cases must resolve the tenant's
// enabled_capabilities overlay alongside the workflow mode and pass it through
// to validateItemAgainstModeTaxonomy, so a composed capability can unlock a
// cross-mode preset (e.g. a retail-mode tenant that has enabled `services`
// can create a service-category item).

describe('item use cases resolve the enabled_capabilities overlay for taxonomy validation', () => {
    it('createItemUseCase rejects a service item on a retail tenant with no overlay resolver provided (default stays [])', async () => {
        const itemRepository = { createItem: jest.fn().mockResolvedValue({ item_id: 1 }) };
        const useCase = buildCreateItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('retail')
        });

        await expect(useCase({
            itemData: { category: 'service', unit_of_measure: 'service' },
            userId: 1
        })).rejects.toThrow(/does not support category/i);
        expect(itemRepository.createItem).not.toHaveBeenCalled();
    });

    it('createItemUseCase unlocks a cross-mode preset when resolveEnabledCapabilities grants it', async () => {
        const itemRepository = { createItem: jest.fn().mockResolvedValue({ item_id: 1 }) };
        const resolveEnabledCapabilities = jest.fn().mockResolvedValue(['services']);
        const useCase = buildCreateItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('retail'),
            resolveEnabledCapabilities
        });

        await useCase({
            itemData: { category: 'service', unit_of_measure: 'service' },
            userId: 1
        });

        expect(resolveEnabledCapabilities).toHaveBeenCalledTimes(1);
        expect(itemRepository.createItem).toHaveBeenCalledWith(
            expect.objectContaining({ category: 'service', mode_item_preset: 'service' }),
            1,
            expect.any(Object)
        );
    });

    it('updateItemUseCase resolves mode and capabilities concurrently with the existing item fetch', async () => {
        const itemRepository = {
            getItemById: jest.fn().mockResolvedValue({ item_id: 5, status: 'active', category: 'service', unit_of_measure: 'service' }),
            updateItem: jest.fn().mockResolvedValue({ item_id: 5 })
        };
        const resolveEnabledCapabilities = jest.fn().mockResolvedValue(['services']);
        const useCase = buildUpdateItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('retail'),
            resolveEnabledCapabilities
        });

        await useCase({ itemId: 5, itemData: { description: 'updated' }, userId: 1 });

        expect(resolveEnabledCapabilities).toHaveBeenCalledTimes(1);
        expect(itemRepository.updateItem).toHaveBeenCalled();
    });

    it('finalizeItemUseCase threads enabledCapabilities into taxonomy validation', async () => {
        const itemRepository = {
            getItemById: jest.fn().mockResolvedValue({
                item_id: 9,
                status: 'draft',
                wizard_metadata: { category: 'service', unit_of_measure: 'service' }
            }),
            finalizeItem: jest.fn().mockResolvedValue({ item_id: 9 })
        };
        const resolveEnabledCapabilities = jest.fn().mockResolvedValue(['services']);
        const useCase = buildFinalizeItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('retail'),
            resolveEnabledCapabilities
        });

        await useCase({ itemId: 9, itemData: { category: 'service', unit_of_measure: 'service' }, userId: 1 });

        expect(resolveEnabledCapabilities).toHaveBeenCalledTimes(1);
        expect(itemRepository.finalizeItem).toHaveBeenCalled();
    });
});

import { jest } from '@jest/globals';
import { buildCreateItemUseCase } from '../src/modules/inventory/usecases/createItemUseCase.js';
import { buildUpdateItemUseCase } from '../src/modules/inventory/usecases/updateItemUseCase.js';

describe('inventory item mode taxonomy use cases', () => {
    it('blocks invalid new Services items before persistence', async () => {
        const itemRepository = {
            createItem: jest.fn()
        };
        const useCase = buildCreateItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('services')
        });

        await expect(useCase({
            itemData: {
                category: 'service',
                unit_of_measure: 'kg'
            },
            userId: 1
        })).rejects.toThrow(/does not support unit_of_measure/i);

        expect(itemRepository.createItem).not.toHaveBeenCalled();
    });

    it('allows legacy edit-only updates without forcing recategorization', async () => {
        const itemRepository = {
            getItemById: jest.fn().mockResolvedValue({
                item_id: 7,
                status: 'active',
                category: 'raw_material',
                product_type: null,
                unit_of_measure: 'kg'
            }),
            updateItem: jest.fn().mockResolvedValue({ item_id: 7 })
        };
        const useCase = buildUpdateItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('msme')
        });

        const result = await useCase({
            itemId: 7,
            itemData: { description: 'legacy row note' },
            userId: 1
        });

        expect(result).toEqual({ item_id: 7 });
        expect(itemRepository.updateItem).toHaveBeenCalledWith(7, { description: 'legacy row note' }, 1);
    });

    it('persists inferred corrected-mode preset when creating new F&B items', async () => {
        const itemRepository = {
            createItem: jest.fn().mockResolvedValue({ item_id: 8 })
        };
        const useCase = buildCreateItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('fnb')
        });

        await useCase({
            itemData: {
                category: 'product',
                product_type: 'finished_goods',
                unit_of_measure: 'serving'
            },
            userId: 1
        });

        expect(itemRepository.createItem).toHaveBeenCalledWith(
            expect.objectContaining({ mode_item_preset: 'menu_item' }),
            1,
            { canManageCategories: false }
        );
    });

    it('rejects mismatched persisted F&B preset values', async () => {
        const itemRepository = {
            createItem: jest.fn()
        };
        const useCase = buildCreateItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('fnb')
        });

        await expect(useCase({
            itemData: {
                category: 'product',
                product_type: 'finished_goods',
                mode_item_preset: 'packaged_beverage',
                unit_of_measure: 'serving'
            },
            userId: 1
        })).rejects.toThrow(/does not support unit_of_measure/i);

        expect(itemRepository.createItem).not.toHaveBeenCalled();
    });
});

import { jest } from '@jest/globals';
import { buildCreateItemUseCase } from '../src/modules/inventory/usecases/createItemUseCase.js';
import { buildUpdateItemUseCase } from '../src/modules/inventory/usecases/updateItemUseCase.js';
import { buildFinalizeItemUseCase } from '../src/modules/inventory/usecases/finalizeItemUseCase.js';

// Phase 9: itemValidator.js's SETTABLE_TRACKING_MODES structurally allows
// tracking_mode:'external_ims' through Joi (Joi has no tenant context), but
// it should only actually be settable once the tenant's inventory_authority
// setting has delegated the ledger to an external system. That gate lives
// at the use-case level (assertTrackingModeAuthorizedForInventoryAuthority),
// mirroring how the enabled_capabilities overlay is resolved and threaded
// through these same three use cases.

// Matches retail mode's 'general_merchandise' preset in
// packages/shared-constants/src/modeItemTaxonomy.js so
// validateItemAgainstModeTaxonomy (which runs after this phase's
// inventory_authority gate) doesn't reject these fixtures on an unrelated
// axis.
const baseItemData = { category: 'product', product_type: 'finished_goods', unit_of_measure: 'pcs' };

describe('item use cases gate tracking_mode:external_ims on inventory_authority', () => {
    it('createItemUseCase rejects tracking_mode:external_ims when the tenant has not delegated inventory authority', async () => {
        const itemRepository = { createItem: jest.fn() };
        const useCase = buildCreateItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('retail'),
            resolveInventoryAuthority: jest.fn().mockResolvedValue('platform')
        });

        await expect(useCase({
            itemData: { ...baseItemData, tracking_mode: 'external_ims' },
            userId: 1
        })).rejects.toMatchObject({
            statusCode: 422,
            details: expect.objectContaining({ reason_code: 'TRACKING_MODE_REQUIRES_DELEGATED_INVENTORY_AUTHORITY' })
        });
        expect(itemRepository.createItem).not.toHaveBeenCalled();
    });

    it('createItemUseCase allows tracking_mode:external_ims once the tenant has delegated inventory authority', async () => {
        const itemRepository = { createItem: jest.fn().mockResolvedValue({ item_id: 1 }) };
        const useCase = buildCreateItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('retail'),
            resolveInventoryAuthority: jest.fn().mockResolvedValue('external_ims')
        });

        await useCase({
            itemData: { ...baseItemData, tracking_mode: 'external_ims' },
            userId: 1
        });

        expect(itemRepository.createItem).toHaveBeenCalledWith(
            expect.objectContaining({ tracking_mode: 'external_ims' }),
            1,
            expect.any(Object)
        );
    });

    it('createItemUseCase defaults inventory_authority to platform (rejects external_ims) when no resolver is provided', async () => {
        const itemRepository = { createItem: jest.fn() };
        const useCase = buildCreateItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('retail')
        });

        await expect(useCase({
            itemData: { ...baseItemData, tracking_mode: 'external_ims' },
            userId: 1
        })).rejects.toMatchObject({ statusCode: 422 });
        expect(itemRepository.createItem).not.toHaveBeenCalled();
    });

    it('createItemUseCase does not gate unrelated tracking modes on inventory_authority', async () => {
        const itemRepository = { createItem: jest.fn().mockResolvedValue({ item_id: 1 }) };
        const useCase = buildCreateItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('retail'),
            resolveInventoryAuthority: jest.fn().mockResolvedValue('platform')
        });

        await useCase({
            itemData: { ...baseItemData, tracking_mode: 'count_ledger' },
            userId: 1
        });

        expect(itemRepository.createItem).toHaveBeenCalled();
    });

    it('updateItemUseCase rejects switching an existing item to tracking_mode:external_ims without delegated authority', async () => {
        const itemRepository = {
            getItemById: jest.fn().mockResolvedValue({ item_id: 5, status: 'active', ...baseItemData }),
            updateItem: jest.fn()
        };
        const useCase = buildUpdateItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('retail'),
            resolveInventoryAuthority: jest.fn().mockResolvedValue('platform')
        });

        await expect(useCase({
            itemId: 5,
            itemData: { tracking_mode: 'external_ims' },
            userId: 1
        })).rejects.toMatchObject({ statusCode: 422 });
        expect(itemRepository.updateItem).not.toHaveBeenCalled();
    });

    it('updateItemUseCase leaves an existing external_ims item alone when the update does not touch tracking_mode', async () => {
        const itemRepository = {
            getItemById: jest.fn().mockResolvedValue({ item_id: 5, status: 'active', tracking_mode: 'external_ims', ...baseItemData }),
            updateItem: jest.fn().mockResolvedValue({ item_id: 5 })
        };
        const useCase = buildUpdateItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('retail'),
            resolveInventoryAuthority: jest.fn().mockResolvedValue('platform')
        });

        // Tenant has since reverted to 'platform' authority, but this edit
        // never sets tracking_mode itself - nothing to gate.
        await useCase({ itemId: 5, itemData: { description: 'updated' }, userId: 1 });

        expect(itemRepository.updateItem).toHaveBeenCalled();
    });

    it('finalizeItemUseCase rejects finalizing a draft into tracking_mode:external_ims without delegated authority', async () => {
        const itemRepository = {
            getItemById: jest.fn().mockResolvedValue({
                item_id: 9,
                status: 'draft',
                wizard_metadata: baseItemData
            }),
            finalizeItem: jest.fn()
        };
        const useCase = buildFinalizeItemUseCase({
            itemRepository,
            resolveWorkflowMode: jest.fn().mockResolvedValue('retail'),
            resolveInventoryAuthority: jest.fn().mockResolvedValue('platform')
        });

        await expect(useCase({
            itemId: 9,
            itemData: { ...baseItemData, tracking_mode: 'external_ims' },
            userId: 1
        })).rejects.toMatchObject({ statusCode: 422 });
        expect(itemRepository.finalizeItem).not.toHaveBeenCalled();
    });
});

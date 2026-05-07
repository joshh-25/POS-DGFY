import { validateItemAgainstModeTaxonomy } from '../../shared/constants/modeItemTaxonomy.js';

export const buildFinalizeItemUseCase = ({ itemRepository, resolveWorkflowMode }) => {
    return async ({ itemId, itemData, userId }) => {
        const workflowMode = await resolveWorkflowMode();
        const existingItem = await itemRepository.getItemById(itemId);
        const validation = validateItemAgainstModeTaxonomy({
            workflowMode,
            itemData,
            existingItem,
            operation: 'finalize'
        });
        const dataToFinalize = validation.preset && !itemData.mode_item_preset
            ? { ...itemData, mode_item_preset: validation.preset.key }
            : itemData;
        return itemRepository.finalizeItem(itemId, dataToFinalize, userId);
    };
};
